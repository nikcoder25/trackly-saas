import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Per-platform daily USD hard cap (September 2026 cost pass).
 *
 * The Anthropic org was drained of $32 of credits in under four days while
 * the app's own ledger saw a fraction of it. These tests pin the brake that
 * stops a provider account from being emptied: once today's recorded spend
 * on a platform reaches its cap, further calls are refused until the UTC
 * day rolls over. The DB pool is mocked; the SUM query is the only one
 * whose result drives logic.
 */
type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: { query: (...args: Parameters<QueryFn>) => queryMock(...args) },
}));
vi.mock('../src/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  getPlatformDailyCapUsd,
  getPlatformSpentTodayUsd,
  enforcePlatformDailyCap,
  PlatformDailyCapExceededError,
  PLATFORM_DAILY_CAP_DEFAULT_USD,
  __resetPlatformSpendCacheForTests,
  __resetAlarmStateForTests,
  recordCall,
  lookupModelPricing,
  estimateCostUsd,
  estimateAnthropicCostUsd,
  ANTHROPIC_CACHE_WRITE_MULTIPLIER,
  ANTHROPIC_CACHE_READ_MULTIPLIER,
} from '../src/lib/cost-tracker';

function mockSpent(total: number) {
  queryMock.mockImplementation(async (sql: string) => {
    if (typeof sql === 'string' && sql.includes('SUM(cost_usd_total)') && sql.includes('platform = $2')) {
      return { rows: [{ total: String(total) }] };
    }
    if (typeof sql === 'string' && sql.includes('INSERT INTO daily_cost_tracker')) {
      return { rows: [{ cost_usd_total: '0' }] };
    }
    return { rows: [] };
  });
}

const ENV_KEYS = ['AI_DAILY_USD_CAP_CLAUDE', 'AI_DAILY_USD_CAP_CHATGPT', 'AI_DAILY_USD_CAP_DEFAULT'];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
  __resetPlatformSpendCacheForTests();
  __resetAlarmStateForTests();
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  vi.clearAllMocks();
});

describe('getPlatformDailyCapUsd', () => {
  it('caps Claude at $5/day by default and leaves the others uncapped', () => {
    expect(PLATFORM_DAILY_CAP_DEFAULT_USD.Claude).toBe(5);
    expect(getPlatformDailyCapUsd('Claude')).toBe(5);
    expect(getPlatformDailyCapUsd('ChatGPT')).toBe(0);
    expect(getPlatformDailyCapUsd('Gemini')).toBe(0);
    expect(getPlatformDailyCapUsd('Perplexity')).toBe(0);
    expect(getPlatformDailyCapUsd('Grok')).toBe(0);
  });

  it('AI_DAILY_USD_CAP_<PLATFORM> wins over the default table, including 0 to disable', () => {
    process.env.AI_DAILY_USD_CAP_CLAUDE = '12.5';
    expect(getPlatformDailyCapUsd('Claude')).toBe(12.5);
    process.env.AI_DAILY_USD_CAP_CLAUDE = '0';
    expect(getPlatformDailyCapUsd('Claude')).toBe(0);
  });

  it('AI_DAILY_USD_CAP_DEFAULT applies to platforms without a specific override', () => {
    process.env.AI_DAILY_USD_CAP_DEFAULT = '20';
    expect(getPlatformDailyCapUsd('ChatGPT')).toBe(20);
    expect(getPlatformDailyCapUsd('Claude')).toBe(20);
    process.env.AI_DAILY_USD_CAP_CLAUDE = '3';
    expect(getPlatformDailyCapUsd('Claude')).toBe(3);
  });

  it('ignores garbage env values', () => {
    process.env.AI_DAILY_USD_CAP_CLAUDE = 'lots';
    expect(getPlatformDailyCapUsd('Claude')).toBe(5);
  });
});

