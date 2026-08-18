/**
 * Module: Search decay (GSC period-over-period, diagnostic).
 *
 * Every other GSC module in the engine reads a single trailing window and
 * asks "is this page underperforming right now". None of them can see a
 * page that is perfectly healthy by those standards and quietly worth half
 * what it was three months ago. This module is the only one that compares
 * two windows, so it is the only one that can catch a decline while it is
 * still cheap to reverse.
 *
 * Detect: pull query × page for the trailing 14 days and the 14 days before
 *   that, aggregate per page, and flag real declines against floors that
 *   suit a local service business rather than a national publisher.
 * Generate: hand the model a full evidence file - both windows, query-level
 *   movement, the site-wide trend as a control, the page itself, and the
 *   AI-citation picture - and force ONE primary cause plus a confidence
 *   score out of ten.
 * Ship: nothing is written to the site. This module diagnoses; the fix
 *   belongs to whichever module the diagnosis points at (see ROUTING).
 * Recheck: re-pull the recent window and report whether clicks recovered.
 *
 * WHY THE THRESHOLDS ARE NOT THE OBVIOUS ONES
 *
 * The widely-copied version of this agent requires 100+ clicks in the
 * prior window before it will look at a page. That is a sane floor for a
 * national publisher and useless here: most pages on a local service site
 * never see 100 clicks in a month, so that rule reports "no decay" forever
 * on exactly the accounts this product serves. The floors below are scaled
 * to that reality and paired with an absolute-loss test, which is what
 * actually keeps small numbers from generating noise - a page going 3
 * clicks to 1 is a 67% decline and means nothing.
 */

import { crawlPage, type FrictionSignals } from '../crawl';
import { generateJson } from '../generate';
import { getAiCaptureEvidence } from '../ai-capture';
import { DECAY_SYSTEM, DECAY_VECTORS, decayUserPrompt, type DecayVector } from '../prompts';
import { comparisonWindows, getValidAccessToken, searchAnalytics, trailingDateRange } from '../gsc';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

/**
 * Length of each comparison window, in days. See comparisonWindows().
 *
 * 14 days on each side, so a decline surfaces about two weeks earlier than a
 * monthly comparison would - the whole point of the module is to catch a
 * page while reversing it is still cheap. 14 is a whole number of weeks, so
 * the day-of-week cycle still cancels on both sides.
 *
 * The floors below are NOT scaled down to match. They are noise suppression,
 * not a per-window quota: a page that loses 3 clicks is noise over any
 * window length, and halving the absolute floor to "keep sensitivity" would
 * simply move that noise into the report. The practical effect is that this
 * window is a little stricter in absolute terms and much faster to react,
 * which is the trade the module exists to make.
 */
export const WINDOW_DAYS = 14;

/**
 * Floors. A page must clear ALL of these to be considered decayed.
 *
 * The relative test alone fires constantly on small numbers; the absolute
 * test alone misses real declines on mid-sized pages. Requiring both is
 * what makes this usable on a site whose best page gets a few dozen clicks
 * a month - roughly 10-20 inside one WINDOW_DAYS window, which is the scale
 * these numbers are set against.
 */
export const MIN_PREV_CLICKS = 10;        // the page mattered before
export const MIN_ABS_CLICK_LOSS = 5;      // the loss is worth someone's time
export const MIN_RELATIVE_DROP = 0.2;     // 20% down on the prior window

/**
 * Pages with almost no clicks either way can still be decaying - a page
 * that fell from 400 impressions to 90 has lost something real even if it
 * only ever converted a handful of clicks. Impressions catch that case.
 */
export const MIN_PREV_IMPRESSIONS = 300;
export const MIN_IMPRESSION_DROP = 0.35;

/** How far average position may move before a decline stops being "quiet". */
const QUIET_POSITION_DRIFT = 1.5;
const COLLAPSE_POSITION_DRIFT = 5;

export type DecayPattern = 'quiet' | 'drifting' | 'collapsed' | 'impressions_lost';

