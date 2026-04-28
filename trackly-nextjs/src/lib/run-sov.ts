/**
 * SOV (Share-of-Voice) helpers shared between the dashboard render
 * path and the watchdog reaper.
 *
 * Why a shared module: both call sites need the same formula —
 * "fraction of non-error queries where the brand was mentioned". The
 * Mentions page recomputes this on every render. The Overview page
 * reads a stored `.sov` field that is written either by the worker
 * on terminal success or by the reaper when a run is wedged. Before
 * this PR those two writers used different formulas (worker:
 * `totalM/totalQ`, reaper: hardcoded `0`); both now flow through
 * `computeSovFromResults` so the dashboard can't render a number
 * that disagrees with itself.
 */

export interface SovResult {
  error?: boolean;
  mentioned?: boolean;
}

export interface RunSovCandidate {
  sov?: number | null;
  allResults?: SovResult[] | null;
}

/**
 * Compute SOV % from a results array using the Mentions-page
 * formula: round(found / ok * 100) where:
 *   ok    = results that didn't error
 *   found = results that mentioned the brand
 *
 * Returns 0 when there are no non-error results (i.e. nothing to
 * divide by) — distinct from "we have data and no mentions",
 * which also returns 0 but is a legitimate zero. The two cases are
 * indistinguishable downstream by design; the only thing this helper
 * promises is that it never throws and never returns NaN.
 */
export function computeSovFromResults(results: SovResult[] | null | undefined): number {
  if (!Array.isArray(results) || results.length === 0) return 0;
  const ok = results.filter(r => !r.error).length;
  if (ok === 0) return 0;
  const found = results.filter(r => r.mentioned).length;
  return Math.round((found / ok) * 100);
}

/**
 * Resolve the SOV % to render on the Overview dashboard for a given
 * historical run entry.
 *
 * Trust the stored `.sov` field when it's a positive number — that's
 * what the worker wrote at terminal success and we have no reason to
 * second-guess it. Only fall back to recomputing from `allResults`
 * when:
 *
 *   1. `.sov` is missing OR exactly zero, AND
 *   2. `allResults` is a non-empty array we can recompute from
 *
 * Both conditions must hold. A legitimate zero (run completed, brand
 * was never mentioned) still has `.sov === 0` AND `allResults` with
 * data — the recompute fires but yields the same 0%, so historical
 * legitimate-zero entries continue to render correctly.
 *
 * The motivating bug: pre-PR reaper wrote `sov: 0` regardless of the
 * accumulated mentions in `allResults`. After this PR the reaper
 * writes the right number; this fallback also makes Overview
 * resilient to any *future* writer that produces a malformed entry,
 * not just the one we know about today.
 */
export function computeOverviewSov(run: RunSovCandidate | null | undefined): number {
  if (!run) return 0;
  const stored = typeof run.sov === 'number' ? run.sov : null;
  // Stored positive — render as-is. No condition under which we'd
  // override a positive worker-written value.
  if (stored !== null && stored > 0) return stored;
  // Stored is 0 or missing. Try the recompute, but only if we have
  // results to recompute from — empty/missing allResults means we
  // have nothing better than the stored value.
  const all = run.allResults;
  if (!Array.isArray(all) || all.length === 0) return stored ?? 0;
  return computeSovFromResults(all);
}
