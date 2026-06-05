/**
 * ChatGPT web_search cost-control knobs:
 *
 *   CHATGPT_SEARCH_MAX_ATTEMPTS — total attempts (including the initial
 *   one) for a ChatGPT call that attaches the hosted `web_search` tool.
 *   Each completed search call is billed at $0.030, so a transient
 *   failure under the generic ChatGPT retry budget (default 3 retries)
 *   could multiply the surcharge 4x for the same query. Default 1
 *   means "no retries on the search path". NO-search calls keep their
 *   full retry budget so transient 5xx / network errors still recover
 *   for free.
 *
 *   CHATGPT_SEARCH_TIMEOUT_MS — per-attempt fetch timeout for the
 *   search path. Tighter than the generic ChatGPT timeout
 *   (AI_CHATGPT_REQUEST_TIMEOUT_MS, default 30s); bounds worst-case
 *   spend on hung search requests that still get billed once OpenAI's
 *   side dispatches the tool call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist these env writes BEFORE ai-platforms.ts is imported — both
// PLATFORM_RATE_LIMITS.ChatGPT and PLATFORM_CB_THRESHOLD are captured
// at module load. Without the threshold bump the cumulative 429s across
// these tests would trip the platform circuit breaker mid-suite.
vi.hoisted(() => {
  process.env.AI_CHATGPT_MIN_DELAY_MS = '0';
  process.env.AI_PLATFORM_CB_THRESHOLD = '1000';
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

import {
  queryAI,
  getChatGPTSearchMaxAttempts,
  getChatGPTSearchTimeoutMs,
} from '../ai-platforms';

const ORIGINAL_ENV = { ...process.env };

function okResp(model = 'gpt-4o-mini-search-preview'): Response {
  return new Response(JSON.stringify({
    id: 'chatcmpl-test',
    model,
    choices: [{ message: { content: 'ok', annotations: [] } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function retryable429(): Response {
  // 429 with a short Retry-After hint (100ms). With a 5000ms sleep
  // budget this fits inside fetchAI's per-call retry budget so the
  // retry loop ACTUALLY executes — i.e. maxRetries genuinely gates
  // the call count, not a hint > budget short-circuit.
  return new Response('{"error":{"message":"rate limited"}}', {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': '100ms',
    },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(okResp());
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  process.env.AI_CHATGPT_MIN_DELAY_MS = '0';
  // Generic ChatGPT retry budget: 3 retries (4 attempts), 5s of sleep
  // budget. The search-path knob is the thing we want to see OVERRIDE
  // this, not the generic value.
  process.env.AI_CHATGPT_MAX_RETRIES = '3';
  process.env.AI_CHATGPT_MAX_RETRY_SLEEP_MS = '5000';
  process.env.CHATGPT_SMART_MODEL_ROUTING = 'false';
  delete process.env.CHATGPT_WEB_SEARCH_GATING;
  delete process.env.WEB_SEARCH_DEFAULT_OFF;
  delete process.env.CHATGPT_SEARCH_MAX_ATTEMPTS;
  delete process.env.CHATGPT_SEARCH_TIMEOUT_MS;
});

afterEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe('getChatGPTSearchMaxAttempts (env helper)', () => {
  it('defaults to 1 (no retries on the search path)', () => {
    delete process.env.CHATGPT_SEARCH_MAX_ATTEMPTS;
    expect(getChatGPTSearchMaxAttempts()).toBe(1);
  });
  it('respects a custom positive integer', () => {
    process.env.CHATGPT_SEARCH_MAX_ATTEMPTS = '3';
    expect(getChatGPTSearchMaxAttempts()).toBe(3);
  });
  it('floors fractional values', () => {
    process.env.CHATGPT_SEARCH_MAX_ATTEMPTS = '2.9';
    expect(getChatGPTSearchMaxAttempts()).toBe(2);
  });
  it('falls back to 1 on garbage / zero / negative', () => {
    for (const v of ['', 'banana', '0', '-2']) {
      process.env.CHATGPT_SEARCH_MAX_ATTEMPTS = v;
      expect(getChatGPTSearchMaxAttempts()).toBe(1);
    }
  });
});

describe('getChatGPTSearchTimeoutMs (env helper)', () => {
  it('defaults to 30000ms', () => {
    delete process.env.CHATGPT_SEARCH_TIMEOUT_MS;
    expect(getChatGPTSearchTimeoutMs()).toBe(30000);
  });
  it('respects a custom positive integer', () => {
    process.env.CHATGPT_SEARCH_TIMEOUT_MS = '15000';
    expect(getChatGPTSearchTimeoutMs()).toBe(15000);
  });
  it('falls back to default on garbage / zero / negative', () => {
    for (const v of ['', 'banana', '0', '-5']) {
      process.env.CHATGPT_SEARCH_TIMEOUT_MS = v;
      expect(getChatGPTSearchTimeoutMs()).toBe(30000);
    }
  });
});

describe('queryAI(ChatGPT) — search path retries are capped', () => {
  it('does NOT retry a transient 429 on the search path (default cap = 1)', async () => {
    // Search-preview model + a freshness query → web_search attaches.
    // Even though AI_CHATGPT_MAX_RETRIES=3 (set in beforeEach), the
    // search path overrides to maxRetries=0 so the 429 surfaces on
    // the very first attempt. Without the cap this same call would
    // issue 4 outbound requests, each billing the $0.030 web_search
    // surcharge.
    fetchMock = vi.fn().mockResolvedValue(retryable429());
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(queryAI(
      'ChatGPT',
      'breaking news on Stripe today',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
      undefined,
      { adminSelectedModel: true },
    )).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('CHATGPT_SEARCH_MAX_ATTEMPTS=3 lifts the cap to 3 attempts on the search path', async () => {
    process.env.CHATGPT_SEARCH_MAX_ATTEMPTS = '3';
    fetchMock = vi.fn().mockResolvedValue(retryable429());
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(queryAI(
      'ChatGPT',
      'breaking news on Stripe today',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
      undefined,
      { adminSelectedModel: true },
    )).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does NOT cap retries on the NO-search path (generic budget preserved)', async () => {
    // Same admin-selected search-preview model, but a definitional
    // query → web_search gated off → no surcharge to bill, so the
    // cheap path keeps the full retry budget (AI_CHATGPT_MAX_RETRIES=3
    // → 4 attempts). adminSelectedModel:true ALSO suppresses the no-
    // search auto-downgrade fallback chain, so a transient error here
    // exercises ONLY fetchAI's retry loop, not the modelChain walk.
    fetchMock = vi.fn().mockResolvedValue(retryable429());
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
      undefined,
      { adminSelectedModel: true },
    )).rejects.toThrow();
    // 1 initial + 3 retries = 4 outbound attempts.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not affect successful single-shot search calls', async () => {
    // Sanity: with the default cap of 1, a successful call is one
    // outbound request, billed once, exactly as before.
    await queryAI(
      'ChatGPT',
      'breaking news on Stripe today',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
      undefined,
      { adminSelectedModel: true },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
