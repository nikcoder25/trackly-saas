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

  it('emits the frozen links as-is — no serve-time 404 re-validation', () => {
    // 404-dropping now happens once at generation (internal-linking's
    // urlResolves) and is frozen on the fix, so the builder is a pure,
    // deterministic read and never re-drops a valid link against a flaky or
    // capped-out sitemap fetch.
    const out = buildEdgeSeoOverrides([
      {
        moduleKey: 'internal-linking',
        targetUrl: 'https://a.com/cagrilintide',
        generated: { links: [{ anchor: 'Calculator', url: 'https://a.com/semaglutide-calculator/' }] },
      },
    ]);
    expect(out['/cagrilintide'].links).toEqual([
      { anchor: 'Calculator', href: 'https://a.com/semaglutide-calculator/' },
    ]);
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

describe('edge external-citation overrides', () => {
  it('emits citations from a shipped external-citations fix (url → href, carries source/claim)', () => {
    const out = buildEdgeSeoOverrides([
      {
        moduleKey: 'external-citations',
        targetUrl: 'https://acme.com/about',
        generated: {
          citations: [
            { claim: 'Cagrilintide is a peptide', anchor: 'PubChem: Cagrilintide', url: 'https://pubchem.ncbi.nlm.nih.gov/compound/x', source: 'PubChem' },
            { claim: 'Cleared by the FDA', anchor: 'FDA label', url: 'https://www.fda.gov/drug', source: 'FDA' },
          ],
        },
      },
    ]);
    expect(out['/about'].citations).toEqual([
      { anchor: 'PubChem: Cagrilintide', href: 'https://pubchem.ncbi.nlm.nih.gov/compound/x', source: 'PubChem', claim: 'Cagrilintide is a peptide' },
      { anchor: 'FDA label', href: 'https://www.fda.gov/drug', source: 'FDA', claim: 'Cleared by the FDA' },
    ]);
  });

  it('drops non-https, relative, own-domain, and competitor citations', () => {
    const citationDenyHosts = new Set(['acme.com', 'rival.com']);
    const out = buildEdgeSeoOverrides(
      [
        {
          moduleKey: 'external-citations',
          targetUrl: 'https://acme.com/p',
          generated: {
            citations: [
              { anchor: 'insecure', url: 'http://pubchem.ncbi.nlm.nih.gov/x' }, // http → drop
              { anchor: 'relative', url: '/local/page' }, // relative → drop
              { anchor: 'self', url: 'https://www.acme.com/about' }, // own domain → drop
              { anchor: 'rival', url: 'https://rival.com/x' }, // competitor → drop
              { anchor: 'FDA', url: 'https://www.fda.gov/ok' }, // external https → keep
            ],
          },
        },
      ],
      { citationDenyHosts },
    );
    expect(out['/p'].citations).toEqual([{ anchor: 'FDA', href: 'https://www.fda.gov/ok' }]);
  });

  it('dedupes by href and caps citations at 5', () => {
    const citations = Array.from({ length: 8 }, (_, i) => ({ anchor: `S${i}`, url: `https://src${i}.org/x` }));
    citations.push({ anchor: 'dup', url: 'https://src0.org/x' });
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'external-citations', targetUrl: 'https://a.com/hub', generated: { citations } },
    ]);
    expect(out['/hub'].citations).toHaveLength(5);
    expect(out['/hub'].citations!.filter((c) => c.href === 'https://src0.org/x')).toHaveLength(1);
  });

  it('newest external-citations fix replaces the earlier citation set', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'external-citations', targetUrl: 'https://a.com/p', generated: { citations: [{ anchor: 'Old', url: 'https://old.org/x' }] } },
      { moduleKey: 'external-citations', targetUrl: 'https://a.com/p', generated: { citations: [{ anchor: 'New', url: 'https://new.org/x' }] } },
    ]);
    expect(out['/p'].citations).toEqual([{ anchor: 'New', href: 'https://new.org/x' }]);
  });

  it('lets internal links and citations coexist on the same path', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'internal-linking', targetUrl: 'https://a.com/p', generated: { links: [{ anchor: 'Guide', url: 'https://a.com/guide' }] } },
      { moduleKey: 'external-citations', targetUrl: 'https://a.com/p', generated: { citations: [{ anchor: 'FDA', url: 'https://fda.gov/x' }] } },
    ]);
    expect(out['/p'].links).toEqual([{ anchor: 'Guide', href: 'https://a.com/guide' }]);
    expect(out['/p'].citations).toEqual([{ anchor: 'FDA', href: 'https://fda.gov/x' }]);
  });
});

