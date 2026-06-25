'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Overview - the main landing dashboard. Headline numbers, the per-engine grid,
// competitor SOV and cited sources are wired to the signed-in user's real brand
// data (fetched client-side); the design's sample values are used as a clearly
// temporary fallback where the app does not yet compute a figure.

import * as React from 'react';
import {
  PLATFORMS, type Platform, PlatformTile, Card, Badge, Delta, Bar, Pill, Spark,
  LineChart, type LineSeries, Filter, Seg, KPIRail, PageHead, Info, Cit,
} from '../ui';
import { GoalCard } from '../shell';
import { useBrandData } from '@/hooks/useBrandData';
import { useRun } from '@/contexts/RunContext';
import { useToast } from '@/components/dashboard/Toast';
import { useBrands } from '@/contexts/BrandContext';
import { KpiCardsSkeleton } from '@/components/dashboard/Skeleton';
import { highlightBrand as highlightBrandText, sanitizeHtml } from '@/lib/sanitize';

/* ───────────────────────── real-data hook ───────────────────────── */

interface QueryRow { q: string; sov: number; d: number; mentions: number; eng: number }
interface RecentItem {
  p: Platform;
  q: string;
  tag: string;
  meta: string;
  t: string;
  answer?: string;
  // Legacy field name kept for the share/report action handlers.
  sources?: string[];
  // Full result context for the drawer presentation.
  platform: string;
  model?: string;
  mentioned: boolean;
  position?: number;
  sentiment?: string;
  citations?: string[];
  competitorMentions?: string[];
  error?: string;
  brandName: string;
}

interface OverviewData {
  hasReal: boolean;
  /** True for a real brand that has not completed any run yet. The page shows
   *  an onboarding/empty state instead of fabricated KPI numbers. */
  noData?: boolean;
  /** Number of completed runs for the selected brand. Drives whether the
   *  header shows a "what changed" comparison (needs >= 2 runs) vs a first-run
   *  message, so change-over-time copy is gated behind real history. */
  runCount: number;
  brandName: string;
  website?: string;
  industry?: string;
  city?: string;
  sov: number;
  sovDelta: number;
  totalM: number;
  mentionsDelta: number;
  totalQ: number;
  health: number;
  sentiment: number;
  platforms: Platform[];
  competitors: { name: string; sov: number; d: number; me?: boolean; color: string }[];
  sources: { d: string; n: number; share: number }[];
  trend: number[];
  queries: QueryRow[];
  recent: RecentItem[];
  insights: InsightItem[];
  accuracyRate: number | null;
  openIssues: number;
  fixedIssues: number;
  healthDelta: number | null;
  sentimentDelta: number | null;
  coverageDelta: number | null;
  sentimentSub: string;
  competitive: number | null;
  competitiveSub: string;
}

interface InsightItem { icon: string; tone: 'pos' | 'warn' | 'info'; t: string; d: string; cta: string; href: string }

const COMP_COLORS = ['var(--accent)', 'var(--text-2)', 'var(--mute)', 'var(--mute-2)', 'var(--info)', 'var(--warn)', '#a78bfa', '#f472b6'];

/* ───────────────────────── filter model ───────────────────────── */

export type OverviewRange = '24h' | '7d' | '30d' | '90d';
export type OverviewIntent = 'all' | 'comparison' | 'recommendation' | 'pricing' | 'feature';
export type OverviewCompetitorView = 'top3' | 'all';

export interface OverviewFilters {
  range: OverviewRange;
  engine: string;          // 'all' or one of the PLATFORMS.name values
  intent: OverviewIntent;
  competitorView: OverviewCompetitorView;
}

const DEFAULT_FILTERS: OverviewFilters = {
  range: '7d',
  engine: 'all',
  intent: 'all',
  competitorView: 'top3',
};

const RANGE_DAYS: Record<OverviewRange, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };

// Keyword heuristic so the Intent dropdown does something real even though the
// data model doesn't tag queries with an intent. Intentionally conservative -
// queries that don't match any pattern are 'other' and only surface when the
// filter is "all".
function classifyIntent(q: unknown): Exclude<OverviewIntent, 'all'> | 'other' {
  const s = String(q || '').toLowerCase();
  if (/\bvs\b|\bversus\b|\bcompare\b|\bcomparison\b|\balternative(s)?\b|\bbetween\b/.test(s)) return 'comparison';
  if (/\bprice|\bpricing\b|\bcost\b|\bcheap\b|\bexpensive\b|\bworth\b|\bfree\b|\$|\bplan(s)?\b/.test(s)) return 'pricing';
  if (/\bfeature(s)?\b|\bintegration(s)?\b|\bsupport\b|\bapi\b|\bworkflow\b|\bcapab/.test(s)) return 'feature';
  if (/\bbest\b|\btop\b|\brecommend|\bgood\b|\bshould\b|\bwhich\b/.test(s)) return 'recommendation';
  return 'other';
}

function filterRunsByRange(runs: any[], range: OverviewRange): any[] {
  const days = RANGE_DAYS[range];
  if (!days) return runs;
  const cutoff = Date.now() - days * 86400_000;
  const inRange = runs.filter(r => {
    const t = new Date(r.time || r.date || r.created_at || 0).getTime();
    return !isNaN(t) && t >= cutoff;
  });
  // If the loaded dataset doesn't reach that far back (e.g. the brand only has
  // 3 historical runs and the user picks 90d), behave like "all available" so
  // the page doesn't go blank for legitimate accounts with sparse history.
  return inRange.length > 0 ? inRange : runs;
}

function resultMatchesEngine(r: any, engine: string): boolean {
  if (!engine || engine === 'all') return true;
  const a = String(r?.platform || '').toLowerCase();
  const b = engine.toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

function resultMatchesIntent(r: any, intent: OverviewIntent): boolean {
  if (!intent || intent === 'all') return true;
  return classifyIntent(r?.query) === intent;
}

/** Map a run result's engine name (e.g. "ChatGPT", "gpt-4o-mini") to a design Platform tile. */
function matchPlatform(name: string): Platform {
  const n = String(name || '').toLowerCase();
  return PLATFORMS.find(p => n.includes(p.id) || n.includes(p.name.toLowerCase()) || p.short.toLowerCase() === n) || PLATFORMS[0];
}
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function relTime(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60000) return 'now';
  const m = Math.floor(diff / 60000);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

function normPlatform(pd: any): { sov: number; total: number; mentions: number; errors: number } {
  if (typeof pd === 'number') return { sov: pd, total: pd > 0 ? 1 : 0, mentions: pd > 0 ? 1 : 0, errors: 0 };
  if (pd && typeof pd === 'object') return { sov: pd.sov || 0, total: pd.total || pd.queries || 0, mentions: pd.mentions || 0, errors: pd.errors || 0 };
  return { sov: 0, total: 0, mentions: 0, errors: 0 };
}

export function useOverviewData(filters: OverviewFilters = DEFAULT_FILTERS): OverviewData | null {
  // Consume the shared brand hook so the Overview reacts to the brand selected
  // in the topbar (BrandContext), auto-reloads on run completion, and reflects
  // live runs - exactly like every other dashboard page. Previously this made a
  // one-off /api/brands fetch on mount that never re-ran when the brand changed.
  const { brand, loading } = useBrandData({ fullData: true });
  const brandId = (brand as any)?.id as string | undefined;

  // Accuracy data lives behind /api/brands/:id/accuracy - the same endpoint the
  // Accuracy Monitor page reads/writes. We fetch it here so the Overview's
  // "Accuracy" health bar and "FALSE CLAIMS" KPI reflect the *real* open/fixed
  // counts, and stay in sync when issues are marked fixed on the monitor page.
  const [accData, setAccData] = React.useState<any>(null);

  const loadAccuracy = React.useCallback((signal?: AbortSignal) => {
    if (!brandId) return;
    // no-store: always read the live DB state so a fix made on the Accuracy
    // Monitor is reflected here immediately, never served from the HTTP cache.
    fetch(`/api/brands/${brandId}/accuracy`, { credentials: 'include', cache: 'no-store', signal })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!signal?.aborted) setAccData(d ?? null); })
      .catch(() => { /* aborted or network error; leave prior value, non-fatal */ });
  }, [brandId]);

  // Reset on brand change (avoids briefly showing the previous brand's numbers),
  // then load the selected brand's accuracy data. The AbortController guards
  // against a slow response for a previous brand landing after a faster one for
  // the newly-selected brand.
  React.useEffect(() => {
    const controller = new AbortController();
    setAccData(null);
    loadAccuracy(controller.signal);
    return () => controller.abort();
  }, [loadAccuracy]);

  // Re-fetch whenever a run completes or an accuracy issue is toggled/checked
  // anywhere in the app, so fixing claims updates the Overview right away.
  // Also revalidate when the tab regains focus/visibility - the Accuracy
  // Monitor and Overview are separate routes, so after fixing claims there and
  // switching back here (or across browser tabs) this guarantees fresh numbers.
  React.useEffect(() => {
    if (!brandId) return;
    const handler = () => loadAccuracy();
    const onVisible = () => { if (document.visibilityState === 'visible') loadAccuracy(); };
    window.addEventListener('livesov:run-complete', handler);
    window.addEventListener('livesov:accuracy-updated', handler);
    window.addEventListener('focus', handler);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('livesov:run-complete', handler);
      window.removeEventListener('livesov:accuracy-updated', handler);
      window.removeEventListener('focus', handler);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [brandId, loadAccuracy]);

  return React.useMemo(() => {
    if (loading) return null;
    if (!brand) return buildFallback();
    return buildFromBrand(brand as any, accData, filters);
  }, [brand, loading, accData, filters]);
}

