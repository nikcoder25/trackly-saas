import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the new daily_cost_tracker rollup + per-platform daily
 * threshold alarm added in fix/cost-tracker-real-tokens-and-alarm.
 *
 * The DB pool is mocked - we never touch Postgres. The upsert RETURNING
 * clause is the only query whose result actually drives logic (it
 * provides cost_usd_total which gates the alarm), so the mock keys off
 * SQL fragments and returns canned rows for that one statement.
 */
type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: { query: (...args: Parameters<QueryFn>) => queryMock(...args) },
}));

import {
  recordCall,
  __resetAlarmStateForTests,
  COST_DAILY_ALARM_USD,
  CHATGPT_WEB_SEARCH_CALL_USD,
} from '../src/lib/cost-tracker';
import { countWebSearchCalls } from '../src/lib/ai-platforms';

function mockUpsertReturns(costToday: number) {
  queryMock.mockImplementation(async (sql: string) => {
    if (typeof sql === 'string' && sql.includes('INSERT INTO daily_cost_tracker')) {
      return { rows: [{ cost_usd_total: String(costToday) }] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
  __resetAlarmStateForTests();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// ── recordCall ──────────────────────────────────────────────────
describe('recordCall', () => {
  it('persists tokens, web-search calls, and cost from a synthetic OpenAI usage payload', async () => {
    mockUpsertReturns(0.001);
    await recordCall({
      platform: 'ChatGPT',
      model: 'gpt-4o-mini-search-preview',
      tokensIn: 120,
      tokensOut: 80,
      webSearchCalls: 2,
      costUsd: 0.123,
    });
    const insertCall = queryMock.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO daily_cost_tracker'));
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    // [day, platform, model, tokensIn, tokensOut, webSearchCalls, costUsd]
    expect(params[1]).toBe('ChatGPT');
    expect(params[2]).toBe('gpt-4o-mini-search-preview');
    expect(params[3]).toBe(120);
    expect(params[4]).toBe(80);
    expect(params[5]).toBe(2);
    expect(params[6]).toBe(0.123);
  });

  it('falls back to estimateCostUsd when costUsd is omitted (no tool_calls)', async () => {
    mockUpsertReturns(0.001);
    // gpt-4o-mini-search-preview: $0.15/1M in, $0.60/1M out
    // 1000 * 0.15/1e6 + 500 * 0.60/1e6 = 0.00015 + 0.00030 = 0.00045
    await recordCall({
      platform: 'ChatGPT',
      model: 'gpt-4o-mini-search-preview',
      tokensIn: 1000,
      tokensOut: 500,
    });
    const insertCall = queryMock.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO daily_cost_tracker'));
    const params = insertCall![1] as unknown[];
    expect(params[5]).toBe(0); // no web-search calls
    expect(Number(params[6])).toBeCloseTo(0.00045, 6);
  });

  it('skips persistence when platform or model is empty', async () => {
    await recordCall({ platform: '', model: 'x', tokensIn: 1, tokensOut: 1 });
    await recordCall({ platform: 'x', model: '', tokensIn: 1, tokensOut: 1 });
    const inserts = queryMock.mock.calls.filter(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO daily_cost_tracker'));
    expect(inserts).toHaveLength(0);
  });

  // Regression for the prod incident where `ensureCostEventsTable`'s
  // `CREATE INDEX ... ON daily_cost_tracker(day DESC)` raised
  // `column "day" does not exist` against a partial-state legacy table,
  // and the error escaped recordCall into queryAI's success path,
  // surfacing as the per-platform errorMessage on every brand run.
  // recordCall is best-effort by contract - table-readiness failures
  // must never break the LLM happy path.
  it('never throws when ensureCostEventsTable fails (e.g. column "day" does not exist)', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('CREATE TABLE')) {
        throw new Error('column "day" does not exist');
      }
      return { rows: [] };
    });
    await expect(recordCall({
      platform: 'ChatGPT',
      model: 'gpt-4o',
      tokensIn: 1, tokensOut: 1, costUsd: 0.001,
    })).resolves.toBeUndefined();
  });

  it('never throws when the upsert INSERT itself fails', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('INSERT INTO daily_cost_tracker')) {
        throw new Error('column "day" does not exist');
      }
      return { rows: [] };
    });
    await expect(recordCall({
      platform: 'Perplexity',
      model: 'sonar-pro',
      tokensIn: 1, tokensOut: 1, costUsd: 0.001,
    })).resolves.toBeUndefined();
  });
});