/**
 * What to do next about each diagnosis. The decay module deliberately owns
 * none of these: duplicating a fix that already exists elsewhere is how two
 * modules end up writing the same field on the same page.
 *
 * `kind` is the part that has to be honest, because a diagnosis is worth
 * nothing to the user if they cannot tell how far it gets them:
 *
 * - 'fix' writes to the site. One click and the page changes.
 * - 'analysis' is another diagnostic. It narrows the problem down but still
 *   publishes nothing, so a card that offered it as "the fix" would send the
 *   user round a loop - accept a finding, get another finding, and never
 *   reach a change. Two of the six causes route this way for a real reason
 *   (deciding WHICH url should own a query, or what a competitor covers,
 *   takes its own pass) and the UI now says so instead of implying a fix.
 * - 'manual' has no module at all. Removing a consent wall or cutting 600KB
 *   of script is a template and performance job; pointing at a prose module
 *   would read as a fix and quietly not be one.
 */
export type RouteKind = 'fix' | 'analysis' | 'manual';

export const ROUTING: Record<DecayVector, {
  module: string | null;
  label: string;
  kind: RouteKind;
  /** What the next step actually achieves, in the user's terms. */
  outcome: string;
}> = {
  stale_content: {
    module: 'content-freshness', label: 'Content freshness', kind: 'fix',
    outcome: 'Adds a dated update block to this page.',
  },
  intent_shift: {
    module: 'geo-page-rewrite', label: 'GEO page rewrite', kind: 'fix',
    outcome: 'Rewrites this page around what searchers now want.',
  },
  competitor_leapfrog: {
    module: 'content-gap', label: 'Content gap', kind: 'analysis',
    outcome: 'Reads the pages outranking you and briefs what to add. Produces a writer’s brief, not a published change.',
  },
  cannibalization: {
    module: 'cannibalization', label: 'Cannibalisation', kind: 'analysis',
    outcome: 'Decides which of your competing URLs should own the query, and what to do with the others. That verdict is what the consolidation or title fix is then based on.',
  },
  ai_answer_capture: {
    module: 'citable-passages', label: 'Citable passages', kind: 'fix',
    outcome: 'Adds a TL;DR and key-facts block AI answers can quote.',
  },
  onpage_friction: {
    module: null, label: 'Manual page-experience work', kind: 'manual',
    outcome: 'No module ships this — it is template and performance work on your site.',
  },
};

interface WindowStats { clicks: number; impressions: number; ctr: number; position: number }
interface QueryMovement {
  query: string;
  clicksBefore: number; clicksAfter: number;
  impressionsBefore: number; impressionsAfter: number;
  positionBefore: number; positionAfter: number;
}

interface PageAgg {
  clicks: number; impressions: number; posSum: number; posWeight: number;
  queries: Map<string, { clicks: number; impressions: number; posSum: number; posWeight: number }>;
}

function emptyAgg(): PageAgg {
  return { clicks: 0, impressions: 0, posSum: 0, posWeight: 0, queries: new Map() };
}

/**
 * Aggregate query × page rows into per-page totals.
 *
 * Position is impression-weighted, not a plain mean. A page ranking 2nd for
 * its main query and 60th for a stray long-tail one is at position 2 in
 * every sense that matters, and averaging those flat produces 31 - which
 * would then read as a catastrophic "improvement" the moment the long-tail
 * query drops out of the report.
 */
export function aggregateByPage(
  rows: { keys: string[]; clicks: number; impressions: number; position: number }[],
): Map<string, PageAgg> {
  const byPage = new Map<string, PageAgg>();
  for (const r of rows) {
    const [page, query] = r.keys;
    if (!page) continue;
    const agg = byPage.get(page) ?? emptyAgg();
    agg.clicks += r.clicks;
    agg.impressions += r.impressions;
    agg.posSum += r.position * r.impressions;
    agg.posWeight += r.impressions;
    if (query) {
      const q = agg.queries.get(query) ?? { clicks: 0, impressions: 0, posSum: 0, posWeight: 0 };
      q.clicks += r.clicks;
      q.impressions += r.impressions;
      q.posSum += r.position * r.impressions;
      q.posWeight += r.impressions;
      agg.queries.set(query, q);
    }
    byPage.set(page, agg);
  }
  return byPage;
}

function stats(agg: PageAgg | undefined): WindowStats {
  if (!agg) return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return {
    clicks: agg.clicks,
    impressions: agg.impressions,
    ctr: agg.impressions > 0 ? agg.clicks / agg.impressions : 0,
    position: agg.posWeight > 0 ? agg.posSum / agg.posWeight : 0,
  };
}

export interface DecayVerdict { decayed: boolean; pattern: DecayPattern | null }

/**
 * Decide whether one page's movement counts as decay, and of what kind.
 * Pure, so the thresholds can be tested without touching GSC.
 */
