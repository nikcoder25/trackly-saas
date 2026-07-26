import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMMERCIAL_PAGES,
  VS_PAGES,
  type CommercialPage,
} from '@/data/seo-registry';
import { alternatives } from '@/data/alternatives';

// The mechanical anti-cannibalisation guard. See src/data/seo-registry.ts for
// the contract. If this file goes red, two competitor pages are fighting for
// the same query — fix the keyword, don't loosen the test.

/**
 * Return a page's full comma-split keyword list, lower-cased and trimmed.
 * Alternative pages read from the data module; /vs/ pages are parsed from the
 * inline `keywords:` string in their source file so the test checks what the
 * page ACTUALLY ships, not a copy that could drift.
 */
function keywordsFor(page: CommercialPage): string[] {
  let raw: string;
  if (page.keywordsFile) {
    const src = readFileSync(join(process.cwd(), page.keywordsFile), 'utf8');
    const m = src.match(/keywords:\s*\n?\s*['"`]([^'"`]+)['"`]/);
    if (!m) throw new Error(`no keywords string found in ${page.keywordsFile}`);
    raw = m[1];
  } else {
    const alt = alternatives.find((a) => `/${a.slug}` === page.url);
    if (!alt) throw new Error(`no alternative data entry for ${page.url}`);
    raw = alt.keywords;
  }
  return raw
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

describe('keyword ownership registry', () => {
  it('registers every alternative page and every vs page', () => {
    // 9 alternatives + 5 vs. If a competitor page is added without a registry
    // row, this count drifts and the omission is caught here.
    expect(COMMERCIAL_PAGES.length).toBe(alternatives.length + VS_PAGES.length);
  });

  it('gives every page a non-empty primary keyword', () => {
    for (const page of COMMERCIAL_PAGES) {
      expect(page.primaryKeyword.trim().length, `${page.url} has no primary keyword`).toBeGreaterThan(0);
    }
  });

  it('every URL appears exactly once', () => {
    const urls = COMMERCIAL_PAGES.map((p) => p.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('no two pages own the same primary keyword', () => {
  it('primary keywords are globally unique', () => {
    const seen = new Map<string, string>();
    for (const page of COMMERCIAL_PAGES) {
      const key = page.primaryKeyword.toLowerCase();
      const prior = seen.get(key);
      expect(
        prior,
        `"${page.primaryKeyword}" is claimed by both ${prior} and ${page.url}`,
      ).toBeUndefined();
      seen.set(key, page.url);
    }
  });
});

describe('no page borrows another page primary keyword', () => {
  // The load-bearing test. A page may list many keywords, but it must not list
  // ANY OTHER registered page's primary term — that is exactly the overlap that
  // makes two URLs compete. This is what caught the /vs/ pages carrying
  // "profound alternative", "peec ai alternative", etc.
  const primaries = COMMERCIAL_PAGES.map((p) => ({
    url: p.url,
    kw: p.primaryKeyword.toLowerCase(),
  }));

  for (const page of COMMERCIAL_PAGES) {
    it(`${page.url} lists no rival's primary keyword`, () => {
      const own = keywordsFor(page);
      const ownSet = new Set(own);
      for (const other of primaries) {
        if (other.url === page.url) continue;
        expect(
          ownSet.has(other.kw),
          `${page.url} lists "${other.kw}", which is owned by ${other.url}`,
        ).toBe(false);
      }
    });
  }
});

describe('each page actually targets the keyword it claims to own', () => {
  // A page can only own a term it is on-page for. Assert the primary keyword
  // is present in the page's own keyword list, so ownership is real, not just
  // asserted in the registry.
  for (const page of COMMERCIAL_PAGES) {
    it(`${page.url} includes its own primary keyword in its keywords`, () => {
      const own = keywordsFor(page);
      expect(
        own,
        `${page.url} claims "${page.primaryKeyword}" but does not list it`,
      ).toContain(page.primaryKeyword.toLowerCase());
    });
  }
});