// ── countWebSearchCalls ─────────────────────────────────────────
describe('countWebSearchCalls', () => {
  it('returns 0 for a non-search response', () => {
    expect(countWebSearchCalls({
      choices: [{ message: { content: 'hi' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })).toBe(0);
  });

  it('reads usage.tool_calls.web_search count', () => {
    expect(countWebSearchCalls({
      usage: { prompt_tokens: 1, completion_tokens: 1, tool_calls: { web_search: 3 } },
    })).toBe(3);
  });

  it('reads usage.tool_calls when it is a flat number', () => {
    expect(countWebSearchCalls({ usage: { tool_calls: 2 } })).toBe(2);
  });

  it('counts message.tool_calls entries with web_search type or function name', () => {
    expect(countWebSearchCalls({
      choices: [{
        message: {
          tool_calls: [
            { type: 'web_search', id: 'a' },
            { type: 'function', function: { name: 'lookup' } },
            { type: 'web_search_call', id: 'b' },
            { type: 'function', function: { name: 'web_search' } },
          ],
        },
      }],
    })).toBe(3);
  });

  it('returns 0 on null / non-object input', () => {
    expect(countWebSearchCalls(null)).toBe(0);
    expect(countWebSearchCalls(undefined)).toBe(0);
    expect(countWebSearchCalls(42)).toBe(0);
  });
});

// ── daily threshold alarm ───────────────────────────────────────
describe('daily threshold alarm', () => {
  it('fires exactly once per UTC day per platform when threshold crossed', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockUpsertReturns(COST_DAILY_ALARM_USD + 0.5);
    await recordCall({
      platform: 'ChatGPT', model: 'gpt-4o',
      tokensIn: 1, tokensOut: 1, costUsd: COST_DAILY_ALARM_USD + 0.5,
    });
    // Same day + platform: must NOT re-fire.
    await recordCall({
      platform: 'ChatGPT', model: 'gpt-4o',
      tokensIn: 1, tokensOut: 1, costUsd: 0.10,
    });
    // Different platform crossing threshold: fires once for IT.
    await recordCall({
      platform: 'Claude', model: 'claude-haiku-4-5-20251001',
      tokensIn: 1, tokensOut: 1, costUsd: COST_DAILY_ALARM_USD + 0.1,
    });

    const alarmCalls = warnSpy.mock.calls.filter(c => c[0] === '[cost.alarm]');
    expect(alarmCalls).toHaveLength(2);
    const platforms = alarmCalls.map(c => (c[1] as { platform: string }).platform).sort();
    expect(platforms).toEqual(['ChatGPT', 'Claude']);
  });

  it('does not fire when today total stays below threshold', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockUpsertReturns(COST_DAILY_ALARM_USD - 0.01);
    await recordCall({
      platform: 'ChatGPT', model: 'gpt-4o',
      tokensIn: 1, tokensOut: 1, costUsd: 0.05,
    });
    const alarmCalls = warnSpy.mock.calls.filter(c => c[0] === '[cost.alarm]');
    expect(alarmCalls).toHaveLength(0);
  });
});

describe('CHATGPT_WEB_SEARCH_CALL_USD', () => {
  it('matches the documented OpenAI rate', () => {
    expect(CHATGPT_WEB_SEARCH_CALL_USD).toBe(0.030);
  });
});