export function classifyDecay(prev: WindowStats, recent: WindowStats): DecayVerdict {
  const clickLoss = prev.clicks - recent.clicks;
  const relativeLoss = prev.clicks > 0 ? clickLoss / prev.clicks : 0;
  // Position only means something when both windows actually ranked. A page
  // absent from one window reports position 0, and treating that as "moved
  // to position 1" would classify every disappearance as quiet decay.
  const positionKnown = prev.position > 0 && recent.position > 0;
  const drift = positionKnown ? recent.position - prev.position : 0;

  const clicksQualify =
    prev.clicks >= MIN_PREV_CLICKS &&
    clickLoss >= MIN_ABS_CLICK_LOSS &&
    relativeLoss >= MIN_RELATIVE_DROP;

  if (clicksQualify) {
    if (!positionKnown || drift > COLLAPSE_POSITION_DRIFT) return { decayed: true, pattern: 'collapsed' };
    if (drift < QUIET_POSITION_DRIFT) return { decayed: true, pattern: 'quiet' };
    return { decayed: true, pattern: 'drifting' };
  }

  // Impressions falling hard is a decline even when the clicks were always
  // few - the demand reaching this page has shrunk.
  const impressionLoss = prev.impressions - recent.impressions;
  const relativeImpressionLoss = prev.impressions > 0 ? impressionLoss / prev.impressions : 0;
  if (prev.impressions >= MIN_PREV_IMPRESSIONS && relativeImpressionLoss >= MIN_IMPRESSION_DROP) {
    return { decayed: true, pattern: 'impressions_lost' };
  }

  return { decayed: false, pattern: null };
}

const PATTERN_LABEL: Record<DecayPattern, string> = {
  quiet: 'clicks fell while rankings held - the click is being lost above the result',
  drifting: 'clicks fell alongside a modest ranking slip',
  collapsed: 'clicks fell and the ranking dropped sharply',
  impressions_lost: 'impressions collapsed - demand reaching this page has shrunk',
};

function severityFor(pattern: DecayPattern, clickLoss: number): DetectedIssue['severity'] {
  if (pattern === 'collapsed') return 'critical';
  if (clickLoss >= 15) return 'high';
  return 'medium';
}

