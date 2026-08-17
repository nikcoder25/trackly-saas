/**
 * Module: CTR rescue (GSC-driven, Channel A).
 *
 * Detect: pull Search Analytics (query × page) for the last 28 days; find
 *   pages averaging positions 1-5 with high impressions but low CTR for
 *   that position (i.e. underperforming the position-expected click rate),
 *   excluding queries Google answers without a click. Rewrite the title +
 *   meta description to win more clicks.
 * Generate: LLM rewrites title + meta.
 * Ship: update title + meta description via the CMS adapter.
 * Recheck: re-pull Search Analytics and confirm CTR improved.
 */

import { crawlPage } from '../crawl';
import { generateJson } from '../generate';
import { screenZeroClickQueries } from '../intent';
import { CTR_SYSTEM, ctrUserPrompt } from '../prompts';
import { getValidAccessToken, searchAnalytics, trailingDateRange } from '../gsc';
import { resolveCmsForBrand } from './_shared';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

export const MIN_IMPRESSIONS = 500; // page-level, to focus on pages with real demand

/**
 * Positions this module owns.
 *
 * Capped at 5 on purpose, and `striking-distance` now starts at 6, so the
 * two modules partition the SERP instead of overlapping it.
 *
 * The split follows the diagnosis. In positions 1-5 the page is already
 * visible, so if it isn't being clicked the metadata is the lever. From 6
 * down, visibility itself is the problem and a better title cannot fix it
 * - that is a ranking job.
 *
 * This is also a correctness fix, not just tidiness. Both modules write
 * the page <title>, and the engine's dedupe key is scoped within a module
 * (see types.ts), so an overlapping band let both queue a title rewrite
 * for the same URL with nothing to catch the collision.
 */
export const POS_MIN = 1;
export const POS_MAX = 5;

// Rough position→expected-CTR curve (organic). A page well below the
// expected CTR for its position is a rescue candidate.
export function expectedCtr(position: number): number {
  if (position <= 1) return 0.28;
  if (position <= 2) return 0.15;
  if (position <= 3) return 0.10;
  if (position <= 5) return 0.06;
  if (position <= 10) return 0.025;
  return 0.01;
}

/** Flag when actual CTR is below this share of the position-expected rate. */
export const CTR_SHORTFALL_RATIO = 0.6;

interface CtrQuery { query: string; impressions: number; ctr: number }

/**
 * Clicks the page would gain over the same window if it merely hit the
 * position-expected CTR. This is the number that makes a fix worth doing,
 * and it is deliberately clicks and not currency: the app has no GA4
 * connection and no conversion data, so any revenue figure would be
 * invented. Callers wanting money multiply by their own lead value.
 */
export function projectedClickGain(impressions: number, ctr: number, position: number): number {
  return Math.max(0, Math.round(impressions * (expectedCtr(position) - ctr)));
}

