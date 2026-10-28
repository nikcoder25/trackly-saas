/**
 * Module: Keyword cannibalisation (GSC-driven, diagnostic).
 *
 * Two pages on one site chasing the same query is a self-inflicted wound:
 * Google splits the topical signals between them, often rotates which one
 * it shows, and ranks whichever it picks below where a single consolidated
 * page would sit. It is also invisible in every per-page report, because
 * neither page looks broken on its own - you only see it by grouping the
 * site's own URLs BY query, which nothing else in the engine does.
 *
 * Detect: group the trailing 28 days of query × page rows by query and flag
 *   queries where two or more of the site's URLs draw real impressions.
 * Generate: pick the owner and decide what happens to the others.
 * Ship: diagnostic - nothing is written. Consolidating pages means 301s and
 *   content merges, which is a decision with permanent consequences for a
 *   site's URL structure and is not something to automate behind one click.
 * Recheck: confirm the query has consolidated onto fewer URLs.
 *
 * Needs no new data source: it re-reads the same Search Console response
 * the other GSC modules already pull.
 */

import { crawlPage } from '../crawl';
import { generateJson } from '../generate';
import { CANNIBALIZATION_SYSTEM, cannibalizationUserPrompt } from '../prompts';
import { getValidAccessToken, searchAnalytics, trailingDateRange } from '../gsc';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

/** A query needs this much total demand before a split is worth resolving. */
export const MIN_QUERY_IMPRESSIONS = 100;
/** Each competing page needs this share of the query to count as competing. */
export const MIN_PAGE_SHARE = 0.1;
/** Below this many impressions a page is noise on the query, not a rival. */
export const MIN_PAGE_IMPRESSIONS = 10;
/** Cap the pages compared per query - beyond this it is a template problem. */
const MAX_PAGES_PER_QUERY = 4;
const MAX_ISSUES = 10;

export interface CompetingPage {
  url: string; clicks: number; impressions: number; position: number;
}

/**
 * Find queries served by more than one of the site's own URLs.
 *
 * The share floor is what separates cannibalisation from ordinary
 * long-tail overlap: on any big site a dozen pages pick up a stray
 * impression for a head term, and treating that as a conflict would flag
 * every query on the site.
 */
export function findCompetingPages(
  rows: { keys: string[]; clicks: number; impressions: number; position: number }[],
): { query: string; pages: CompetingPage[]; impressions: number }[] {
  const byQuery = new Map<string, Map<string, CompetingPage>>();
  for (const r of rows) {
    const [page, query] = r.keys;
    if (!page || !query) continue;
    const pages = byQuery.get(query) ?? new Map<string, CompetingPage>();
    const existing = pages.get(page);
    if (existing) {
      existing.clicks += r.clicks;
      existing.impressions += r.impressions;
      existing.position = (existing.position + r.position) / 2;
    } else {
      pages.set(page, { url: page, clicks: r.clicks, impressions: r.impressions, position: r.position });
    }
    byQuery.set(query, pages);
  }

  const out: { query: string; pages: CompetingPage[]; impressions: number }[] = [];
  for (const [query, pageMap] of byQuery) {
    const total = [...pageMap.values()].reduce((s, p) => s + p.impressions, 0);
    if (total < MIN_QUERY_IMPRESSIONS) continue;
    const competing = [...pageMap.values()]
      .filter((p) => p.impressions >= MIN_PAGE_IMPRESSIONS && p.impressions / total >= MIN_PAGE_SHARE)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, MAX_PAGES_PER_QUERY);
    if (competing.length < 2) continue;
    out.push({ query, pages: competing, impressions: total });
  }
  return out.sort((a, b) => b.impressions - a.impressions);
}

