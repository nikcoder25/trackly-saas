import { describe, expect, it } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { rankTrackers, getRankTracker, getAllRankTrackerSlugs } from '@/data/rank-trackers';

/**
 * Guards for the rank-tracker page family.
 *
 * These pages sit OUTSIDE the keyword-ownership registry in
 * src/data/seo-registry.ts, which only covers /vs/ and /<competitor>-alternative
 * pages. That makes this the one commercial surface with no mechanical
 * anti-cannibalisation check - and it now holds a category page
 * (/llm-rank-tracker) sitting directly above two engine pages, which is exactly
 * the arrangement where a stray keyword makes a parent compete with its own
 * children. These tests are the missing guard for that family.
 */

const APP_DIR = join(process.cwd(), 'src/app/(public)');

function keywordList(keywords: string): string[] {
  return keywords
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

/** The keyword a page is trying to rank first for: the slug read as a phrase. */
function primaryKeyword(slug: string): string {
  return slug.replace(/-/g, ' ');
}

describe('rank-tracker pages', () => {
  it('every data entry has a route file, and every route has a data entry', () => {
    for (const slug of getAllRankTrackerSlugs()) {
      expect(
        existsSync(join(APP_DIR, slug, 'page.tsx')),
        `missing route file for ${slug}`,
      ).toBe(true);
    }

    // The reverse direction: a *-rank-tracker route with no data entry would
    // throw at build time on the non-null assertion, but fail loudly here first.
    const routeSlugs = readdirSync(APP_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.endsWith('-rank-tracker'))
      .map((d) => d.name);
    for (const slug of routeSlugs) {
      expect(getRankTracker(slug), `no data entry for route /${slug}`).toBeDefined();
    }
    expect(routeSlugs.length).toBe(rankTrackers.length);
  });

  it('declares each page primary keyword exactly once across the family', () => {
    const seen = new Map<string, string>();
    for (const r of rankTrackers) {
      const primary = primaryKeyword(r.slug);
      expect(
        keywordList(r.keywords),
        `${r.slug} must declare its own primary keyword "${primary}"`,
      ).toContain(primary);
      expect(seen.has(primary), `"${primary}" is claimed by two pages`).toBe(false);
      seen.set(primary, r.slug);
    }
  });

  it('never lets one page list another page primary keyword', () => {
    // The cannibalisation rule. /llm-rank-tracker must not reach down for
    // "chatgpt rank tracker", and neither engine page may reach up for
    // "llm rank tracker".
    for (const page of rankTrackers) {
      const mine = keywordList(page.keywords);
      for (const other of rankTrackers) {
        if (other.slug === page.slug) continue;
        const theirs = primaryKeyword(other.slug);
        expect(
          mine,
          `${page.slug} lists "${theirs}", which is ${other.slug}'s primary keyword`,
        ).not.toContain(theirs);
      }
    }
  });

  it('keeps engine copy grammatical for plural category pages', () => {
    // RankTrackerPage interpolates `engineSubject` as the subject of "cite" /
    // "list" / "recommend". A plural subject must set enginePlural so the
    // scaffolding drops the third-person -s ("LLMs cite", not "LLMs cites").
    for (const r of rankTrackers) {
      if (r.enginePlural) {
        expect(r.engineSubject, `${r.slug} sets enginePlural but no engineSubject`).toBeTruthy();
      }
      // A subject ending in "s" that is not marked plural is the likely typo.
      if (r.engineSubject && /s$/i.test(r.engineSubject) && !r.enginePlural) {
        throw new Error(
          `${r.slug}: engineSubject "${r.engineSubject}" looks plural but enginePlural is not set`,
        );
      }
    }
  });

  it('links every page to two others without linking to itself', () => {
    for (const r of rankTrackers) {
      expect(r.brandTrackingHref).toMatch(/^\//);
      expect(r.otherHref).toMatch(/^\//);
      expect(r.otherHref).not.toBe(`/${r.slug}`);
      expect(r.brandTrackingHref).not.toBe(`/${r.slug}`);
    }
  });

  it('ships complete metadata for every page', () => {
    for (const r of rankTrackers) {
      expect(r.metaTitle.length, `${r.slug} metaTitle`).toBeGreaterThan(20);
      expect(r.metaDescription.length, `${r.slug} metaDescription`).toBeGreaterThan(80);
      expect(r.stats.length, `${r.slug} stats`).toBe(4);
      expect(r.models.length, `${r.slug} models`).toBeGreaterThan(0);
      expect(r.faqs.length, `${r.slug} faqs`).toBeGreaterThanOrEqual(5);
      expect(r.whyParagraphs.length, `${r.slug} whyParagraphs`).toBeGreaterThanOrEqual(3);
    }
  });
});
