/**
 * Module: CTR rescue (GSC-driven, Channel A).
 *
 * Detect: pull Search Analytics (query × page) for the last 30 days; find
 *   pages averaging positions 1-5 with high impressions but low CTR for
 *   that position (i.e. underperforming the position-expected click rate),
 *   excluding queries Google answers without a click. Rewrite the title +
 *   meta description to win more clicks.
 * Generate: LLM produces THREE title options and THREE meta description
 *   options, each on a different psychological lever, ranked best-first.
 *   Option 1 is the draft that ships; the rest are one click away in the
 *   dashboard. A metadata rewrite is a judgement call about how a business
 *   wants to sound, so handing back a single take makes the reviewer's only
 *   choices "accept" or "spend another credit" - the options cost nothing
 *   extra because they come out of the same call.
 * Ship: update title + meta description via the CMS adapter.
 * Recheck: re-pull Search Analytics and confirm CTR improved.
 */

import { crawlPage } from '../crawl';
import { generateJson } from '../generate';
import { screenZeroClickQueries } from '../intent';
import { CTR_SYSTEM, ctrUserPrompt } from '../prompts';
import { getValidAccessToken, LOOKBACK_DAYS, searchAnalytics, trailingDateRange } from '../gsc';
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

/** One metadata option: the text, the lever it pulls, and why it works. */
export interface CtrOption {
  text: string;
  /** Short lever name, e.g. "loss aversion". */
  lever: string;
  /** One sentence on why this makes the searcher click. */
  strategy: string;
}

/** Options wanted per field. Three is enough to show a real choice of angle. */
export const OPTIONS_PER_FIELD = 3;

/**
 * Coerce whatever the model returned into a clean option list.
 *
 * A model told to return three objects will occasionally return two, or
 * bare strings, or one object with the text under a different key. None of
 * that should fail a fix the user has already paid a credit for, so the
 * shape is repaired here rather than asserted: anything unusable is
 * dropped, and the caller decides what to do with an empty list.
 */
export function normaliseOptions(raw: unknown): CtrOption[] {
  if (!Array.isArray(raw)) return [];
  const out: CtrOption[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const text = typeof item === 'string'
      ? item
      : typeof (item as CtrOption | null)?.text === 'string' ? (item as CtrOption).text : '';
    const trimmed = text.trim();
    if (!trimmed) continue;
    // Two options with identical copy are one option; the lever label does
    // not make a duplicate a choice.
    const dedupe = trimmed.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const o = (item ?? {}) as Partial<CtrOption>;
    out.push({
      text: trimmed,
      lever: typeof o.lever === 'string' && o.lever.trim() ? o.lever.trim() : 'unspecified',
      strategy: typeof o.strategy === 'string' ? o.strategy.trim() : '',
    });
    if (out.length >= OPTIONS_PER_FIELD) break;
  }
  return out;
}

/**
 * Does the text that will ship still correspond to this option?
 *
 * Deliberately not string equality. Brand rules (rules.ts) run on every
 * draft AFTER generation and may append a title suffix, cap the length, or
 * strip a banned phrase, so the field that actually ships is routinely a
 * lightly-edited version of the option the reviewer picked. Exact matching
 * would show the chosen option as an unchosen "alternative" on any brand
 * that configures a title suffix - which is most of them.
 *
 * Containment in either direction covers append and truncate without
 * pretending a hand-written replacement is still one of the options. When
 * nothing matches, every option simply lists as an alternative: the safe
 * direction to be wrong in, and exactly what a manual edit should look like.
 */
export function isSameOption(current: string | null | undefined, optionText: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const a = norm(current ?? '');
  const b = norm(optionText);
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/**
 * Render the alternatives for the preview card. Only ever called with the
 * options that are NOT shipping, so nothing here is marked as selected.
 */
function optionLines(label: string, options: CtrOption[]): string {
  if (!options.length) return '';
  return `\n\n${label}\n` + options.map((o, i) =>
    `${i + 1}. ${o.text}\n   lever: ${o.lever}${o.strategy ? ` — ${o.strategy}` : ''}`,
  ).join('\n');
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
    const { startDate, endDate } = trailingDateRange(LOOKBACK_DAYS);
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
    const { data } = await generateJson<{
      titles: unknown; descriptions: unknown; rationale: string;
      // Tolerated for backwards compatibility with a single-option response.
      title?: string; description?: string;
    }>({
      ctx,
      system: CTR_SYSTEM,
      user: ctrUserPrompt({ brand: ctx.brand, url: d.url, title, meta, queries: d.queries, competitors }),
      maxTokens: 1200,
    });

    const titleOptions = normaliseOptions(data.titles);
    const descriptionOptions = normaliseOptions(data.descriptions);
    // A model that ignored the options contract still gave us a usable
    // rewrite; treat its single answer as the one option rather than
    // failing a fix the user already paid for.
    if (!titleOptions.length && typeof data.title === 'string' && data.title.trim()) {
      titleOptions.push({ text: data.title.trim(), lever: 'unspecified', strategy: '' });
    }
    if (!descriptionOptions.length && typeof data.description === 'string' && data.description.trim()) {
      descriptionOptions.push({ text: data.description.trim(), lever: 'unspecified', strategy: '' });
    }
    if (!titleOptions.length || !descriptionOptions.length) {
      throw new Error('The model returned no usable title or meta description options. Try regenerating.');
    }

    return {
      generated: {
        // Option 1 is the recommendation and the pair that ships. Keeping
        // these as plain top-level strings is deliberate: ship(), the
        // dashboard's inline editor and the outcome-learning history all
        // read `title`/`description`, and picking a different option is a
        // rewrite of these fields rather than a separate concept.
        title: titleOptions[0].text,
        description: descriptionOptions[0].text,
        titleOptions,
        descriptionOptions,
        rationale: data.rationale,
        before: { title, description: meta },
        serpQuery: topQuery,
        serpCompared: competitors.length,
        serpCompetitors: competitors.slice(0, 5),
      },
      creditsUsed: 1,
    };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const g = draft.generated as {
      title?: string; description?: string;
      titleOptions?: CtrOption[]; descriptionOptions?: CtrOption[];
      rationale?: string;
      before?: { title?: string | null; description?: string | null };
    };
    const b = g.before ?? {};
    // The shipping pair is whatever `title`/`description` currently hold -
    // which is option 1 until the reviewer picks another or edits it by
    // hand, so the alternatives are listed relative to those, not to the
    // model's original ordering.
    const titles = g.titleOptions ?? [];
    const descriptions = g.descriptionOptions ?? [];
    const others = (options: CtrOption[], shipping?: string) =>
      options.filter((o) => !isSameOption(shipping, o.text));

    const alternatives =
      optionLines('OTHER TITLE OPTIONS', others(titles, g.title))
      + optionLines('OTHER META DESCRIPTION OPTIONS', others(descriptions, g.description));

    return {
      kind: 'key-values',
      label: 'New title + meta description',
      addNote: alternatives
        ? `The recommended pair ships. ${titles.length} title and ${descriptions.length} meta options were `
          + 'generated, each on a different lever — use Edit to swap one in before approving.'
        : undefined,
      before: `Title: ${b.title ?? '(none)'}\n\nMeta: ${b.description ?? '(none)'}`,
      after: `Title: ${g.title ?? ''}\n\nMeta: ${g.description ?? ''}`
        + (g.rationale ? `\n\nWhy the current pair loses the click: ${g.rationale}` : '')
        + alternatives,
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
