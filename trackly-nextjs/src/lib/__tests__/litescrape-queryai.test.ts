/**
 * queryAI routing for the Litescrape-backed engines: Gemini goes to
 * consumer Gemini via Litescrape first and falls back to the API; Google
 * AI Overview / AI Mode are read from Google with the brand's city.
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

// Hoisted because vi.mock's factory is lifted above ordinary top-level
// declarations, which would otherwise be in the temporal dead zone.
const { recordCostEventMock, recordCallMock } = vi.hoisted(() => ({
  recordCostEventMock: vi.fn().mockResolvedValue(undefined),
  recordCallMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../cost-tracker', () => ({
  enforceCostCap: vi.fn().mockResolvedValue(undefined),
  enforcePlatformDailyCap: vi.fn().mockResolvedValue(undefined),
  estimateAnthropicCostUsd: vi.fn().mockReturnValue(null),
  recordCostEvent: recordCostEventMock,
  recordCall: recordCallMock,
  CHATGPT_WEB_SEARCH_CALL_USD: 0.030,
  GEMINI_GROUNDING_CALL_USD: 0.035,
  // Fixed token cost so assertions isolate the grounding surcharge.
  estimateCostUsd: vi.fn().mockReturnValue(0.0004),
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
const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const geminiApi = () => ok({
  candidates: [{ content: { parts: [{ text: 'From the API.' }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
});
const urlOf = (i: number) => String(fetchMock.mock.calls[i]?.[0]);

beforeEach(() => {
  process.env.AI_GEMINI_MIN_DELAY_MS = '0';
  process.env.LITESCRAPE_API_KEY = 'ls-key';
});

afterEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe('queryAI(Gemini) via Litescrape', () => {
  it('uses Litescrape and records its per-call cost', async () => {
    fetchMock = vi.fn().mockResolvedValue(ok({ text: 'Acme HVAC is the top pick.' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await queryAI('Gemini', 'best hvac in auburn', 'gem-key', 'gemini-2.5-flash-lite', undefined, { tenantId: 't1' });
    expect(r.text).toBe('Acme HVAC is the top pick.');
    expect(r.model).toBe('gemini-web-litescrape');
    expect(urlOf(0)).toContain('api.litescrape.com/api/google/gemini');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recordCallMock).toHaveBeenCalledWith(expect.objectContaining({ costUsd: 0.00015 }));
  });

  it('falls back to the Gemini API when Litescrape fails', async () => {
    fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ error: 'down' }, 503))
      .mockResolvedValue(geminiApi());
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await queryAI('Gemini', 'best hvac in auburn 2', 'gem-key', 'gemini-2.5-flash-lite');
    expect(r.text).toBe('From the API.');
    expect(urlOf(1)).toContain('generativelanguage');
  });

  it('keeps JSON-mode callers on the API', async () => {
    fetchMock = vi.fn().mockResolvedValue(ok({
      candidates: [{ content: { parts: [{ text: '{"a":1}' }] }, finishReason: 'STOP' }],
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await queryAI('Gemini', 'parse this', 'gem-key', 'gemini-2.5-flash-lite', undefined, { jsonMode: true });
    expect(urlOf(0)).not.toContain('litescrape');
  });

  it('is off with GEMINI_VIA_LITESCRAPE=false', async () => {
    process.env.GEMINI_VIA_LITESCRAPE = 'false';
    fetchMock = vi.fn().mockResolvedValue(geminiApi());
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await queryAI('Gemini', 'best hvac in auburn 3', 'gem-key', 'gemini-2.5-flash-lite');
    expect(urlOf(0)).not.toContain('litescrape');
  });
});

describe('queryAI(Google AI Overview / AI Mode)', () => {
  it('reads the AI Overview from the brand city', async () => {
    fetchMock = vi.fn().mockResolvedValue(ok({
      ai_overview: { text_blocks: [{ type: 'paragraph', snippet: 'Acme HVAC is well reviewed.' }], references: [{ link: 'https://acme.com/' }] },
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await queryAI('Google AI Overview', 'best hvac', 'ls-key', undefined, { city: 'Auburn, AL' });
    expect(r.text).toBe('Acme HVAC is well reviewed.');
    expect(r.citations).toEqual(['https://acme.com/']);
    expect(r.model).toBe('google-ai-overview');
    expect(new URL(urlOf(0)).searchParams.get('location')).toBe('Auburn, AL');
  });

  it('returns empty text when Google shows no AI Overview', async () => {
    fetchMock = vi.fn().mockResolvedValue(ok({ ai_overview: null }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await queryAI('Google AI Overview', 'obscure query', 'ls-key');
    expect(r.text).toBe('');
    expect(recordCallMock).toHaveBeenCalledWith(expect.objectContaining({ costUsd: 0 }));
  });

  it('reads AI Mode', async () => {
    fetchMock = vi.fn().mockResolvedValue(ok({
      text_blocks: [{ type: 'paragraph', snippet: 'Try Acme HVAC.' }], references: [],
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const r = await queryAI('Google AI Mode', 'best hvac near me', 'ls-key', undefined, { city: 'Auburn, AL' });
    expect(r.text).toBe('Try Acme HVAC.');
    expect(urlOf(0)).toContain('/api/google/ai-mode');
  });
});
