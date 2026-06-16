/**
 * OpenAI Batch API path for no-search ChatGPT calls.
 *
 * Three behaviors under test:
 *   1. Config helpers respect CHATGPT_BATCH_ENABLED /
 *      CHATGPT_BATCH_MAX_WAIT_MS / CHATGPT_BATCH_POLL_INTERVAL_MS with
 *      conservative defaults.
 *   2. parseBatchOutput() maps JSONL rows to BatchItemResult by
 *      customId, surfacing per-row errors and reporting absent rows.
 *   3. queryAI(ChatGPT) on the no-search path routes through the batch
 *      API only when the flag is on AND the caller marked
 *      batchEligible. When off (default), behavior is byte-identical
 *      to the synchronous Chat Completions path. On batch failure,
 *      falls back to sync so no tick is silently dropped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  isChatGPTBatchEnabled,
  getChatGPTBatchMaxWaitMs,
  getChatGPTBatchPollIntervalMs,
  parseBatchOutput,
  submitChatGPTBatch,
  ChatGPTBatchError,
  type BatchRequest,
} from '../chatgpt-batch';
import { queryAI } from '../ai-platforms';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.AI_CHATGPT_MIN_DELAY_MS = '0';
  process.env.AI_CHATGPT_MAX_RETRIES = '0';
  process.env.AI_CHATGPT_MAX_RETRY_SLEEP_MS = '0';
  process.env.CHATGPT_SMART_MODEL_ROUTING = 'false';
  delete process.env.CHATGPT_WEB_SEARCH_GATING;
  delete process.env.WEB_SEARCH_DEFAULT_OFF;
  delete process.env.CHATGPT_NONSEARCH_MODEL;
  delete process.env.CHATGPT_BATCH_ENABLED;
  delete process.env.CHATGPT_BATCH_MAX_WAIT_MS;
  delete process.env.CHATGPT_BATCH_POLL_INTERVAL_MS;
});

afterEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

// ────────────────────────────────────────────────────────────────────
// Config helpers
// ────────────────────────────────────────────────────────────────────

describe('isChatGPTBatchEnabled', () => {
  it('defaults to false when unset', () => {
    delete process.env.CHATGPT_BATCH_ENABLED;
    expect(isChatGPTBatchEnabled()).toBe(false);
  });
  it('accepts true / 1 / yes (case-insensitive)', () => {
    process.env.CHATGPT_BATCH_ENABLED = 'true';
    expect(isChatGPTBatchEnabled()).toBe(true);
    process.env.CHATGPT_BATCH_ENABLED = 'TRUE';
    expect(isChatGPTBatchEnabled()).toBe(true);
    process.env.CHATGPT_BATCH_ENABLED = '1';
    expect(isChatGPTBatchEnabled()).toBe(true);
    process.env.CHATGPT_BATCH_ENABLED = 'yes';
    expect(isChatGPTBatchEnabled()).toBe(true);
  });
  it('treats anything else (including "false") as disabled', () => {
    process.env.CHATGPT_BATCH_ENABLED = 'false';
    expect(isChatGPTBatchEnabled()).toBe(false);
    process.env.CHATGPT_BATCH_ENABLED = '0';
    expect(isChatGPTBatchEnabled()).toBe(false);
    process.env.CHATGPT_BATCH_ENABLED = '';
    expect(isChatGPTBatchEnabled()).toBe(false);
  });
});

describe('getChatGPTBatchMaxWaitMs', () => {
  it('defaults to 6h', () => {
    delete process.env.CHATGPT_BATCH_MAX_WAIT_MS;
    expect(getChatGPTBatchMaxWaitMs()).toBe(6 * 60 * 60 * 1000);
  });
  it('respects positive overrides', () => {
    process.env.CHATGPT_BATCH_MAX_WAIT_MS = '120000';
    expect(getChatGPTBatchMaxWaitMs()).toBe(120000);
  });
  it('falls back to default on garbage / non-positive', () => {
    process.env.CHATGPT_BATCH_MAX_WAIT_MS = 'oops';
    expect(getChatGPTBatchMaxWaitMs()).toBe(6 * 60 * 60 * 1000);
    process.env.CHATGPT_BATCH_MAX_WAIT_MS = '-1';
    expect(getChatGPTBatchMaxWaitMs()).toBe(6 * 60 * 60 * 1000);
  });
});

describe('getChatGPTBatchPollIntervalMs', () => {
  it('defaults to 30s', () => {
    delete process.env.CHATGPT_BATCH_POLL_INTERVAL_MS;
    expect(getChatGPTBatchPollIntervalMs()).toBe(30_000);
  });
  it('respects overrides', () => {
    process.env.CHATGPT_BATCH_POLL_INTERVAL_MS = '5000';
    expect(getChatGPTBatchPollIntervalMs()).toBe(5000);
  });
});

// ────────────────────────────────────────────────────────────────────
// parseBatchOutput
// ────────────────────────────────────────────────────────────────────

describe('parseBatchOutput', () => {
  const items: BatchRequest[] = [
    { customId: 'a', body: { model: 'gpt-5.4-nano' } },
    { customId: 'b', body: { model: 'gpt-5.4-nano' } },
    { customId: 'c', body: { model: 'gpt-5.4-nano' } },
  ];

  it('maps each completed row to its customId, exposing the chat completions body unchanged', () => {
    const jsonl = [
      JSON.stringify({
        custom_id: 'a',
        response: {
          status_code: 200,
          body: {
            id: 'chatcmpl-a',
            model: 'gpt-5.4-nano',
            choices: [{ message: { content: 'hello A' } }],
            usage: { prompt_tokens: 10, completion_tokens: 2 },
          },
        },
      }),
      JSON.stringify({
        custom_id: 'b',
        response: {
          status_code: 200,
          body: {
            id: 'chatcmpl-b',
            model: 'gpt-5.4-nano',
            choices: [{ message: { content: 'hello B' } }],
            usage: { prompt_tokens: 11, completion_tokens: 3 },
          },
        },
      }),
      JSON.stringify({
        custom_id: 'c',
        response: {
          status_code: 200,
          body: {
            id: 'chatcmpl-c',
            model: 'gpt-5.4-nano',
            choices: [{ message: { content: 'hello C' } }],
            usage: { prompt_tokens: 12, completion_tokens: 4 },
          },
        },
      }),
    ].join('\n');

    const results = parseBatchOutput(jsonl, items);
    const byId = Object.fromEntries(results.map(r => [r.customId, r]));

    expect(byId.a.error).toBeNull();
    expect(byId.a.response?.choices?.[0]?.message?.content).toBe('hello A');
    expect(byId.b.response?.usage?.prompt_tokens).toBe(11);
    expect(byId.c.response?.id).toBe('chatcmpl-c');
  });

  it('reports per-row errors on the result envelope', () => {
    const jsonl = [
      JSON.stringify({
        custom_id: 'a',
        error: { code: 'invalid_request', message: 'bad input' },
      }),
      JSON.stringify({
        custom_id: 'b',
        response: {
          status_code: 400,
          body: { error: { code: 'context_length_exceeded', message: 'too long' } },
        },
      }),
    ].join('\n');
    const results = parseBatchOutput(jsonl, items);
    const byId = Object.fromEntries(results.map(r => [r.customId, r]));

    expect(byId.a.response).toBeNull();
    expect(byId.a.error?.code).toBe('invalid_request');
    expect(byId.b.error?.code).toBe('context_length_exceeded');
    // c was never present in the output → caller can fall back to sync
    expect(byId.c.error?.message).toMatch(/no row/i);
  });

  it('tolerates blank lines and unparseable rows without losing siblings', () => {
    const jsonl = [
      '',
      'not valid json',
      JSON.stringify({
        custom_id: 'b',
        response: { status_code: 200, body: { choices: [{ message: { content: 'ok' } }] } },
      }),
      '',
    ].join('\n');
    const results = parseBatchOutput(jsonl, items);
    const byId = Object.fromEntries(results.map(r => [r.customId, r]));
    expect(byId.b.response?.choices?.[0]?.message?.content).toBe('ok');
    expect(byId.a.error?.message).toMatch(/no row/i);
    expect(byId.c.error?.message).toMatch(/no row/i);
  });
});

// ────────────────────────────────────────────────────────────────────
// submitChatGPTBatch - orphan cancel on abandon
// ────────────────────────────────────────────────────────────────────

describe('submitChatGPTBatch orphan cancel', () => {
  function installStuckBatchFetchMock(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async (urlIn: string | URL | Request, init?: RequestInit) => {
      const url = typeof urlIn === 'string' ? urlIn : urlIn.toString();
      if (url.endsWith('/v1/files') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'file-xyz' }), { status: 200 });
      }
      if (url.endsWith('/v1/batches') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'batch-stuck', status: 'validating' }), { status: 200 });
      }
      if (url.endsWith('/v1/batches/batch-stuck/cancel') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'batch-stuck', status: 'cancelling' }), { status: 200 });
      }
      if (url.includes('/v1/batches/batch-stuck')) {
        return new Response(JSON.stringify({ id: 'batch-stuck', status: 'in_progress' }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  const items: BatchRequest[] = [{ customId: 'a', body: { model: 'gpt-5.4-nano' } }];

  it('max-wait timeout cancels the still-running batch before throwing', async () => {
    const fetchMock = installStuckBatchFetchMock();
    await expect(
      submitChatGPTBatch(items, 'sk-test', { maxWaitMs: 10, pollIntervalMs: 1 }),
    ).rejects.toMatchObject({ name: 'ChatGPTBatchError', stage: 'timeout' });
    const urls = fetchMock.mock.calls.map(c => (typeof c[0] === 'string' ? c[0] : (c[0] as URL).toString()));
    expect(urls.some(u => u.endsWith('/v1/batches/batch-stuck/cancel'))).toBe(true);
  });

  it('caller abort cancels the still-running batch before throwing', async () => {
    const fetchMock = installStuckBatchFetchMock();
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5);
    await expect(
      submitChatGPTBatch(items, 'sk-test', {
        maxWaitMs: 60_000, pollIntervalMs: 1000, signal: ctrl.signal,
      }),
    ).rejects.toThrow();
    const urls = fetchMock.mock.calls.map(c => (typeof c[0] === 'string' ? c[0] : (c[0] as URL).toString()));
    expect(urls.some(u => u.endsWith('/v1/batches/batch-stuck/cancel'))).toBe(true);
  });

  it('terminal status (failed) does NOT issue a cancel - nothing left to bill', async () => {
    const fetchMock = vi.fn(async (urlIn: string | URL | Request, init?: RequestInit) => {
      const url = typeof urlIn === 'string' ? urlIn : urlIn.toString();
      if (url.endsWith('/v1/files') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'file-xyz' }), { status: 200 });
      }
      if (url.endsWith('/v1/batches') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'batch-dead', status: 'validating' }), { status: 200 });
      }
      if (url.includes('/v1/batches/batch-dead')) {
        return new Response(JSON.stringify({ id: 'batch-dead', status: 'failed' }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await expect(
      submitChatGPTBatch(items, 'sk-test', { maxWaitMs: 10_000, pollIntervalMs: 1 }),
    ).rejects.toBeInstanceOf(ChatGPTBatchError);
    const urls = fetchMock.mock.calls.map(c => (typeof c[0] === 'string' ? c[0] : (c[0] as URL).toString()));
    expect(urls.some(u => u.includes('/cancel'))).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// queryAI(ChatGPT, no-search) - flag wiring + fallback
// ────────────────────────────────────────────────────────────────────

interface CapturedFetch {
  url: string;
  init: RequestInit;
}

function buildChatCompletionsBody(model = 'gpt-5.4-nano') {
  return new Response(JSON.stringify({
    id: 'chatcmpl-sync',
    model,
    choices: [{ message: { content: 'sync ok', annotations: [] } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function installBatchHappyPathFetchMock(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (urlIn: string | URL | Request, init?: RequestInit) => {
    const url = typeof urlIn === 'string' ? urlIn : urlIn.toString();
    if (url.endsWith('/v1/files') && init?.method === 'POST') {
      return new Response(JSON.stringify({ id: 'file-xyz' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/v1/batches') && init?.method === 'POST') {
      return new Response(JSON.stringify({ id: 'batch-abc', status: 'validating' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/v1/batches/batch-abc') && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify({
        id: 'batch-abc',
        status: 'completed',
        output_file_id: 'file-out',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/v1/files/file-out/content')) {
      const row = {
        custom_id: 'q-r1:0',
        response: {
          status_code: 200,
          body: {
            id: 'chatcmpl-batch',
            model: 'gpt-5.4-nano',
            choices: [{ message: { content: 'batch ok', annotations: [] } }],
            usage: { prompt_tokens: 7, completion_tokens: 3 },
          },
        },
      };
      return new Response(JSON.stringify(row), {
        status: 200, headers: { 'Content-Type': 'application/jsonl' },
      });
    }
    // Synchronous Chat Completions fallback (or non-batch test path).
    return buildChatCompletionsBody();
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('queryAI(ChatGPT no-search) - batch path wiring', () => {
  it('default (flag unset) → sync Chat Completions, never touches /v1/batches', async () => {
    const fetchMock = installBatchHappyPathFetchMock();
    await queryAI(
      'ChatGPT',
      'what is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      undefined,
      undefined,
      { batchEligible: true, queryId: 'r1:0' },
    );
    const urls = fetchMock.mock.calls.map(c => (typeof c[0] === 'string' ? c[0] : (c[0] as URL).toString()));
    expect(urls.some(u => u.includes('/v1/batches'))).toBe(false);
    expect(urls.some(u => u.includes('/v1/chat/completions'))).toBe(true);
  });

  it('flag on + batchEligible=true + no-search → routes through /v1/batches', async () => {
    process.env.CHATGPT_BATCH_ENABLED = 'true';
    process.env.CHATGPT_BATCH_POLL_INTERVAL_MS = '1';
    const fetchMock = installBatchHappyPathFetchMock();
    const result = await queryAI(
      'ChatGPT',
      'what is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      undefined,
      undefined,
      { batchEligible: true, queryId: 'r1:0' },
    );
    const urls = fetchMock.mock.calls.map(c => (typeof c[0] === 'string' ? c[0] : (c[0] as URL).toString()));
    expect(urls.some(u => u.endsWith('/v1/files'))).toBe(true);
    expect(urls.some(u => u.endsWith('/v1/batches'))).toBe(true);
    expect(urls.some(u => u.includes('/v1/batches/batch-abc'))).toBe(true);
    // Response parsing is identical → caller sees the same shape as sync.
    expect(result.text).toBe('batch ok');
    expect(result.tokensIn).toBe(7);
    expect(result.tokensOut).toBe(3);
  });

  it('flag on + batchEligible NOT set → stays synchronous (user-facing path)', async () => {
    process.env.CHATGPT_BATCH_ENABLED = 'true';
    const fetchMock = installBatchHappyPathFetchMock();
    await queryAI(
      'ChatGPT',
      'what is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      undefined,
      undefined,
      { /* no batchEligible */ },
    );
    const urls = fetchMock.mock.calls.map(c => (typeof c[0] === 'string' ? c[0] : (c[0] as URL).toString()));
    expect(urls.some(u => u.includes('/v1/batches'))).toBe(false);
  });

  it('batch upload failure → falls back to synchronous Chat Completions (no dropped tick)', async () => {
    process.env.CHATGPT_BATCH_ENABLED = 'true';
    process.env.CHATGPT_BATCH_POLL_INTERVAL_MS = '1';
    const calls: CapturedFetch[] = [];
    const fetchMock = vi.fn(async (urlIn: string | URL | Request, init?: RequestInit) => {
      const url = typeof urlIn === 'string' ? urlIn : urlIn.toString();
      calls.push({ url, init: init || {} });
      if (url.endsWith('/v1/files')) {
        return new Response('{"error":{"message":"upload boom"}}', { status: 500 });
      }
      return buildChatCompletionsBody();
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await queryAI(
      'ChatGPT',
      'what is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      undefined,
      undefined,
      { batchEligible: true, queryId: 'r1:0' },
    );
    // Tried upload, failed, then fell back to /v1/chat/completions.
    const urls = calls.map(c => c.url);
    expect(urls[0]).toMatch(/\/v1\/files$/);
    expect(urls.some(u => u.endsWith('/v1/chat/completions'))).toBe(true);
    expect(result.text).toBe('sync ok');
  });

  it('batch terminal failure (status=failed) → falls back to synchronous path', async () => {
    process.env.CHATGPT_BATCH_ENABLED = 'true';
    process.env.CHATGPT_BATCH_POLL_INTERVAL_MS = '1';
    const fetchMock = vi.fn(async (urlIn: string | URL | Request, init?: RequestInit) => {
      const url = typeof urlIn === 'string' ? urlIn : urlIn.toString();
      if (url.endsWith('/v1/files') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'file-xyz' }), { status: 200 });
      }
      if (url.endsWith('/v1/batches') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'batch-fail' }), { status: 200 });
      }
      if (url.includes('/v1/batches/batch-fail')) {
        return new Response(JSON.stringify({
          id: 'batch-fail',
          status: 'failed',
          errors: { data: [{ code: 'internal', message: 'something broke' }] },
        }), { status: 200 });
      }
      return buildChatCompletionsBody();
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await queryAI(
      'ChatGPT',
      'what is HTTP?',
      `sk-test-${Math.random().toString(36).slice(2)}`,
      undefined,
      undefined,
      { batchEligible: true, queryId: 'r1:0' },
    );
    expect(result.text).toBe('sync ok');
  });
});