describe('edge citable-passages overrides', () => {
  it('emits a citable block (tldr + passages) from a shipped citable-passages fix', () => {
    const out = buildEdgeSeoOverrides([
      {
        moduleKey: 'citable-passages',
        targetUrl: 'https://acme.com/guide/',
        generated: {
          tldr: 'Cagrilintide is a long-acting amylin analogue.',
          passages: ['Half-life is about 7 days.', 'Dosed once weekly.'],
          rationale: 'ignored', // module carries this but the override drops it
          html: '<section>ignored</section>',
        },
      },
    ]);
    expect(out['/guide'].citable).toEqual({
      tldr: 'Cagrilintide is a long-acting amylin analogue.',
      passages: ['Half-life is about 7 days.', 'Dosed once weekly.'],
    });
  });

  it('trims blanks, dedupes passages, and caps at 6', () => {
    const passages = Array.from({ length: 9 }, (_, i) => `Fact ${i}`);
    passages.push('Fact 0'); // duplicate
    passages.push('   ');    // blank
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'citable-passages', targetUrl: 'https://a.com/hub', generated: { tldr: '  Summary  ', passages } },
    ]);
    expect(out['/hub'].citable!.tldr).toBe('Summary');
    expect(out['/hub'].citable!.passages).toHaveLength(6);
    expect(out['/hub'].citable!.passages.filter((p) => p === 'Fact 0')).toHaveLength(1);
  });

  it('drops a citable fix with neither a TL;DR nor any passage', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'citable-passages', targetUrl: 'https://a.com/p', generated: { tldr: '   ', passages: ['', '  '] } },
    ]);
    expect(out['/p']).toBeUndefined();
  });

  it('newest citable-passages fix replaces the earlier block', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'citable-passages', targetUrl: 'https://a.com/p', generated: { tldr: 'Old', passages: ['old'] } },
      { moduleKey: 'citable-passages', targetUrl: 'https://a.com/p', generated: { tldr: 'New', passages: ['new'] } },
    ]);
    expect(out['/p'].citable).toEqual({ tldr: 'New', passages: ['new'] });
  });

  it('lets links, citations, and the citable block all coexist on one path', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'internal-linking', targetUrl: 'https://a.com/p', generated: { links: [{ anchor: 'Guide', url: 'https://a.com/guide' }] } },
      { moduleKey: 'external-citations', targetUrl: 'https://a.com/p', generated: { citations: [{ anchor: 'FDA', url: 'https://fda.gov/x' }] } },
      { moduleKey: 'citable-passages', targetUrl: 'https://a.com/p', generated: { tldr: 'Summary', passages: ['A fact.'] } },
    ]);
    expect(out['/p'].links).toEqual([{ anchor: 'Guide', href: 'https://a.com/guide' }]);
    expect(out['/p'].citations).toEqual([{ anchor: 'FDA', href: 'https://fda.gov/x' }]);
    expect(out['/p'].citable).toEqual({ tldr: 'Summary', passages: ['A fact.'] });
  });
});

