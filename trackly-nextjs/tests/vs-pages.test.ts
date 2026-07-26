import { describe, expect, it } from 'vitest';
import { vsComparisons, getVsComparison } from '@/data/vs-comparisons';
import { alternatives } from '@/data/alternatives';
import sitemap from '@/app/sitemap';

// Pins the data-driven /vs/ cohort (the newer, template-rendered comparison
// pages). Keyword ownership itself is guarded by keyword-ownership.test.ts;
// this file pins format, honesty, cross-linking, and discoverability.

describe('vs comparison cohort', () => {
  it('has the six data-driven comparisons', () => {
    expect(vsComparisons).toHaveLength(6);
  });

  it('every slug is unique', () => {
    const slugs = vsComparisons.map((v) => v.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  for (const v of vsComparisons) {
    describe(`/vs/${v.slug}`, () => {
      it('titles the head-to-head as "Livesov vs {name}"', () => {
        expect(v.metaTitle).toMatch(/^Livesov vs .+/);
        expect(v.metaTitle).toContain(v.name);
      });

      it('owns a "livesov vs" primary keyword that its own keywords include', () => {
        expect(v.primaryKeyword).toMatch(/^livesov vs /);
        const kws = v.keywords.split(',').map((k) => k.trim().toLowerCase());
        expect(kws).toContain(v.primaryKeyword.toLowerCase());
      });

      it('does not reach for the alternative/review/pricing intents', () => {
        // Those belong to the alternative pages and to future intents; a vs
        // page borrowing them re-creates the cannibalisation Phase 0 removed.
        const kws = v.keywords.toLowerCase();
        expect(kws).not.toMatch(/\balternative\b/);
        expect(kws).not.toMatch(/\breview\b/);
        expect(kws).not.toMatch(/\bpricing\b/);
      });

      it('gives an honest "why pick the competitor" case', () => {
        expect(v.competitorFit.length).toBeGreaterThanOrEqual(2);
        for (const fit of v.competitorFit) {
          expect(fit.title.length).toBeGreaterThan(3);
          expect(fit.description.length).toBeGreaterThan(20);
        }
      });

      it('has at least three FAQs', () => {
        expect(v.faqs.length).toBeGreaterThanOrEqual(3);
      });

      it('cross-links to a real alternative page for the same tool', () => {
        const slugs = new Set(alternatives.map((a) => `/${a.slug}`));
        expect(slugs, `${v.alternativeHref} is not a real alternative page`).toContain(v.alternativeHref);
      });

      it('is resolvable via getVsComparison', () => {
        expect(getVsComparison(v.slug)?.name).toBe(v.name);
      });
    });
  }

  it('every title is unique', () => {
    const titles = vsComparisons.map((v) => v.metaTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('vs pages are discoverable + reciprocally linked', () => {
  const urls = new Set(sitemap().map((e) => new URL(e.url).pathname));

  it('lists every data-driven vs page in the sitemap', () => {
    for (const v of vsComparisons) {
      expect(urls, `/vs/${v.slug} missing from sitemap`).toContain(`/vs/${v.slug}`);
    }
  });

  it('the matching alternative page links back to the vs page', () => {
    // Reciprocal internal link consolidates the cluster instead of leaving the
    // two pages disconnected.
    for (const v of vsComparisons) {
      const alt = alternatives.find((a) => `/${a.slug}` === v.alternativeHref);
      expect(alt?.vsHref, `${v.alternativeHref} should link to /vs/${v.slug}`).toBe(`/vs/${v.slug}`);
    }
  });
});