function buildFallback(): OverviewData {
  return {
    hasReal: false,
    runCount: 0,
    brandName: 'Acme PM',
    industry: 'Project management software', city: 'San Francisco',
    sov: 27.4, sovDelta: +4.2, totalM: 1284, mentionsDelta: +218, totalQ: 142, health: 78, sentiment: 74,
    platforms: PLATFORMS,
    competitors: [
      { name: 'Acme', sov: 27.4, d: +4.2, me: true, color: 'var(--accent)' },
      { name: 'Linear', sov: 22.1, d: -1.4, color: 'var(--text-2)' },
      { name: 'Asana', sov: 14.8, d: +0.6, color: 'var(--mute)' },
      { name: 'Monday', sov: 9.3, d: -2.1, color: 'var(--mute-2)' },
      { name: 'Notion', sov: 6.1, d: +1.1, color: 'var(--info)' },
      { name: 'Jira', sov: 5.4, d: -0.7, color: 'var(--warn)' },
    ],
    sources: [
      { d: 'acme.com/customers', n: 214, share: 18 },
      { d: 'acme.com/pricing', n: 182, share: 16 },
      { d: 'g2.com/products/acme', n: 96, share: 9 },
      { d: 'reddit.com/r/projectmanagement', n: 71, share: 6 },
      { d: 'acme.com/blog/agile', n: 54, share: 5 },
      { d: 'producthunt.com/products/acme', n: 41, share: 4 },
    ],
    trend: [18, 19, 20, 22, 20, 22, 24, 23, 25, 24, 26, 27, 27, 27.4],
    queries: [
      { q: 'best project management tool', sov: 38, d: +5, mentions: 142, eng: 5 },
      { q: 'acme vs linear', sov: 61, d: +12, mentions: 89, eng: 5 },
      { q: 'cheapest pm for startups', sov: 12, d: -4, mentions: 31, eng: 4 },
      { q: 'pm tool with AI features', sov: 24, d: +2, mentions: 67, eng: 5 },
      { q: 'is acme worth the price', sov: 44, d: +7, mentions: 22, eng: 3 },
      { q: 'free alternative to monday.com', sov: 8, d: -1, mentions: 18, eng: 4 },
    ],
    recent: [
      { p: PLATFORMS[1], q: 'best agile pm tool for engineering teams', tag: 'pos', meta: 'Acme · 2nd of 5', t: '2m', platform: 'Claude', mentioned: true, position: 2, sentiment: 'positive', brandName: 'Acme PM', answer: 'For engineering teams, the most-recommended tools are Linear, Acme, and Asana. Acme is praised for its GitHub-native workflow and AI summaries.', sources: ['linear.app/why', 'acme.com/customers', 'asana.com/eng', 'g2.com/category/pm'], citations: ['linear.app/why', 'acme.com/customers', 'asana.com/eng', 'g2.com/category/pm'] },
      { p: PLATFORMS[0], q: 'linear vs acme for startups', tag: 'neu', meta: 'Acme · mentioned', t: '4m', platform: 'ChatGPT', mentioned: true, brandName: 'Acme PM', answer: 'Both Linear and Acme are popular with startups. Linear is known for speed; Acme for its AI-assisted planning and GitHub integration.', sources: ['linear.app', 'acme.com/startups'], citations: ['linear.app', 'acme.com/startups'] },
      { p: PLATFORMS[2], q: 'cheapest project mgmt with AI', tag: 'neg', meta: 'not mentioned', t: '7m', platform: 'Gemini', mentioned: false, brandName: 'Acme PM', answer: 'The most affordable AI-enabled options include Trello, ClickUp, and Notion. (Acme was not mentioned in this answer.)', sources: ['trello.com', 'clickup.com'], citations: ['trello.com', 'clickup.com'] },
      { p: PLATFORMS[3], q: 'acme pricing for 50 seats', tag: 'warn', meta: 'Hallucination · stale price', t: '12m', platform: 'Perplexity', mentioned: true, brandName: 'Acme PM', answer: 'Acme costs about $8 per seat per month, so 50 seats would be roughly $400/month.', sources: ['acme.com/pricing'], citations: ['acme.com/pricing'] },
      { p: PLATFORMS[4], q: 'is acme good for product teams', tag: 'pos', meta: 'Acme · 1st', t: '18m', platform: 'Grok', mentioned: true, position: 1, sentiment: 'positive', brandName: 'Acme PM', answer: 'Yes - Acme is frequently cited as a strong choice for product teams thanks to its roadmap views and AI summaries.', sources: ['acme.com/product', 'producthunt.com/products/acme'], citations: ['acme.com/product', 'producthunt.com/products/acme'] },
      { p: PLATFORMS[0], q: 'what pm tool does intuit use', tag: 'neu', meta: 'Acme · 3rd of 4', t: '24m', platform: 'ChatGPT', mentioned: true, position: 3, brandName: 'Acme PM', answer: 'Large enterprises like Intuit are often associated with Jira and Asana; Acme is also mentioned as a growing alternative.', sources: ['g2.com/category/pm'], citations: ['g2.com/category/pm'] },
    ],
    insights: [],
    accuracyRate: 88,
    openIssues: 6,
    fixedIssues: 3,
    healthDelta: 6,
    sentimentDelta: 3,
    coverageDelta: 14,
    sentimentSub: '61% positive',
    competitive: 68,
    competitiveSub: '#2 of 6 tracked',
  };
}

