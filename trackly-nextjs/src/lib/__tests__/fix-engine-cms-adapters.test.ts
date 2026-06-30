/**
 * Fix Engine - Shopify / Ghost / Webflow CMS adapters (safeFetch mocked).
 * Covers verify, a representative write, and that unsupported ops throw
 * CmsUnsupportedError so the engine degrades gracefully.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: fetchMock }));

import { shopifyAdapter } from '@/lib/fix-engine/cms/shopify';
import { ghostAdapter } from '@/lib/fix-engine/cms/ghost';
import { webflowAdapter } from '@/lib/fix-engine/cms/webflow';
import { CmsUnsupportedError } from '@/lib/fix-engine/cms/types';

function res(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

beforeEach(() => fetchMock.mockReset());

describe('Shopify adapter', () => {
  const creds = { shop: 'acme', accessToken: 'shpat_x' };

  it('verifies and normalises the shop domain', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { shop: { id: 1 } }));
    expect(await shopifyAdapter.verify(creds, '')).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toBe('https://acme.myshopify.com/admin/api/2024-07/shop.json');
  });

  it('updates a page title by resolving its handle', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { pages: [{ id: 7, handle: 'about', body_html: '<p>x</p>' }] })); // list
    fetchMock.mockResolvedValueOnce(res(201, { metafield: { id: 1 } }));                                        // title_tag metafield
    fetchMock.mockResolvedValueOnce(res(200, { page: { id: 7 } }));                                             // PUT title
    const r = await shopifyAdapter.updateTitle(creds, { url: 'https://acme.com/pages/about' }, 'New');
    expect(r.ok).toBe(true);
    expect(r.resourceId).toBe(7);
  });

  it('reports page_not_found when the handle is absent', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { pages: [{ id: 7, handle: 'other' }] }));
    const r = await shopifyAdapter.updateMetaDescription(creds, { url: 'https://acme.com/pages/about' }, 'd');
    expect(r.ok).toBe(false);
  });

  it('throws on unsupported canonical / robots', async () => {
    await expect(shopifyAdapter.updateCanonical(creds, { url: 'x' }, 'c')).rejects.toBeInstanceOf(CmsUnsupportedError);
    await expect(shopifyAdapter.setIndexable(creds, { url: 'x' })).rejects.toBeInstanceOf(CmsUnsupportedError);
  });
});

describe('Ghost adapter', () => {
  const creds = { adminApiUrl: 'https://blog.com', adminApiKey: 'abc:0011223344556677' };

  it('verifies with a minted JWT', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { site: { title: 'Blog' } }));
    expect(await ghostAdapter.verify(creds, '')).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Ghost [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it('updates the title of a resolved post', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { posts: [{ id: 'p1', updated_at: '2024-01-01' }] })); // resolve post
    fetchMock.mockResolvedValueOnce(res(200, { posts: [{ id: 'p1' }] }));                            // PUT
    const r = await ghostAdapter.updateTitle(creds, { url: 'https://blog.com/hello' }, 'Hi');
    expect(r.ok).toBe(true);
  });

  it('throws on unsupported body ops', async () => {
    await expect(ghostAdapter.updateBody(creds, { url: 'x' }, '<p>x</p>', 'replace')).rejects.toBeInstanceOf(CmsUnsupportedError);
  });
});

describe('Webflow adapter', () => {
  const creds = { apiToken: 't', siteId: 's1' };

  it('verifies the site', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { id: 's1' }));
    expect(await webflowAdapter.verify(creds, '')).toEqual({ ok: true });
  });

  it('updates page SEO title and best-effort publishes', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { pages: [{ id: 'pg1', slug: 'about' }] })); // list pages
    fetchMock.mockResolvedValueOnce(res(200, { id: 'pg1' }));                              // PATCH seo
    fetchMock.mockResolvedValueOnce(res(200, {}));                                          // publish
    const r = await webflowAdapter.updateTitle(creds, { url: 'https://site.com/about' }, 'New');
    expect(r.ok).toBe(true);
    expect(r.resourceId).toBe('pg1');
  });

  it('throws on unsupported body / create', async () => {
    await expect(webflowAdapter.updateBody(creds, { url: 'x' }, 'h', 'replace')).rejects.toBeInstanceOf(CmsUnsupportedError);
    await expect(webflowAdapter.createPage(creds, { title: 't', slug: 's', html: 'h' })).rejects.toBeInstanceOf(CmsUnsupportedError);
  });
});