export const searchDecayModule: FixModule = {
  key: 'search-decay',
  title: 'Search decay',
  description: 'Pages quietly losing clicks compared with the previous month, diagnosed to a single cause.',
  channel: 'A',
  trigger: 'gsc',
  minPlan: 'pro',
  phase: 2,
  diagnostic: true,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const token = await getValidAccessToken(ctx.brand.id, ctx.tenantId);
    if (!token || !token.siteUrl) return [];
    const { recent, previous } = comparisonWindows(WINDOW_DAYS);

    const [recentRows, prevRows] = await Promise.all([
      searchAnalytics({
        accessToken: token.accessToken, siteUrl: token.siteUrl,
        startDate: recent.startDate, endDate: recent.endDate,
        dimensions: ['page', 'query'], rowLimit: 5000,
      }),
      searchAnalytics({
        accessToken: token.accessToken, siteUrl: token.siteUrl,
        startDate: previous.startDate, endDate: previous.endDate,
        dimensions: ['page', 'query'], rowLimit: 5000,
      }),
    ]);

    const recentByPage = aggregateByPage(recentRows);
    const prevByPage = aggregateByPage(prevRows);

    // Site-wide movement over the same windows. Without this control a page
    // that fell 25% during a month the whole site fell 30% reads as a
    // problem, when it actually outperformed.
    const siteTrend = siteMovement(prevByPage, recentByPage);

    const issues: DetectedIssue[] = [];
    // Iterate the PREVIOUS window: a page that vanished entirely has no row
    // in the recent one, and that is the most severe decay there is.
    for (const [page, prevAgg] of prevByPage) {
      const prev = stats(prevAgg);
      const recentAgg = recentByPage.get(page);
      const rec = stats(recentAgg);
      const { decayed, pattern } = classifyDecay(prev, rec);
      if (!decayed || !pattern) continue;

      const queries = queryMovements(prevAgg, recentAgg).slice(0, 12);
      const clickLoss = prev.clicks - rec.clicks;
      const pctLoss = prev.clicks > 0 ? Math.round((clickLoss / prev.clicks) * 100) : 0;

      issues.push({
        key: page,
        targetUrl: page,
        severity: severityFor(pattern, clickLoss),
        summary: pattern === 'impressions_lost'
          ? `Impressions ${prev.impressions} → ${rec.impressions} over ${WINDOW_DAYS}d - ${PATTERN_LABEL[pattern]}`
          : `Clicks ${prev.clicks} → ${rec.clicks} (-${pctLoss}%) over ${WINDOW_DAYS}d - ${PATTERN_LABEL[pattern]}`,
        detected: {
          url: page, pattern, windowDays: WINDOW_DAYS,
          recent: rec, previous: prev, queries, siteTrend,
        },
        before: { clicks: prev.clicks, impressions: prev.impressions, ctr: prev.ctr, position: prev.position },
      });
    }

    // Worst first, so a capped scan spends its budget on the biggest losses.
    issues.sort((a, b) => {
      const la = (a.before?.clicks as number ?? 0) - ((a.detected.recent as WindowStats).clicks);
      const lb = (b.before?.clicks as number ?? 0) - ((b.detected.recent as WindowStats).clicks);
      return lb - la;
    });
    return issues;
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const d = issue.detected as {
      url: string; pattern: DecayPattern; windowDays: number;
      recent: WindowStats; previous: WindowStats; queries: QueryMovement[];
      siteTrend: { clicksDelta: number; impressionsDelta: number } | null;
    };

    let pageText = '';
    let title: string | null = null;
    let lastModified: string | null = null;
    let friction: FrictionSignals | null = null;
    try {
      const page = await crawlPage(d.url, ctx.signal);
      pageText = page.text;
      title = page.title;
      lastModified = page.lastModified;
      // Absent on an unreachable page, and the prompt is told to refuse an
      // on-page-friction diagnosis when it is missing rather than guess.
      friction = page.friction ?? null;
    } catch { /* diagnose from the metrics alone if the page is unreachable */ }

    // The evidence only this product can supply.
    let aiEvidence: string | null = null;
    try {
      const ev = await getAiCaptureEvidence({
        brandId: ctx.brand.id,
        brandWebsite: ctx.brand.website,
        pageUrl: d.url,
        queries: d.queries.map((q) => q.query),
      });
      aiEvidence = ev.summary;
    } catch { /* best-effort enrichment */ }

    // What currently ranks for the page's biggest losing query.
    let competitors: { title: string; description: string }[] = [];
    const topQuery = d.queries[0]?.query ?? null;
    if (topQuery) {
      try {
        const { getTopSerpResults } = await import('../serp');
        competitors = await getTopSerpResults(ctx, topQuery);
      } catch { /* diagnose without competitor context */ }
    }

    const { data } = await generateJson<{
      primaryCause: string; confidence: number; evidence: string;
      ruledOut: string; actions: { action: string; priority: string }[];
    }>({
      ctx,
      system: DECAY_SYSTEM,
      user: decayUserPrompt({
        brand: ctx.brand,
        url: d.url,
        title,
        windowDays: d.windowDays,
        recent: d.recent,
        previous: d.previous,
        queries: d.queries,
        pattern: PATTERN_LABEL[d.pattern],
        pageText,
        lastModified,
        siteTrend: d.siteTrend,
        aiEvidence,
        competitors,
        friction,
      }),
      maxTokens: 1400,
    });

    // Never trust a free-text label into a lookup table.
    const cause: DecayVector = (DECAY_VECTORS as readonly string[]).includes(data.primaryCause)
      ? data.primaryCause as DecayVector
      : 'stale_content';
    const confidence = Math.max(1, Math.min(10, Math.round(Number(data.confidence) || 1)));

    return {
      generated: {
        ...data,
        primaryCause: cause,
        confidence,
        causeRecognised: cause === data.primaryCause,
        routeTo: ROUTING[cause],
        aiEvidence,
        pattern: d.pattern,
      },
      creditsUsed: 2,
    };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const g = draft.generated as {
      primaryCause?: DecayVector; confidence?: number; evidence?: string; ruledOut?: string;
      actions?: { action: string; priority: string }[];
      routeTo?: { label: string; kind?: RouteKind; outcome?: string };
    };
    const actions = (g.actions ?? [])
      .map((a) => `- [${a.priority}] ${a.action}`)
      .join('\n');
    return {
      kind: 'key-values',
      label: 'Decay diagnosis',
      addNote: 'A diagnosis, not an edit. Nothing is written to your site when you accept this - '
        + (g.routeTo
          ? `next step: ${g.routeTo.label}${g.routeTo.kind === 'analysis' ? ' (another analysis, not a published change)' : ''}.`
          : 'it tells you what to do next.'),
      after: `Primary cause: ${g.primaryCause ?? 'unknown'} (confidence ${g.confidence ?? '?'}/10)\n\n`
        + `Evidence: ${g.evidence ?? ''}\n\n`
        + `Ruled out: ${g.ruledOut ?? ''}\n\n`
        + `Recommended actions:\n${actions || '- (none)'}`,
    };
  },

  /**
   * Diagnostic: accepting the finding writes nothing to the site. The
   * ShipResult carries the routing so the dashboard can offer the next
   * module, and `diagnostic: true` keeps this out of outcome measurement.
   */
  async ship(_issue: DetectedIssue, draft: GeneratedDraft): Promise<ShipResult> {
    const g = draft.generated as {
      primaryCause?: DecayVector; confidence?: number;
      routeTo?: { module: string | null; label: string; kind?: RouteKind; outcome?: string };
    };
    return {
      ok: true,
      detail: {
        diagnostic: true,
        primaryCause: g.primaryCause ?? null,
        confidence: g.confidence ?? null,
        recommendedModule: g.routeTo?.module ?? null,
        recommendedKind: g.routeTo?.kind ?? null,
      },
      after: {
        diagnosis: g.primaryCause ?? null,
        recommendedModule: g.routeTo?.module ?? null,
        recommendedKind: g.routeTo?.kind ?? null,
      },
    };
  },

  async recheck(issue: DetectedIssue, _draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    const token = await getValidAccessToken(ctx.brand.id, ctx.tenantId);
    if (!token || !token.siteUrl) return { verified: false, scoreAfter: null, note: 'GSC not connected' };
    try {
      const { startDate, endDate } = trailingDateRange(WINDOW_DAYS);
      const rows = await searchAnalytics({
        accessToken: token.accessToken, siteUrl: token.siteUrl, startDate, endDate,
        dimensions: ['page'], rowLimit: 5000,
      });
      const mine = rows.find((r) => r.keys[0] === issue.targetUrl);
      if (!mine) return { verified: false, scoreAfter: null, note: 'No recent GSC data for this page yet' };
      const prevClicks = (issue.before as { clicks?: number })?.clicks ?? 0;
      const recovered = prevClicks > 0 ? mine.clicks / prevClicks : 0;
      return {
        verified: recovered >= 0.9,
        scoreAfter: Math.max(0, Math.min(100, Math.round(recovered * 100))),
        note: `Clicks ${prevClicks} → ${mine.clicks} versus the pre-decay window`,
      };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};

/** Per-query before/after movement, biggest click loss first. */
function queryMovements(prev: PageAgg, recent: PageAgg | undefined): QueryMovement[] {
  const keys = new Set([...prev.queries.keys(), ...(recent?.queries.keys() ?? [])]);
  const out: QueryMovement[] = [];
  for (const query of keys) {
    const b = prev.queries.get(query);
    const a = recent?.queries.get(query);
    out.push({
      query,
      clicksBefore: b?.clicks ?? 0,
      clicksAfter: a?.clicks ?? 0,
      impressionsBefore: b?.impressions ?? 0,
      impressionsAfter: a?.impressions ?? 0,
      positionBefore: b && b.posWeight > 0 ? b.posSum / b.posWeight : 0,
      positionAfter: a && a.posWeight > 0 ? a.posSum / a.posWeight : 0,
    });
  }
  return out.sort((x, y) => (y.clicksBefore - y.clicksAfter) - (x.clicksBefore - x.clicksAfter));
}

/** Site-wide relative movement between the two windows, or null. */
function siteMovement(
  prevByPage: Map<string, PageAgg>,
  recentByPage: Map<string, PageAgg>,
): { clicksDelta: number; impressionsDelta: number } | null {
  let pc = 0, pi = 0, rc = 0, ri = 0;
  for (const a of prevByPage.values()) { pc += a.clicks; pi += a.impressions; }
  for (const a of recentByPage.values()) { rc += a.clicks; ri += a.impressions; }
  if (pc <= 0 || pi <= 0) return null;
  return { clicksDelta: (rc - pc) / pc, impressionsDelta: (ri - pi) / pi };
}
