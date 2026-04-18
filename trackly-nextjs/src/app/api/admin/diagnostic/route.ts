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
import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { getPlanLimits } from '@/lib/constants';

interface ActiveRunRow {
  id: string;
  brand_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error: string | null;
  received: number;
  total_expected: number;
}

interface EligibleBrandRow {
  id: string;
  user_id: string;
  plan: string;
  data: { schedule?: string | number; runs?: Array<{ time?: string; date?: string }> } | null;
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

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

  let recentActiveRuns: ActiveRunRow[] = [];
  try {
    const r = await pool.query<ActiveRunRow>(
      `SELECT id, brand_id, status, started_at, completed_at, error, received, total_expected
       FROM active_runs
       ORDER BY started_at DESC
       LIMIT 20`
    );
    recentActiveRuns = r.rows;
  } catch {
    // Table may not exist.
  }

  // Per-brand eligibility. Mirror the filter in /api/cron/route.ts so we
  // see exactly what the scheduler would see on its next tick.
  const paidPlans = ['starter', 'pro', 'agency', 'enterprise', 'owner'];
  const brandsResult = await pool.query<EligibleBrandRow>(
    `SELECT b.id, b.user_id, b.data, u.plan
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
    let eligible = false;
    let skipReason: string | null = null;
    if (!limits.scheduledRuns) {
      skipReason = 'plan_no_scheduled_runs';
    } else if (hoursSince !== null && hoursSince < effectiveSchedule) {
      skipReason = 'interval_not_elapsed';
    } else {
      eligible = true;
    }
    return {
      brand_id: row.id,
      user_id: row.user_id,
      plan: row.plan,
      schedule_hours: scheduleHours,
      effective_schedule_hours: effectiveSchedule,
      last_run_source: lastRunSource,
      last_done_at: lastDoneIso,
      hours_since_last_run: hoursSince !== null ? Number(hoursSince.toFixed(2)) : null,
      eligible,
      skip_reason: skipReason,
    };
  });

  const summary = {
    paid_brands_total: brandsResult.rows.length,
    eligible_now: eligibility.filter(e => e.eligible).length,
    skipped_interval: eligibility.filter(e => e.skip_reason === 'interval_not_elapsed').length,
    skipped_plan: eligibility.filter(e => e.skip_reason === 'plan_no_scheduled_runs').length,
    never_run: eligibility.filter(e => e.last_run_source === 'none').length,
  };

  return Response.json({
    timestamp: new Date().toISOString(),
    env: envFlags,
    scheduler_lock: schedulerLock,
    recent_active_runs: recentActiveRuns,
    summary,
    eligibility,
  });
}
