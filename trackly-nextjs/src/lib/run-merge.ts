/**
 * Merge a retry run (a few prompts re-run on one or more engines) back into
 * the scan it is retrying, instead of saving it as a new, tiny scan.
 *
 * Without this, re-running the failed Grok rows made the "latest scan" a run
 * with only those rows, and Prompts & answers / Overview lost every other
 * engine's answers until the next full scan.
 */
import { computeSovFromResults } from './run-sov';
import { aggregateCompetitorCounts } from './parser';
import { isRedirectCitationHost } from './citation-hosts';

type Row = Record<string, unknown> & { platform?: string; query?: string; error?: boolean; mentioned?: boolean; citations?: string[] };
type StoredRun = Record<string, unknown> & { id?: string; allResults?: Row[]; results?: Row[]; activePlatforms?: string[] };

const key = (r: Row) => `${r.platform}\u0000${String(r.query || '').toLowerCase().trim()}`;

/**
 * Replace the target run's rows that match (platform, query) with the new
 * rows, then recompute the run's summary fields. Mutates and returns the
 * target run, or null when the target isn't found.
 */
export function mergeRetryIntoRun(runs: StoredRun[], targetRunId: string, newRows: Row[]): StoredRun | null {
  const target = runs.find(r => r && r.id === targetRunId);
  if (!target) return null;
  const existing: Row[] = Array.isArray(target.allResults) ? target.allResults
    : Array.isArray(target.results) ? target.results : [];
  const fresh = new Map(newRows.map(r => [key(r), r]));
  const merged: Row[] = existing.map(r => {
    const k = key(r);
    if (!fresh.has(k)) return r;
    const n = fresh.get(k)!;
    fresh.delete(k);
    return n;
  });
  // Rows the target never had (e.g. a newly enabled engine) are appended.
  for (const r of fresh.values()) merged.push(r);

  const platforms = Array.from(new Set([
    ...(Array.isArray(target.activePlatforms) ? target.activePlatforms : []),
    ...merged.map(r => String(r.platform || '')).filter(Boolean),
  ]));
  const platformStats: Record<string, { queries: number; mentions: number; sov: number; errors: number }> = {};
  for (const p of platforms) {
    const rows = merged.filter(r => r.platform === p);
    const mentions = rows.filter(r => r.mentioned && !r.error).length;
    const errors = rows.filter(r => r.error).length;
    const ok = rows.length - errors;
    platformStats[p] = { queries: rows.length, mentions, sov: ok > 0 ? Math.round((mentions / ok) * 100) : 0, errors };
  }

  const citations: Record<string, number> = {};
  for (const r of merged) {
    for (const url of r.citations || []) {
      try {
        const domain = new URL(url).hostname.replace(/^www\./, '');
        if (isRedirectCitationHost(domain)) continue;
        citations[domain] = (citations[domain] || 0) + 1;
      } catch { /* skip invalid URLs */ }
    }
  }

  target.allResults = merged;
  if ('results' in target) delete target.results;
  target.activePlatforms = platforms;
  target.platforms = platformStats;
  target.sov = computeSovFromResults(merged as Array<{ error?: boolean; mentioned?: boolean }>);
  target.totalQ = merged.length;
  target.totalM = merged.filter(r => r.mentioned && !r.error).length;
  target.errorCount = merged.filter(r => r.error).length;
  target.citations = citations;
  target.competitors = aggregateCompetitorCounts(merged as Array<{ competitorMentions?: string[] }>);
  target.retriedAt = new Date().toISOString();
  return target;
}
