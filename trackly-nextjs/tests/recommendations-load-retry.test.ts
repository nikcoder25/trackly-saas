/**
 * Unit tests for the silent-401-refresh retry path on the
 * /dashboard/recommendations page.
 *
 * Mirrors the pattern already used elsewhere in the dashboard (see
 * BrandContext.refreshBrands) where a stale session cookie causes a
 * one-shot 401 right after viewport resize / re-mount, and a silent
 * POST /api/auth/refresh + a single retry recovers without bothering
 * the user.
 */
import { describe, it, expect, vi } from 'vitest';
import { loadRecsWithRetry, type FetchFn, type RefreshFn } from '@/app/(dashboard)/dashboard/recommendations/load-recs';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

const URL = 'http://t/api/brands/brand_A/recommendations';

describe('loadRecsWithRetry', () => {
  it('returns ok on a first-shot 200 (no refresh attempted)', async () => {
    const fetch: FetchFn = vi.fn().mockResolvedValue(
      jsonResponse({ recommendations: [{ id: 'r1', title: 'x', severity: 'high', status: 'open' }] }),
    );
    const refresh: RefreshFn = vi.fn().mockResolvedValue(true);

    const out = await loadRecsWithRetry(URL, { fetch, refresh });

    expect(out).toEqual({
      kind: 'ok',
      recommendations: [{ id: 'r1', title: 'x', severity: 'high', status: 'open' }],
    });
    expect(refresh).not.toHaveBeenCalled();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('on 401 -> refresh ok -> retry 200: returns ok and renders the list (not the error UI)', async () => {
    const fetch: FetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Authentication required' }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ recommendations: [{ id: 'r1', title: 'x', severity: 'high', status: 'open' }] }));
    const refresh: RefreshFn = vi.fn().mockResolvedValue(true);

    const out = await loadRecsWithRetry(URL, { fetch, refresh });

    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') expect(out.recommendations).toHaveLength(1);
    expect(refresh).toHaveBeenCalledOnce();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it('on 401 -> refresh ok -> retry 401: surfaces session-expired (NOT Try-again)', async () => {
    const fetch: FetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Authentication required' }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Authentication required' }, { status: 401 }));
    const refresh: RefreshFn = vi.fn().mockResolvedValue(true);

    const out = await loadRecsWithRetry(URL, { fetch, refresh });

    expect(out).toEqual({ kind: 'session-expired' });
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it('on 401 -> refresh fails: surfaces session-expired without a second GET', async () => {
    const fetch: FetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Authentication required' }, { status: 401 }));
    const refresh: RefreshFn = vi.fn().mockResolvedValue(false);

    const out = await loadRecsWithRetry(URL, { fetch, refresh });

    expect(out).toEqual({ kind: 'session-expired' });
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('on 401 -> refresh throws: surfaces session-expired (does not bubble)', async () => {
    const fetch: FetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Authentication required' }, { status: 401 }));
    const refresh: RefreshFn = vi.fn().mockRejectedValue(new Error('refresh blew up'));

    const out = await loadRecsWithRetry(URL, { fetch, refresh });

    expect(out).toEqual({ kind: 'session-expired' });
  });

  it('non-401 server error: returns the existing PR #472 error path with the server message', async () => {
    const fetch: FetchFn = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Failed to load recommendations' }, { status: 500 }),
    );
    const refresh: RefreshFn = vi.fn().mockResolvedValue(true);

    const out = await loadRecsWithRetry(URL, { fetch, refresh });

    expect(out).toEqual({ kind: 'error', message: 'Failed to load recommendations' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('network error before any response: returns the existing error path with a friendly message', async () => {
    const fetch: FetchFn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const refresh: RefreshFn = vi.fn().mockResolvedValue(true);

    const out = await loadRecsWithRetry(URL, { fetch, refresh });

    expect(out.kind).toBe('error');
    if (out.kind === 'error') expect(out.message).toBe('fetch failed');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('logs info on first 401 and warn on second-401 surfacing', async () => {
    const fetch: FetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'auth' }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ error: 'auth' }, { status: 401 }));
    const refresh: RefreshFn = vi.fn().mockResolvedValue(true);
    const logger = { info: vi.fn(), warn: vi.fn() };

    await loadRecsWithRetry(URL, { fetch, refresh, logger });

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/silent refresh/i),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/session-expired/i),
    );
  });
});