function buildFromBrand(brand: any, accData?: any, filters: OverviewFilters = DEFAULT_FILTERS): OverviewData {
  const fb = buildFallback();
  const runs: any[] = Array.isArray(brand.runs) ? brand.runs : [];
  const sortedAll = [...runs].sort((a, b) => new Date(a.time || a.date || 0).getTime() - new Date(b.time || b.date || 0).getTime());
  // Apply the time-range filter as a window over loaded runs (no API change).
  // When the loaded history doesn't reach that far back, filterRunsByRange
  // falls back to "all available" so the page doesn't go blank.
  const sorted = filterRunsByRange(sortedAll, filters.range);
  const lastRun = sorted[sorted.length - 1] || null;
  const prevRun = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
  const brandQueries: string[] = Array.isArray(brand.queries) ? brand.queries : [];
  const engineFiltered = filters.engine !== 'all';
  const intentFiltered = filters.intent !== 'all';
  const filtersActive = engineFiltered || intentFiltered;
  const accIssues: any[] = accData?.issues || [];
  const accuracyRate: number | null = accData?.accuracyRate ?? null;
  const openIssues = accIssues.filter((i: any) => !i.fixed).length;
  const fixedIssues = accIssues.filter((i: any) => i.fixed).length;
  if (!lastRun) {
    // Brand exists but has never completed a run. Return a genuine empty state
    // - zeroed KPIs and no demo competitors/sources/trend - so the Overview
    // doesn't contradict the Query Tracker ("NO DATA") and Brand Health ("no
    // prior run"). The `noData` flag drives the onboarding panel in the page.
    return {
      ...fb, hasReal: true, noData: true, runCount: 0,
      brandName: brand.name || fb.brandName, industry: brand.industry, city: brand.city,
      website: brand.website,
      sov: 0, sovDelta: 0, totalM: 0, mentionsDelta: 0,
      totalQ: brandQueries.length, health: 0, sentiment: 0,
      competitors: [], sources: [], trend: [],
      accuracyRate, openIssues, fixedIssues,
      healthDelta: null, sentimentDelta: null, coverageDelta: null,
      sentimentSub: '', competitive: null, competitiveSub: '',
      queries: brandQueries.slice(0, 6).map(q => ({ q, sov: 0, d: 0, mentions: 0, eng: 0 })),
      recent: [],
      insights: [],
    };
  }
  // Per-result data is the source of truth for filters. When no filter is
  // active we still prefer the precomputed lastRun.* totals (they're cheaper
  // and match what other pages show); when a filter is active we recompute
  // everything from the filtered results so the KPIs honor the controls.
  const allResults: any[] = Array.isArray(lastRun.allResults) ? lastRun.allResults : [];
  const results: any[] = filtersActive
    ? allResults.filter(r => resultMatchesEngine(r, filters.engine) && resultMatchesIntent(r, filters.intent))
    : allResults;

  const totalM = filtersActive
    ? results.filter(r => r.mentioned).length
    : (Number(lastRun.totalM) || results.filter(r => r.mentioned).length);
  // Coverage = distinct prompts represented in the (possibly filtered) result
  // set. With no filter, fall back to the precomputed lastRun.totalQ / brand
  // queries length so the number matches what other pages show.
  const distinctQ = new Set(results.map(r => r.query).filter(Boolean)).size;
  const totalQ = filtersActive
    ? distinctQ
    : (Number(lastRun.totalQ) || distinctQ || brandQueries.length);

  // Share of Voice is mention-rate across the (filtered) result set. With no
  // filter, prefer the precomputed lastRun.sov for parity with other pages.
  const okResults = results.filter(r => !r.error);
  const computedSov = okResults.length > 0
    ? Math.round((results.filter(r => r.mentioned).length / okResults.length) * 100)
    : 0;
  const sov = filtersActive ? computedSov : Math.round(Number(lastRun.sov) || computedSov);

  const prevResults: any[] = Array.isArray(prevRun?.allResults) ? prevRun.allResults : [];
  const prevFiltered = filtersActive
    ? prevResults.filter(r => resultMatchesEngine(r, filters.engine) && resultMatchesIntent(r, filters.intent))
    : prevResults;
  const prevOk = prevFiltered.filter(r => !r.error);
  const prevSovComputed = prevOk.length > 0
    ? Math.round((prevFiltered.filter(r => r.mentioned).length / prevOk.length) * 100)
    : 0;
  const prevSov = prevRun
    ? (filtersActive ? prevSovComputed : Math.round(Number(prevRun.sov) || prevSovComputed))
    : sov;

  // sentiment from per-result data, fallback to mock
  const pos = results.filter(r => r.sentiment === 'positive').length;
  const neu = results.filter(r => r.sentiment === 'neutral').length;
  const neg = results.filter(r => r.sentiment === 'negative').length;
  const sentTotal = pos + neu + neg;
  const sentiment = sentTotal > 0 ? Math.round((pos * 100 + neu * 50) / sentTotal) : fb.sentiment;

  // health blend (visibility + sentiment)
  const mRate = totalQ > 0 ? totalM / totalQ : 0;
  const health = sentTotalSafe(sentTotal) ? Math.round(Math.min(100, mRate * 55 + (sentiment / 100) * 45)) : fb.health;

  // Real subtitle for the Sentiment bar: the share of mentions that are positive.
  const sentimentSub = sentTotal > 0 ? `${Math.round((pos / sentTotal) * 100)}% positive` : 'no sentiment data yet';

  // Previous-run metrics, used to show *real* week-over-week deltas instead of
  // hardcoded numbers. Null when there is no prior run to compare against.
  // Uses the same filter window as the current numbers so the deltas remain
  // apples-to-apples when an engine/intent filter is active.
  let prevSentiment: number | null = null;
  let prevHealth: number | null = null;
  let prevTotalQ: number | null = null;
  if (prevRun) {
    const pTotalM = filtersActive
      ? prevFiltered.filter(r => r.mentioned).length
      : (Number(prevRun.totalM) || prevFiltered.filter(r => r.mentioned).length);
    const pDistinctQ = new Set(prevFiltered.map(r => r.query).filter(Boolean)).size;
    prevTotalQ = filtersActive
      ? pDistinctQ
      : (Number(prevRun.totalQ) || pDistinctQ || brandQueries.length);
    const pPos = prevFiltered.filter(r => r.sentiment === 'positive').length;
    const pNeu = prevFiltered.filter(r => r.sentiment === 'neutral').length;
    const pNeg = prevFiltered.filter(r => r.sentiment === 'negative').length;
    const pSentTotal = pPos + pNeu + pNeg;
    if (pSentTotal > 0) {
      prevSentiment = Math.round((pPos * 100 + pNeu * 50) / pSentTotal);
      const pMRate = prevTotalQ > 0 ? pTotalM / prevTotalQ : 0;
      prevHealth = Math.round(Math.min(100, pMRate * 55 + (prevSentiment / 100) * 45));
    }
  }
  const healthDelta = prevHealth !== null ? health - prevHealth : null;
  const sentimentDelta = prevSentiment !== null ? sentiment - prevSentiment : null;
  const coverageDelta = prevTotalQ !== null ? totalQ - prevTotalQ : null;

  // platforms: override design tiles with real SOV/mentions where present.
  // When an engine filter is active, narrow the grid to just that engine and
  // recompute its SOV from the filtered result set so the tile agrees with
  // the KPI rail.
  const rawPlatforms = lastRun.platforms || {};
  const platformsAll: Platform[] = PLATFORMS.map(p => {
    const key = Object.keys(rawPlatforms).find(k => k.toLowerCase() === p.name.toLowerCase());
    if (!key) return p;
    const n = normPlatform(rawPlatforms[key]);
    return { ...p, sov: Math.round(n.sov), ok: n.errors === 0, ms: p.ms };
  });
  const platforms: Platform[] = engineFiltered
    ? platformsAll.filter(p => p.name.toLowerCase() === filters.engine.toLowerCase()).map(p => ({ ...p, sov }))
    : platformsAll;

  // competitors: when filters are active we can't trust lastRun.competitors
  // (it aggregates across all engines/intents), so rebuild from filtered
  // r.competitorMentions. Otherwise use the precomputed map for parity.
  const compRaw: Record<string, number> = filtersActive
    ? results.reduce<Record<string, number>>((acc, r) => {
        const list: unknown = r?.competitorMentions;
        if (Array.isArray(list)) {
          for (const name of list) {
            if (typeof name === 'string' && name.trim()) {
              acc[name] = (acc[name] || 0) + 1;
            }
          }
        }
        return acc;
      }, {})
    : (lastRun.competitors || {});
  let competitors: OverviewData['competitors'] = [];
  const compEntries = Object.entries(compRaw).sort((a, b) => b[1] - a[1]).slice(0, 7);
  if (compEntries.length > 0) {
    const total = compEntries.reduce((s, [, c]) => s + c, 0) + Math.max(1, totalM);
    competitors = [
      { name: brand.name || 'You', sov, d: sov - prevSov, me: true, color: 'var(--accent)' },
      ...compEntries.map(([name, c], i) => ({ name, sov: Math.round((c / total) * 100), d: 0, color: COMP_COLORS[(i + 1) % COMP_COLORS.length] })),
    ].sort((a, b) => b.sov - a.sov);
    // "vs Top 3 competitors" = me + the three highest-SOV non-me brands.
    if (filters.competitorView === 'top3') {
      const me = competitors.find(c => c.me);
      const rest = competitors.filter(c => !c.me).slice(0, 3);
      competitors = (me ? [me, ...rest] : rest).sort((a, b) => b.sov - a.sov);
    }
  }

  // Real "Competitive" standing derived from the competitor SOV table: how close
  // you are to the category leader (100 = you lead it), plus your rank. Null when
  // no rivals are tracked, so the banner can show an honest empty state.
  let competitive: number | null = null;
  let competitiveSub = '';
  if (competitors.length > 0) {
    const rank = competitors.findIndex(c => c.me) + 1;
    const leaderSov = competitors[0].sov || 0;
    competitive = leaderSov > 0 ? Math.round(Math.min(100, (sov / leaderSov) * 100)) : 0;
    competitiveSub = `#${rank} of ${competitors.length} tracked`;
  }

  // sources / citations
  const citeRaw: Record<string, number> = lastRun.citations || {};
  let sources: OverviewData['sources'] = [];
  const citeEntries = Object.entries(citeRaw).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (citeEntries.length > 0) {
    const total = citeEntries.reduce((s, [, c]) => s + c, 0) || 1;
    sources = citeEntries.map(([d, n]) => ({ d, n, share: Math.round((n / total) * 100) }));
  }

  // trend
  const trend = sorted.slice(-14).map(r => Math.round(Number(r.sov) || 0));

  // recent mentions - newest results from the latest run (already engine/intent
  // filtered because `results` is the filtered set)
  const runDate = lastRun.date || lastRun.time || lastRun.created_at;
  const recent: RecentItem[] = results
    .filter(r => r.query && !r.error)
    .slice(-8)
    .reverse()
    .map(r => {
      const mentioned = !!r.mentioned;
      const pos = r.position ?? r.listPosition;
      const tag = !mentioned ? 'neu'
        : r.sentiment === 'positive' ? 'pos'
        : r.sentiment === 'negative' ? 'neg'
        : 'neu';
      const meta = mentioned
        ? (pos ? `${brand.name} · ${ordinal(Number(pos))}` : `${brand.name} · mentioned`)
        : 'not mentioned';
      const answer = r.response || r.snippet || r.raw || r.context || '';
      const rawSources = Array.isArray(r.sources) ? r.sources : Array.isArray(r.citations) ? r.citations : [];
      const sources: string[] = rawSources
        .map((s: any) => (typeof s === 'string' ? s : s?.url || s?.domain || ''))
        .filter(Boolean);
      const citations = Array.isArray(r.citations)
        ? r.citations
            .map((c: any) => (typeof c === 'string' ? c : c?.url || c?.domain || ''))
            .filter((c: string) => Boolean(c))
        : sources;
      return {
        p: matchPlatform(r.platform),
        q: r.query,
        tag,
        meta,
        t: relTime(runDate),
        answer,
        sources,
        platform: String(r.platform || ''),
        model: typeof r.model === 'string' ? r.model : undefined,
        mentioned,
        position: pos != null ? Number(pos) : undefined,
        sentiment: typeof r.sentiment === 'string' ? r.sentiment : undefined,
        citations,
        competitorMentions: Array.isArray(r.competitorMentions)
          ? r.competitorMentions.filter((c: unknown): c is string => typeof c === 'string')
          : undefined,
        error: typeof r.errorMessage === 'string' ? r.errorMessage : (typeof r.error === 'string' ? r.error : undefined),
        brandName: brand.name || '',
      };
    });

  // top tracked queries - aggregate mention rate / engines across all (filtered)
  // runs. Applies the engine + intent filters at the result level so the table
  // matches what the rest of the page shows.
  const qAgg: Record<string, { mentioned: number; total: number; platforms: Set<string>; hist: number[] }> = {};
  for (const run of sorted) {
    const rs: any[] = Array.isArray(run.allResults) ? run.allResults : [];
    const per: Record<string, { m: number; t: number }> = {};
    for (const r of rs) {
      if (!r.query) continue;
      if (!resultMatchesEngine(r, filters.engine)) continue;
      if (!resultMatchesIntent(r, filters.intent)) continue;
      if (!qAgg[r.query]) qAgg[r.query] = { mentioned: 0, total: 0, platforms: new Set(), hist: [] };
      if (!per[r.query]) per[r.query] = { m: 0, t: 0 };
      per[r.query].t++;
      qAgg[r.query].total++;
      qAgg[r.query].platforms.add(r.platform);
      if (r.mentioned) { per[r.query].m++; qAgg[r.query].mentioned++; }
    }
    for (const [q, s] of Object.entries(per)) {
      qAgg[q].hist.push(s.t > 0 ? Math.round((s.m / s.t) * 100) : 0);
    }
  }
  // Ensure tracked prompts with no results yet still appear - but respect the
  // intent filter so the table doesn't show queries that don't match.
  for (const q of brandQueries) {
    if (intentFiltered && classifyIntent(q) !== filters.intent) continue;
    if (!qAgg[q]) qAgg[q] = { mentioned: 0, total: 0, platforms: new Set(), hist: [] };
  }
  let queries: QueryRow[] = Object.entries(qAgg).map(([q, s]) => ({
    q,
    sov: s.total > 0 ? Math.round((s.mentioned / s.total) * 100) : 0,
    d: s.hist.length >= 2 ? s.hist[s.hist.length - 1] - s.hist[s.hist.length - 2] : 0,
    mentions: s.mentioned,
    eng: s.platforms.size,
  })).sort((a, b) => b.mentions - a.mentions || b.sov - a.sov).slice(0, 6);
  if (queries.length === 0) queries = brandQueries.slice(0, 6).map(q => ({ q, sov: 0, d: 0, mentions: 0, eng: 0 }));

  const prevTotalM = prevRun
    ? (filtersActive
        ? prevFiltered.filter(r => r.mentioned).length
        : (Number(prevRun.totalM) || 0))
    : 0;

  // Real "needs you today" insights - derived only from data we actually have.
  // Cards with no real backing are simply not emitted (the strip hides itself
  // when there are none).
  const realComp = compEntries.length > 0;
  const insights: InsightItem[] = [];
  if (trend.length >= 2) {
    const momentum = Math.round((sov - prevSov) * 10) / 10;
    if (momentum >= 1) insights.push({ icon: '▲', tone: 'pos', t: `Share of Voice up ${momentum} pts`, d: `now ${sov}% across the AI engines`, cta: 'See trends', href: '/dashboard/trends' });
    else if (momentum <= -1) insights.push({ icon: '▼', tone: 'warn', t: `Share of Voice down ${Math.abs(momentum)} pts`, d: `now ${sov}% - see what changed`, cta: 'Investigate', href: '/dashboard/competitors' });
  }
  if (realComp) {
    const top = competitors[0];
    if (top?.me) insights.push({ icon: '★', tone: 'pos', t: 'You lead your category', d: `#1 of ${competitors.length} at ${sov}% Share of Voice`, cta: 'Compare', href: '/dashboard/competitors' });
    else if (top) insights.push({ icon: '◆', tone: 'info', t: `${top.name} leads at ${top.sov}%`, d: `you're at ${sov}% - close the gap`, cta: 'Compare', href: '/dashboard/competitors' });
  }
  if (sentTotal > 0 && sentiment < 60) {
    insights.push({ icon: '⚠', tone: 'warn', t: `Sentiment is ${sentiment}%`, d: 'how the AI engines describe you needs attention', cta: 'Review mentions', href: '/dashboard/mentions' });
  }
  // Always-valid CTA (links to a real page; not fabricated copy).
  insights.push({ icon: '✦', tone: 'info', t: 'Ways to win more visibility', d: 'see your prioritized recommendations', cta: 'See plan', href: '/dashboard/recommendations' });

  return {
    hasReal: true,
    runCount: runs.length,
    brandName: brand.name || fb.brandName,
    website: brand.website,
    industry: brand.industry, city: brand.city,
    sov, sovDelta: prevRun ? sov - prevSov : 0,
    totalM, mentionsDelta: prevRun ? totalM - prevTotalM : 0,
    totalQ, health, sentiment,
    platforms, competitors, sources,
    trend: trend.length >= 2 ? trend : fb.trend,
    queries,
    recent,
    insights: insights.slice(0, 3),
    accuracyRate,
    openIssues,
    fixedIssues,
    healthDelta,
    sentimentDelta,
    coverageDelta,
    sentimentSub,
    competitive,
    competitiveSub,
  };
}
function sentTotalSafe(n: number) { return n > 0; }

