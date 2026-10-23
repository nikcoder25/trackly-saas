/**
 * Brand vs tracked rivals, on the same scale as the headline visibility.
 *
 * The rival list is the brand's configured `competitors` (the list the
 * Competitors page shows), not whichever names happened to be counted in the
 * last run. Every row, the brand's included, is a mention rate over the same
 * answered results, so the brand's row equals its visibility score and a
 * "you lead" claim only appears when the brand is strictly ahead of every
 * tracked rival.
 */

export interface RivalResult {
  error?: unknown;
  competitorMentions?: unknown;
}

export interface RivalRow {
  name: string;
  sov: number;
  d: number;
  me?: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

function lookupCount(counts: Record<string, number> | null | undefined, name: string): number {
  if (!counts) return 0;
  const key = Object.keys(counts).find(k => norm(k) === norm(name));
  return key ? Math.max(0, Number(counts[key]) || 0) : 0;
}

/**
 * Mention rate (whole percent) for each competitor over the answered results.
 * Reads per-result `competitorMentions` when the run has them; older runs
 * that only stored an aggregate count map fall back to `fallbackCounts`.
 */
export function rivalMentionRates(
  competitors: string[],
  results: RivalResult[] | null | undefined,
  fallbackCounts?: Record<string, number> | null,
): Record<string, number> {
  const ok = (Array.isArray(results) ? results : []).filter(r => r && !r.error);
  const perResult = ok.some(r => Array.isArray(r.competitorMentions));
  const out: Record<string, number> = {};
  for (const comp of competitors) {
    const count = perResult
      ? ok.filter(r => Array.isArray(r.competitorMentions)
          && (r.competitorMentions as unknown[]).some(m => typeof m === 'string' && norm(m) === norm(comp))).length
      : lookupCount(fallbackCounts, comp);
    out[comp] = ok.length > 0 ? Math.min(100, Math.round((count / ok.length) * 100)) : 0;
  }
  return out;
}

/** Unique, trimmed competitor names in their configured order. */
export function cleanCompetitorList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of raw) {
    if (typeof c !== 'string' || !c.trim()) continue;
    const k = norm(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c.trim());
  }
  return out;
}

/**
 * Ranked rows: the brand (at its visibility score) plus each tracked rival.
 * Ties rank the rival first so a draw never reads as the brand leading.
 * Returns [] when no rivals are tracked.
 */
export function buildRivalRows(opts: {
  brandName: string;
  brandSov: number;
  prevBrandSov?: number | null;
  competitors: string[];
  results: RivalResult[] | null | undefined;
  prevResults?: RivalResult[] | null;
  fallbackCounts?: Record<string, number> | null;
  prevFallbackCounts?: Record<string, number> | null;
  displayName?: (name: string) => string;
}): RivalRow[] {
  const comps = cleanCompetitorList(opts.competitors);
  if (comps.length === 0) return [];
  const hasPrev = opts.prevBrandSov != null;
  const rates = rivalMentionRates(comps, opts.results, opts.fallbackCounts);
  const prevRates = hasPrev ? rivalMentionRates(comps, opts.prevResults, opts.prevFallbackCounts) : {};
  const label = opts.displayName || ((n: string) => n);
  const me: RivalRow = {
    name: opts.brandName,
    sov: opts.brandSov,
    d: hasPrev ? opts.brandSov - (opts.prevBrandSov as number) : 0,
    me: true,
  };
  const rivals: RivalRow[] = comps.map(c => ({
    name: label(c),
    sov: rates[c],
    d: hasPrev ? rates[c] - (prevRates[c] ?? 0) : 0,
  }));
  return [me, ...rivals].sort((a, b) => b.sov - a.sov || (a.me ? 1 : 0) - (b.me ? 1 : 0));
}

/** True only when the brand is named and strictly ahead of every tracked rival. */
export function leadsRivals(rows: { sov: number; me?: boolean }[]): boolean {
  const me = rows.find(r => r.me);
  const others = rows.filter(r => !r.me);
  if (!me || others.length === 0 || !(me.sov > 0)) return false;
  return others.every(o => me.sov > o.sov);
}
