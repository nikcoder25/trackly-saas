/**
 * Diagnostic endpoint for the scheduled-run pipeline.
 *
 * GET /api/admin/diagnostic
 * Auth: admin or owner.
 *
 * Returns a snapshot of every signal needed to understand why a brand
 * did or did not run in the last hour:
 *   - Relevant env flags (without leaking secrets)
 *   - cron_locks state (is the scheduler wedged?)
 *   - Last 20 active_runs rows across all brands, with statuses
 *   - Per-brand eligibility view (plan, schedule, hours since last
 *     done, whether the next cron tick would pick it up, and why
 *     not if it wouldn't)
 *
 * Designed to be hittable by curl from a laptop or from another
 * Claude session for root-cause analysis, without needing SSH into
 * DigitalOcean, direct DB access, or Sentry log queries.
 */
import { pool, ensureColumns } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { getPlanLimits } from '@/lib/constants';

// Keep these mirrors in sync with /api/cron/route.ts - the diagnostic
// view is only useful if it reports the exact thresholds the cron is
// using to skip brands.
const CRASH_BACKOFF_THRESHOLD =
  Number(process.env.CRON_CRASH_BACKOFF_THRESHOLD) || 3;
const CRASH_BACKOFF_BASE_MINUTES =
  Number(process.env.CRON_CRASH_BACKOFF_BASE_MINUTES) || 30;
const CRASH_BACKOFF_MAX_MINUTES =
  Number(process.env.CRON_CRASH_BACKOFF_MAX_MINUTES) || 24 * 60;

interface ActiveRunRow {
  id: string;
  brand_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error: string | null;
  received: number;
  total_expected: number;
  last_platform_attempted: string | null;
  last_query_attempted: string | null;
  last_attempt_at: string | null;
}

interface EligibleBrandRow {
  id: string;
  user_id: string;
  plan: string;
  crash_backoff_cleared_at: string | null;
  data: {
    schedule?: string | number;
    runs?: Array<{ time?: string; date?: string }>;
    platforms?: string[];
    queries?: string[];
  } | null;
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  // Make sure crash_backoff_cleared_at exists before we select it below.
  await ensureColumns();

  const envFlags = {
    QUEUE_MODE: process.env.QUEUE_MODE || 'never',
    REDIS_URL_set: !!process.env.REDIS_URL,
    CRON_SECRET_set: !!process.env.CRON_SECRET,
    APP_URL_set: !!process.env.APP_URL,
    CRON_INTERVAL_MINUTES: process.env.CRON_INTERVAL_MINUTES || '(default 60)',
    NODE_ENV: process.env.NODE_ENV || '(unset)',
  };

  let schedulerLock: { locked_at: string | null; instance_id: string | null } | null = null;
  try {
    const r = await pool.query(
      `SELECT locked_at, instance_id FROM cron_locks WHERE name = 'scheduler'`
    );
    if (r.rows.length) {
      schedulerLock = {
        locked_at: r.rows[0].locked_at,
        instance_id: r.rows[0].instance_id,
      };
    }
  } catch {
    // Table may not exist yet.
  }

  // Mirror /api/cron/route.ts STALE_RUN_MINUTES so the dashboard view
  // matches what the reconciler considers stuck. Override via the same
  // env var so they stay in sync.
  const staleMinutes = (() => {
    const raw = parseInt(process.env.CRON_RECONCILE_STALE_MINUTES || '', 10);
    return Number.isFinite(raw) && raw > 0 ? Math.min(60, raw) : 5;
  })();

  let recentActiveRuns: Array<ActiveRunRow & {
    running_for_seconds: number | null;
    is_stale: boolean;
  }> = [];
  try {
    const r = await pool.query<ActiveRunRow>(
      `SELECT id, brand_id, status, started_at, completed_at, error,
              received, total_expected,
              last_platform_attempted, last_query_attempted, last_attempt_at
       FROM active_runs
       ORDER BY started_at DESC
       LIMIT 20`
    );
    const nowMs = Date.now();
    recentActiveRuns = r.rows.map(row => {
      // For finished rows, "running_for_seconds" is just the wall-clock
      // duration of the run; for still-running rows, it's how long it
      // has been alive RIGHT NOW. is_stale is the actionable flag - the
      // next cron tick will reap any row where this is true.
      const startedMs = new Date(row.started_at).getTime();
      const endMs = row.completed_at ? new Date(row.completed_at).getTime() : nowMs;
      const elapsedSeconds = Math.max(0, Math.round((endMs - startedMs) / 1000));
      const isStale = row.status === 'running' && (nowMs - startedMs) > staleMinutes * 60_000;
      return { ...row, running_for_seconds: elapsedSeconds, is_stale: isStale };
    });
  } catch {
    // Table may not exist.
  }

