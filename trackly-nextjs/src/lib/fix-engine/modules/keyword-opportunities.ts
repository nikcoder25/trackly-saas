/**
 * Module: Keyword opportunities (Channel A, GSC + Keywords Everywhere).
 *
 * The "low-competition, high-volume" targeting an agency does by hand:
 *
 * Detect: pull the brand's own GSC queries (28d), keep the ones ranking on
 *   page 2-3 (positions 8-30, real impressions), then enrich with Keywords
 *   Everywhere volume + ad-competition. An opportunity = volume ≥ MIN_VOLUME
 *   and competition ≤ MAX_COMPETITION — keywords the site already almost
 *   ranks for that are demonstrably winnable. Requires BOTH connections;
 *   silently detects nothing when either is missing.
 * Generate: a targeting plan (suggested title + specific on-page actions)
 *   plus one ready-to-publish section answering the keyword's intent.
 * Ship: append the section to the target page.
 * Recheck: confirm the section is live (position movement then shows up in
 *   the striking-distance / outcome tracking over the following weeks).
 */

import { crawlPage } from '../crawl';
import { generateJson } from '../generate';
import { KEYWORD_PLAN_SYSTEM, keywordPlanUserPrompt } from '../prompts';
import { getValidAccessToken, searchAnalytics, trailingDateRange } from '../gsc';
import { getKeywordMetrics, hasKeywordData } from '../keywords';
import { resolveCmsForBrand } from './_shared';
import type {
  ContentPatch,
  DetectedIssue,
  FixContext,
  FixModule,
  GeneratedDraft,
  PreviewBlock,
  RecheckVerdict,
  ShipResult,
} from '../types';

export const MIN_VOLUME = 100;        // monthly searches
export const MAX_COMPETITION = 0.4;   // Google Ads competition, 0-1
const POSITION_MIN = 8;               // page 2-3: already almost ranking
const POSITION_MAX = 30;
const MAX_CANDIDATES = 50;            // KWE lookups per scan (credit-aware)
const MAX_ISSUES = 10;

