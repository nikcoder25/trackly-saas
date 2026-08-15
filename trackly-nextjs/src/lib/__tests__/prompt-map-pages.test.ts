/**
 * Tests for selectImportantPages (src/lib/prompt-map.ts).
 *
 * This heuristic decides which pages the classifier is even allowed to
 * bind a prompt to. Anything it filters out can never become a prompt's
 * page, and from there can never be picked up by the Fix Engine - so the
 * cost of wrongly demoting a real service page is high, and the cost of
 * letting /privacy through is a wasted slot in the candidate list.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const state: { targets: string[]; throws: boolean } = { targets: [], throws: false };

vi.mock('../fix-engine/crawl', () => ({
  resolveCrawlTargets: vi.fn(async () => {
    if (state.throws) throw new Error('sitemap unreachable');
    return state.targets;
  }),
}));

const { selectImportantPages } = await import('../prompt-map');

beforeEach(() => {
  state.targets = [];
  state.throws = false;
});

describe('selectImportantPages', () => {
  it('returns nothing when the brand has no website', async () => {
    expect(await selectImportantPages(undefined)).toEqual([]);
  });

  it('degrades to an empty list when the sitemap fetch throws', async () => {
    // A binding step that crashes the whole brand save because a customer's
    // sitemap 500s would be far worse than simply offering no pages.
    state.throws = true;
    expect(await selectImportantPages('https://acme.test')).toEqual([]);
  });

  it('puts the homepage first', async () => {
    state.targets = [
      'https://acme.test/',
      'https://acme.test/services/ac-repair',
      'https://acme.test/about',
    ];
    const pages = await selectImportantPages('https://acme.test');
    expect(pages[0].path).toBe('/');
  });

  it('prefers shallow pages over deeply nested ones', async () => {
    state.targets = [
      'https://acme.test/services/hvac/auburn/emergency/after-hours',
      'https://acme.test/financing',
    ];
    const pages = await selectImportantPages('https://acme.test');
    expect(pages[0].path).toBe('/financing');
  });

  it('demotes blog, legal and pagination URLs below real service pages', async () => {
    state.targets = [
      'https://acme.test/blog/how-heat-pumps-work',
      'https://acme.test/privacy-policy',
      'https://acme.test/tag/hvac',
      'https://acme.test/ac-repair',
    ];
    const pages = await selectImportantPages('https://acme.test');
    expect(pages[0].path).toBe('/ac-repair');
  });

  it('drops URLs carrying a query string', async () => {
    // ?page=2 style URLs are filtered views of a page that also exists
    // without one; keeping both would split a prompt's binding.
    state.targets = [
      'https://acme.test/services',
      'https://acme.test/services?page=2',
    ];
    const pages = await selectImportantPages('https://acme.test');
    expect(pages.map(p => p.path)).toEqual(['/services']);
  });

  it('deduplicates URLs that differ only by trailing slash or case', async () => {
    state.targets = [
      'https://acme.test/Services',
      'https://acme.test/services/',
      'https://acme.test/services',
    ];
    const pages = await selectImportantPages('https://acme.test');
    expect(pages).toHaveLength(1);
  });

  it('skips unparseable entries rather than failing the whole list', async () => {
    state.targets = ['not-a-url', 'https://acme.test/ac-repair'];
    const pages = await selectImportantPages('https://acme.test');
    expect(pages.map(p => p.path)).toEqual(['/ac-repair']);
  });

  it('honours the max cap', async () => {
    state.targets = Array.from({ length: 60 }, (_, i) => `https://acme.test/p${i}`);
    const pages = await selectImportantPages('https://acme.test', 10);
    expect(pages).toHaveLength(10);
  });
});
