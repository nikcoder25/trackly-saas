/**
 * Module: Content gap (GSC + competitor crawl, diagnostic).
 *
 * A page stuck at position 8 is usually not stuck because of its title. It
 * is stuck because three competitors answered the question more completely
 * and Google can tell. This module reads those competitors and says exactly
 * what they cover that we do not.
 *
 * Detect: GSC queries in positions 6-20 with real demand, filtered down to
 *   a handful of high-value targets. NO model call here - see below.
 * Generate: fetch the live SERP for the target query, profile our page and
 *   the top competitors for depth and structure, and produce a writer's
 *   brief naming the specific headings, angles and elements that are
 *   missing.
 * Ship: diagnostic - nothing is written to the site.
 * Recheck: re-pull the query's position and report movement.
 *
 * WHY SELECTION IS DETERMINISTIC
 *
 * Every target selected here triggers a SERP lookup plus up to four full
 * page renders, and renders bill per success. That cost needs a gate, and
 * the obvious gate is a cheap model call that picks the best candidates.
 *
 * We do it without the model call, because every criterion turns out to be
 * available as data. Branded and navigational queries are recognisable
 * from the brand name and a URL pattern. PDFs, tag archives and utility
 * pages are a path check. Commercial value is exactly what DataForSEO's
 * search-intent classifier returns, from SERP evidence rather than a
 * model's introspection. Winnability is the position band. A model asked
 * to judge these would be guessing at things we can look up, and it would
 * cost a call on every scan of every brand to do it.
 */

import { generateJson } from '../generate';
import { profilePage, medianWordCount } from '../depth';
import { CONTENT_GAP_SYSTEM, contentGapUserPrompt } from '../prompts';
import { getValidAccessToken, searchAnalytics, trailingDateRange } from '../gsc';
import { getSearchIntent, isDataForSeoConfigured, type IntentLabel } from '@/lib/dataforseo';
import { logger } from '@/lib/logger';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

/** The band this module owns. Mirrors striking-distance's lower bound. */
export const POS_MIN = 6;
export const POS_MAX = 20;

/**
 * Per-query demand floor. Deliberately far below the 1,000 that a
 * national-publisher version of this would use: a local service query
 * pulling 200 impressions a month is a real, valuable target, and a floor
 * set for national head terms would select nothing on these accounts.
 */
export const MIN_IMPRESSIONS = 200;

/** Hard cap on targets per scan. Each one costs a SERP call + ~4 renders. */
export const MAX_TARGETS = 3;
/** Competitor pages profiled per target. */
export const MAX_COMPETITORS = 3;

/** URL shapes that are never worth a content expansion. */
const EXCLUDED_PATHS = [
  /\.(?:pdf|docx?|xlsx?|pptx?|zip|jpe?g|png|gif|webp|svg|mp4|mp3)$/i,
  /\/(?:tag|tags|category|categories|author|page)\/\d*/i,
  /\/(?:login|signin|sign-in|register|signup|sign-up|logout|account|cart|checkout|basket)\b/i,
  /\/(?:privacy|terms|terms-of-service|cookie-policy|disclaimer|thank-you|thanks)\b/i,
  /[?&](?:utm_|replytocom|s=)/i,
];

/** Query shapes that indicate the searcher is comparing or buying. */
const EVALUATIVE = /\b(?:best|top|vs|versus|compare|comparison|review|reviews|alternative|alternatives|cheapest|near me|cost|pricing)\b/i;

export function isExcludedUrl(url: string): boolean {
  return EXCLUDED_PATHS.some((re) => re.test(url));
}

/**
 * Words that carry no brand identity: the trade the business is in, and
 * generic corporate furniture. A local business name is usually nothing but
 * these plus a city, which is exactly why naive brand matching is dangerous
 * here.
 */
const GENERIC_BRAND_WORDS = new Set([
  'moving', 'movers', 'removals', 'storage', 'heating', 'cooling', 'air',
  'heat', 'hvac', 'plumbing', 'plumber', 'plumbers', 'paving', 'roofing',
  'roofers', 'electric', 'electrical', 'electricians', 'landscaping', 'lawn',
  'cleaning', 'cleaners', 'pest', 'control', 'remodeling', 'remodelling',
  'construction', 'contractors', 'contracting', 'services', 'service',
  'solutions', 'company', 'group', 'brothers', 'sons', 'incorporated',
]);

