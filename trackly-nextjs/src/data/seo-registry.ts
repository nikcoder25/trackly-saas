// ─────────────────────────────────────────────────────────────────────────────
// Keyword ownership registry — the single source of truth for which URL owns
// which commercial-intent search term.
//
// WHY THIS EXISTS
// A site with 9 "{tool} alternative" pages and 5 "livesov vs {tool}" pages is
// one careless keyword edit away from two URLs competing for the same query.
// When that happens Google splits link equity and ranking signals across both
// and neither wins — self-inflicted cannibalisation. Before this registry the
// /vs/ pages were literally bidding on the alternatives pages' primary terms
// ("profound alternative" appeared in both /profound-alternative and
// /vs/profound).
//
// THE CONTRACT (enforced by tests/keyword-ownership.test.ts)
//   1. Every commercial page declares exactly ONE primary keyword here.
//   2. No two pages may declare the same primary keyword.
//   3. No page's full `keywords` list may CONTAIN another page's primary
//      keyword — not even as a secondary term.
//
// Adding a new competitor page? Add its row here first. If CI goes red, the
// keyword you picked is already owned — pick the angle that page uniquely
// serves instead. That red build is the guard working.
// ─────────────────────────────────────────────────────────────────────────────

import { alternatives } from './alternatives';

export interface CommercialPage {
  /** Site-relative URL, e.g. "/profound-alternative". */
  url: string;
  /** The one term this page is the designated owner of. */
  primaryKeyword: string;
  /**
   * Repo-relative path to the source file whose inline `keywords:` string the
   * guard test parses. Only set for pages that are NOT data-driven (the /vs/
   * pages keep their metadata inline). Alternative pages omit this — the test
   * reads their keywords straight from the `alternatives` data module.
   */
  keywordsFile?: string;
}

/**
 * Head-to-head comparison pages. Each owns "livesov vs {tool}" (and the
 * reverse "{tool} vs livesov"), and must NOT reach for "{tool} alternative",
 * "{tool} review", or "{tool} pricing" — those belong to other intents.
 */
export const VS_PAGES: readonly CommercialPage[] = [
  { url: '/vs/profound', primaryKeyword: 'livesov vs profound', keywordsFile: 'src/app/(public)/vs/profound/page.tsx' },
  { url: '/vs/peec-ai',  primaryKeyword: 'livesov vs peec ai',  keywordsFile: 'src/app/(public)/vs/peec-ai/page.tsx' },
  { url: '/vs/otterly',  primaryKeyword: 'livesov vs otterly',  keywordsFile: 'src/app/(public)/vs/otterly/page.tsx' },
  { url: '/vs/semrush',  primaryKeyword: 'livesov vs semrush',  keywordsFile: 'src/app/(public)/vs/semrush/page.tsx' },
  { url: '/vs/ahrefs',   primaryKeyword: 'livesov vs ahrefs',   keywordsFile: 'src/app/(public)/vs/ahrefs/page.tsx' },
] as const;

/** Alternative pages, derived from their data module so this can never drift. */
export const ALTERNATIVE_PAGES: readonly CommercialPage[] = alternatives.map((a) => ({
  url: `/${a.slug}`,
  primaryKeyword: a.primaryKeyword,
}));

/** Every commercial-intent competitor page, in one list. */
export const COMMERCIAL_PAGES: readonly CommercialPage[] = [
  ...ALTERNATIVE_PAGES,
  ...VS_PAGES,
];
