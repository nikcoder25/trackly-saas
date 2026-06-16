/**
 * Determinism knobs for ChatGPT (gpt-5.x family only).
 *
 * Two env-driven fields - `temperature` (default 0) and `seed` (default 7)
 * - are attached to the OpenAI request body to make identical
 * (prompt, model) pairs return byte-identical answers. This stabilises
 * the Postgres response cache so repeat queries land as hits.
 *
 * The tests below pin three contracts:
 *   (a) Each field is read from process.env at call time and can be
 *       disabled independently via empty-string env (no redeploy).
 *   (b) Neither field is attached for non-gpt-5 models. Older OpenAI
 *       cohorts (gpt-4o, *-search-preview) reject or silently ignore
 *       these fields.
 *   (c) Claude / Perplexity / Gemini / Grok request bodies are
 *       byte-unchanged. The whole point of this PR is that nothing
 *       outside the ChatGPT branch moves.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PLATFORM_RATE_LIMITS.ChatGPT.minDelayMs is captured at module load.
// Hoist the bypass so the second ChatGPT call in this file doesn't sit
// on a 6 s rate-limit sleep and time the test out.
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

import {
  queryAI,
  isGpt5xModel,
  getChatGPTTemperature,
  getChatGPTSeed,
} from '../ai-platforms';

const ORIGINAL_ENV = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;

function captureFetchBody(): Record<string, unknown> | null {
  const call = fetchMock.mock.calls[0];
  if (!call) return null;
  const init = call[1] as RequestInit | undefined;
  if (!init?.body) return null;
  return JSON.parse(init.body as string);
}

function okOpenAiResponse(model: string): Response {
  return new Response(JSON.stringify({
    id: 'chatcmpl-test',
    model,
    choices: [{ message: { content: 'ok', annotations: [] } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function okClaudeResponse(model: string): Response {
  return new Response(JSON.stringify({
    id: 'msg-test',
    model,
    content: [{ type: 'text', text: 'ok' }],
    usage: { input_tokens: 10, output_tokens: 5 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function okGeminiResponse(): Response {
  return new Response(JSON.stringify({
    candidates: [{
      content: { parts: [{ text: 'ok' }] },
      finishReason: 'STOP',
    }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function okPerplexityResponse(model: string): Response {
  return new Response(JSON.stringify({
    id: 'pplx-test',
    model,
    choices: [{ message: { content: 'ok' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
    citations: [],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function okGrokResponse(model: string): Response {
  return new Response(JSON.stringify({
    id: 'grok-test',
    model,
    choices: [{ message: { content: 'ok' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  // Default to an OpenAI-shaped response; per-test code can override.
  fetchMock = vi.fn().mockResolvedValue(okOpenAiResponse('gpt-5.4-mini'));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  process.env.AI_CHATGPT_MIN_DELAY_MS = '0';
  process.env.CHATGPT_SMART_MODEL_ROUTING = 'false';
  // Wipe inherited determinism env so each test sets its own.
  delete process.env.CHATGPT_TEMPERATURE;
  delete process.env.CHATGPT_SEED;
});

afterEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

// ── Helper-level contracts ──────────────────────────────

describe('isGpt5xModel', () => {
  it('matches every gpt-5.x id the catalog ships today', () => {
    expect(isGpt5xModel('gpt-5.4-mini')).toBe(true);
    expect(isGpt5xModel('gpt-5.4')).toBe(true);
    expect(isGpt5xModel('gpt-5.4-nano')).toBe(true);
    // Forward-compat: future gpt-5.x point releases must keep matching.
    expect(isGpt5xModel('gpt-5.5-mini')).toBe(true);
    expect(isGpt5xModel('gpt-5-foo')).toBe(true);
  });

  it('rejects every model that does NOT accept seed/temperature reliably', () => {
    expect(isGpt5xModel('gpt-4o')).toBe(false);
    expect(isGpt5xModel('gpt-4o-mini')).toBe(false);
    expect(isGpt5xModel('gpt-4o-mini-search-preview')).toBe(false);
    expect(isGpt5xModel('gpt-4-turbo')).toBe(false);
    expect(isGpt5xModel('o1-preview')).toBe(false);
    expect(isGpt5xModel('claude-haiku-4-5-20251001')).toBe(false);
    expect(isGpt5xModel('')).toBe(false);
  });
});

describe('getChatGPTTemperature', () => {
  it('defaults to 0 when unset', () => {
    delete process.env.CHATGPT_TEMPERATURE;
    expect(getChatGPTTemperature()).toBe(0);
  });

  it('returns null when set to empty string (disables the field)', () => {
    process.env.CHATGPT_TEMPERATURE = '';
    expect(getChatGPTTemperature()).toBeNull();
  });

  it('parses numeric overrides', () => {
    process.env.CHATGPT_TEMPERATURE = '0.7';
    expect(getChatGPTTemperature()).toBe(0.7);
    process.env.CHATGPT_TEMPERATURE = '0';
    expect(getChatGPTTemperature()).toBe(0);
  });

  it('falls back to 0 on bogus input rather than NaN', () => {
    process.env.CHATGPT_TEMPERATURE = 'not-a-number';
    expect(getChatGPTTemperature()).toBe(0);
  });
});

describe('getChatGPTSeed', () => {
  it('defaults to 7 when unset', () => {
    delete process.env.CHATGPT_SEED;
    expect(getChatGPTSeed()).toBe(7);
  });

  it('returns null when set to empty string (disables the field)', () => {
    process.env.CHATGPT_SEED = '';
    expect(getChatGPTSeed()).toBeNull();
  });

  it('parses integer overrides', () => {
    process.env.CHATGPT_SEED = '42';
    expect(getChatGPTSeed()).toBe(42);
  });

  it('truncates floats and falls back to 7 on bogus input', () => {
    process.env.CHATGPT_SEED = '99.9';
    expect(getChatGPTSeed()).toBe(99);
    process.env.CHATGPT_SEED = 'nope';
    expect(getChatGPTSeed()).toBe(7);
  });
});

// ── ChatGPT body wiring (integration) ───────────────────

describe('queryAI(ChatGPT, gpt-5.x) - temperature + seed attached', () => {
  it('attaches both fields with defaults on a plain gpt-5.4-mini call', async () => {
    fetchMock.mockResolvedValueOnce(okOpenAiResponse('gpt-5.4-mini'));
    await queryAI(
      'ChatGPT',
      'recommend bakeries in Austin',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
    );
    const body = captureFetchBody();
    expect(body).not.toBeNull();
    expect(body!.temperature).toBe(0);
    expect(body!.seed).toBe(7);
  });

  it('honours runtime env overrides at call time (no redeploy)', async () => {
    process.env.CHATGPT_TEMPERATURE = '0.3';
    process.env.CHATGPT_SEED = '123';
    fetchMock.mockResolvedValueOnce(okOpenAiResponse('gpt-5.4-mini'));
    await queryAI(
      'ChatGPT',
      'recommend bakeries in Austin',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
    );
    const body = captureFetchBody();
    expect(body!.temperature).toBe(0.3);
    expect(body!.seed).toBe(123);
  });

  it('CHATGPT_TEMPERATURE="" disables temperature INDEPENDENTLY of seed', async () => {
    process.env.CHATGPT_TEMPERATURE = '';
    fetchMock.mockResolvedValueOnce(okOpenAiResponse('gpt-5.4-mini'));
    await queryAI(
      'ChatGPT',
      'recommend bakeries in Austin',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
    );
    const body = captureFetchBody();
    expect(body).not.toHaveProperty('temperature');
    expect(body!.seed).toBe(7);
  });

  it('CHATGPT_SEED="" disables seed INDEPENDENTLY of temperature', async () => {
    process.env.CHATGPT_SEED = '';
    fetchMock.mockResolvedValueOnce(okOpenAiResponse('gpt-5.4-mini'));
    await queryAI(
      'ChatGPT',
      'recommend bakeries in Austin',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
    );
    const body = captureFetchBody();
    expect(body!.temperature).toBe(0);
    expect(body).not.toHaveProperty('seed');
  });

  it('both empty → full rollback, neither field attached', async () => {
    process.env.CHATGPT_TEMPERATURE = '';
    process.env.CHATGPT_SEED = '';
    fetchMock.mockResolvedValueOnce(okOpenAiResponse('gpt-5.4-mini'));
    await queryAI(
      'ChatGPT',
      'recommend bakeries in Austin',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
    );
    const body = captureFetchBody();
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('seed');
  });

  it('also attaches to gpt-5.4 (full) and gpt-5.4-nano', async () => {
    fetchMock.mockResolvedValueOnce(okOpenAiResponse('gpt-5.4'));
    await queryAI('ChatGPT', 'q', 'sk-a', 'gpt-5.4');
    let body = captureFetchBody();
    expect(body!.temperature).toBe(0);
    expect(body!.seed).toBe(7);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(okOpenAiResponse('gpt-5.4-nano'));
    await queryAI('ChatGPT', 'q', 'sk-b', 'gpt-5.4-nano');
    body = captureFetchBody();
    expect(body!.temperature).toBe(0);
    expect(body!.seed).toBe(7);
  });
});

describe('queryAI(ChatGPT, non-gpt-5.x) - neither field attached', () => {
  it('does NOT attach temperature/seed to gpt-4o-mini-search-preview', async () => {
    fetchMock.mockResolvedValueOnce(okOpenAiResponse('gpt-4o-mini-search-preview'));
    await queryAI(
      'ChatGPT',
      'recommend bakeries in Austin',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
    );
    const body = captureFetchBody();
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('seed');
    expect(body!.model).toBe('gpt-4o-mini-search-preview');
  });

  it('does NOT attach temperature/seed to gpt-4o', async () => {
    fetchMock.mockResolvedValueOnce(okOpenAiResponse('gpt-4o'));
    await queryAI(
      'ChatGPT',
      'recommend bakeries in Austin',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o',
    );
    const body = captureFetchBody();
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('seed');
  });
});

// ── Other platforms are byte-unchanged ──────────────────
// Even with the determinism env set to the values that would attach
// fields on ChatGPT, the Claude / Perplexity / Gemini / Grok bodies
// must come out exactly as they did before this PR. Asserting against
// a full literal body is the strongest "byte-unchanged" check we can
// write in a unit test.

const SYSTEM_PROMPT =
  'Recommendation assistant. List 3-6 specific businesses by name with one-line descriptions. Max 80 words. No intro, no caveats, no closing advice.';
const MAX_TOK = Number(process.env.AI_MAX_OUTPUT_TOKENS) || 100;

describe('non-ChatGPT request bodies are byte-unchanged', () => {
  beforeEach(() => {
    // Set determinism env to the values that DO attach fields on
    // ChatGPT - proves these knobs cannot leak into other providers.
    process.env.CHATGPT_TEMPERATURE = '0';
    process.env.CHATGPT_SEED = '7';
  });

  it('Claude body: { model, max_tokens, system, messages } - nothing else', async () => {
    fetchMock.mockResolvedValueOnce(okClaudeResponse('claude-haiku-4-5-20251001'));
    await queryAI(
      'Claude',
      'recommend bakeries in Austin',
      `sk-ant-${Math.random().toString(36).slice(2)}`,
      'claude-haiku-4-5-20251001',
    );
    const body = captureFetchBody();
    expect(body).toEqual({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: MAX_TOK,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'recommend bakeries in Austin' }],
    });
  });

  it('Perplexity body: { model, max_tokens, return_citations, messages } - nothing else', async () => {
    fetchMock.mockResolvedValueOnce(okPerplexityResponse('sonar'));
    await queryAI(
      'Perplexity',
      'recommend bakeries in Austin',
      `pplx-${Math.random().toString(36).slice(2)}`,
      'sonar',
    );
    const body = captureFetchBody();
    expect(body).toEqual({
      model: 'sonar',
      max_tokens: MAX_TOK,
      return_citations: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: 'recommend bakeries in Austin' },
      ],
    });
  });

  it('Gemini body: { systemInstruction, contents, generationConfig } - nothing else', async () => {
    fetchMock.mockResolvedValueOnce(okGeminiResponse());
    await queryAI(
      'Gemini',
      'recommend bakeries in Austin',
      `AIza-${Math.random().toString(36).slice(2)}`,
      'gemini-2.5-flash',
    );
    const body = captureFetchBody();
    expect(body).toEqual({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: 'recommend bakeries in Austin' }] }],
      generationConfig: { maxOutputTokens: MAX_TOK },
    });
  });

  it('Grok body: { model, max_tokens, messages } - nothing else', async () => {
    fetchMock.mockResolvedValueOnce(okGrokResponse('grok-3-mini'));
    await queryAI(
      'Grok',
      'recommend bakeries in Austin',
      `xai-${Math.random().toString(36).slice(2)}`,
      'grok-3-mini',
    );
    const body = captureFetchBody();
    expect(body).toEqual({
      model: 'grok-3-mini',
      max_tokens: MAX_TOK,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: 'recommend bakeries in Austin' },
      ],
    });
  });
});