/**
 * Navigational queries: the searcher already wants us by name and will click
 * regardless, so more content changes nothing.
 *
 * The hard part is that a local business name is often just its city plus
 * its trade. "Green Bay Moving Co" shares every word with "green bay movers"
 * - which is not a branded query at all, it is the single most valuable
 * commercial query the business has. Matching the brand name loosely would
 * quietly exclude it from analysis.
 *
 * So both the trade words and the city are stripped before matching, and
 * only genuinely distinctive tokens count. A business whose name is entirely
 * city plus trade has no distinctive token left, and we conclude it has no
 * detectable branded queries rather than guessing - the explicit
 * navigational-word check below still catches "contact" and "login". Wrongly
 * analysing a branded query wastes one slot; wrongly skipping the money
 * query costs the customer the ranking.
 */
export function isBrandedQuery(query: string, brandName?: string, city?: string): boolean {
  const q = query.toLowerCase();
  if (/\b(?:login|log in|sign in|contact|careers|jobs|phone number|address|hours|near me directions)\b/.test(q)) return true;
  if (!brandName) return false;

  const cityWords = new Set(
    (city ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean),
  );
  const distinctive = brandName.toLowerCase().split(/[^a-z0-9]+/).filter((w) =>
    w.length > 3 && !GENERIC_BRAND_WORDS.has(w) && !cityWords.has(w));

  return distinctive.length > 0 && distinctive.every((w) => q.includes(w));
}

export interface GapCandidate {
  url: string; query: string; impressions: number; clicks: number; position: number;
  intent?: IntentLabel; score: number;
}

/**
 * Rank candidates so the capped scan spends its render budget well.
 * Impressions carry the weight; commercial intent and evaluative phrasing
 * multiply it, because those are the queries where better content converts.
 */
export function scoreCandidate(c: Omit<GapCandidate, 'score'>): number {
  let multiplier = 1;
  if (c.intent === 'commercial' || c.intent === 'transactional') multiplier *= 1.6;
  if (EVALUATIVE.test(c.query)) multiplier *= 1.3;
  // Closer to page 1 is more winnable with content alone.
  const winnability = 1 + (POS_MAX - Math.min(c.position, POS_MAX)) / (POS_MAX - POS_MIN);
  return c.impressions * multiplier * winnability;
}