/** Coerce a stored brand website (which may be bare like "acme.com") into a
 *  safe absolute URL we can use as an `<a href>`. Returns '' for empty input
 *  or for anything that isn't a plausible http(s) URL after normalization. */
function normalizeWebsite(raw?: string | null): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (!u.hostname || !u.hostname.includes('.')) return '';
    return u.toString();
  } catch {
    return '';
  }
}

/* ───────────────────────── page ───────────────────────── */

function DownloadReportButton() {
  const { selectedBrand } = useBrands();
  const { toast } = useToast();
  const brandId = (selectedBrand as any)?.id as string | undefined;
  const [busy, setBusy] = React.useState(false);
  const download = async () => {
    setBusy(true);
    try { await downloadBrandReport(brandId, (selectedBrand as any)?.name, toast); }
    finally { setBusy(false); }
  };
  return (
    <button className="btn-g" onClick={download} disabled={busy} title="Download a branded PDF visibility report for this brand">
      {busy ? 'Preparing…' : '↓ Download report'}
    </button>
  );
}

/** Onboarding panel shown on the Overview when the selected brand has no
 *  completed runs yet. Replaces the old fabricated KPI numbers (Share of
 *  Voice 27.4%, 1,284 mentions, …) with an honest "run your first scan" CTA. */