  // Per-brand eligibility. Mirror the filter in /api/cron/route.ts so we
  // see exactly what the scheduler would see on its next tick.
  const paidPlans = ['starter', 'pro', 'agency', 'enterprise', 'owner'];
  const brandsResult = await pool.query<EligibleBrandRow>(
    `SELECT b.id, b.user_id, b.data, u.plan, b.crash_backoff_cleared_at
     FROM brands b
     JOIN users u ON u.id = b.user_id
     WHERE u.plan = ANY($1::text[])
     ORDER BY b.updated_at ASC
     LIMIT 100`,
    [paidPlans]
  );

  const brandIds = brandsResult.rows.map(r => r.id);
  const lastDoneMap: Record<string, string> = {};
  if (brandIds.length) {
    const r = await pool.query<{ brand_id: string; last_run: string }>(
      `SELECT brand_id, MAX(COALESCE(completed_at, started_at))::text AS last_run
       FROM active_runs
       WHERE brand_id = ANY($1) AND status = 'done'
       GROUP BY brand_id`,
      [brandIds]
    );
    for (const row of r.rows) lastDoneMap[row.brand_id] = row.last_run;
  }

  // Per-brand crash-backoff state (mirrors the cron's getBrandCrashInfo).
  // Error rows at or before crash_backoff_cleared_at are excluded so the
  // diagnostic reflects the effective streak the scheduler will see.
  interface CrashRow {
    brand_id: string;
    consecutive_errors: string | number | null;
    last_error_at: string | null;
    last_done_at: string | null;
  }
  const crashMap: Record<string, CrashRow> = {};
  if (brandIds.length) {
    try {
      const r = await pool.query<CrashRow>(
        `WITH reset AS (
          SELECT id, crash_backoff_cleared_at
          FROM brands
          WHERE id = ANY($1)
        ),
        ranked AS (
          SELECT
            ar.brand_id, ar.status, ar.started_at,
            ROW_NUMBER() OVER (PARTITION BY ar.brand_id ORDER BY ar.started_at DESC) AS rn
          FROM active_runs ar
          LEFT JOIN reset r ON r.id = ar.brand_id
          WHERE ar.brand_id = ANY($1)
            AND ar.status IN ('done', 'error')
            AND (r.crash_backoff_cleared_at IS NULL OR ar.started_at > r.crash_backoff_cleared_at)
        ),
        with_done_marker AS (
          SELECT
            brand_id, status, started_at, rn,
            SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)
              OVER (PARTITION BY brand_id ORDER BY rn) AS done_seen_after
          FROM ranked
        )
        SELECT
          brand_id,
          COUNT(*) FILTER (WHERE status = 'error' AND done_seen_after = 0) AS consecutive_errors,
          MAX(started_at) FILTER (WHERE status = 'error')::text AS last_error_at,
          MAX(started_at) FILTER (WHERE status = 'done')::text AS last_done_at
        FROM with_done_marker
        GROUP BY brand_id`,
        [brandIds]
      );
      for (const row of r.rows) crashMap[row.brand_id] = row;
    } catch {
      // Column may still be missing mid-migration; fall through with empty map.
    }
  }

