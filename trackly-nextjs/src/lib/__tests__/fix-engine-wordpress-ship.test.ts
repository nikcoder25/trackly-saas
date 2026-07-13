/**
 * Fix Engine - WordPress adapter SEO-write verification (safeFetch mocked).
 *
 * WordPress core returns HTTP 200 for a REST write even when it silently
 * drops post-meta keys an SEO plugin hasn't registered with `show_in_rest`.
 * These tests pin the adapter's contract: an SEO field write is only
 * reported ok when WP actually echoes the value back — otherwise it degrades
 * to a truthful failure (reason `seo_field_not_writable_via_rest`) so a fix
 * is never marked "shipped" while the live page is unchanged.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: fetchMock }));

import { wordpressAdapter } from '@/lib/fix-engine/cms/wordpress';

function res(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

const creds = { username: 'admin', appPassword: 'app pass word' };
const target = { url: 'https://acme.test/ipamorelin-dosage-chart' };

// resolveResource() looks up pages first — resolve to page id 7.
function mockResolveToPage(id = 7) {
  fetchMock.mockResolvedValueOnce(res(200, [{ id }])); // GET pages?slug=...
}

beforeEach(() => { fetchMock.mockReset(); }); // braces: don't return the mock as a teardown fn

describe('WordPress meta description write', () => {
  it('reports ok when the SEO plugin field actually persists', async () => {
    mockResolveToPage();
    fetchMock.mockResolvedValueOnce(res(200, { id: 7, link: 'https://acme.test/ipamorelin-dosage-chart', meta: { _yoast_wpseo_metadesc: 'New description that stuck' } }));
    const r = await wordpressAdapter.updateMetaDescription(creds, target, 'New description that stuck');
    expect(r.ok).toBe(true);
    expect(r.resourceId).toBe(7);
  });

  it('degrades to a truthful failure when WP silently drops the meta key', async () => {
    mockResolveToPage();
    // 200 OK, but the SEO meta key is absent (not registered in REST) — the
    // description never actually persisted on the page.
    fetchMock.mockResolvedValueOnce(res(200, { id: 7, meta: {} }));
    const r = await wordpressAdapter.updateMetaDescription(creds, target, 'Will be dropped');
    expect(r.ok).toBe(false);
    expect(r.detail?.reason).toBe('seo_field_not_writable_via_rest');
    expect(r.error).toMatch(/Connector/);
  });

  it('does not falsely succeed when WP echoes a stale/mismatched value', async () => {
    mockResolveToPage();
    fetchMock.mockResolvedValueOnce(res(200, { id: 7, meta: { _yoast_wpseo_metadesc: 'the OLD description' } }));
    const r = await wordpressAdapter.updateMetaDescription(creds, target, 'the new description');
    expect(r.ok).toBe(false);
  });
});

describe('WordPress SEO title write', () => {
  it('reports ok when Rank Math title persists', async () => {
    mockResolveToPage();
    fetchMock.mockResolvedValueOnce(res(200, { id: 7, meta: { rank_math_title: 'Ipamorelin Dosage Chart: mcg to Units' } }));
    const r = await wordpressAdapter.updateTitle(creds, target, 'Ipamorelin Dosage Chart: mcg to Units');
    expect(r.ok).toBe(true);
  });

  it('fails truthfully when the SEO title is not REST-writable', async () => {
    mockResolveToPage();
    fetchMock.mockResolvedValueOnce(res(200, { id: 7, title: { raw: 'Ipamorelin Dosage Chart: mcg to Units' }, meta: {} }));
    const r = await wordpressAdapter.updateTitle(creds, target, 'Ipamorelin Dosage Chart: mcg to Units');
    expect(r.ok).toBe(false);
    expect(r.detail?.reason).toBe('seo_field_not_writable_via_rest');
  });
});

describe('WordPress canonical / indexable writes', () => {
  it('canonical fails truthfully when the plugin field is not exposed', async () => {
    mockResolveToPage();
    fetchMock.mockResolvedValueOnce(res(200, { id: 7, meta: {} }));
    const r = await wordpressAdapter.updateCanonical(creds, target, 'https://acme.test/canonical');
    expect(r.ok).toBe(false);
    expect(r.detail?.reason).toBe('seo_field_not_writable_via_rest');
  });

  it('setIndexable succeeds when Rank Math robots persists as index/follow', async () => {
    mockResolveToPage();
    fetchMock.mockResolvedValueOnce(res(200, { id: 7, meta: { rank_math_robots: ['index', 'follow'] } }));
    const r = await wordpressAdapter.setIndexable(creds, target);
    expect(r.ok).toBe(true);
  });

  it('still surfaces a genuine HTTP write failure', async () => {
    mockResolveToPage();
    fetchMock.mockResolvedValueOnce(res(500, { message: 'boom' }));
    const r = await wordpressAdapter.updateMetaDescription(creds, target, 'x');
    expect(r.ok).toBe(false);
  });
});