describe('enforcePlatformDailyCap', () => {
  it('lets calls through while spend is under the cap', async () => {
    mockSpent(4.99);
    await expect(enforcePlatformDailyCap('Claude')).resolves.toBeUndefined();
  });

  it('refuses calls once today\'s spend reaches the cap, with a rate-limit-shaped error', async () => {
    mockSpent(5);
    let caught: unknown;
    try { await enforcePlatformDailyCap('Claude'); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(PlatformDailyCapExceededError);
    const err = caught as PlatformDailyCapExceededError;
    expect(err.platform).toBe('Claude');
    expect(err.capUsd).toBe(5);
    expect(err.spentUsd).toBe(5);
    // Shaped like a 429 so callers that already skip a rate-limited
    // platform treat it the same way, and never retry it.
    expect(err.isRateLimit).toBe(true);
    expect(err.budgetExhausted).toBe(true);
    expect(err.isTransient).toBe(false);
    expect(err.message).toContain('AI_DAILY_USD_CAP_CLAUDE');
  });

  it('never queries the DB for an uncapped platform', async () => {
    mockSpent(999);
    await expect(enforcePlatformDailyCap('ChatGPT')).resolves.toBeUndefined();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('fails open when the spend query throws', async () => {
    queryMock.mockImplementation(async () => { throw new Error('db down'); });
    await expect(enforcePlatformDailyCap('Claude')).resolves.toBeUndefined();
  });

  it('caches today\'s spend for a short window instead of querying per call', async () => {
    mockSpent(1);
    await getPlatformSpentTodayUsd('Claude');
    await getPlatformSpentTodayUsd('Claude');
    await getPlatformSpentTodayUsd('Claude');
    const sumCalls = queryMock.mock.calls.filter(c => typeof c[0] === 'string' && c[0].includes('SUM(cost_usd_total)'));
    expect(sumCalls).toHaveLength(1);
  });

  it('counts calls recorded inside the cache window toward the cap', async () => {
    mockSpent(4.5);
    await expect(enforcePlatformDailyCap('Claude')).resolves.toBeUndefined();
    // A $0.60 call lands inside the 30s window: the cached total must
    // move, so the next check trips without waiting for a fresh SUM.
    await recordCall({ platform: 'Claude', model: 'claude-haiku-4-5-20251001', tokensIn: 0, tokensOut: 0, costUsd: 0.6 });
    await expect(enforcePlatformDailyCap('Claude')).rejects.toBeInstanceOf(PlatformDailyCapExceededError);
  });

  it('resets when the UTC day rolls over', async () => {
    mockSpent(5);
    const today = new Date('2026-09-14T12:00:00Z');
    await expect(enforcePlatformDailyCap('Claude', today)).rejects.toBeInstanceOf(PlatformDailyCapExceededError);
    mockSpent(0);
    const tomorrow = new Date('2026-09-15T00:00:01Z');
    await expect(enforcePlatformDailyCap('Claude', tomorrow)).resolves.toBeUndefined();
  });
});

describe('lookupModelPricing / estimateCostUsd prefix matching', () => {
  it('picks the LONGEST matching prefix so a dated nano id is not priced as the flagship', () => {
    const nano = lookupModelPricing('gpt-5.4-nano');
    const flagship = lookupModelPricing('gpt-5.4');
    expect(nano).not.toBeNull();
    expect(flagship).not.toBeNull();
    expect(nano!.input).toBeLessThan(flagship!.input);
    expect(lookupModelPricing('gpt-5.4-nano-2026-01-01')).toEqual(nano);
    expect(estimateCostUsd('gpt-5.4-nano-2026-01-01', 1_000_000, 0)).toBe(nano!.input);
  });

  it('returns null for unknown models', () => {
    expect(lookupModelPricing('made-up-model')).toBeNull();
  });
});

describe('estimateAnthropicCostUsd', () => {
  const haiku = 'claude-haiku-4-5-20251001';

  it('matches the plain estimate when nothing is cached', () => {
    const cost = estimateAnthropicCostUsd(haiku, { input_tokens: 1000, output_tokens: 500 });
    expect(cost).toBeCloseTo(estimateCostUsd(haiku, 1000, 500), 12);
  });

  it('bills cache writes at 1.25x and cache reads at 0.1x of the input price', () => {
    const p = lookupModelPricing(haiku)!;
    const cost = estimateAnthropicCostUsd(haiku, {
      input_tokens: 100, output_tokens: 0,
      cache_creation_input_tokens: 10_000, cache_read_input_tokens: 20_000,
    })!;
    const expected = (
      100 * p.input
      + 10_000 * p.input * ANTHROPIC_CACHE_WRITE_MULTIPLIER
      + 20_000 * p.input * ANTHROPIC_CACHE_READ_MULTIPLIER
    ) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 12);
    // A cache read is cheaper than sending the same tokens uncached.
    expect(cost).toBeLessThan(estimateCostUsd(haiku, 30_100, 0));
  });

  it('returns null for an unknown model or missing usage so callers fall back', () => {
    expect(estimateAnthropicCostUsd('no-such-model', { input_tokens: 1 })).toBeNull();
    expect(estimateAnthropicCostUsd(haiku, undefined)).toBeNull();
  });
});
