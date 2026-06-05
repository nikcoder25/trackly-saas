/**
 * Output-token cost knobs for ChatGPT calls:
 *
 *   - `reasoning_effort` — gpt-5 reasoning models default to "medium"
 *     when unset, which burns hidden reasoning tokens (billed as
 *     output). Default "minimal" via CHATGPT_REASONING_EFFORT. Empty
 *     string omits the field.
 *
 *   - `verbosity` — gpt-5 default "medium" lets responses overrun the
 *     SYSTEM_PROMPT "Max 80 words" budget. Default "low" via
 *     CHATGPT_VERBOSITY. Empty string omits the field.
 *
 * Both fields are gpt-5-only. gpt-4o / *-search-preview reject them,
 * so the payload must not carry either field when the resolved model
 * isn't gpt-5.
 *
 * Mocks and fixtures mirror chatgpt-cost-knobs.test.ts so the queryAI
 * ChatGPT branch exercises end-to-end with a captured fetch body.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capture ChatGPT minDelay at module-load time. Hoist the override so
// it's in place BEFORE ai-platforms.ts is imported below, otherwise
// the second outbound call sits on a 6 s rate-limit sleep.
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
  getChatGPTReasoningEffort,
  getChatGPTVerbosity,
} from '../ai-platforms';

const ORIGINAL_ENV = { ...process.env };

interface CapturedBody {
  model?: string;
  reasoning_effort?: string;
  verbosity?: string;
  max_tokens?: number;
  max_completion_tokens?: number;
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

function captureFetchUrl(callIdx = 0): string | null {
  const call = fetchMock.mock.calls[callIdx];
  if (!call) return null;
  return String(call[0]);
}

function okOpenAiResponse(modelEcho = 'gpt-5.4-nano'): Response {
  return new Response(JSON.stringify({
    id: 'chatcmpl-test',
    model: modelEcho,
    choices: [{ message: { content: 'ok', annotations: [] } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function okClaudeResponse(): Response {
  return new Response(JSON.stringify({
    id: 'msg-test',
    model: 'claude-haiku-4-5-20251001',
    content: [{ type: 'text', text: 'ok' }],
    usage: { input_tokens: 10, output_tokens: 5 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function okPerplexityResponse(): Response {
  return new Response(JSON.stringify({
    id: 'pplx-test',
    model: 'sonar',
    choices: [{ message: { content: 'ok' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
    citations: [],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function okGrokResponse(): Response {
  return new Response(JSON.stringify({
    id: 'grok-test',
    model: 'grok-3-mini',
    choices: [{ message: { content: 'ok' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function okGeminiResponse(): Response {
  return new Response(JSON.stringify({
    modelVersion: 'gemini-2.5-flash',
    candidates: [{ content: { parts: [{ text: 'ok' }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(okOpenAiResponse());
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  process.env.AI_CHATGPT_MIN_DELAY_MS = '0';
  process.env.AI_CHATGPT_MAX_RETRIES = '0';
  process.env.AI_CHATGPT_MAX_RETRY_SLEEP_MS = '0';
  process.env.CHATGPT_SMART_MODEL_ROUTING = 'false';
  delete process.env.CHATGPT_WEB_SEARCH_GATING;
  delete process.env.WEB_SEARCH_DEFAULT_OFF;
  delete process.env.CHATGPT_REASONING_EFFORT;
  delete process.env.CHATGPT_VERBOSITY;
});

afterEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

// ────────────────────────────────────────────────────────────────────
// Env helpers
// ────────────────────────────────────────────────────────────────────

describe('getChatGPTReasoningEffort (env helper)', () => {
  it('defaults to "minimal" when unset', () => {
    delete process.env.CHATGPT_REASONING_EFFORT;
    expect(getChatGPTReasoningEffort()).toBe('minimal');
  });
  it('respects minimal|low|medium|high', () => {
    for (const v of ['minimal', 'low', 'medium', 'high']) {
      process.env.CHATGPT_REASONING_EFFORT = v;
      expect(getChatGPTReasoningEffort()).toBe(v);
    }
  });
  it('normalises case + whitespace', () => {
    process.env.CHATGPT_REASONING_EFFORT = '  HIGH  ';
    expect(getChatGPTReasoningEffort()).toBe('high');
  });
  it('falls back to "minimal" on garbage input', () => {
    process.env.CHATGPT_REASONING_EFFORT = 'extreme';
    expect(getChatGPTReasoningEffort()).toBe('minimal');
  });
  it('returns null when explicitly set to empty string', () => {
    process.env.CHATGPT_REASONING_EFFORT = '';
    expect(getChatGPTReasoningEffort()).toBeNull();
  });
});

describe('getChatGPTVerbosity (env helper)', () => {
  it('defaults to "low" when unset', () => {
    delete process.env.CHATGPT_VERBOSITY;
    expect(getChatGPTVerbosity()).toBe('low');
  });
  it('respects low|medium|high', () => {
    for (const v of ['low', 'medium', 'high']) {
      process.env.CHATGPT_VERBOSITY = v;
      expect(getChatGPTVerbosity()).toBe(v);
    }
  });
  it('normalises case + whitespace', () => {
    process.env.CHATGPT_VERBOSITY = '  Medium ';
    expect(getChatGPTVerbosity()).toBe('medium');
  });
  it('falls back to "low" on garbage input', () => {
    process.env.CHATGPT_VERBOSITY = 'whisper';
    expect(getChatGPTVerbosity()).toBe('low');
  });
  it('returns null when explicitly set to empty string', () => {
    process.env.CHATGPT_VERBOSITY = '';
    expect(getChatGPTVerbosity()).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// (a) reasoning_effort on the gpt-5 outbound body
// ────────────────────────────────────────────────────────────────────

describe('queryAI(ChatGPT) — reasoning_effort on the outbound body', () => {
  it('attaches reasoning_effort:"minimal" by default for gpt-5.x models', async () => {
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body).not.toBeNull();
    expect(body!.model).toBe('gpt-5.4-mini');
    expect(body!.reasoning_effort).toBe('minimal');
  });

  it('respects CHATGPT_REASONING_EFFORT=high override', async () => {
    process.env.CHATGPT_REASONING_EFFORT = 'high';
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body!.reasoning_effort).toBe('high');
  });

  it('omits reasoning_effort entirely when CHATGPT_REASONING_EFFORT=""', async () => {
    process.env.CHATGPT_REASONING_EFFORT = '';
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body).not.toHaveProperty('reasoning_effort');
    // Verbosity remains unaffected — each lever is independently disable-able.
    expect(body!.verbosity).toBe('low');
  });
});

// ────────────────────────────────────────────────────────────────────
// (b) verbosity on the gpt-5 outbound body
// ────────────────────────────────────────────────────────────────────

describe('queryAI(ChatGPT) — verbosity on the outbound body', () => {
  it('attaches verbosity:"low" by default for gpt-5.x models', async () => {
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-nano',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body!.model).toBe('gpt-5.4-nano');
    expect(body!.verbosity).toBe('low');
  });

  it('respects CHATGPT_VERBOSITY=medium override', async () => {
    process.env.CHATGPT_VERBOSITY = 'medium';
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body!.verbosity).toBe('medium');
  });

  it('omits verbosity entirely when CHATGPT_VERBOSITY=""', async () => {
    process.env.CHATGPT_VERBOSITY = '';
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body).not.toHaveProperty('verbosity');
    // reasoning_effort remains unaffected.
    expect(body!.reasoning_effort).toBe('minimal');
  });

  it('omits BOTH fields when both env vars are empty', async () => {
    process.env.CHATGPT_REASONING_EFFORT = '';
    process.env.CHATGPT_VERBOSITY = '';
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-5.4-mini',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('verbosity');
    // Existing output cap is still enforced through max_completion_tokens —
    // this PR only touches the reasoning/verbosity knobs.
    expect(body!.max_completion_tokens).toBe(100);
  });
});

// ────────────────────────────────────────────────────────────────────
// (c) non-gpt-5 models must NOT carry either field
// ────────────────────────────────────────────────────────────────────

describe('queryAI(ChatGPT) — non-gpt-5 models are not touched', () => {
  it('gpt-4o-mini-search-preview gets neither reasoning_effort nor verbosity', async () => {
    // Search-preview model on a freshness query → web_search attaches;
    // search-preview rejects reasoning_effort/verbosity so the payload
    // must omit them.
    await queryAI(
      'ChatGPT',
      'breaking news on Stripe today',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body!.model).toBe('gpt-4o-mini-search-preview');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('verbosity');
    // Existing search_context_size lever still applies on this path.
    expect(body!.web_search_options).toBeDefined();
  });

  it('gpt-4o (non-search) also gets neither field', async () => {
    await queryAI(
      'ChatGPT',
      'What is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body!.model).toBe('gpt-4o');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('verbosity');
  });

  it('non-gpt-5 models ignore explicit env overrides too', async () => {
    process.env.CHATGPT_REASONING_EFFORT = 'high';
    process.env.CHATGPT_VERBOSITY = 'high';
    await queryAI(
      'ChatGPT',
      'breaking news on Stripe today',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      'gpt-4o-mini-search-preview',
      undefined,
      { adminSelectedModel: true },
    );
    const body = captureFetchBody();
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('verbosity');
  });
});

// ────────────────────────────────────────────────────────────────────
// (d) other providers are NOT touched — bodies must stay unchanged
// ────────────────────────────────────────────────────────────────────

describe('Claude / Perplexity / Gemini / Grok request bodies are unchanged', () => {
  it('Claude body carries no ChatGPT-only fields', async () => {
    fetchMock = vi.fn().mockResolvedValue(okClaudeResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    // Force-set both knobs to prove they leak nowhere outside ChatGPT.
    process.env.CHATGPT_REASONING_EFFORT = 'high';
    process.env.CHATGPT_VERBOSITY = 'high';
    await queryAI(
      'Claude',
      'List 3 coffee shops',
      `sk-claude-${Math.random().toString(36).slice(2)}`,
      'claude-haiku-4-5-20251001',
    );
    const body = captureFetchBody();
    expect(body).not.toBeNull();
    // Original byte-shape: model, max_tokens (legacy field — anthropic still
    // expects it), system, messages.
    expect(body!.model).toBe('claude-haiku-4-5-20251001');
    expect(body!.max_tokens).toBe(100);
    expect(body).toHaveProperty('system');
    expect(body).toHaveProperty('messages');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('verbosity');
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('web_search_options');
    // Hit the Anthropic endpoint, nothing else.
    expect(captureFetchUrl()).toContain('api.anthropic.com');
  });

  it('Perplexity body carries no ChatGPT-only fields', async () => {
    fetchMock = vi.fn().mockResolvedValue(okPerplexityResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    process.env.CHATGPT_REASONING_EFFORT = 'high';
    process.env.CHATGPT_VERBOSITY = 'high';
    await queryAI(
      'Perplexity',
      'List 3 coffee shops',
      `sk-pplx-${Math.random().toString(36).slice(2)}`,
      'sonar',
    );
    const body = captureFetchBody();
    expect(body).not.toBeNull();
    expect(body!.model).toBe('sonar');
    expect(body!.max_tokens).toBe(100);
    expect(body).toHaveProperty('return_citations', true);
    expect(body).toHaveProperty('messages');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('verbosity');
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('web_search_options');
    expect(captureFetchUrl()).toContain('api.perplexity.ai');
  });

  it('Grok body carries no ChatGPT-only fields', async () => {
    fetchMock = vi.fn().mockResolvedValue(okGrokResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    process.env.CHATGPT_REASONING_EFFORT = 'high';
    process.env.CHATGPT_VERBOSITY = 'high';
    await queryAI(
      'Grok',
      'List 3 coffee shops',
      `sk-grok-${Math.random().toString(36).slice(2)}`,
      'grok-3-mini',
    );
    const body = captureFetchBody();
    expect(body).not.toBeNull();
    expect(body!.model).toBe('grok-3-mini');
    expect(body!.max_tokens).toBe(100);
    expect(body).toHaveProperty('messages');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('verbosity');
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('web_search_options');
    expect(captureFetchUrl()).toContain('api.x.ai');
  });

  it('Gemini body carries no ChatGPT-only fields', async () => {
    fetchMock = vi.fn().mockResolvedValue(okGeminiResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    process.env.CHATGPT_REASONING_EFFORT = 'high';
    process.env.CHATGPT_VERBOSITY = 'high';
    await queryAI(
      'Gemini',
      'List 3 coffee shops',
      `sk-gem-${Math.random().toString(36).slice(2)}`,
      'gemini-2.5-flash',
    );
    const body = captureFetchBody();
    expect(body).not.toBeNull();
    // Gemini uses its own payload shape: systemInstruction / contents /
    // generationConfig.maxOutputTokens.
    expect(body).toHaveProperty('systemInstruction');
    expect(body).toHaveProperty('contents');
    expect(body).toHaveProperty('generationConfig');
    expect((body!.generationConfig as { maxOutputTokens: number }).maxOutputTokens).toBe(100);
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('verbosity');
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('web_search_options');
    // Hit the Gemini endpoint, nothing else.
    expect(captureFetchUrl()).toContain('generativelanguage.googleapis.com');
  });
});
