/**
 * Module: CTR rescue (GSC-driven, Channel A).
 *
 * Detect: pull Search Analytics (query × page) for the last 28 days; find
 *   pages with high impressions but low CTR for their average position
 *   (i.e. underperforming the position-expected click rate). Rewrite the
 *   title + meta description to win more clicks.
 * Generate: LLM rewrites title + meta.
 * Ship: update title + meta description via the CMS adapter.
 * Recheck: re-pull Search Analytics and confirm CTR improved.
 */

import { crawlPage } from '../crawl';
import { generateJson } from '../generate';
import { CTR_SYSTEM, ctrUserPrompt } from '../prompts';
import { getValidAccessToken, searchAnalytics, trailingDateRange } from '../gsc';
import { resolveCmsForBrand } from './_shared';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

const MIN_IMPRESSIONS = 100; // page-level, to focus on pages with real demand

// Rough position→expected-CTR curve (organic). A page well below the
// expected CTR for its position is a rescue candidate.
function expectedCtr(position: number): number {
  if (position <= 1) return 0.28;
  if (position <= 2) return 0.15;
  if (position <= 3) return 0.10;
  if (position <= 5) return 0.06;
  if (position <= 10) return 0.025;
  return 0.01;
}

interface CtrQuery { query: string; impressions: number; ctr: number }

export const ctrRescueModule: FixModule = {
  key: 'ctr-rescue',
  title: 'CTR rescue',
  description: 'High impressions, low CTR — rewrite title and meta to win clicks.',
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

    const issues: DetectedIssue[] = [];
    for (const [page, a] of byPage) {
      if (a.impressions < MIN_IMPRESSIONS) continue;
      const avgPos = a.posSum / a.n;
      const ctr = a.clicks / a.impressions;
      const exp = expectedCtr(avgPos);
      // Underperforming if actual CTR is below ~60% of position-expected.
      if (ctr >= exp * 0.6) continue;
      a.queries.sort((x, y) => y.impressions - x.impressions);
      issues.push({
        key: page,
        targetUrl: page,
        severity: a.impressions > 1000 ? 'high' : 'medium',
        summary: `CTR ${(ctr * 100).toFixed(1)}% vs ~${(exp * 100).toFixed(0)}% expected at pos ${avgPos.toFixed(1)}`,
        detected: { url: page, queries: a.queries.slice(0, 10) },
        before: { ctr, impressions: a.impressions },
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
    return {
      ok,
      detail: { title: t.detail, meta: m.detail },
      after: { title: g.title, description: g.description },
      error: ok ? undefined : 'One or more CMS writes failed',
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