export const keywordOpportunitiesModule: FixModule = {
  key: 'keyword-opportunities',
  title: 'Keyword opportunities',
  description: 'Low-competition, high-volume keywords you already almost rank for (GSC × Keywords Everywhere).',
  channel: 'A',
  trigger: 'gsc',
  minPlan: 'starter',
  phase: 2,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    // Needs both data sources; without them this module just finds nothing.
    if (!(await hasKeywordData(ctx.brand.id))) return [];
    const token = await getValidAccessToken(ctx.brand.id, ctx.tenantId);
    if (!token || !token.siteUrl) return [];

    const { startDate, endDate } = trailingDateRange(28);
    const rows = await searchAnalytics({
      accessToken: token.accessToken, siteUrl: token.siteUrl, startDate, endDate,
      dimensions: ['query', 'page'], rowLimit: 2000,
    });

    // Best page per query within our position window, ranked by impressions.
    const byQuery = new Map<string, { page: string; position: number; impressions: number; clicks: number }>();
    for (const r of rows) {
      const [query, page] = r.keys;
      if (!query || !page) continue;
      if (r.position < POSITION_MIN || r.position > POSITION_MAX) continue;
      const cur = byQuery.get(query);
      if (!cur || r.impressions > cur.impressions) {
        byQuery.set(query, { page, position: r.position, impressions: r.impressions, clicks: r.clicks });
      }
    }
    const candidates = [...byQuery.entries()]
      .sort((a, b) => b[1].impressions - a[1].impressions)
      .slice(0, MAX_CANDIDATES);
    if (candidates.length === 0) return [];

    const metrics = await getKeywordMetrics(ctx.brand.id, candidates.map(([q]) => q));

    const issues: DetectedIssue[] = [];
    for (const [query, g] of candidates) {
      const m = metrics.get(query.trim().toLowerCase().replace(/\s+/g, ' '));
      if (!m) continue;
      if (m.volume < MIN_VOLUME || m.competition > MAX_COMPETITION) continue;
      issues.push({
        key: `kw:${query}`,
        targetUrl: g.page,
        severity: m.volume >= 1000 ? 'high' : 'medium',
        summary: `"${query}" — ${m.volume.toLocaleString()} searches/mo, low competition (${m.competition.toFixed(2)}), you rank #${Math.round(g.position)}`,
        detected: {
          query, page: g.page, position: g.position, impressions: g.impressions,
          volume: m.volume, competition: m.competition, cpc: m.cpc,
        },
      });
      if (issues.length >= MAX_ISSUES) break;
    }
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { query: string; page: string; position: number; volume: number; competition: number; instruction?: string };
    let title: string | null = null;
    let pageText = '';
    try {
      const page = await crawlPage(d.page, ctx.signal);
      title = page.title; pageText = page.text;
    } catch { /* plan can still be generated from brand context */ }
    let user = keywordPlanUserPrompt({
      brand: ctx.brand, url: d.page, keyword: d.query,
      volume: d.volume, competition: d.competition, position: d.position,
      title, pageText,
    });
    // A user-initiated keyword request can add intent/angle (e.g. "focus on
    // comparison-shoppers"). Scan-detected opportunities carry none.
    if (typeof d.instruction === 'string' && d.instruction.trim()) {
      user += `\n\nUser preference (honor this): ${d.instruction.trim()}`;
    }
    const { data } = await generateJson<{ suggestedTitle: string; suggestedH1?: string; suggestedMetaDescription?: string; suggestedSlug?: string; plan: string[]; heading: string; html: string; rationale: string }>({
      ctx,
      system: KEYWORD_PLAN_SYSTEM,
      user,
      maxTokens: 1400,
    });
    return {
      generated: {
        suggestedTitle: data.suggestedTitle,
        suggestedH1: data.suggestedH1 ?? null,
        suggestedMetaDescription: data.suggestedMetaDescription ?? null,
        suggestedSlug: data.suggestedSlug ?? null,
        currentTitle: title ?? null,
        plan: data.plan,
        heading: data.heading, html: data.html, rationale: data.rationale,
      },
      creditsUsed: 2,
    };
  },

  preview(issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const d = issue.detected as { query: string; volume: number; competition: number; position: number };
    const g = draft.generated as {
      suggestedTitle?: string; suggestedH1?: string | null; suggestedMetaDescription?: string | null;
      suggestedSlug?: string | null; currentTitle?: string | null; plan?: string[]; html?: string;
    };
    const plan = g.plan ?? [];
    // The exact keyword the plan targets across every on-page location, so the
    // reviewer can see at a glance that title/H1/meta/slug/heading all carry it.
    const onPage = [
      g.suggestedTitle && `Title:  ${g.suggestedTitle}`,
      g.suggestedH1 && `H1:     ${g.suggestedH1}`,
      g.suggestedMetaDescription && `Meta:   ${g.suggestedMetaDescription}`,
      g.suggestedSlug && `Slug:   /${String(g.suggestedSlug).replace(/^\/+/, '')}`,
    ].filter(Boolean) as string[];
    return {
      kind: 'key-values',
      label: `Target "${d.query}" (${d.volume.toLocaleString()}/mo · comp ${d.competition.toFixed(2)} · now #${Math.round(d.position)})`,
      before: [
        `Current title: ${g.currentTitle || '(none)'}`,
        '',
        `No section on this page targets "${d.query}" yet.`,
      ].join('\n'),
      after: [
        `Exact keyword to target across on-page SEO: "${d.query}"`,
        '',
        ...onPage,
        '',
        'Plan:',
        ...plan.map((p) => `• ${p}`),
        '',
        'New section to publish:',
        String(g.html ?? ''),
      ].join('\n'),
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.updateBody(cms.creds, { url: issue.targetUrl! }, String(draft.generated.html), 'append');
    return {
      ok: result.ok,
      detail: result.detail ?? {},
      after: { heading: draft.generated.heading },
      error: result.ok ? undefined : (result.error ?? 'CMS write failed'),
    };
  },

  contentPatch(issue: DetectedIssue, draft: GeneratedDraft): ContentPatch | null {
    if (!issue.targetUrl) return null;
    return { url: issue.targetUrl, bodyAppend: String(draft.generated.html) };
  },

  async recheck(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    try {
      const page = await crawlPage(issue.targetUrl!, ctx.signal);
      const heading = String(draft.generated.heading ?? '').replace(/\s+/g, ' ').slice(0, 60);
      const verified = !!heading && page.text.replace(/\s+/g, ' ').includes(heading);
      return {
        verified,
        scoreAfter: verified ? 100 : null,
        note: verified
          ? 'Section is live — ranking movement shows in GSC over the next weeks'
          : 'New section not found on the page yet',
      };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
