/**
 * Fix Engine - edge adapter (plugin-free CDN publishing) + the SEO override
 * builder the Worker consumes.
 *
 * Truthfulness contract: the adapter only reports ok when the Worker's
 * x-livesov-edge marker is present on the target — shipping into a domain
 * the Worker doesn't serve must fail with an actionable message, never
 * silently "succeed".
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: fetchMock }));
vi.mock('@/lib/db', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));

import { edgeAdapter, EDGE_MARKER_HEADER } from '@/lib/fix-engine/cms/edge';
import { getCmsAdapter } from '@/lib/fix-engine/cms';
import { CmsUnsupportedError } from '@/lib/fix-engine/cms/types';
import { buildEdgeSeoOverrides, edgeSeoPathKey } from '@/lib/fix-engine/schema';

function res(headers: Record<string, string>) {
  return {
    status: 200, ok: true,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => '<html></html>',
    json: async () => ({}),
  } as unknown as Response;
}

const target = { url: 'https://acme.test/pricing' };

// Braces matter: `() => fetchMock.mockReset()` would RETURN the mock (mockReset
// returns `this`), which vitest calls as a teardown fn — invoking whatever
// implementation the test left behind (here: persistent rejections).
beforeEach(() => { fetchMock.mockReset(); });

describe('edge adapter', () => {
  it('is registered in the adapter registry', () => {
    expect(getCmsAdapter('edge')).toBe(edgeAdapter);
  });

  it('verify succeeds only when the Worker marker header is live on the site', async () => {
    fetchMock.mockResolvedValueOnce(res({ [EDGE_MARKER_HEADER]: 'v1' }));
    expect(await edgeAdapter.verify({}, 'https://acme.test')).toEqual({ ok: true });

    fetchMock.mockResolvedValueOnce(res({}));
    const r = await edgeAdapter.verify({}, 'https://acme.test');
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/x-livesov-edge/);
  });

  it('head-level writes report ok when the Worker fronts the page', async () => {
    fetchMock.mockResolvedValue(res({ [EDGE_MARKER_HEADER]: 'v1' }));
    for (const call of [
      edgeAdapter.updateTitle({}, target, 'New Title'),
      edgeAdapter.updateMetaDescription({}, target, 'New description'),
      edgeAdapter.updateCanonical({}, target, 'https://acme.test/pricing'),
      edgeAdapter.injectSchema({}, target, '{"@type":"Organization"}'),
      edgeAdapter.setIndexable({}, target),
    ]) {
      const r = await call;
      expect(r.ok).toBe(true);
      expect(r.detail?.delivery).toBe('edge');
    }
  });

  it('refuses to ship when the Worker is not routed (no false "shipped")', async () => {
    fetchMock.mockResolvedValue(res({}));
    const r = await edgeAdapter.updateTitle({}, target, 'New Title');
    expect(r.ok).toBe(false);
    expect(r.detail?.reason).toBe('edge_worker_not_detected');
    expect(r.error).toMatch(/Worker/);
  });

  it('refuses to ship when the page is unreachable', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('connect timeout')));
    const r = await edgeAdapter.updateMetaDescription({}, target, 'x');
    expect(r.ok).toBe(false);
    expect(r.detail?.error).toBe('connect timeout');
  });

  it('throws CmsUnsupportedError for body/content ops (degrades to hand-off)', async () => {
    await expect(edgeAdapter.updateBody({}, target, '<p>x</p>', 'replace')).rejects.toBeInstanceOf(CmsUnsupportedError);
    await expect(edgeAdapter.createPage({}, { title: 't', slug: 's', html: 'h' })).rejects.toBeInstanceOf(CmsUnsupportedError);
    await expect(edgeAdapter.replaceInBody({}, target, 'a', 'b')).rejects.toBeInstanceOf(CmsUnsupportedError);
  });
});

describe('edge SEO override builder', () => {
  it('normalises URLs to path keys (trailing slash stripped, root kept)', () => {
    expect(edgeSeoPathKey('https://acme.test/pricing/')).toBe('/pricing');
    expect(edgeSeoPathKey('https://acme.test/')).toBe('/');
    expect(edgeSeoPathKey('https://acme.test')).toBe('/');
    expect(edgeSeoPathKey('not a url')).toBeNull();
  });

  it('folds shipped fixes into per-path overrides, newest winning per field', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'title-rewrite', targetUrl: 'https://a.com/p', generated: { title: 'Old Title' } },
      { moduleKey: 'meta-rewrite', targetUrl: 'https://a.com/p/', generated: { description: 'Desc' } },
      { moduleKey: 'title-rewrite', targetUrl: 'https://a.com/p', generated: { title: 'New Title' } }, // newer wins
      { moduleKey: 'canonical-fix', targetUrl: 'https://a.com/q', generated: { canonical: 'https://a.com/q' } },
    ]);
    expect(out['/p']).toEqual({ title: 'New Title', description: 'Desc' });
    expect(out['/q']).toEqual({ canonical: 'https://a.com/q' });
  });

  it('ctr-rescue contributes both title and description', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'ctr-rescue', targetUrl: 'https://a.com/r', generated: { title: 'T', description: 'D' } },
    ]);
    expect(out['/r']).toEqual({ title: 'T', description: 'D' });
  });

  it('skips unknown modules, missing URLs, and empty values', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'faq-schema', targetUrl: 'https://a.com/x', generated: { html: '<x>' } }, // not an edge module
      { moduleKey: 'title-rewrite', targetUrl: null, generated: { title: 'T' } },
      { moduleKey: 'title-rewrite', targetUrl: 'https://a.com/y', generated: { title: '   ' } },
      { moduleKey: 'meta-rewrite', targetUrl: 'https://a.com/y', generated: null },
    ]);
    expect(out).toEqual({});
  });

  it('carries JSON-LD schema with </script>-breakout escaping', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'schema-markup', targetUrl: 'https://a.com/s', generated: { schema: '{"@type":"FAQPage","x":"</script><img>"}' } },
    ]);
    expect(out['/s'].jsonLd).toBe('{"@type":"FAQPage","x":"<\\/script><img>"}');
  });

  it('carries the OG/Twitter head block and the indexable flag', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'og-cards', targetUrl: 'https://a.com/', generated: { head: '<meta property="og:title" content="T">' } },
      { moduleKey: 'noindex-removal', targetUrl: 'https://a.com/hidden', generated: { action: 'set-indexable' } },
    ]);
    expect(out['/'].head).toContain('og:title');
    expect(out['/hidden']).toEqual({ indexable: true });
  });
});
