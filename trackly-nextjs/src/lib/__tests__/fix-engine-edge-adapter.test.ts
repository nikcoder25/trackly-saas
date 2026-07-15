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
import { buildEdgeSeoOverrides, edgeSeoPathKey, normalizeEdgeOverrideKeys } from '@/lib/fix-engine/schema';

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

describe('edge internal-link overrides', () => {
  it('emits links from a shipped internal-linking fix (url → href), carrying rel', () => {
    const out = buildEdgeSeoOverrides([
      {
        moduleKey: 'internal-linking',
        targetUrl: 'https://a.com/guide',
        generated: {
          links: [
            { anchor: 'Semaglutide calculator', url: 'https://a.com/semaglutide-calculator/' },
            { anchor: 'Pricing', url: 'https://a.com/pricing', rel: 'nofollow' },
          ],
        },
      },
    ]);
    expect(out['/guide'].links).toEqual([
      { anchor: 'Semaglutide calculator', href: 'https://a.com/semaglutide-calculator/' },
      { anchor: 'Pricing', href: 'https://a.com/pricing', rel: 'nofollow' },
    ]);
  });

  it('drops links whose href would 404 against the site’s real routes', () => {
    // The real bug: a fix links to /peptides/semaglutide but the live URL is
    // /semaglutide-calculator/. Validated against the known route set, the
    // dead target is dropped and only the real one survives.
    const knownPaths = new Set(['/semaglutide-calculator', '/pricing', '/']);
    const out = buildEdgeSeoOverrides(
      [
        {
          moduleKey: 'internal-linking',
          targetUrl: 'https://a.com/cagrilintide',
          generated: {
            links: [
              { anchor: 'Semaglutide', url: 'https://a.com/peptides/semaglutide' }, // 404 → dropped
              { anchor: 'Calculator', url: 'https://a.com/semaglutide-calculator/' }, // real → kept
            ],
          },
        },
      ],
      { knownPaths },
    );
    expect(out['/cagrilintide'].links).toEqual([
      { anchor: 'Calculator', href: 'https://a.com/semaglutide-calculator/' },
    ]);
  });

  it('drops the links field entirely when every target 404s', () => {
    const knownPaths = new Set(['/real', '/']);
    const out = buildEdgeSeoOverrides(
      [{ moduleKey: 'internal-linking', targetUrl: 'https://a.com/p', generated: { links: [{ anchor: 'X', url: 'https://a.com/dead' }] } }],
      { knownPaths },
    );
    expect(out['/p']).toBeUndefined();
  });

  it('dedupes by href and caps at 8 links', () => {
    const links = Array.from({ length: 12 }, (_, i) => ({ anchor: `A${i}`, url: `https://a.com/p${i}` }));
    links.push({ anchor: 'dup', url: 'https://a.com/p0' }); // duplicate href
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'internal-linking', targetUrl: 'https://a.com/hub', generated: { links } },
    ]);
    expect(out['/hub'].links).toHaveLength(8);
    // p0 kept once (first occurrence), the trailing duplicate ignored.
    expect(out['/hub'].links!.filter((l) => l.href === 'https://a.com/p0')).toHaveLength(1);
  });

  it('newest internal-linking fix for a path replaces the earlier link set', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'internal-linking', targetUrl: 'https://a.com/p', generated: { links: [{ anchor: 'Old', url: 'https://a.com/old' }] } },
      { moduleKey: 'internal-linking', targetUrl: 'https://a.com/p', generated: { links: [{ anchor: 'New', url: 'https://a.com/new' }] } },
    ]);
    expect(out['/p'].links).toEqual([{ anchor: 'New', href: 'https://a.com/new' }]);
  });

  it('ignores malformed link entries (missing anchor or href)', () => {
    const out = buildEdgeSeoOverrides([
      {
        moduleKey: 'internal-linking',
        targetUrl: 'https://a.com/p',
        generated: { links: [{ anchor: '', url: 'https://a.com/x' }, { anchor: 'Y', url: '' }, 'nope', null] },
      },
    ]);
    expect(out['/p']).toBeUndefined();
  });

  it('folds a trailing-slash target into the same key as its slashless form', () => {
    // A fix stored for /guide/ and one for /guide must resolve to one entry.
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'internal-linking', targetUrl: 'https://a.com/guide/', generated: { links: [{ anchor: 'A', url: 'https://a.com/a' }] } },
      { moduleKey: 'title-rewrite', targetUrl: 'https://a.com/guide', generated: { title: 'T' } },
    ]);
    expect(Object.keys(out)).toEqual(['/guide']);
    expect(out['/guide'].title).toBe('T');
    expect(out['/guide'].links).toEqual([{ anchor: 'A', href: 'https://a.com/a' }]);
  });
});

describe('normalizeEdgeOverrideKeys (serve-boundary trailing-slash matching)', () => {
  it('re-keys to canonical paths so /p and /p/ resolve to one entry', () => {
    const out = normalizeEdgeOverrideKeys({
      '/peptides/cagrilintide/': { title: 'Cagrilintide' },
      '/pricing': { description: 'D' },
      '/': { indexable: true },
    });
    expect(out['/peptides/cagrilintide']).toEqual({ title: 'Cagrilintide' });
    expect(out['/peptides/cagrilintide/']).toBeUndefined();
    expect(out['/pricing']).toEqual({ description: 'D' });
    expect(out['/']).toEqual({ indexable: true });
  });

  it('merges two keys that collapse to the same path (later fields win)', () => {
    const out = normalizeEdgeOverrideKeys({
      '/p': { title: 'Old', description: 'Keep' },
      '/p/': { title: 'New' },
    });
    expect(out['/p']).toEqual({ title: 'New', description: 'Keep' });
  });
});