export const contentGapModule: FixModule = {
  key: 'content-gap',
  title: 'Content gap',
  description: 'Compare a stalled page against the pages outranking it, and brief exactly what is missing.',
  channel: 'A',
  trigger: 'gsc',
  minPlan: 'agency',
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

    // Cheapest filters first, so nothing expensive touches a candidate that
    // was never eligible.
    const raw = rows
      .filter((r) => {
        const [page, query] = r.keys;
        if (!page || !query) return false;
        if (r.position < POS_MIN || r.position > POS_MAX) return false;
        if (r.impressions < MIN_IMPRESSIONS) return false;
        if (isExcludedUrl(page)) return false;
        if (isBrandedQuery(query, ctx.brand.name, ctx.brand.city ?? undefined)) return false;
        return true;
      })
      .map((r) => ({
        url: r.keys[0], query: r.keys[1],
        impressions: r.impressions, clicks: r.clicks, position: r.position,
      }));
    if (!raw.length) return [];

    // One page can hold several qualifying queries; keep only its best, so
    // the module produces one brief per page rather than three overlapping
    // ones.
    const bestPerPage = new Map<string, typeof raw[number]>();
    for (const c of raw) {
      const existing = bestPerPage.get(c.url);
      if (!existing || c.impressions > existing.impressions) bestPerPage.set(c.url, c);
    }
    const deduped = [...bestPerPage.values()];

    // Intent is an annotation on the ranking, never a filter: an
    // unclassified query keeps its place in the queue on impressions alone.
    let intents = new Map<string, { label: IntentLabel }>();
    if (isDataForSeoConfigured()) {
      try {
        intents = await getSearchIntent(deduped.slice(0, 200).map((c) => c.query));
      } catch (e) {
        logger.warn('fix_engine.content_gap.intent_failed', { err: (e as Error).message });
      }
    }

    const scored: GapCandidate[] = deduped
      .map((c) => {
        const intent = intents.get(c.query.toLowerCase())?.label;
        return { ...c, intent, score: scoreCandidate({ ...c, intent }) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_TARGETS);

    if (deduped.length > scored.length) {
      // Never let a budget cap read as "this is everything we found".
      logger.info('fix_engine.content_gap.capped', {
        brandId: ctx.brand.id, eligible: deduped.length, selected: scored.length,
      });
    }

    return scored.map((c) => ({
      key: c.url,
      targetUrl: c.url,
      severity: c.impressions > 1000 ? 'high' : 'medium',
      summary: `Position ${c.position.toFixed(1)} for "${c.query}" (${c.impressions} impressions)`
        + ` - ${deduped.length > scored.length ? `top ${scored.length} of ${deduped.length} eligible pages` : 'compare against the pages outranking it'}`,
      detected: {
        url: c.url, query: c.query, position: c.position,
        impressions: c.impressions, clicks: c.clicks, intent: c.intent ?? null,
        eligibleCandidates: deduped.length,
      },
      before: { position: c.position, impressions: c.impressions },
    }));
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as { url: string; query: string; position: number };

    const { getTopSerpResults } = await import('../serp');
    const serp = await getTopSerpResults(ctx, d.query);
    const ourHost = hostOf(ctx.brand.website) ?? hostOf(d.url);
    const competitorUrls = serp
      .map((r) => r.url)
      .filter((u): u is string => !!u)
      .filter((u) => hostOf(u) !== ourHost)
      .slice(0, MAX_COMPETITORS);

    if (!competitorUrls.length) {
      throw new Error(
        'No competitor results available for this query. Set SERPER_API_KEY or SERPAPI_KEY for real Google results.',
      );
    }

    // Our own page is not a third-party fetch; the customer connected it.
    const [ours, ...theirs] = await Promise.all([
      profilePage(d.url, { thirdParty: false, signal: ctx.signal }),
      ...competitorUrls.map((u) => profilePage(u, { thirdParty: true, signal: ctx.signal })),
    ]);

    const readable = theirs.filter((p) => p.read);
    if (!readable.length) {
      // Better to fail loudly than to brief a writer from nothing. The
      // reasons are actionable, so pass them through.
      const reasons = theirs.map((p) => `${p.url}: ${p.unreadReason}`).join('; ');
      throw new Error(
        `Could not read any competitor page (${reasons}). `
        + 'Competitor pages are often JS-rendered; configure a render backend (SCRAPERAPI_KEY, ZYTE_API_KEY, '
        + 'BRIGHTDATA_API_TOKEN or NAP_RENDER_ENDPOINT) so their content can be measured.',
      );
    }
    if (!ours.read) {
      throw new Error(`Could not read our own page ${d.url} (${ours.unreadReason}).`);
    }

    const { data } = await generateJson<{
      verdict: string; summary: string; wordCountNote: string;
      sections: { heading: string; level: number; placement: string; brief: string; sourcedFrom: string }[];
      faqs: { question: string; answerAngle: string }[];
      assetRecommendation: string;
    }>({
      ctx,
      system: CONTENT_GAP_SYSTEM,
      user: contentGapUserPrompt({
        brand: ctx.brand,
        url: d.url,
        keyword: d.query,
        position: d.position,
        ourPage: {
          title: ours.title, wordCount: ours.wordCount,
          headings: ours.headings, text: ours.text,
        },
        competitors: readable.map((p) => ({
          url: p.url, title: p.title, wordCount: p.wordCount, headings: p.headings,
          hasTables: p.hasTables, hasFaqSchema: p.hasFaqSchema, hasLists: p.hasLists,
          text: p.text,
        })),
      }),
      maxTokens: 2600,
    });

    return {
      generated: {
        ...data,
        query: d.query,
        ourWordCount: ours.wordCount,
        competitorMedianWordCount: medianWordCount(readable),
        competitorsRead: readable.length,
        competitorsAttempted: theirs.length,
        unreadCompetitors: theirs.filter((p) => !p.read).map((p) => ({ url: p.url, reason: p.unreadReason })),
        renderedAny: [ours, ...readable].some((p) => p.rendered),
      },
      creditsUsed: 3,
    };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const g = draft.generated as {
      verdict?: string; summary?: string; wordCountNote?: string;
      sections?: { heading: string; level: number; placement: string; brief: string; sourcedFrom: string }[];
      faqs?: { question: string; answerAngle: string }[];
      assetRecommendation?: string; query?: string;
      ourWordCount?: number; competitorMedianWordCount?: number;
      competitorsRead?: number; competitorsAttempted?: number;
      unreadCompetitors?: { url: string; reason?: string }[];
    };

    const coverage = g.competitorsRead != null && g.competitorsAttempted != null
      && g.competitorsRead < g.competitorsAttempted
      ? `\n\nRead ${g.competitorsRead} of ${g.competitorsAttempted} competitor pages`
        + (g.unreadCompetitors?.length
          ? ` (skipped: ${g.unreadCompetitors.map((u) => `${u.url} — ${u.reason}`).join(', ')})`
          : '')
      : '';

    if (g.verdict === 'no_meaningful_gap') {
      return {
        kind: 'key-values',
        label: 'Content gap analysis',
        addNote: 'No action recommended.',
        after: `Query: "${g.query ?? ''}"\n\n${g.summary ?? ''}\n\n${g.wordCountNote ?? ''}${coverage}`,
      };
    }

    const sections = (g.sections ?? []).map((s, i) =>
      `${i + 1}. H${s.level} — ${s.heading}\n`
      + `   where: ${s.placement}\n`
      + `   cover: ${s.brief}\n`
      + `   seen on: ${s.sourcedFrom}`,
    ).join('\n\n');
    const faqs = (g.faqs ?? []).map((f) => `- ${f.question}\n  angle: ${f.answerAngle}`).join('\n');

    return {
      kind: 'key-values',
      label: 'Content expansion brief',
      addNote: 'A brief for a writer, not an edit. Nothing is published from this card - '
        + 'the headings below describe what to write, they are not the copy itself.',
      after: `Query: "${g.query ?? ''}"\n`
        + `Our length: ${g.ourWordCount ?? '?'} words vs competitor median ${g.competitorMedianWordCount ?? '?'}\n\n`
        + `${g.summary ?? ''}\n\n${g.wordCountNote ?? ''}\n\n`
        + `SECTIONS TO ADD\n${sections || '(none)'}\n\n`
        + `FAQs\n${faqs || '(none)'}\n\n`
        + `ASSET\n${g.assetRecommendation ?? '(none)'}${coverage}`,
    };
  },

  /**
   * Diagnostic: the brief is instructions for a writer, not publishable
   * copy. Shipping it would put "cover the following concepts..." on a live
   * page, so there is deliberately no write path here - the prose is a
   * separate authoring step.
   */
  async ship(_issue: DetectedIssue, draft: GeneratedDraft): Promise<ShipResult> {
    const g = draft.generated as { verdict?: string; sections?: unknown[]; query?: string };
    return {
      ok: true,
      detail: {
        diagnostic: true,
        verdict: g.verdict ?? null,
        sectionsBriefed: g.sections?.length ?? 0,
        query: g.query ?? null,
      },
      after: { verdict: g.verdict ?? null, sectionsBriefed: g.sections?.length ?? 0 },
    };
  },

  async recheck(issue: DetectedIssue, _draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    const token = await getValidAccessToken(ctx.brand.id, ctx.tenantId);
    if (!token || !token.siteUrl) return { verified: false, scoreAfter: null, note: 'GSC not connected' };
    const d = issue.detected as { query: string };
    try {
      const { startDate, endDate } = trailingDateRange(28);
      const rows = await searchAnalytics({
        accessToken: token.accessToken, siteUrl: token.siteUrl, startDate, endDate,
        dimensions: ['page', 'query'], rowLimit: 5000,
      });
      const mine = rows.find((r) => r.keys[0] === issue.targetUrl && r.keys[1] === d.query);
      if (!mine) return { verified: false, scoreAfter: null, note: 'No recent GSC data for this query yet' };
      const before = (issue.before as { position?: number })?.position ?? mine.position;
      return {
        verified: mine.position < before,
        scoreAfter: Math.max(0, Math.round((POS_MAX - Math.min(mine.position, POS_MAX)) / (POS_MAX - 1) * 100)),
        note: `Position ${before.toFixed(1)} → ${mine.position.toFixed(1)} for "${d.query}"`,
      };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).host.replace(/^www\./, '').toLowerCase();
  } catch { return null; }
}
