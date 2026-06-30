/**
 * Fix Engine - CMS auto-detection fingerprints.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: fetchMock }));

import { detectCms } from '@/lib/fix-engine/cms/detect';

function res(status: number, body: string, headers: Record<string, string> = {}) {
  return { status, ok: status >= 200 && status < 300, text: async () => body, headers: new Headers(headers) } as unknown as Response;
}

beforeEach(() => fetchMock.mockReset());

describe('detectCms', () => {
  it('detects WordPress via the REST namespace (high confidence)', async () => {
    fetchMock.mockResolvedValueOnce(res(200, '{"namespaces":["wp/v2"]}')); // /wp-json/
    const d = await detectCms('https://acme.com');
    expect(d).toMatchObject({ cms: 'wordpress', confidence: 'high', hasAdapter: true });
  });

  it('detects Shopify from homepage assets', async () => {
    fetchMock.mockResolvedValueOnce(res(404, 'nope'));                       // /wp-json/
    fetchMock.mockResolvedValueOnce(res(200, '<script src="https://cdn.shopify.com/x.js"></script>')); // /
    const d = await detectCms('https://acme.com');
    expect(d.cms).toBe('shopify');
    expect(d.hasAdapter).toBe(true);
  });

  it('detects Ghost and Webflow from the generator meta', async () => {
    fetchMock.mockResolvedValueOnce(res(404, '')); // wp-json
    fetchMock.mockResolvedValueOnce(res(200, '<meta name="generator" content="Ghost 5.0">'));
    expect((await detectCms('https://blog.com')).cms).toBe('ghost');

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(res(404, ''));
    fetchMock.mockResolvedValueOnce(res(200, '<meta name="generator" content="Webflow">'));
    expect((await detectCms('https://site.com')).cms).toBe('webflow');
  });

  it('returns unknown when nothing matches', async () => {
    fetchMock.mockResolvedValueOnce(res(404, ''));
    fetchMock.mockResolvedValueOnce(res(200, '<html><body>hand-rolled</body></html>'));
    const d = await detectCms('https://custom.com');
    expect(d.cms).toBe('unknown');
    expect(d.hasAdapter).toBe(false);
  });

  it('handles an invalid URL', async () => {
    const d = await detectCms('not a url');
    expect(d.cms).toBe('unknown');
  });
});
