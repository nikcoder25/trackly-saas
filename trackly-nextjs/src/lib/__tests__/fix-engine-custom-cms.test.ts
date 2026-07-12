/**
 * Fix Engine - custom-site CMS adapter: signed POST contract, unsupported
 * degradation, auth errors, and verify().
 */

import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: fetchMock }));

import { customAdapter } from '@/lib/fix-engine/cms/custom';
import { getCmsAdapter, listSupportedCms, CmsAuthError, CmsUnsupportedError } from '@/lib/fix-engine/cms';

const creds = { endpoint: 'https://acme.example/livesov-fix', secret: 'a'.repeat(32) };

function jsonRes(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response;
}

beforeEach(() => { fetchMock.mockReset(); });

describe('custom-site adapter', () => {
  it('is registered in the adapter registry', () => {
    expect(getCmsAdapter('custom')).toBe(customAdapter);
    expect(listSupportedCms()).toContain('custom');
  });

  it('sends a bearer + HMAC-signed POST for update_title', async () => {
    fetchMock.mockResolvedValue(jsonRes(200, { ok: true }));
    const r = await customAdapter.updateTitle(creds, { url: 'https://acme.example/pricing' }, 'Better Title');
    expect(r.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe(creds.endpoint);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${creds.secret}`);
    const payload = JSON.parse(init.body) as { op: string; url: string; value: string; ts: number };
    expect(payload).toMatchObject({ op: 'update_title', url: 'https://acme.example/pricing', value: 'Better Title' });
    expect(typeof payload.ts).toBe('number');
    const want = crypto.createHmac('sha256', creds.secret).update(init.body).digest('hex');
    expect(init.headers['X-Livesov-Signature']).toBe(`sha256=${want}`);
  });

  it('degrades unimplemented ops to CmsUnsupportedError (hand-off, not failure)', async () => {
    fetchMock.mockResolvedValue(jsonRes(200, { ok: false, unsupported: true }));
    await expect(customAdapter.updateBody(creds, { url: 'https://acme.example/p' }, '<p>x</p>', 'append')).rejects.toBeInstanceOf(CmsUnsupportedError);
    fetchMock.mockResolvedValue(jsonRes(501, {}));
    await expect(customAdapter.injectSchema(creds, { url: 'https://acme.example/p' }, '{}')).rejects.toBeInstanceOf(CmsUnsupportedError);
  });

  it('maps 401/403 to CmsAuthError and endpoint errors to ok:false', async () => {
    fetchMock.mockResolvedValue(jsonRes(401, {}));
    await expect(customAdapter.updateTitle(creds, { url: 'https://a.example/p' }, 't')).rejects.toBeInstanceOf(CmsAuthError);
    fetchMock.mockResolvedValue(jsonRes(200, { ok: false, error: 'db down' }));
    const r = await customAdapter.updateMetaDescription(creds, { url: 'https://a.example/p' }, 'd');
    expect(r.ok).toBe(false);
    expect(r.detail?.error).toBe('db down');
  });

  it('verify() pings the endpoint and rejects bad creds without a request', async () => {
    fetchMock.mockResolvedValue(jsonRes(200, { ok: true }));
    expect((await customAdapter.verify(creds, '')).ok).toBe(true);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body).op).toBe('ping');

    fetchMock.mockClear();
    const bad = await customAdapter.verify({ endpoint: 'http://insecure.example/x', secret: 'short' }, '');
    expect(bad.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes found:false through for replace_in_body misses', async () => {
    fetchMock.mockResolvedValue(jsonRes(200, { ok: true, found: false }));
    const r = await customAdapter.replaceInBody(creds, { url: 'https://a.example/p' }, 'old text', 'new text');
    expect(r.ok).toBe(true);
    expect(r.found).toBe(false);
  });
});