export const ctrRescueModule: FixModule = {
  key: 'ctr-rescue',
  title: 'CTR rescue',
  description: 'Positions 1-5 with high impressions and low CTR — rewrite title and meta to win clicks.',
  channel: 'A',
  trigger: 'gsc',
  minPlan: 'pro',
  phase: 2,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const token = await getValidAccessToken(ctx.brand.id, ctx.tenantId);
    if (!token || !token.siteUrl) return [];
    const { startDate, endDate } = trailingDateRange(28);
    const rows = await searchAnalytics({
      accessToken: token.accessToken, siteUrl: token.siteUrl, startDate, endDate,
      dimensions: ['page', 'query'], rowLimit: 5000,
    });

    // Aggregate per page.
    interface Agg { impressions: number; clicks: number; posSum: number; n: number; queries: CtrQuery[] }
    const byPage = new Map<string, Agg>();
    for (const r of rows) {
      const [page, query] = r.keys;
      const a = byPage.get(page) ?? { impressions: 0, clicks: 0, posSum: 0, n: 0, queries: [] };
      a.impressions += r.impressions;
      a.clicks += r.clicks;
      a.posSum += r.position;
      a.n += 1;
      a.queries.push({ query, impressions: r.impressions, ctr: r.ctr });
      byPage.set(page, a);
    }

    // First pass: everything that looks like a CTR shortfall on the numbers
    // alone. Screening happens after, so the zero-click lookup is one
    // batched call over just the candidates' primary queries.
    interface Candidate {
      page: string; avgPos: number; ctr: number; impressions: number;
      expected: number; queries: CtrQuery[];
    }
    const candidates: Candidate[] = [];
    for (const [page, a] of byPage) {
      if (a.impressions < MIN_IMPRESSIONS) continue;
      const avgPos = a.posSum / a.n;
      if (avgPos < POS_MIN || avgPos > POS_MAX) continue;
      const ctr = a.clicks / a.impressions;
      const exp = expectedCtr(avgPos);
      if (ctr >= exp * CTR_SHORTFALL_RATIO) continue;
      a.queries.sort((x, y) => y.impressions - x.impressions);
      candidates.push({ page, avgPos, ctr, impressions: a.impressions, expected: exp, queries: a.queries });
    }
    if (!candidates.length) return [];

    // A page whose primary query is one Google answers in the SERP is not
    // underperforming, it is being read correctly - see intent.ts.
    const zeroClick = await screenZeroClickQueries(
      candidates.map((c) => c.queries[0]?.query).filter((q): q is string => !!q),
    );

    const issues: DetectedIssue[] = [];
    for (const c of candidates) {
      const primary = c.queries[0]?.query;
      if (primary && zeroClick.has(primary.trim().toLowerCase())) continue;
      const gain = projectedClickGain(c.impressions, c.ctr, c.avgPos);
      issues.push({
        key: c.page,
        targetUrl: c.page,
        severity: c.impressions > 1000 ? 'high' : 'medium',
        summary: `CTR ${(c.ctr * 100).toFixed(1)}% vs ~${(c.expected * 100).toFixed(0)}% expected at pos ${c.avgPos.toFixed(1)}`
          + ` - about ${gain} clicks/month on the table`,
        detected: {
          url: c.page,
          queries: c.queries.slice(0, 10),
          projectedClickGain: gain,
        },
        before: { ctr: c.ctr, impressions: c.impressions, position: c.avgPos },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; queries: CtrQuery[] };
    let title: string | null = null;
    let meta: string | null = null;
    try {
      const page = await crawlPage(d.url, ctx.signal);
      title = page.title; meta = page.metaDescription;
    } catch { /* fall back to query-only generation */ }
    // Competitive context: what currently wins the click for the page's top
    // query — the exact SERP the rewrite has to beat. Best-effort.
    let competitors: { title: string; description: string }[] = [];
    const topQuery = d.queries[0]?.query ?? null;
    if (topQuery) {
      try {
        const { getTopSerpResults } = await import('../serp');
        competitors = await getTopSerpResults(ctx, topQuery);
      } catch { /* generate without competitor context */ }
    }
    const { data } = await generateJson<{ title: string; description: string; rationale: string }>({
      ctx,
      system: CTR_SYSTEM,
      user: ctrUserPrompt({ brand: ctx.brand, url: d.url, title, meta, queries: d.queries, competitors }),
      maxTokens: 500,
    });
    return { generated: { ...data, before: { title, description: meta }, serpQuery: topQuery, serpCompared: competitors.length, serpCompetitors: competitors.slice(0, 5) }, creditsUsed: 1 };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const g = draft.generated as { title?: string; description?: string; before?: { title?: string | null; description?: string | null } };
    const b = g.before ?? {};
    return {
      kind: 'key-values',
      label: 'New title + meta description',
      before: `Title: ${b.title ?? '(none)'}\n\nMeta: ${b.description ?? '(none)'}`,
      after: `Title: ${g.title ?? ''}\n\nMeta: ${g.description ?? ''}`,
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const g = draft.generated as { title: string; description: string };
    const t = await cms.adapter.updateTitle(cms.creds, { url: issue.targetUrl! }, g.title);
    const m = await cms.adapter.updateMetaDescription(cms.creds, { url: issue.targetUrl! }, g.description);
    const ok = t.ok && m.ok;
    // Pass the adapter's own reason through — it is often actionable ("your
    // SEO plugin does not expose that field — connect the Connector"), and a
    // generic "writes failed" buries it. Both writes are idempotent, so
    // there's no ordering hazard in attempting both.
    return {
      ok,
      detail: { title: t.detail, meta: m.detail },
      after: { title: g.title, description: g.description },
      error: ok ? undefined : [t.ok ? null : t.error ?? 'Title update failed', m.ok ? null : m.error ?? 'Meta description update failed'].filter(Boolean).join('; '),
    };
  },

  async recheck(issue: DetectedIssue, _draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    const token = await getValidAccessToken(ctx.brand.id, ctx.tenantId);
    if (!token || !token.siteUrl) return { verified: false, scoreAfter: null, note: 'GSC not connected' };
    try {
      const { startDate, endDate } = trailingDateRange(7);
      const rows = await searchAnalytics({
        accessToken: token.accessToken, siteUrl: token.siteUrl, startDate, endDate,
        dimensions: ['page'], rowLimit: 5000,
      });
      const mine = rows.find((r) => r.keys[0] === issue.targetUrl);
      if (!mine) return { verified: false, scoreAfter: null, note: 'No recent GSC data for this page yet' };
      const before = (issue.before as { ctr?: number })?.ctr ?? mine.ctr;
      const improved = mine.ctr > before;
      const scoreAfter = Math.min(100, Math.round(mine.ctr * 100 * 4)); // 25% CTR → 100
      return { verified: improved, scoreAfter, note: `CTR ${(before * 100).toFixed(1)}% → ${(mine.ctr * 100).toFixed(1)}%` };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