  const now = Date.now();
  const eligibility = brandsResult.rows.map(row => {
    const scheduleRaw = row.data?.schedule;
    const scheduleHours = (scheduleRaw !== undefined && scheduleRaw !== null)
      ? (parseInt(String(scheduleRaw), 10) || 24)
      : 24;
    const limits = getPlanLimits(row.plan || 'free');
    const effectiveSchedule = Math.max(scheduleHours, limits.minScheduleHours);
    let lastDoneIso: string | null = lastDoneMap[row.id] || null;
    let lastRunSource: 'active_runs_done' | 'brand_data' | 'none' = lastDoneIso ? 'active_runs_done' : 'none';
    if (!lastDoneIso) {
      const runs = row.data?.runs || [];
      const last = runs[runs.length - 1];
      const stamp = last?.time ?? last?.date ?? null;
      if (stamp) {
        lastDoneIso = new Date(stamp).toISOString();
        lastRunSource = 'brand_data';
      }
    }
    const hoursSince = lastDoneIso
      ? (now - new Date(lastDoneIso).getTime()) / 3_600_000
      : null;
    // Crash-backoff state for this brand, derived from active_runs and
    // crash_backoff_cleared_at. Matches the formula in cron/route.ts.
    const crash = crashMap[row.id];
    const consecutiveErrors = Number(crash?.consecutive_errors || 0);
    const lastErrorAt = crash?.last_error_at ? new Date(crash.last_error_at) : null;
    let backoffMinutes = 0;
    let waitMinutesRemaining = 0;
    let inBackoff = false;
    if (consecutiveErrors >= CRASH_BACKOFF_THRESHOLD && lastErrorAt) {
      const overflow = consecutiveErrors - CRASH_BACKOFF_THRESHOLD;
      backoffMinutes = Math.min(
        CRASH_BACKOFF_MAX_MINUTES,
        CRASH_BACKOFF_BASE_MINUTES * Math.pow(2, Math.max(0, overflow)),
      );
      const elapsedMs = now - lastErrorAt.getTime();
      const waitMs = backoffMinutes * 60_000 - elapsedMs;
      if (waitMs > 0) {
        inBackoff = true;
        waitMinutesRemaining = Math.ceil(waitMs / 60_000);
      }
    }

    let eligible = false;
    let skipReason: string | null = null;
    if (!limits.scheduledRuns) {
      skipReason = 'plan_no_scheduled_runs';
    } else if (hoursSince !== null && hoursSince < effectiveSchedule) {
      skipReason = 'interval_not_elapsed';
    } else if (inBackoff) {
      skipReason = 'crash_backoff';
    } else {
      eligible = true;
    }
    // Per-brand platforms + query count: for fast config diffing when
    // one brand stalls at a different received= count than its peers.
    // If brand A stalls at 9 and brand B stalls at 6 under the same
    // query count, the set diff of `platforms` points directly at the
    // suspect adapter.
    const platforms = Array.isArray(row.data?.platforms)
      ? row.data!.platforms as string[]
      : null;
    const queryCount = Array.isArray(row.data?.queries)
      ? (row.data!.queries as unknown[]).length
      : null;
    return {
      brand_id: row.id,
      user_id: row.user_id,
      plan: row.plan,
      schedule_hours: scheduleHours,
      effective_schedule_hours: effectiveSchedule,
      platforms,
      query_count: queryCount,
      last_run_source: lastRunSource,
      last_done_at: lastDoneIso,
      hours_since_last_run: hoursSince !== null ? Number(hoursSince.toFixed(2)) : null,
      eligible,
      skip_reason: skipReason,
      crash_backoff: {
        consecutive_errors: consecutiveErrors,
        in_backoff: inBackoff,
        backoff_minutes: backoffMinutes,
        wait_minutes_remaining: waitMinutesRemaining,
        last_error_at: crash?.last_error_at || null,
        cleared_at: row.crash_backoff_cleared_at,
      },
    };
  });

  const summary = {
    paid_brands_total: brandsResult.rows.length,
    eligible_now: eligibility.filter(e => e.eligible).length,
    skipped_interval: eligibility.filter(e => e.skip_reason === 'interval_not_elapsed').length,
    skipped_plan: eligibility.filter(e => e.skip_reason === 'plan_no_scheduled_runs').length,
    skipped_crash_backoff: eligibility.filter(e => e.skip_reason === 'crash_backoff').length,
    never_run: eligibility.filter(e => e.last_run_source === 'none').length,
  };

  return Response.json({
    timestamp: new Date().toISOString(),
    env: envFlags,
    stale_threshold_minutes: staleMinutes,
    scheduler_lock: schedulerLock,
    recent_active_runs: recentActiveRuns,
    summary: {
      ...summary,
      stale_running_now: recentActiveRuns.filter(r => r.is_stale).length,
    },
    eligibility,
  });
}