describe('edge faq-schema overrides', () => {
  it('emits a faq block (Q/A pairs) from a shipped faq-schema fix', () => {
    const out = buildEdgeSeoOverrides([
      {
        moduleKey: 'faq-schema',
        targetUrl: 'https://acme.com/guide/',
        generated: {
          faqs: [
            { question: 'Is it safe?', answer: 'Yes, when dosed correctly.' },
            { question: 'How is it stored?', answer: 'Refrigerated.' },
          ],
          rationale: 'ignored',
          html: '<section>ignored</section>',
          schema: '{"@type":"FAQPage"}',
        },
      },
    ]);
    expect(out['/guide'].faq).toEqual({
      faqs: [
        { question: 'Is it safe?', answer: 'Yes, when dosed correctly.' },
        { question: 'How is it stored?', answer: 'Refrigerated.' },
      ],
    });
  });

  it('trims, drops blank pairs, dedupes by question, and caps at 8', () => {
    const faqs = Array.from({ length: 11 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}` }));
    faqs.push({ question: 'Q0', answer: 'dup' }); // duplicate question
    faqs.push({ question: '  ', answer: 'blank q' }); // blank question
    faqs.push({ question: 'no answer', answer: '   ' }); // blank answer
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'faq-schema', targetUrl: 'https://a.com/hub', generated: { faqs } },
    ]);
    expect(out['/hub'].faq!.faqs).toHaveLength(8);
    expect(out['/hub'].faq!.faqs.filter((f) => f.question === 'Q0')).toHaveLength(1);
  });

  it('drops a faq fix with no usable pairs', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'faq-schema', targetUrl: 'https://a.com/p', generated: { faqs: [{ question: '  ', answer: '' }] } },
    ]);
    expect(out['/p']).toBeUndefined();
  });

  it('newest faq-schema fix replaces the earlier block', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'faq-schema', targetUrl: 'https://a.com/p', generated: { faqs: [{ question: 'Old?', answer: 'old' }] } },
      { moduleKey: 'faq-schema', targetUrl: 'https://a.com/p', generated: { faqs: [{ question: 'New?', answer: 'new' }] } },
    ]);
    expect(out['/p'].faq).toEqual({ faqs: [{ question: 'New?', answer: 'new' }] });
  });

  it('lets all four body blocks (links, citations, citable, faq) coexist on one path', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'internal-linking', targetUrl: 'https://a.com/p', generated: { links: [{ anchor: 'Guide', url: 'https://a.com/guide' }] } },
      { moduleKey: 'external-citations', targetUrl: 'https://a.com/p', generated: { citations: [{ anchor: 'FDA', url: 'https://fda.gov/x' }] } },
      { moduleKey: 'citable-passages', targetUrl: 'https://a.com/p', generated: { tldr: 'Summary', passages: ['A fact.'] } },
      { moduleKey: 'faq-schema', targetUrl: 'https://a.com/p', generated: { faqs: [{ question: 'Q?', answer: 'A.' }] } },
    ]);
    expect(out['/p'].links).toEqual([{ anchor: 'Guide', href: 'https://a.com/guide' }]);
    expect(out['/p'].citations).toEqual([{ anchor: 'FDA', href: 'https://fda.gov/x' }]);
    expect(out['/p'].citable).toEqual({ tldr: 'Summary', passages: ['A fact.'] });
    expect(out['/p'].faq).toEqual({ faqs: [{ question: 'Q?', answer: 'A.' }] });
  });
});

describe('edge content-freshness overrides', () => {
  it('emits a freshness block (update + dated label) from a shipped fix', () => {
    const out = buildEdgeSeoOverrides([
      {
        moduleKey: 'content-freshness',
        targetUrl: 'https://acme.com/guide/',
        generated: {
          update: 'Reviewed against the latest 2026 dosing guidance; figures unchanged.',
          html: '<div class="lvx-fresh"><strong>Updated July 2026:</strong> Reviewed against the latest 2026 dosing guidance; figures unchanged.</div>',
          rationale: 'ignored',
        },
      },
    ]);
    expect(out['/guide'].freshness).toEqual({
      update: 'Reviewed against the latest 2026 dosing guidance; figures unchanged.',
      label: 'Updated July 2026:',
    });
  });

  it('falls back to a plain "Updated:" label when the html has no dated strong tag', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'content-freshness', targetUrl: 'https://a.com/p', generated: { update: 'Still current.' } },
    ]);
    expect(out['/p'].freshness).toEqual({ update: 'Still current.', label: 'Updated:' });
  });

  it('trims and caps the update text at 600 chars, drops empty', () => {
    const long = 'y'.repeat(700);
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'content-freshness', targetUrl: 'https://a.com/hub', generated: { update: `  ${long}  ` } },
    ]);
    expect(out['/hub'].freshness!.update).toHaveLength(600);
    const empty = buildEdgeSeoOverrides([
      { moduleKey: 'content-freshness', targetUrl: 'https://a.com/e', generated: { update: '   ' } },
    ]);
    expect(empty['/e']).toBeUndefined();
  });

  it('newest content-freshness fix replaces the earlier block', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'content-freshness', targetUrl: 'https://a.com/p', generated: { update: 'Old note.' } },
      { moduleKey: 'content-freshness', targetUrl: 'https://a.com/p', generated: { update: 'New note.' } },
    ]);
    expect(out['/p'].freshness).toEqual({ update: 'New note.', label: 'Updated:' });
  });

  it('lets all five body blocks (links, citations, citable, faq, freshness) coexist on one path', () => {
    const out = buildEdgeSeoOverrides([
      { moduleKey: 'internal-linking', targetUrl: 'https://a.com/p', generated: { links: [{ anchor: 'Guide', url: 'https://a.com/guide' }] } },
      { moduleKey: 'external-citations', targetUrl: 'https://a.com/p', generated: { citations: [{ anchor: 'FDA', url: 'https://fda.gov/x' }] } },
      { moduleKey: 'citable-passages', targetUrl: 'https://a.com/p', generated: { tldr: 'Summary', passages: ['A fact.'] } },
      { moduleKey: 'faq-schema', targetUrl: 'https://a.com/p', generated: { faqs: [{ question: 'Q?', answer: 'A.' }] } },
      { moduleKey: 'content-freshness', targetUrl: 'https://a.com/p', generated: { update: 'Fresh.' } },
    ]);
    expect(out['/p'].links).toEqual([{ anchor: 'Guide', href: 'https://a.com/guide' }]);
    expect(out['/p'].citations).toEqual([{ anchor: 'FDA', href: 'https://fda.gov/x' }]);
    expect(out['/p'].citable).toEqual({ tldr: 'Summary', passages: ['A fact.'] });
    expect(out['/p'].faq).toEqual({ faqs: [{ question: 'Q?', answer: 'A.' }] });
    expect(out['/p'].freshness).toEqual({ update: 'Fresh.', label: 'Updated:' });
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