export const cannibalizationModule: FixModule = {
  key: 'cannibalization',
  title: 'Keyword cannibalisation',
  description: 'Two or more of your pages competing for the same query - decide which one should own it.',
  channel: 'A',
  trigger: 'gsc',
  minPlan: 'pro',
  phase: 2,
  diagnostic: true,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const token = await getValidAccessToken(ctx.brand.id, ctx.tenantId);
    if (!token || !token.siteUrl) return [];
    const { startDate, endDate } = trailingDateRange(28);
    const rows = await searchAnalytics({
      accessToken: token.accessToken, siteUrl: token.siteUrl, startDate, endDate,
      dimensions: ['page', 'query'], rowLimit: 5000,
    });

    return findCompetingPages(rows).slice(0, MAX_ISSUES).map(({ query, pages, impressions }) => ({
      // Keyed on the query, not a URL: the conflict belongs to the query,
      // and keying on a page would create one fix per side of the same one.
      key: `query:${query}`,
      // The best-performing page is the likely owner and the sensible thing
      // for the dashboard to link to.
      targetUrl: pages[0].url,
      severity: impressions > 1000 ? 'high' : 'medium',
      summary: `${pages.length} pages competing for "${query}" (${impressions} impressions)`,
      detected: { query, pages, impressions },
    }));
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { query: string; pages: CompetingPage[] };
    const summarised = await Promise.all(d.pages.map(async (p) => {
      let title: string | null = null;
      let summary = '';
      try {
        const page = await crawlPage(p.url, ctx.signal);
        title = page.title;
        summary = page.text.slice(0, 600);
      } catch { /* compare on metrics alone if a page is unreachable */ }
      return { ...p, title, summary };
    }));

    const { data } = await generateJson<{
      isRealConflict: boolean; owner: string; reasoning: string;
      resolutions: { url: string; action: string; detail: string }[];
      internalLinks: string;
    }>({
      ctx,
      system: CANNIBALIZATION_SYSTEM,
      user: cannibalizationUserPrompt({ brand: ctx.brand, query: d.query, pages: summarised }),
      maxTokens: 1200,
    });
    return { generated: { ...data, query: d.query }, creditsUsed: 1 };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const g = draft.generated as {
      isRealConflict?: boolean; owner?: string; reasoning?: string;
      resolutions?: { url: string; action: string; detail: string }[];
      internalLinks?: string; query?: string;
    };
    if (g.isRealConflict === false) {
      return {
        kind: 'key-values',
        label: 'Cannibalisation verdict',
        addNote: 'No action needed.',
        after: `These pages share the phrase "${g.query ?? ''}" but serve different intents.\n\n${g.reasoning ?? ''}`,
      };
    }
    const res = (g.resolutions ?? [])
      .map((r) => `- ${r.url}\n  → ${r.action}: ${r.detail}`)
      .join('\n');
    return {
      kind: 'key-values',
      label: 'Cannibalisation resolution',
      addNote: 'A plan, not an edit. Consolidating pages means redirects and content merges, so nothing is changed automatically.',
      after: `Query: "${g.query ?? ''}"\n\nShould own it: ${g.owner ?? '?'}\n\nWhy: ${g.reasoning ?? ''}\n\n`
        + `Other pages:\n${res || '- (none)'}\n\nInternal links: ${g.internalLinks ?? ''}`,
    };
  },

  /** Diagnostic: records the plan, writes nothing. */
  async ship(_issue: DetectedIssue, draft: GeneratedDraft): Promise<ShipResult> {
    const g = draft.generated as { owner?: string; isRealConflict?: boolean; resolutions?: unknown[] };
    return {
      ok: true,
      detail: {
        diagnostic: true,
        isRealConflict: g.isRealConflict ?? null,
        owner: g.owner ?? null,
        resolutions: g.resolutions?.length ?? 0,
      },
      after: { owner: g.owner ?? null },
    };
  },

  async recheck(issue: DetectedIssue, _draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    const token = await getValidAccessToken(ctx.brand.id, ctx.tenantId);
    if (!token || !token.siteUrl) return { verified: false, scoreAfter: null, note: 'GSC not connected' };
    const d = issue.detected as { query: string; pages: CompetingPage[] };
    try {
      const { startDate, endDate } = trailingDateRange(28);
      const rows = await searchAnalytics({
        accessToken: token.accessToken, siteUrl: token.siteUrl, startDate, endDate,
        dimensions: ['page', 'query'], rowLimit: 5000,
      });
      const still = findCompetingPages(rows).find((c) => c.query === d.query);
      const nowCompeting = still?.pages.length ?? 1;
      const wasCompeting = d.pages.length;
      return {
        verified: nowCompeting < wasCompeting,
        scoreAfter: nowCompeting <= 1 ? 100 : Math.max(0, Math.round((1 - nowCompeting / wasCompeting) * 100)),
        note: `${wasCompeting} → ${nowCompeting} pages competing for "${d.query}"`,
      };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
