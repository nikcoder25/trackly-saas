/**
 * Cost-reduction knobs for ChatGPT calls. Two independent levers:
 *
 *   1. `web_search_options.search_context_size` - defaults to "low" so
 *      OpenAI bills the hosted web_search tool at the cheaper tier
 *      instead of the (unset → "medium") default. Overridable via
 *      CHATGPT_SEARCH_CONTEXT_SIZE.
 *
 *   2. Default no-search model auto-downgrade - when the call will NOT
 *      attach web_search AND the caller did not explicitly select a
 *      model, route to gpt-5.4-nano (env-overridable via
 *      CHATGPT_NONSEARCH_MODEL). Admin-explicit selections and
 *      search-preview models are honored verbatim.
 *
 * The mocks here mirror chatgpt-web-search-default-off.test.ts so the
 * queryAI ChatGPT branch exercises end-to-end with a captured fetch
 * body.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PLATFORM_RATE_LIMITS.ChatGPT.minDelayMs is captured at module load
// time. Hoist the override so it's in place BEFORE ai-platforms.ts is
// imported below - otherwise the second call in this file sits on a
// 6 s rate-limit sleep and the test times out.
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

import { queryAI, getChatGPTSearchContextSize, getChatGPTNonSearchModel } from '../ai-platforms';

const ORIGINAL_ENV = { ...process.env };

interface CapturedBody {
  model: string;
  web_search_options?: { search_context_size?: string; user_location?: unknown };
  [k: string]: unknown;
}

let fetchMock: ReturnType<typeof vi.fn>;

function captureFetchBody(callIdx = 0): CapturedBody | null {
  const call = fetchMock.mock.calls[callIdx];
  if (!call) return null;
  const init = call[1] as RequestInit | undefined;
  if (!init?.body) return null;
  return JSON.parse(init.body as string) as CapturedBody;
}

function okOpenAiResponse(modelEcho = 'gpt-4o-mini-search-preview'): Response {
  return new Response(JSON.stringify({
    id: 'chatcmpl-test',
    model: modelEcho,
    choices: [{ message: { content: 'ok', annotations: [] } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function fastTransient429(): Response {
  // 429 with a Retry-After hint that exceeds the ChatGPT per-call
  // sleep budget. fetchAI takes the "deferral" branch and throws
  // immediately with `isRateLimit: true, needsDeferral: true` - no
  // internal backoff, so the test doesn't sit on multi-second sleeps.
  // isTransientError() returns true on `isRateLimit`, which is what
  // the no-search downgrade fallback chain keys off.
  return new Response('{"error":{"message":"rate limited"}}', {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      // 120s > AI_CHATGPT_MAX_RETRY_SLEEP_MS default of 30s → defer path.
      'Retry-After': '120',
    },
  });
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(okOpenAiResponse());
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  process.env.AI_CHATGPT_MIN_DELAY_MS = '0';
  // Drop attempts and sleep budget so a failing search-model call
  // surfaces fast instead of burning seconds on backoff.
  process.env.AI_CHATGPT_MAX_RETRIES = '0';
  process.env.AI_CHATGPT_MAX_RETRY_SLEEP_MS = '0';
  // Smart-routing OFF so we exercise the gate, not the model-routing
  // fallback. Otherwise resolveChatGPTModel would route "What is HTTP?"
  // away from search-preview before queryAI sees it.
  process.env.CHATGPT_SMART_MODEL_ROUTING = 'false';
  // Web-search gate ON for legacy regex by default; individual tests
  // flip CHATGPT_WEB_SEARCH_GATING / WEB_SEARCH_DEFAULT_OFF as needed.
  delete process.env.CHATGPT_WEB_SEARCH_GATING;
  delete process.env.WEB_SEARCH_DEFAULT_OFF;
  delete process.env.CHATGPT_SEARCH_CONTEXT_SIZE;
  delete process.env.CHATGPT_NONSEARCH_MODEL;
});

afterEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

// ────────────────────────────────────────────────────────────────────
// CHANGE 1 - search_context_size
// ────────────────────────────────────────────────────────────────────

describe('getChatGPTSearchContextSize (env helper)', () => {
  it('defaults to "low" when unset', () => {
    delete process.env.CHATGPT_SEARCH_CONTEXT_SIZE;
    expect(getChatGPTSearchContextSize()).toBe('low');
  });
  it('respects low|medium|high', () => {
    process.env.CHATGPT_SEARCH_CONTEXT_SIZE = 'medium';
    expect(getChatGPTSearchContextSize()).toBe('medium');
    process.env.CHATGPT_SEARCH_CONTEXT_SIZE = 'HIGH';
    expect(getChatGPTSearchContextSize()).toBe('high');
  });
  it('falls back to "low" on garbage input', () => {
    process.env.CHATGPT_SEARCH_CONTEXT_SIZE = 'extra-large';
    expect(getChatGPTSearchContextSize()).toBe('low');
    process.env.CHATGPT_SEARCH_CONTEXT_SIZE = '';
    expect(getChatGPTSearchContextSize()).toBe('low');
  });
});

describe('queryAI(ChatGPT) - search_context_size on the outbound body', () => {
  it('attaches search_context_size:"low" by default when web_search is enabled', async () => {
    await queryAI(
      'ChatGPT',
      'breaking news on Stripe today',  // hits legacy freshness regex
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
      undefined,
      { adminSelectedModel: true },  // keep search-preview model verbatim
    );
    const body = captureFetchBody();
    expect(body).not.toBeNull();
    expect(body!.web_search_options).toBeDefined();
    expect(body!.web_search_options!.search_context_size).toBe('low');
  });

  it('respects CHATGPT_SEARCH_CONTEXT_SIZE=medium override', async () => {
    process.env.CHATGPT_SEARCH_CONTEXT_SIZE = 'medium';
    await queryAI(
      'ChatGPT',
      'breaking news on Stripe today',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body!.web_search_options!.search_context_size).toBe('medium');
  });

  it('respects CHATGPT_SEARCH_CONTEXT_SIZE=high override', async () => {
    process.env.CHATGPT_SEARCH_CONTEXT_SIZE = 'high';
    await queryAI(
      'ChatGPT',
      'breaking news on Stripe today',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body!.web_search_options!.search_context_size).toBe('high');
  });

  it('falls back to "low" when the env var is invalid', async () => {
    process.env.CHATGPT_SEARCH_CONTEXT_SIZE = 'bogus';
    await queryAI(
      'ChatGPT',
      'breaking news on Stripe today',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body!.web_search_options!.search_context_size).toBe('low');
  });

  it('does NOT attach search_context_size when web_search itself is gated off', async () => {
    // Definitional query → legacy regex denies web_search → no
    // web_search_options at all (existing behavior). search_context_size
    // only ever appears inside web_search_options.
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body).not.toHaveProperty('web_search_options');
  });

  it('preserves user_location alongside search_context_size', async () => {
    await queryAI(
      'ChatGPT',
      'breaking news on Stripe today',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
      { city: 'Austin' },
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body!.web_search_options).toMatchObject({
      search_context_size: 'low',
      user_location: { type: 'approximate', approximate: { city: 'Austin', country: 'US' } },
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// CHANGE 2 - no-search auto-downgrade to gpt-5.4-nano
// ────────────────────────────────────────────────────────────────────

describe('getChatGPTNonSearchModel (env helper)', () => {
  it('defaults to "gpt-5.4-nano" when unset', () => {
    delete process.env.CHATGPT_NONSEARCH_MODEL;
    expect(getChatGPTNonSearchModel()).toBe('gpt-5.4-nano');
  });
  it('respects a custom model id', () => {
    process.env.CHATGPT_NONSEARCH_MODEL = 'gpt-4o-mini';
    expect(getChatGPTNonSearchModel()).toBe('gpt-4o-mini');
  });
  it('returns null when explicitly disabled', () => {
    for (const v of ['', 'off', 'OFF', 'false', 'disabled']) {
      process.env.CHATGPT_NONSEARCH_MODEL = v;
      expect(getChatGPTNonSearchModel()).toBeNull();
    }
  });
});

describe('queryAI(ChatGPT) - no-search auto-downgrade', () => {
  it('downgrades the default model (gpt-5.4-mini) to gpt-5.4-nano on no-search calls', async () => {
    // model: undefined → queryAI uses platform default (gpt-5.4-mini).
    // No adminSelectedModel flag → downgrade applies.
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
    );
    const body = captureFetchBody();
    expect(body).not.toBeNull();
    expect(body!.model).toBe('gpt-5.4-nano');
  });

  it('downgrades when model is explicitly passed as the default (no admin flag)', async () => {
    // Mirrors the production run-route, which always passes a model
    // even when it equals the platform default. Without
    // adminSelectedModel:true the call is still treated as a default
    // and gets downgraded.
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
    );
    const body = captureFetchBody();
    expect(body!.model).toBe('gpt-5.4-nano');
  });

  it('honors adminSelectedModel:true - no downgrade even on no-search path', async () => {
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body!.model).toBe('gpt-5.4-mini');
  });

  it('honors a non-default admin-picked model verbatim', async () => {
    // gpt-5.4 (full) is not the default. Even without adminSelectedModel
    // the downgrade is skipped because useModel !== default.
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4',
    );
    const body = captureFetchBody();
    expect(body!.model).toBe('gpt-5.4');
  });

  it('search-preview model selection is untouched (search path)', async () => {
    // A search-preview model + a freshness query → web_search attaches
    // → downgrade must NOT fire. The body should still carry the
    // admin-picked search-preview model.
    await queryAI(
      'ChatGPT',
      'breaking news on Stripe today',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
    );
    const body = captureFetchBody();
    expect(body!.model).toBe('gpt-4o-mini-search-preview');
    expect(body!.web_search_options).toBeDefined();
  });

  it('search-preview model selection is untouched even when web_search is gated off', async () => {
    // Search-preview model with a definitional query: web_search gate
    // denies, but the model itself is search-preview and must NOT be
    // downgraded. This is the explicit constraint in the PR scope -
    // search-preview model routing lives in resolveChatGPTModel, not
    // here.
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
    );
    const body = captureFetchBody();
    expect(body!.model).toBe('gpt-4o-mini-search-preview');
    expect(body).not.toHaveProperty('web_search_options');
  });

  it('CHATGPT_NONSEARCH_MODEL=off disables the downgrade', async () => {
    process.env.CHATGPT_NONSEARCH_MODEL = 'off';
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
    );
    const body = captureFetchBody();
    expect(body!.model).toBe('gpt-5.4-mini');
  });

  it('CHATGPT_NONSEARCH_MODEL=gpt-4o-mini overrides the downgrade target', async () => {
    process.env.CHATGPT_NONSEARCH_MODEL = 'gpt-4o-mini';
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
    );
    const body = captureFetchBody();
    expect(body!.model).toBe('gpt-4o-mini');
  });

  it('falls back through gpt-5.4-mini → gpt-4o on transient nano errors', async () => {
    // First two attempts fail transiently (nano then mini), third
    // succeeds (gpt-4o). The captured outbound bodies should record
    // exactly that progression.
    fetchMock = vi.fn()
      .mockResolvedValueOnce(fastTransient429())
      .mockResolvedValueOnce(fastTransient429())
      .mockResolvedValueOnce(okOpenAiResponse('gpt-4o'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(captureFetchBody(0)!.model).toBe('gpt-5.4-nano');
    expect(captureFetchBody(1)!.model).toBe('gpt-5.4-mini');
    expect(captureFetchBody(2)!.model).toBe('gpt-4o');
  });

  it('does NOT walk the fallback chain when the downgrade was suppressed', async () => {
    // adminSelectedModel:true suppresses the downgrade. A transient
    // error here should surface immediately, not silently try mini → 4o.
    fetchMock = vi.fn().mockResolvedValue(fastTransient429());
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
      undefined,
      { adminSelectedModel: true },
    )).rejects.toThrow();
    // One attempt only: no fallback chain when downgrade was suppressed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(captureFetchBody(0)!.model).toBe('gpt-5.4-mini');
  });
});