function OverviewEmptyState({ totalQ }: { totalQ: number }) {
  const { startRun, live } = useRun();
  const { selectedBrandLocked } = useBrands();
  const running = live.running;
  return (
    <div style={{
      border: '1px dashed var(--line, var(--border))', borderRadius: 14,
      padding: '22px 24px', marginBottom: 16,
      background: 'var(--card, var(--bg2))',
      display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--primary-light, rgba(99,102,241,.1))', color: 'var(--primary)', fontSize: 22,
      }}>📡</div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>No data yet - run your first scan</div>
        <div style={{ fontSize: 13, color: 'var(--mute, var(--muted))', lineHeight: 1.55 }}>
          {totalQ > 0
            ? <>You have <strong>{totalQ}</strong> tracked prompt{totalQ === 1 ? '' : 's'} ready. Run them across the AI engines to populate your Share of Voice, mentions and competitor data.</>
            : <>Add a few tracked prompts in Brand Setup, then run them across the AI engines to see your real visibility data here.</>}
        </div>
      </div>
      <button
        className="btn-p"
        onClick={() => startRun(false)}
        disabled={running || selectedBrandLocked || totalQ === 0}
        style={(running || selectedBrandLocked || totalQ === 0) ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
        title={selectedBrandLocked ? 'This brand is locked - upgrade to run' : totalQ === 0 ? 'Add tracked prompts first' : undefined}
      >
        {running ? 'Running…' : '▶ Run first scan'}
      </button>
    </div>
  );
}

