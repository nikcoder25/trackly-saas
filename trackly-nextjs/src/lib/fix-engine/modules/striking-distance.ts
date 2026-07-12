/**
 * Module: Striking distance (GSC-driven, Channel A). The highest-ROI module.
 *
 * Detect: pull Search Analytics (query × page) for the last 28 days, find
 *   pages with queries ranking in positions 4-15 (page-1 edge) that have
 *   real impressions. Group by page; each page with enough striking-distance
 *   opportunity becomes one fix.
 * Generate: LLM produces a sharper title + a focused content section
 *   targeting those near-ranking queries.
 * Ship: update the title and append the new section via the CMS adapter.
 * Recheck: re-pull Search Analytics and confirm average position improved.
 */

import { crawlPage } from '../crawl';
import { generateJson } from '../generate';
import { STRIKING_SYSTEM, strikingUserPrompt } from '../prompts';
import { getValidAccessToken, searchAnalytics, trailingDateRange } from '../gsc';
import { resolveCmsForBrand } from './_shared';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

const POS_MIN = 4;
const POS_MAX = 15;
const MIN_IMPRESSIONS = 20;     // per query, to ignore noise
const MIN_QUERIES_PER_PAGE = 1; // a page needs at least this many striking queries

interface StrikingQuery { query: string; position: number; impressions: number }

export const strikingDistanceModule: FixModule = {
  key: 'striking-distance',
  title: 'Striking distance',
  description: 'Find position 4-15 queries and optimise the page to climb. Highest ROI.',
  channel: 'A',
  trigger: 'gsc',
  minPlan: 'pro',
  phase: 2,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const token = await getValidAccessToken(ctx.brand.id, ctx.tenantId);
    if (!token || !token.siteUrl) return [];
    const { startDate, endDate } = trailingDateRange(28);
    const rows = await searchAnalytics({
      accessToken: token.accessToken,
      siteUrl: token.siteUrl,
      startDate, endDate,
      dimensions: ['page', 'query'],
      rowLimit: 5000,
    });

    // Group striking-distance queries by page.
    const byPage = new Map<string, StrikingQuery[]>();
    for (const r of rows) {
      const [page, query] = r.keys;
      if (r.position < POS_MIN || r.position > POS_MAX) continue;
      if (r.impressions < MIN_IMPRESSIONS) continue;
      const list = byPage.get(page) ?? [];
      list.push({ query, position: r.position, impressions: r.impressions });
      byPage.set(page, list);
    }

    const issues: DetectedIssue[] = [];
    for (const [page, queries] of byPage) {
      if (queries.length < MIN_QUERIES_PER_PAGE) continue;
      queries.sort((a, b) => b.impressions - a.impressions);
      const top = queries.slice(0, 10);
      const bestImpr = top[0]?.impressions ?? 0;
      issues.push({
        key: page,
        targetUrl: page,
        severity: bestImpr > 200 ? 'high' : 'medium',
        summary: `${queries.length} query(s) in striking distance (pos ${POS_MIN}-${POS_MAX})`,
        detected: { url: page, queries: top },
        before: { avgPosition: top.reduce((s, q) => s + q.position, 0) / top.length },
      });
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; queries: StrikingQuery[] };
    let pageText = '';
    let title: string | null = null;
    try {
      const page = await crawlPage(d.url, ctx.signal);
      pageText = page.text;
      title = page.title;
    } catch { /* generate from queries alone if the page is unreachable */ }
    const { data } = await generateJson<{ title: string; sectionHeading: string; sectionBody: string; rationale: string }>({
      ctx,
      system: STRIKING_SYSTEM,
      user: strikingUserPrompt({ brand: ctx.brand, url: d.url, title, queries: d.queries, pageText }),
      maxTokens: 1600,
    });
    const sectionHtml = `<h2>${data.sectionHeading}</h2>\n<p>${data.sectionBody}</p>`;
    return { generated: { ...data, sectionHtml }, creditsUsed: 2 };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const g = draft.generated as { title?: string; sectionHtml?: string };
    return {
      kind: 'code-block',
      label: 'New title + content section',
      language: 'html',
      after: `<title>${g.title ?? ''}</title>\n\n${g.sectionHtml ?? ''}`,
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const g = draft.generated as { title: string; sectionHtml: string };
    const titleRes = await cms.adapter.updateTitle(cms.creds, { url: issue.targetUrl! }, g.title);
    const bodyRes = await cms.adapter.updateBody(cms.creds, { url: issue.targetUrl! }, g.sectionHtml, 'append');
    const ok = titleRes.ok && bodyRes.ok;
    return {
      ok,
      detail: { title: titleRes.detail, body: bodyRes.detail },
      after: { title: g.title, sectionHtml: g.sectionHtml },
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
        dimensions: ['page', 'query'], rowLimit: 5000,
      });
      const mine = rows.filter((r) => r.keys[0] === issue.targetUrl);
      if (!mine.length) return { verified: false, scoreAfter: null, note: 'No recent GSC data for this page yet' };
      const avgPos = mine.reduce((s, r) => s + r.position, 0) / mine.length;
      const before = (issue.before as { avgPosition?: number })?.avgPosition ?? avgPos;
      const improved = avgPos < before;
      // Score: closer to position 1 is better (1 → 100, 20 → 0).
      const scoreAfter = Math.max(0, Math.round((20 - Math.min(avgPos, 20)) / 19 * 100));
      return { verified: improved, scoreAfter, note: `Avg position ${before.toFixed(1)} → ${avgPos.toFixed(1)}` };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
