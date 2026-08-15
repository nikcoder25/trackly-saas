/**
 * Integration test for Gemini grounding, wired through queryAI('Gemini', ...).
 *
 * Two things are being pinned down here.
 *
 * 1. The outbound request carries the `google_search` tool by default.
 *    Without it Gemini answers from training-time memory, which is not
 *    what "what does Gemini say about my brand today" means, and every
 *    Gemini mention in the product would be measuring the wrong thing.
 *
 * 2. `groundingMetadata.webSearchQueries` is read back out and returned as
 *    `fanout`. That field IS the Fan-out feature - it is the engine's own
 *    report of the sub-queries it issued, so dropping it silently would
 *    leave the Fan-out page permanently empty with nothing to point at.
 *
 * The mocks mirror the ChatGPT web-search tests: every queryAI side-effect
 * dependency is stubbed and global.fetch is intercepted to inspect the body.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

// The real geminiGroundingEnabled is kept (it only reads env) so the
// default-on behaviour and the kill switch are both genuinely exercised.
vi.mock('../response-cache', async () => {
  const actual = await vi.importActual<typeof import('../response-cache')>('../response-cache');
  return {
    buildCacheKey: vi.fn().mockReturnValue('cache-key'),
    getCached: vi.fn().mockResolvedValue(null),
    setCached: vi.fn().mockResolvedValue(undefined),
    getCacheTtl: vi.fn().mockReturnValue(60),
    geminiGroundingEnabled: actual.geminiGroundingEnabled,
    __cacheStats: { hits: 0, misses: 0, writes: 0, errors: 0 },
  };
});

import { queryAI } from '../ai-platforms';

const ORIGINAL_ENV = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;

function capturedBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls[0];
  const init = call?.[1] as RequestInit | undefined;
  return JSON.parse((init?.body as string) || '{}');
}

function geminiResponse(groundingMetadata?: unknown): Response {
  return new Response(JSON.stringify({
    candidates: [{
      content: { parts: [{ text: 'Acme HVAC is well reviewed.' }] },
      finishReason: 'STOP',
      ...(groundingMetadata ? { groundingMetadata } : {}),
    }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(geminiResponse());
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  process.env.AI_GEMINI_MIN_DELAY_MS = '0';
});

afterEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe('queryAI(Gemini) grounding', () => {
  it('sends the google_search tool by default', async () => {
    delete process.env.GEMINI_GROUNDING_DISABLED;
    await queryAI('Gemini', 'best hvac in auburn', 'test-key', 'gemini-2.5-flash');
    expect(capturedBody().tools).toEqual([{ google_search: {} }]);
  });

  it('omits the tool when GEMINI_GROUNDING_DISABLED is set', async () => {
    process.env.GEMINI_GROUNDING_DISABLED = 'true';
    await queryAI('Gemini', 'best hvac in auburn', 'test-key', 'gemini-2.5-flash');
    expect(capturedBody()).not.toHaveProperty('tools');
  });

  it('omits the tool in JSON mode, which the API rejects alongside a tool', async () => {
    delete process.env.GEMINI_GROUNDING_DISABLED;
    await queryAI(
      'Gemini', 'classify these', 'test-key', 'gemini-2.5-flash',
      undefined, { jsonMode: true },
    );
    const body = capturedBody();
    expect(body).not.toHaveProperty('tools');
    expect((body.generationConfig as Record<string, unknown>).responseMimeType)
      .toBe('application/json');
  });

  it('returns webSearchQueries as fanout and grounding chunks as citations', async () => {
    delete process.env.GEMINI_GROUNDING_DISABLED;
    fetchMock.mockResolvedValue(geminiResponse({
      webSearchQueries: ['hvac auburn wa reviews', 'best hvac companies auburn'],
      groundingChunks: [
        { web: { uri: 'https://vertexaisearch.example/redirect/abc' } },
        { web: { uri: 'https://vertexaisearch.example/redirect/def' } },
      ],
    }));
    const result = await queryAI('Gemini', 'best hvac in auburn', 'test-key', 'gemini-2.5-flash');
    expect(result.fanout).toEqual(['hvac auburn wa reviews', 'best hvac companies auburn']);
    expect(result.citations).toHaveLength(2);
  });

  it('deduplicates repeated fan-out queries', async () => {
    fetchMock.mockResolvedValue(geminiResponse({
      webSearchQueries: ['hvac auburn', 'hvac auburn', 'ac repair auburn'],
    }));
    const result = await queryAI('Gemini', 'q', 'test-key', 'gemini-2.5-flash');
    expect(result.fanout).toEqual(['hvac auburn', 'ac repair auburn']);
  });

  it('yields an empty fanout, not a crash, when the response carries no grounding', async () => {
    // An ungrounded answer is a legitimate outcome (the model may decide
    // not to search); it must not take the whole run down with it.
    fetchMock.mockResolvedValue(geminiResponse());
    const result = await queryAI('Gemini', 'q', 'test-key', 'gemini-2.5-flash');
    expect(result.fanout).toEqual([]);
    expect(result.citations).toEqual([]);
  });

  it('ignores malformed grounding metadata', async () => {
    fetchMock.mockResolvedValue(geminiResponse({
      webSearchQueries: 'not-an-array',
      groundingChunks: [{ web: {} }, {}],
    }));
    const result = await queryAI('Gemini', 'q', 'test-key', 'gemini-2.5-flash');
    expect(result.fanout).toEqual([]);
    expect(result.citations).toEqual([]);
  });
});
