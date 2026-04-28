/**
 * Cron-scheduler eligibility helpers (PR-C-2).
 *
 * Extracted from src/app/api/cron/route.ts so the lastRunTime
 * resolution can be unit-tested without standing up a Postgres pool
 * + a half-day's worth of mocked AI infrastructure.
 *
 * Why this exists at all: when the watchdog reaper finalizes a stuck
 * `active_runs` row it appends a `watchdogReap: true` entry to
 * `brand.data.runs` with `time: nowIso` (the reap moment). The
 * scheduler's `interval_not_elapsed` gate uses
 * `brand.data.runs[last].time` as a fallback when there's no
 * `status='done'` row in `active_runs` to consult — and the naive
 * "take the latest entry" walk treats the reap stamp as "this brand
 * just ran successfully", blocking the brand for the full
 * `effectiveSchedule` window (typically 24-48 hours).
 *
 * The fix: walk backwards skipping reap/emergency-save entries, so
 * either an older legitimate successful run is used (its real
 * timestamp ungate-able when older than effectiveSchedule), or no
 * fallback timestamp is found at all (brand treated as "never run"
 * → eligible immediately). Brands with a recent `status='done'` row
 * in `active_runs` are unaffected — the primary path still wins.
 */

export interface RunStampSource {
  time?: string | number | Date;
  date?: string | number | Date;
  // Reaper-stamped entries carry these flags. Walking past them is
  // the entire point of this helper.
  watchdogReap?: boolean;
  emergencySave?: boolean;
}

export interface ResolvedLastRun {
  lastRunTime: number | null;
  lastRunSource: 'active_runs' | 'brand_data' | null;
}

/**
 * Resolve the "last run timestamp" the scheduler should compare
 * against `effectiveSchedule` for a brand.
 *
 * @param primaryFromActiveRuns ms epoch from
 *   `MAX(COALESCE(completed_at, started_at)) FROM active_runs WHERE status='done'`
 *   for this brand, or null if no `done` row exists.
 * @param brandRuns The `brand.data.runs` JSONB array (or undefined).
 *   Walked from newest entry backwards; `watchdogReap` /
 *   `emergencySave` flagged entries are skipped.
 *
 * @returns `{ lastRunTime, lastRunSource }`. `lastRunTime: null`
 *   means "no usable history" — caller should treat the brand as
 *   eligible (no interval gate to check).
 */
export function resolveLastRunTime(
  primaryFromActiveRuns: number | null | undefined,
  brandRuns: RunStampSource[] | undefined | null,
): ResolvedLastRun {
  // Primary path — trust active_runs. The scheduler's source of
  // truth for successful runs; never override even if brand_data
  // disagrees.
  if (primaryFromActiveRuns) {
    return { lastRunTime: primaryFromActiveRuns, lastRunSource: 'active_runs' };
  }
  if (!Array.isArray(brandRuns) || brandRuns.length === 0) {
    return { lastRunTime: null, lastRunSource: null };
  }
  // Fallback path — walk from newest entry backwards looking for a
  // non-reap entry. Pre-PR-C-2 this just took the last element which
  // could be a reaper-stamped entry, poisoning the interval gate.
  for (let i = brandRuns.length - 1; i >= 0; i--) {
    const r = brandRuns[i];
    if (!r) continue;
    if (r.watchdogReap === true || r.emergencySave === true) continue;
    const stamp = r.time ?? r.date;
    if (stamp === undefined || stamp === null) continue;
    const ms = new Date(stamp as string | number | Date).getTime();
    if (!Number.isFinite(ms)) continue;
    return { lastRunTime: ms, lastRunSource: 'brand_data' };
  }
  // Every entry was a reap (or had no usable timestamp). Returning
  // null means the gate is bypassed in the caller — correct
  // behavior because we have no evidence the brand has actually
  // run successfully recently.
  return { lastRunTime: null, lastRunSource: null };
}
