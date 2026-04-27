/**
 * Tests for src/lib/key-validator.ts.
 *
 * The validator is a thin wrapper around `fetch` against the provider's
 * /models endpoint, so we mock global fetch with vi.stubGlobal and
 * assert the URL/headers/timeout behaviour. Unknown platforms and
 * empty keys must short-circuit BEFORE any network call.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateProviderKey, validateProviderKeys } from '../src/lib/key-validator';

describe('validateProviderKey', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns ok=true on a 200 response, with measured latency', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const result = await validateProviderKey('ChatGPT', 'sk-test-1234567890abcd');
    expect(result.ok).toBe(true);
    expect(result.status).toBe('ok');
    expect(result.httpStatus).toBe(200);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.platform).toBe('ChatGPT');
  });

  it('marks 401 as invalid with provider-specific error message', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response('{}', { status: 401 }));

    const result = await validateProviderKey('ChatGPT', 'sk-bogus-key-1234567890');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.httpStatus).toBe(401);
    expect(result.error).toBe('ChatGPT rejected this key: 401 (unauthorized)');
  });

  it('marks 403 as invalid', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response('{}', { status: 403 }));

    const result = await validateProviderKey('Claude', 'sk-ant-bogus-1234567890');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.httpStatus).toBe(403);
  });

  it('marks 429 as a transient error, not invalid (so the UI does not block save)', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response('{}', { status: 429 }));

    const result = await validateProviderKey('ChatGPT', 'sk-test-1234567890abcd');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.error).toContain('429');
  });

  it('marks 500 as transient error', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response('{}', { status: 503 }));

    const result = await validateProviderKey('Gemini', 'AIza-test-key-1234567890');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.httpStatus).toBe(503);
  });

  it('returns invalid with status="invalid" for unknown platforms (no network call)', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const result = await validateProviderKey('Wat', 'sk-test-1234567890abcd');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.error).toContain('Unknown platform');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects empty keys without hitting the network', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const result = await validateProviderKey('ChatGPT', '   ');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.error).toBe('API key is empty');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats Perplexity 405 as ok (provider has no /models endpoint)', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response('{}', { status: 405 }));

    const result = await validateProviderKey('Perplexity', 'pplx-test-key-1234567890');
    expect(result.ok).toBe(true);
    expect(result.status).toBe('ok');
    expect(result.httpStatus).toBe(405);
  });

  it('puts the API key in the Authorization header for ChatGPT', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await validateProviderKey('ChatGPT', 'sk-test-1234567890abcd');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/models');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer sk-test-1234567890abcd',
    });
  });

  it('puts the API key in the x-api-key header for Claude', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await validateProviderKey('Claude', 'sk-ant-test-1234567890');
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      'x-api-key': 'sk-ant-test-1234567890',
      'anthropic-version': '2023-06-01',
    });
  });

  it('puts the API key in the URL query string for Gemini', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await validateProviderKey('Gemini', 'AIza-test-key-1234567890');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('https://generativelanguage.googleapis.com/v1beta/models');
    expect(url).toContain('key=AIza-test-key-1234567890');
    // Auth must NOT also be sent in headers — Gemini rejects the
    // duplicate and the boot probe shape stays consistent.
    expect((init as RequestInit).headers).toEqual({});
  });

  it('reports a network error as status=error (not invalid)', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new TypeError('fetch failed'));

    const result = await validateProviderKey('Grok', 'xai-test-1234567890abcd');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.error).toContain('Grok validation network error');
  });

  it('reports timeout when the provider hangs longer than the cap', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        return await new Promise<Response>((_, rej) => {
          init.signal?.addEventListener('abort', () => {
            rej(new DOMException('aborted', 'AbortError'));
          });
        });
      });

    const result = await validateProviderKey('ChatGPT', 'sk-test-1234567890abcd', { timeoutMs: 50 });
    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.error).toContain('timed out');
  });

  it('respects a caller-supplied AbortSignal', async () => {
    const ctrl = new AbortController();
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        return await new Promise<Response>((_, rej) => {
          init.signal?.addEventListener('abort', () => {
            rej(new DOMException('aborted', 'AbortError'));
          });
        });
      });

    const promise = validateProviderKey('ChatGPT', 'sk-test-1234567890abcd', { signal: ctrl.signal });
    ctrl.abort();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
  });
});

describe('validateProviderKeys (parallel fan-out)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('runs every input concurrently and preserves result order', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const results = await validateProviderKeys([
      { platform: 'ChatGPT', apiKey: 'sk-test-1234567890ab' },
      { platform: 'Claude', apiKey: 'sk-ant-test-12345678' },
      { platform: 'Grok', apiKey: 'xai-test-1234567890ab' },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ platform: 'ChatGPT', ok: true });
    expect(results[1]).toMatchObject({ platform: 'Claude', ok: false, status: 'invalid' });
    expect(results[2]).toMatchObject({ platform: 'Grok', ok: true });
  });
});