export function PageOverview() {
  const [range, setRange] = React.useState<OverviewRange>('7d');
  const [engine, setEngine] = React.useState<string>('all');
  const [intent, setIntent] = React.useState<OverviewIntent>('all');
  const [competitorView, setCompetitorView] = React.useState<OverviewCompetitorView>('top3');
  const [drawer, setDrawer] = React.useState<RecentItem | null>(null);
  // Memoize the filters object so useOverviewData's React.useMemo dependency
  // doesn't churn on every render (the inner hook depends on this reference).
  const filters = React.useMemo<OverviewFilters>(
    () => ({ range, engine, intent, competitorView }),
    [range, engine, intent, competitorView],
  );
  const data = useOverviewData(filters);
  const d = data || buildFallback();

  // While a scan is in progress the brand's live/partial results can flow into
  // the data hook, which made the headline score widgets flash a misleading
  // figure (e.g. "100 Excellent" off the first returned query) before settling
  // on the real value once the run completed. Hold those widgets in a loading
  // state until the run is done so we only ever display final, complete scores.
  const { live } = useRun();
  const scanning = live.running;

  // With real data we only have the brand's own SOV history, so show just that
  // line rather than fabricated competitor trends. The demo overlay is kept for
  // the no-data fallback so the chart still looks alive.
  const meLine: LineSeries = { id: 'me', label: d.brandName || 'You', color: 'var(--primary)', bold: true, fill: true, cur: d.sov, data: d.trend };
  const sovSeries: LineSeries[] = d.hasReal ? [meLine] : [
    meLine,
    { id: 'linear', label: 'Linear', color: 'var(--info)', dashed: true, cur: 22.1, data: [26, 25, 25, 24, 24, 23, 22, 23, 22, 22, 22, 22, 22, 22.1] },
    { id: 'asana', label: 'Asana', color: 'var(--mute)', dashed: true, cur: 14.8, data: [20, 19, 18, 17, 17, 16, 16, 15, 15, 15, 15, 15, 14, 14.8] },
    { id: 'monday', label: 'Monday', color: 'var(--mute-2)', dashed: true, cur: 9.3, data: [12, 12, 11, 11, 11, 10, 10, 10, 9, 9, 9, 9, 9, 9.3] },
  ];
  const xLabels = ['', 'M', '', 'W', '', 'F', '', 'S', '', 'T', '', 'T', '', 'today'];
  const fmt = (n: number) => n.toLocaleString();

  return (
    <>
      <PageHead title={<>Welcome back, <span style={{ color: 'var(--primary)' }}>Nikhil</span>.</>}
        sub={
          !d.hasReal
            ? <>Sample data - add your brand to replace these example figures with real AI visibility.</>
            : scanning
              ? <>Scanning {d.brandName} across the 5 AI engines - your scores will update when the run completes.</>
              : d.noData
                ? <>Run your first scan to see how {d.brandName} shows up across the 5 AI engines.</>
                : d.runCount < 2
                  ? <>Your first results are in - here&rsquo;s how {d.brandName} shows up across the 5 AI engines.</>
                  : <>{d.brandName} is mentioned across the 5 AI engines - here&rsquo;s what changed since your last scan.</>
        }
        actions={<>
          {!d.hasReal && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#b45309',
              background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.35)',
              padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap',
            }}>Sample data</span>
          )}
          <DownloadReportButton />
          {(() => {
            const href = normalizeWebsite(d.website);
            if (!href) {
              return (
                <button
                  className="btn-p"
                  disabled
                  title="Add a website to your brand to open it from here"
                  style={{ opacity: 0.55, cursor: 'not-allowed' }}
                >
                  ↗ View live
                </button>
              );
            }
            return (
              <a
                className="btn-p"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open ${href} in a new tab`}
                style={{ textDecoration: 'none' }}
              >
                ↗ View live
              </a>
            );
          })()}
        </>} />

      <div className="page-body">
        {d.noData && !scanning && <OverviewEmptyState totalQ={d.totalQ} />}
        {scanning
          ? <HealthBannerSkeleton />
          : <HealthBanner health={d.health} healthDelta={d.healthDelta} sentiment={d.sentiment} sentimentSub={d.sentimentSub} sov={d.sov} totalQ={d.totalQ} accuracyRate={d.accuracyRate} openIssues={d.openIssues} fixedIssues={d.fixedIssues} competitive={d.competitive} competitiveSub={d.competitiveSub} />}
        {!scanning && <GoalCard current={d.sov} />}
        {!scanning && <InsightsStrip items={d.insights} />}

        <Filter>
          <Seg value={range} onChange={(v) => setRange(v as OverviewRange)} options={['24h', '7d', '30d', '90d']} />
          <select className="sel" value={engine} onChange={(e) => setEngine(e.target.value)}>
            <option value="all">All engines</option>
            <option value="ChatGPT">ChatGPT</option>
            <option value="Claude">Claude</option>
            <option value="Gemini">Gemini</option>
            <option value="Perplexity">Perplexity</option>
            <option value="Grok">Grok</option>
          </select>
          <select className="sel" value={intent} onChange={(e) => setIntent(e.target.value as OverviewIntent)}>
            <option value="all">All intents</option>
            <option value="comparison">Comparison</option>
            <option value="recommendation">Recommendation</option>
            <option value="pricing">Pricing</option>
            <option value="feature">Feature</option>
          </select>
          <select className="sel" value={competitorView} onChange={(e) => setCompetitorView(e.target.value as OverviewCompetitorView)}>
            <option value="top3">vs Top 3 competitors</option>
            <option value="all">vs All competitors</option>
          </select>
          <span style={{ flex: 1 }} />
          <Pill tone="acc"><span className="pulse" /> Auto-runs on</Pill>
        </Filter>

        {scanning
          ? <KpiCardsSkeleton count={5} />
          : <KPIRail items={[
              { k: 'SHARE OF VOICE', term: 'sov', v: String(d.sov), suffix: '%', d: d.sovDelta, info: 'vs prev. run' },
              { k: 'MENTIONS', term: 'mention', v: fmt(d.totalM), d: d.mentionsDelta, info: '5 engines' },
              { k: 'SENTIMENT', term: 'sentiment', v: String(d.sentiment), suffix: '%', d: d.sentimentDelta ?? undefined, info: d.sentimentDelta != null ? 'vs prev. run' : undefined },
              { k: 'FALSE CLAIMS', term: 'hallucination', v: d.accuracyRate !== null ? String(d.openIssues) : '-', danger: d.accuracyRate !== null && d.openIssues > 0, info: d.accuracyRate !== null ? (d.fixedIssues > 0 ? `${d.fixedIssues} fixed` : 'none fixed') : 'not set up' },
              { k: 'COVERAGE', term: 'coverage', v: String(d.totalQ), d: d.coverageDelta ?? undefined, info: 'prompts' },
            ]} />}

        <div className="g2">
          <Card title="Share of Voice - 14 days" info="sov"
            lede="How your slice of AI answers stacks up against rivals, day by day. Up = AI is recommending you more."
            right={<Pill>5 engines · 4 brands</Pill>} style={{ gridColumn: 'span 2' }}>
            <LineChart series={sovSeries} xLabels={xLabels} height={280} />
          </Card>
        </div>

        <OverviewEngineGrid platforms={d.platforms} />

        <div className="g2">
          <OverviewRecentMentions onOpen={setDrawer} total={d.totalM} items={d.recent} />
          <OverviewQueriesTable rows={d.queries} totalQ={d.totalQ} />
        </div>

        <div className="g2">
          <OverviewCompetitors rows={d.competitors} />
          <OverviewSources rows={d.sources} />
        </div>
      </div>

      {drawer && <MentionDrawer item={drawer} onClose={() => setDrawer(null)} />}
    </>
  );
}

function BrandHealthGauge({ value }: { value: number }) {
  const size = 96, r = size / 2 - 8, cir = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.18)" strokeWidth="6" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,1)" strokeWidth="6" fill="none"
          strokeDasharray={`${cir * value / 100} ${cir}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray 1.4s cubic-bezier(.2,.7,.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', lineHeight: 1 }}>
        <span style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', fontFamily: 'var(--mono)' }}>{value}</span>
        <span style={{ fontSize: 10, opacity: .7, marginTop: 2, fontFamily: 'var(--mono)' }}>/ 100</span>
      </div>
    </div>
  );
}

function HBar({ label, v, sub }: { label: string; v: number; sub: string }) {
  return (
    <div className="hbar">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span className="hbar-l">{label}</span>
        <span className="hbar-v mono">{v}</span>
      </div>
      <div className="hbar-track"><i style={{ width: v + '%' }} /></div>
      <div className="hbar-sub">{sub}</div>
    </div>
  );
}

// Loading placeholder for the score banner, shown while a scan is running so
// the gauge + bars never bind to partial live data (which used to flash an
// inflated "100 Excellent" before settling on the real score).
function HealthBannerSkeleton() {
  const bars = ['Visibility', 'Sentiment', 'Accuracy', 'Competitive'];
  return (
    <section className="hb" aria-busy="true">
      <div className="hb-score">
        <div style={{ width: 96, height: 96, borderRadius: '50%', border: '6px solid rgba(255,255,255,.18)', boxSizing: 'border-box' }} />
        <div>
          <div className="eyebrow" style={{ color: 'rgba(255,255,255,.7)' }}>BRAND HEALTH</div>
          <div className="hb-grade" style={{ opacity: .8 }}>Scanning…</div>
          <div className="hb-d"><span style={{ color: 'rgba(255,255,255,.7)' }}>Calculating once the run completes</span></div>
        </div>
      </div>
      <div className="hb-bars">
        {bars.map(label => (
          <div className="hbar" key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span className="hbar-l">{label}</span>
              <span className="hbar-v mono" style={{ opacity: .5 }}>-</span>
            </div>
            <div className="hbar-track"><i style={{ width: '0%' }} /></div>
            <div className="hbar-sub">Scanning…</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HealthBanner({ health, healthDelta, sentiment, sentimentSub, sov, totalQ, accuracyRate, openIssues, fixedIssues, competitive, competitiveSub }: { health: number; healthDelta: number | null; sentiment: number; sentimentSub: string; sov: number; totalQ: number; accuracyRate: number | null; openIssues: number; fixedIssues: number; competitive: number | null; competitiveSub: string }) {
  const grade = health >= 80 ? 'Excellent' : health >= 65 ? 'Good' : health >= 45 ? 'Fair' : 'Needs work';
  const accSub = accuracyRate !== null
    ? `${openIssues} claim${openIssues !== 1 ? 's' : ''} open${fixedIssues > 0 ? ` / ${fixedIssues} fixed` : ''}`
    : 'add facts to enable';
  return (
    <section className="hb">
      <div className="hb-score">
        <BrandHealthGauge value={health} />
        <div>
          <div className="eyebrow" style={{ color: 'rgba(255,255,255,.7)', display: 'flex', alignItems: 'center' }}>BRAND HEALTH <Info term="health" /></div>
          <div className="hb-grade">{grade}</div>
          <div className="hb-d">
            {healthDelta != null && <Delta v={healthDelta} />}
            <span style={{ color: 'rgba(255,255,255,.7)' }}>{healthDelta != null ? 'vs previous run' : 'no prior run to compare'}</span>
          </div>
        </div>
      </div>
      <div className="hb-bars">
        <HBar label="Visibility" v={Math.round(sov)} sub={`${totalQ} prompts tracked`} />
        <HBar label="Sentiment" v={sentiment} sub={sentimentSub} />
        <HBar label="Accuracy" v={accuracyRate ?? 0} sub={accSub} />
        <HBar label="Competitive" v={competitive ?? 0} sub={competitive != null ? competitiveSub : 'no rivals tracked'} />
      </div>
      <div className="hb-art" aria-hidden="true">
        <svg viewBox="0 0 240 140" preserveAspectRatio="none">
          <defs>
            <linearGradient id="hbG" x1="0" x2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,.25)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>
          <path d="M0 100 C 50 80, 90 90, 140 60 S 200 30, 240 25 L240 140 L0 140 Z" fill="url(#hbG)" />
          <path d="M0 100 C 50 80, 90 90, 140 60 S 200 30, 240 25" stroke="rgba(255,255,255,.55)" strokeWidth="2" fill="none" />
        </svg>
      </div>
    </section>
  );
}

function InsightsStrip({ items }: { items: InsightItem[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="strip-head">
        <span className="eyebrow">NEEDS YOU TODAY</span>
        <span className="strip-sub">The few things worth acting on right now - tap to dive in.</span>
      </div>
      <div className="ins-strip">
        {items.map((it, i) => (
          <button key={i} className={'ins-card ins-' + it.tone} onClick={() => { window.location.href = it.href; }}>
            <span className="ins-icon">{it.icon}</span>
            <div className="ins-body">
              <div className="ins-t">{it.t}</div>
              <div className="ins-d">{it.d}</div>
            </div>
            <span className="ins-cta">{it.cta} →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Fetch the brand's PDF report and trigger a download, handling the Pro+ plan
// gate gracefully (a toast, not a raw JSON error tab). Shared by the Overview
// header button and the mention drawer.
async function downloadBrandReport(brandId: string | undefined, brandName: string | undefined, toast: any) {
  if (!brandId) { toast('Select a brand first to generate a report.', 'error'); return; }
  try {
    const res = await fetch(`/api/brands/${brandId}/report/pdf`, { credentials: 'include' });
    if (res.status === 403) {
      const j = await res.json().catch(() => ({}));
      toast(j.error || 'PDF reports are available on the Pro plan and above.', 'error');
      return;
    }
    if (res.status === 429) {
      toast('Too many downloads - please wait a moment and try again.', 'error');
      return;
    }
    if (!res.ok) {
      // Surface the server's specific message when available (e.g. "Brand not
      // found") so the user knows what to do, instead of a generic "try again".
      const j = await res.clone().json().catch(() => null);
      toast((j && j.error) || 'Could not generate the report. Please try again.', 'error');
      return;
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^"]+)"?/);
    const name = m ? m[1] : `${brandName || 'brand'}_AI_Visibility_Report.pdf`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Report downloaded');
  } catch {
    toast('Could not generate the report. Please try again.', 'error');
  }
}

function MentionDrawer({ item, onClose }: { item: RecentItem; onClose: () => void }) {
  const { startRun } = useRun();
  const { toast } = useToast();
  const { selectedBrand } = useBrands();
  const brandId = (selectedBrand as any)?.id as string | undefined;
  const [copied, setCopied] = React.useState(false);
  const [added, setAdded] = React.useState(false);

  // Strip light markdown and collapse whitespace so the answer reads as a single
  // clean paragraph in the drawer body - matches the Evidence & Proof excerpt.
  const answerExcerpt = (item.answer || '')
    .replace(/[#*_~`]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  const highlighted = answerExcerpt
    ? sanitizeHtml(highlightBrandText(answerExcerpt, item.brandName))
    : '';
  const verdictTone = item.error ? 'warn' : item.mentioned ? 'pos' : 'neg';
  const verdictLabel = item.error
    ? 'ERROR'
    : item.mentioned
      ? `FOUND${item.position ? ` · #${item.position}` : ''}`
      : 'NOT FOUND';
  const sentiment = item.sentiment || (item.mentioned ? 'neutral' : '-');
  const modelLine = [item.platform || item.p.name, item.model, item.t].filter(Boolean).join(' · ');

  const handleRerun = () => {
    if (!brandId) { toast('Select a brand first to run queries.', 'error'); return; }
    startRun(false);
    toast('Re-running your prompts across all engines…');
    onClose();
  };
  const handleFlag = () => {
    // Hallucinations / false claims are managed on the Accuracy Monitor.
    onClose();
    window.location.href = '/dashboard/accuracy';
  };
  const handleShare = async () => {
    const text = `${item.platform || item.p?.name} · "${item.q}"\nVerdict: ${verdictLabel} - ${item.meta}\n\n${item.answer || '(no response text captured)'}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast('Copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Could not copy to clipboard', 'error');
    }
  };
  const handleAddToReport = async () => {
    if (!brandId) { toast('Select a brand first to build a report.', 'error'); return; }
    try {
      const res = await fetch(`/api/brands/${brandId}/report/items`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'mention', payload: { platform: item.platform || item.p?.name, query: item.q, tag: item.tag, meta: item.meta, answer: item.answer || '', sources: item.sources || item.citations || [] } }),
      });
      if (!res.ok) { toast('Could not add to report.', 'error'); return; }
      const j = await res.json().catch(() => ({}));
      setAdded(true);
      toast(j.duplicate ? 'Already in your report' : 'Added to report');
    } catch { toast('Could not add to report.', 'error'); }
  };

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-h">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PlatformTile p={item.p} size={30} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{item.platform || item.p.name}</div>
              <div className="mono dim" style={{ fontSize: 11 }}>{modelLine}</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="drawer-b">
          <div className="eyebrow">QUERY</div>
          <div style={{ fontSize: 14.5, color: 'var(--text)', padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 6, margin: '8px 0 18px', fontFamily: 'var(--mono)' }}>&ldquo;{item.q}&rdquo;</div>
          <div className="eyebrow">VERDICT</div>
          <div style={{ display: 'flex', gap: 8, margin: '8px 0 18px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge tone={verdictTone}>{verdictLabel}</Badge>
            <span className="quiet" style={{ fontSize: 13 }}>{item.meta}</span>
            {!item.error && (
              <span className="mono dim" style={{ fontSize: 11 }}>· sentiment: {sentiment}</span>
            )}
          </div>
          <div className="eyebrow">VERBATIM ANSWER</div>
          {item.error ? (
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--warn)', margin: '8px 0 18px' }}>{item.error}</p>
          ) : highlighted ? (
            <p
              style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text)', margin: '8px 0 18px' }}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          ) : (
            <p className="quiet" style={{ fontSize: 13, margin: '8px 0 18px' }}>
              No response text captured for this result.
            </p>
          )}
          {item.competitorMentions && item.competitorMentions.length > 0 && (
            <>
              <div className="eyebrow">ALSO MENTIONED</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 18px' }}>
                {item.competitorMentions.map((c, i) => (
                  <span key={i} className="badge badge-neu">{c}</span>
                ))}
              </div>
            </>
          )}
          {item.citations && item.citations.length > 0 && (
            <>
              <div className="eyebrow">SOURCES CITED</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 18px' }}>
                {item.citations.map((c, i) => <Cit key={i} url={c} />)}
              </div>
            </>
          )}
          <div className="eyebrow">ACTIONS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <button className="btn-g" onClick={handleRerun}>↻ Re-run this query</button>
            <button className="btn-g" onClick={handleFlag}>⚐ Flag as hallucination</button>
            <button className="btn-g" onClick={handleShare}>↗ {copied ? 'Copied!' : 'Share'}</button>
            <a className="btn-g" href="/dashboard/proof" style={{ textDecoration: 'none' }}>Open in Evidence &amp; Proof</a>
            <button className="btn-p" onClick={handleAddToReport} disabled={added}>{added ? 'Added ✓' : '+ Add to report'}</button>
          </div>
        </div>
      </aside>
    </>
  );
}

function OverviewEngineGrid({ platforms }: { platforms: Platform[] }) {
  return (
    <Card title="By engine - today" info="sov"
      lede="Your Share of Voice inside each AI assistant, refreshed this hour."
      right={<span className="mono dim" style={{ fontSize: 11 }}>UPDATED 2 MIN AGO</span>} padding={false}>
      <div className="eg-grid">
        {platforms.map(p => (
          <div key={p.id} className="eg-cell">
            <div className="eg-h">
              <PlatformTile p={p} size={26} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', letterSpacing: '0.08em' }}>
                  {p.ok ? <><span className="pulse" style={{ width: 5, height: 5 }} /> OK · {p.ms}ms</> : <span className="neg">⚠ DEGRADED</span>}
                </div>
              </div>
              <Badge tone={p.delta >= 0 ? 'pos' : 'neg'}>{p.delta >= 0 ? '▲' : '▼'} {Math.abs(p.delta)}</Badge>
            </div>
            <div className="eg-v mono">{p.sov}<i>%</i></div>
            <Bar value={p.sov} />
            <div className="eg-spark">
              <Spark data={[12, 14, 11, 18, 16, 22, 20, 24, 22, 28, 26, 30, p.sov]} width={200} height={26} color={p.delta >= 0 ? 'var(--accent)' : 'var(--mute)'} fill />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OverviewRecentMentions({ onOpen, total, items }: { onOpen: (it: RecentItem) => void; total: number; items: RecentItem[] }) {
  return (
    <Card title="Recent mentions" info="mention"
      lede="The newest AI answers that named you - click any row to read the exact wording."
      right={<Pill tone="acc"><span className="pulse" /> Live</Pill>} padding={false}
      foot={<><span>{total.toLocaleString()} total · 7 days</span><a className="dim" href="/dashboard/mentions">Open mentions →</a></>}>
      {items.length === 0 ? (
        <div className="quiet" style={{ padding: '24px 16px', fontSize: 13, textAlign: 'center' }}>
          No mentions yet - run the engines to see how AI answers about this brand.
        </div>
      ) : (
      <ul className="feed">
        {items.map((it, i) => (
          <li key={i} className="feed-i" onClick={() => onOpen(it)}>
            <PlatformTile p={it.p} size={24} />
            <div style={{ minWidth: 0 }}>
              <div className="feed-q">&ldquo;{it.q}&rdquo;</div>
              <div className="feed-m">
                <Badge tone={it.tag}>{it.tag.toUpperCase()}</Badge>
                <span style={{ marginLeft: 8 }}>{it.meta}</span>
              </div>
            </div>
            <span className="mono dim" style={{ fontSize: 11 }}>{it.t}</span>
          </li>
        ))}
      </ul>
      )}
    </Card>
  );
}

function OverviewQueriesTable({ rows, totalQ }: { rows: QueryRow[]; totalQ: number }) {
  const { selectedBrand } = useBrands();
  const { toast } = useToast();
  const brandId = (selectedBrand as any)?.id as string | undefined;
  const [addedQ, setAddedQ] = React.useState<Record<string, boolean>>({});

  const addQuery = async (r: QueryRow) => {
    if (!brandId) { toast('Select a brand first to build a report.', 'error'); return; }
    try {
      const res = await fetch(`/api/brands/${brandId}/report/items`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'query', payload: { q: r.q, sov: r.sov, engines: r.eng } }),
      });
      if (!res.ok) { toast('Could not add to report.', 'error'); return; }
      const j = await res.json().catch(() => ({}));
      setAddedQ(prev => ({ ...prev, [r.q]: true }));
      toast(j.duplicate ? 'Already in your report' : 'Added to report');
    } catch { toast('Could not add to report.', 'error'); }
  };

  return (
    <Card title="Top tracked queries" info="prompt"
      lede="The buyer questions you watch - and how visible you are on each."
      right={<a href="/dashboard/query-tracker" className="mono dim" style={{ fontSize: 11 }}>ALL {totalQ} →</a>} padding={false}>
      {rows.length === 0 ? (
        <div className="quiet" style={{ padding: '24px 16px', fontSize: 13, textAlign: 'center' }}>
          No tracked prompts yet - add prompts in Brand Setup to start tracking.
        </div>
      ) : (
      <table className="tbl">
        <thead><tr><th>QUERY</th><th className="right">SOV</th><th className="right">Δ</th><th className="right">MENTIONS</th><th className="right">ENGINES</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><b>{r.q}</b></td>
              <td className="right num">{r.sov}%</td>
              <td className="right"><Delta v={r.d} suffix="%" /></td>
              <td className="right num">{r.mentions}</td>
              <td className="right num">{r.eng}/5</td>
              <td className="right">
                <button className="btn-d" style={{ padding: '3px 8px', fontSize: 10.5, whiteSpace: 'nowrap' }}
                  onClick={() => addQuery(r)} disabled={!!addedQ[r.q]} title="Add this query to your report">
                  {addedQ[r.q] ? 'Added ✓' : '+ Report'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </Card>
  );
}

function OverviewCompetitors({ rows }: { rows: OverviewData['competitors'] }) {
  const max = Math.max(30, ...rows.map(r => r.sov));
  return (
    <Card title="Competitor SOV" info="sov"
      lede="Who's winning the AI conversation in your category right now."
      right={<a href="/dashboard/competitors" className="mono dim" style={{ fontSize: 11 }}>COMPETITORS →</a>}>
      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 12.5 }}>
          No competitor data yet - run queries to see how you compare.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {rows.map((r, i) => (
            <div key={i} className="comp-row">
              <span className="comp-name">
                <span style={{ width: 8, height: 8, background: r.color, borderRadius: 2, display: 'inline-block', flexShrink: 0 }} />
                <b title={r.name} style={{ color: r.me ? 'var(--accent)' : 'var(--text)', fontWeight: 500, fontSize: 13 }}>{r.name}</b>
                {r.me && <Badge tone="acc">YOU</Badge>}
              </span>
              <Bar value={r.sov} max={max} />
              <span className="mono" style={{ fontSize: 13, textAlign: 'right' }}>{r.sov}%</span>
              <span style={{ textAlign: 'right' }}><Delta v={r.d} suffix="%" /></span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function OverviewSources({ rows }: { rows: OverviewData['sources'] }) {
  const max = Math.max(20, ...rows.map(r => r.share));
  return (
    <Card title="Most cited sources" info="citation"
      lede="The web pages AI leans on when it describes you. Strengthen the helpful ones."
      right={<a href="/dashboard/citations" className="mono dim" style={{ fontSize: 11 }}>CITATIONS →</a>}>
      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 12.5 }}>
          No citations tracked yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((r, i) => (
            <div key={i} className="src-row">
              <Cit url={r.d} />
              <Bar value={r.share} max={max} />
              <span className="mono" style={{ fontSize: 12, color: 'var(--text)', minWidth: 46, textAlign: 'right' }}>{r.n}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
