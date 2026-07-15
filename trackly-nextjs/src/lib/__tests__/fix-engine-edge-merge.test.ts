/**
 * Fix Engine - regression guard for the "only one edge block serves" bug.
 *
 * When a page has BOTH a shipped internal-linking fix AND a shipped
 * external-citations fix, the per-path override must carry links AND citations
 * together — shipping one type must never clobber the other. This exercises the
 * full server path (getEdgeSeoOverrides → buildEdgeSeoOverrides), which folds
 * every fix row for a path into ONE merged override object.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [] as Array<{ module_key: string; target_url: string; generated: Record<string, unknown> }>,
  brand: { website: 'https://acme.test', competitors: [] as string[] },
}));

vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(async (sql: string) => {
      if (/FROM fixes/.test(sql)) return { rows: state.rows };
      if (/FROM brands/.test(sql)) return { rows: [state.brand] };
      return { rows: [] };
    }),
  },
}));
// Serve-time link validation is gone, so getEdgeSeoOverrides makes no outbound
// fetch; a throwing safeFetch proves the served path never re-validates links.
vi.mock('@/lib/safe-fetch', () => ({
  safeFetch: vi.fn(async () => { throw new Error('no network at serve time'); }),
  SSRFError: class extends Error {},
}));

import { getEdgeSeoOverrides } from '@/lib/fix-engine/schema';

beforeEach(() => {
  state.rows = [];
  state.brand = { website: 'https://acme.test', competitors: [] };
  vi.clearAllMocks();
});

describe('getEdgeSeoOverrides — links + citations coexist per path', () => {
  it('carries BOTH links and citations (and head fields) for a page with all three fix types', async () => {
    state.rows = [
      { module_key: 'internal-linking', target_url: 'https://acme.test/about', generated: { links: [{ anchor: 'Cagrilintide', url: 'https://acme.test/peptides/cagrilintide' }] } },
      { module_key: 'external-citations', target_url: 'https://acme.test/about', generated: { citations: [{ anchor: 'FDA', url: 'https://fda.gov/x', source: 'FDA' }] } },
      { module_key: 'title-rewrite', target_url: 'https://acme.test/about', generated: { title: 'About Acme' } },
    ];
    const out = await getEdgeSeoOverrides('brand-1');
    expect(out['/about']).toEqual({
      title: 'About Acme',
      links: [{ anchor: 'Cagrilintide', href: 'https://acme.test/peptides/cagrilintide' }],
      citations: [{ anchor: 'FDA', href: 'https://fda.gov/x', source: 'FDA' }],
    });
  });

  it('shipping the citations fix does not drop the internal links (order-independent)', async () => {
    // citations row LAST — the internal-linking override must survive.
    state.rows = [
      { module_key: 'internal-linking', target_url: 'https://acme.test/about', generated: { links: [{ anchor: 'Guide', url: 'https://acme.test/guide' }] } },
      { module_key: 'external-citations', target_url: 'https://acme.test/about', generated: { citations: [{ anchor: 'PubChem', url: 'https://pubchem.ncbi.nlm.nih.gov/x' }] } },
    ];
    const out = await getEdgeSeoOverrides('brand-1');
    expect(out['/about'].links).toEqual([{ anchor: 'Guide', href: 'https://acme.test/guide' }]);
    expect(out['/about'].citations).toEqual([{ anchor: 'PubChem', href: 'https://pubchem.ncbi.nlm.nih.gov/x' }]);
  });

  it('serves internal links without re-validating them against the sitemap (deterministic read)', async () => {
    const { safeFetch } = await import('@/lib/safe-fetch');
    state.rows = [
      { module_key: 'internal-linking', target_url: 'https://acme.test/hub', generated: { links: [{ anchor: 'A', url: 'https://acme.test/a' }] } },
    ];
    const out = await getEdgeSeoOverrides('brand-1');
    expect(out['/hub'].links).toEqual([{ anchor: 'A', href: 'https://acme.test/a' }]);
    expect(safeFetch).not.toHaveBeenCalled(); // no serve-time sitemap fetch
  });

  it('carries ALL FIVE body blocks (links + citations + citable + faq + freshness) plus head fields for one page, order-independent', async () => {
    const { safeFetch } = await import('@/lib/safe-fetch');
    // freshness/faq/citable rows FIRST, links/citations after, head field last —
    // the merge must be order-independent and none may clobber another.
    state.rows = [
      { module_key: 'content-freshness', target_url: 'https://acme.test/about', generated: { update: 'Reviewed for 2026.', html: '<div class="lvx-fresh"><strong>Updated July 2026:</strong> Reviewed for 2026.</div>' } },
      { module_key: 'faq-schema', target_url: 'https://acme.test/about', generated: { faqs: [{ question: 'Is it safe?', answer: 'Yes.' }], schema: '{"@type":"FAQPage"}' } },
      { module_key: 'citable-passages', target_url: 'https://acme.test/about', generated: { tldr: 'Acme makes peptides.', passages: ['Founded 2019.', 'Ships worldwide.'] } },
      { module_key: 'internal-linking', target_url: 'https://acme.test/about', generated: { links: [{ anchor: 'Cagrilintide', url: 'https://acme.test/peptides/cagrilintide' }] } },
      { module_key: 'external-citations', target_url: 'https://acme.test/about', generated: { citations: [{ anchor: 'FDA', url: 'https://fda.gov/x', source: 'FDA' }] } },
      { module_key: 'title-rewrite', target_url: 'https://acme.test/about', generated: { title: 'About Acme' } },
    ];
    const out = await getEdgeSeoOverrides('brand-1');
    expect(out['/about']).toEqual({
      title: 'About Acme',
      links: [{ anchor: 'Cagrilintide', href: 'https://acme.test/peptides/cagrilintide' }],
      citations: [{ anchor: 'FDA', href: 'https://fda.gov/x', source: 'FDA' }],
      citable: { tldr: 'Acme makes peptides.', passages: ['Founded 2019.', 'Ships worldwide.'] },
      faq: { faqs: [{ question: 'Is it safe?', answer: 'Yes.' }] },
      freshness: { update: 'Reviewed for 2026.', label: 'Updated July 2026:' },
    });
    // Still a pure read — building the override never re-fetches at serve time.
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
