/**
 * Integration test for the WEB_SEARCH_DEFAULT_OFF feature flag wired
 * through queryAI('ChatGPT', ...). The assertion that matters: when the
 * flag is on AND the strict freshness classifier denies the query, the
 * outbound OpenAI request body MUST NOT contain `web_search_options`.
 * That field is the trigger for the $0.030/call web_search surcharge —
 * suppressing it is the entire mechanism of the cost reduction.
 *
 * The test mocks all queryAI side-effect deps (db, redis, metrics, cost
 * tracker) and intercepts global.fetch to capture the request body.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PLATFORM_RATE_LIMITS.ChatGPT.minDelayMs is captured at module load
// time (Number(env.AI_CHATGPT_MIN_DELAY_MS) || 6000). Hoist the override
// so it's in place BEFORE ai-platforms.ts is imported below — otherwise
// the second call in this file sits on a 6 s rate-limit sleep and the
// test times out.
vi.hoisted(() => {
  process.env.AI_CHATGPT_MIN_DELAY_MS = '0';
});

vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

vi.mock('../db', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

// distributedLimiterEnabled() returns false → queryAI skips every Redis
// branch and runs purely against in-process state.
vi.mock('../redis-platform-state', () => ({
  acquireSlot: vi.fn(),
  recordRateLimit: vi.fn(),
  isRateLimited: vi.fn().mockResolvedValue(false),
  coalesceCall: vi.fn(),
  distributedLimiterEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('../metrics', () => ({
  recordAiCall: vi.fn(),
  classifyOutcome: vi.fn().mockReturnValue('success'),
}));

vi.mock('../cost-tracker', () => ({
  enforceCostCap: vi.fn().mockResolvedValue(undefined),
  recordCostEvent: vi.fn().mockResolvedValue(undefined),
  recordCall: vi.fn().mockResolvedValue(undefined),
  CHATGPT_WEB_SEARCH_CALL_USD: 0.030,
  estimateCostUsd: vi.fn().mockReturnValue(0),
  CostCapExceededError: class CostCapExceededError extends Error {},
}));

vi.mock('../fairness-scheduler', () => ({
  acquirePlatformSlotFair: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('../response-cache', () => ({
  buildCacheKey: vi.fn().mockReturnValue('cache-key'),
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  getCacheTtl: vi.fn().mockReturnValue(60),
  __cacheStats: { hits: 0, misses: 0, writes: 0, errors: 0 },
}));

import { queryAI } from '../ai-platforms';

const ORIGINAL_ENV = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;

function captureFetchBody(): Record<string, unknown> | null {
  const call = fetchMock.mock.calls[0];
  if (!call) return null;
  const init = call[1] as RequestInit | undefined;
  if (!init?.body) return null;
  return JSON.parse(init.body as string);
}

function okOpenAiResponse(): Response {
  // Minimal shape that satisfies queryAI's ChatGPT branch: a choice with
  // message.content, usage with token counts, no tool_calls (so the web
  // search counter stays at 0 — we don't care about cost ledger here).
  return new Response(JSON.stringify({
    id: 'chatcmpl-test',
    model: 'gpt-4o-mini-search-preview',
    choices: [{ message: { content: 'ok', annotations: [] } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(okOpenAiResponse());
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  // Bypass the per-key minimum spacing so the test doesn't sit on a
  // 6-second sleep. Smart-routing OFF so we exercise the gate, not the
  // model-routing fallback (the gate is the cheaper layer and is what
  // this PR is testing).
  process.env.AI_CHATGPT_MIN_DELAY_MS = '0';
  process.env.CHATGPT_SMART_MODEL_ROUTING = 'false';
});

afterEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe('queryAI(ChatGPT) + WEB_SEARCH_DEFAULT_OFF=true', () => {
  it('does NOT include web_search_options when classifier denies', async () => {
    process.env.WEB_SEARCH_DEFAULT_OFF = 'true';
    delete process.env.CHATGPT_WEB_SEARCH_GATING;
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
    );
    const body = captureFetchBody();
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty('web_search_options');
    expect(body!.model).toBe('gpt-4o-mini-search-preview');
  });

  it('DOES include web_search_options when classifier allows (strict freshness anchor present)', async () => {
    process.env.WEB_SEARCH_DEFAULT_OFF = 'true';
    delete process.env.CHATGPT_WEB_SEARCH_GATING;
    await queryAI(
      'ChatGPT',
      'breaking news on Stripe today',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
    );
    const body = captureFetchBody();
    expect(body).not.toBeNull();
    expect(body).toHaveProperty('web_search_options');
  });

  // Rollback behavior: setting the flag false (or leaving it unset) must
  // restore the pre-classifier regex-based gate. "Stripe pricing" hits the
  // legacy permissive regex via the `pricing` keyword.
  it('legacy regex remains in effect when flag is off (rollback path)', async () => {
    delete process.env.WEB_SEARCH_DEFAULT_OFF;
    delete process.env.CHATGPT_WEB_SEARCH_GATING;
    await queryAI(
      'ChatGPT',
      'Stripe pricing',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
    );
    const body = captureFetchBody();
    expect(body).not.toBeNull();
    // Legacy regex matches `pricing` → web_search_options attached.
    expect(body).toHaveProperty('web_search_options');
  });

  // Verifies that when the strict classifier denies, the legacy regex's
  // catch ("pricing") no longer fires. This is the cost-saving delta.
  it('flag ON suppresses requests the legacy regex would have allowed', async () => {
    process.env.WEB_SEARCH_DEFAULT_OFF = 'true';
    delete process.env.CHATGPT_WEB_SEARCH_GATING;
    await queryAI(
      'ChatGPT',
      'Stripe pricing',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
    );
    const body = captureFetchBody();
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty('web_search_options');
  });

  // The CHATGPT_WEB_SEARCH_GATING=false hard kill switch must override
  // the strict classifier — that's the ops-incident lever.
  it('CHATGPT_WEB_SEARCH_GATING=false overrides the strict classifier', async () => {
    process.env.WEB_SEARCH_DEFAULT_OFF = 'true';
    process.env.CHATGPT_WEB_SEARCH_GATING = 'false';
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
    );
    const body = captureFetchBody();
    expect(body).not.toBeNull();
    expect(body).toHaveProperty('web_search_options');
  });
});
