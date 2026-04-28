/**
 * Cron endpoint for scheduled brand runs. Called every hour by GitHub
 * Actions (.github/workflows/cron.yml) and also by the in-process
 * instrumentation trigger in src/instrumentation.ts. Authorized via the
 * `Authorization: Bearer $CRON_SECRET` header; cron_locks dedupes
 * concurrent triggers so running both schedulers is safe.
 */
import crypto from 'crypto';
import { pool } from '@/lib/db';
import { acquireCronLock } from '@/lib/cron-lock';
import { getPlanLimits } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { reconcileStaleRuns, getStaleRunMinutes } from '@/lib/run-reconciler';
import { recordDispatchOutcome } from '@/lib/cron-dispatch-alert';
import { resolveLastRunTime } from '@/lib/cron-eligibility';

export const maxDuration = 300; // 5 minutes max for cron

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

// Stagger between brand triggers - each brand waits brand_index * this many
// milliseconds so scheduled runs don't all hit providers at the same instant.
const BRAND_STAGGER_MS = 8000;

/**
 * Mark any `active_runs` rows that have been stuck in 'running' for more
 * than 30 minutes as 'error'. Without this, a scan that crashed before its
 * terminal status update (OOM, SIGKILL, function timeout) leaves a row in
 * 'running' forever, which poisons downstream scheduling and /run-lock
 * logic across every brand, not just the one that crashed.
 *
 * Column names vary across deploys: the canonical schema (defined in
 * /api/brands/[id]/run) uses `completed_at` + `error`, but a legacy
 * deployment may instead use `finished_at` + `error_message`. We
 * introspect information_schema and build the UPDATE to match whatever
 * columns are actually present, so this function never fails just
 * because a column name differs.
 */
// How long a 'running' row may persist before we treat it as stale.
// The shared watchdog in @/lib/run-reconciler reads this via
// getStaleRunMinutes(); kept as a local alias so the cron summary logs
// the same threshold value the reconciler used.
const STALE_RUN_MINUTES = getStaleRunMinutes();

// In-process tracker for cron pile-up detection. When reconciled >= processed
// for two ticks in a row, the scheduler is picking up brands that crash
// before writing a 'done' row - the exact signature of the Apr 2026 "Last
// Run frozen" incident. Emit a loud error once per alert so Sentry pages
// ops instead of the failure mode going silent for days.
const g = globalThis as unknown as {
  _cronPileupStreak?: number;
  _cronPileupAlerted?: boolean;
};

// Per-brand crash backoff: after CRASH_BACKOFF_THRESHOLD consecutive runs
// that end in 'error' (no 'done' in between), skip the brand for an
// exponentially-growing window so a permanently-broken brand doesn't
// burn API budget on every tick.
const CRASH_BACKOFF_THRESHOLD =
  Number(process.env.CRON_CRASH_BACKOFF_THRESHOLD) || 3;
const CRASH_BACKOFF_BASE_MINUTES =
  Number(process.env.CRON_CRASH_BACKOFF_BASE_MINUTES) || 30;
const CRASH_BACKOFF_MAX_MINUTES =
  Number(process.env.CRON_CRASH_BACKOFF_MAX_MINUTES) || 24 * 60;

interface BrandCrashInfo {
  consecutiveErrors: number;
  lastErrorAt: Date | null;
  lastDoneAt: Date | null;
}

async function getBrandCrashInfo(brandIds: string[]): Promise<Map<string, BrandCrashInfo>> {
  const info = new Map<string, BrandCrashInfo>();
  if (!brandIds.length) return info;
  try {
    // For each brand, count the consecutive 'error' rows in active_runs
    // since the most recent 'done' row (or since inception if never done).
    // Uses a single query with a window to keep cron tick fast.
    const res = await pool.query(
      `WITH ranked AS (
        SELECT
          brand_id,
          status,
          started_at,
          ROW_NUMBER() OVER (PARTITION BY brand_id ORDER BY started_at DESC) AS rn
        FROM active_runs
        WHERE brand_id = ANY($1)
          AND status IN ('done', 'error')
      ),
      with_done_marker AS (
        SELECT
          brand_id,
          status,
          started_at,
          rn,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)
            OVER (PARTITION BY brand_id ORDER BY rn) AS done_seen_after
        FROM ranked
      )
      SELECT
        brand_id,
        COUNT(*) FILTER (WHERE status = 'error' AND done_seen_after = 0) AS consecutive_errors,
        MAX(started_at) FILTER (WHERE status = 'error') AS last_error_at,
        MAX(started_at) FILTER (WHERE status = 'done') AS last_done_at
      FROM with_done_marker
      GROUP BY brand_id`,
      [brandIds],
    );
    for (const row of res.rows as Array<{
      brand_id: string;
      consecutive_errors: string | number | null;
      last_error_at: string | Date | null;
      last_done_at: string | Date | null;
    }>) {
      info.set(row.brand_id, {
        consecutiveErrors: Number(row.consecutive_errors || 0),
        lastErrorAt: row.last_error_at ? new Date(row.last_error_at) : null,
        lastDoneAt: row.last_done_at ? new Date(row.last_done_at) : null,
      });
    }
  } catch (e) {
    logger.warn('cron.crash_backoff_lookup_failed', { error: (e as Error).message });
  }
  return info;
}

// Given the brand's consecutive-error count and last error time, decide
// whether the brand is currently in a crash-backoff window.
function inCrashBackoff(info: BrandCrashInfo | undefined): { backoff: true; waitMs: number; minutes: number } | { backoff: false } {
  if (!info || info.consecutiveErrors < CRASH_BACKOFF_THRESHOLD || !info.lastErrorAt) {
    return { backoff: false };
  }
  const overflow = info.consecutiveErrors - CRASH_BACKOFF_THRESHOLD;
  const minutes = Math.min(
    CRASH_BACKOFF_MAX_MINUTES,
    CRASH_BACKOFF_BASE_MINUTES * Math.pow(2, Math.max(0, overflow)),
  );
  const elapsedMs = Date.now() - info.lastErrorAt.getTime();
  const waitMs = minutes * 60 * 1000 - elapsedMs;
  return waitMs > 0
    ? { backoff: true, waitMs, minutes }
    : { backoff: false };
}

async function reconcileStaleActiveRuns(): Promise<{ count: number; brandIds: string[] }> {
  // Delegates to the shared watchdog which, beyond flipping the
  // active_runs row to 'error', also appends a minimal entry to
  // brands.data.runs. Appending is the piece the previous cron-only
  // reconciler was missing: without it, a stuck run left the dashboard
  // "Last Run" frozen even after the active_runs row was reaped,
  // because the dashboard reads brands.data.runs[last].time.
  const { count, brandIds } = await reconcileStaleRuns({
    reason: `reconciled: stale running row (>${STALE_RUN_MINUTES}min)`,
  });
  if (count > 0) {
    logger.info('cron.reconciled_stale_runs', {
      count, threshold_minutes: STALE_RUN_MINUTES, brand_ids: brandIds,
    });
  }
  return { count, brandIds };
}

export async function GET(request: Request) {
  // Verify cron secret (required)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token || token.length !== cronSecret.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(cronSecret))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // `mode=daily_floor` is called once per UTC day by the workflow's daily
  // schedule. It runs under a separate lock so the hourly tick can't starve
  // it, and it ignores the per-brand interval gate so any brand that missed
  // its 24h slot (e.g. off-by-a-few-minutes drift) still runs at least once
  // per day.
  const url = new URL(request.url);
  const isDailyFloor = url.searchParams.get('mode') === 'daily_floor';
  const mode: 'hourly' | 'daily_floor' = isDailyFloor ? 'daily_floor' : 'hourly';

  // Dedupe overlapping triggers (GH Actions schedule + workflow_dispatch
  // + in-process instrumentation all hit this endpoint). Redis-backed when
  // REDIS_URL is set, with a Postgres fallback table so this never 500s
  // if Redis is briefly unreachable. Daily floor uses its own lock name so
  // the hourly scheduler can't block it.
  const lockName = isDailyFloor ? 'scheduler_daily' : 'scheduler';
  const lockTtlMinutes = isDailyFloor ? 15 : 10;
  const lock = await acquireCronLock(lockName, lockTtlMinutes);
  if (!lock) {
    logger.warn('cron.locked_skip', { mode });
    // Emit a summary line even on the locked path so every invocation
    // produces exactly one cron.summary log, which makes absence of the
    // line unambiguously signal a crashed/hung handler.
    logger.info('cron.summary', {
      mode,
      processed: 0,
      skipped: 0,
      reconciled: 0,
      total: 0,
      reason: 'locked',
      timestamp: new Date().toISOString(),
    });
    return Response.json({ skipped: true, reason: 'locked', mode });
  }

  try {
    // Reap stale 'running' rows BEFORE computing eligibility. Any row
    // stuck here would otherwise make its brand look "recently run"
    // forever, silently suppressing scheduled runs - not just for one
    // brand, but any customer whose scan has ever crashed mid-flight.
    const { count: reconciled, brandIds: reconciledBrandIds } =
      await reconcileStaleActiveRuns();

    // Pre-filter: only fetch brands on paid plans that support scheduled runs.
    // This avoids wasting the LIMIT on free-plan brands which are always ineligible.
    const result = await pool.query(`
      SELECT b.id, b.user_id, b.data, u.plan
      FROM brands b
      JOIN users u ON u.id = b.user_id
      WHERE u.plan IN ('starter', 'pro', 'agency', 'enterprise', 'owner')
      ORDER BY b.updated_at ASC
      LIMIT 100
    `);

    // Fetch last successful run times from active_runs (more reliable than
    // brand JSON data which may be stale if a previous run failed to save).
    // Only 'done' runs count toward scheduling: a 'running' row left behind
    // by a crashed/timed-out scan never transitions to a terminal state
    // (there is no stale-state reaper), so including it here would make
    // MAX(started_at) permanently "recent" and silently block every future
    // scheduled run for that brand. Dedupe of truly-in-flight scans is
    // handled by the 10-minute lock in /api/brands/[id]/run.
    const brandIds = result.rows.map((r: { id: string }) => r.id);
    const lastRunMap: Record<string, number> = {};
    if (brandIds.length > 0) {
      const runsResult = await pool.query(
        `SELECT brand_id, MAX(COALESCE(completed_at, started_at)) AS last_run
         FROM active_runs
         WHERE brand_id = ANY($1) AND status = 'done'
         GROUP BY brand_id`,
        [brandIds]
      );
      for (const row of runsResult.rows) {
        lastRunMap[row.brand_id] = new Date(row.last_run).getTime();
      }
    }

    // Filter eligible brands
    interface CronBrandRow {
      id: string;
      plan?: string;
      data?: {
        schedule?: string | number;
        runs?: Array<{ time?: string | number | Date; date?: string | number | Date }>;
      };
    }
    // Structured skip reasons. Each skipped brand emits one log line so
    // operators can diagnose why a brand didn't run without having to
    // re-derive the filter state from database snapshots.
    type SkipReason =
      | 'plan_no_scheduled_runs'
      | 'interval_not_elapsed'
      | 'crash_backoff'
      | 'no_credits';
    const skipCounts: Record<SkipReason, number> = {
      plan_no_scheduled_runs: 0,
      interval_not_elapsed: 0,
      crash_backoff: 0,
      no_credits: 0,
    };
    const logSkip = (reason: SkipReason, details: Record<string, unknown>) => {
      skipCounts[reason]++;
      logger.info('cron.skip', { reason, ...details });
    };

    const crashInfo = await getBrandCrashInfo(brandIds);

    const eligible = (result.rows as CronBrandRow[]).filter((row) => {
      const scheduleRaw = row.data?.schedule;
      const scheduleHours = (scheduleRaw !== undefined && scheduleRaw !== null)
        ? (parseInt(String(scheduleRaw), 10) || 24)
        : 24;
      const plan = row.plan || 'free';
      const limits = getPlanLimits(plan);
      if (!limits.scheduledRuns) {
        logSkip('plan_no_scheduled_runs', { brand_id: row.id, plan });
        return false;
      }
      // Use the greater of brand schedule or plan minimum
      const effectiveSchedule = Math.max(scheduleHours, limits.minScheduleHours);

      // Check last run time: prefer active_runs table, fall back to brand
      // data BUT skipping watchdog-reap entries. The reaper stamps a
      // brand.data.runs entry with `time: nowIso` when finalizing a stuck
      // row; pre-PR-C-2 that timestamp got picked up here as "the brand
      // just ran", blocking the brand for the full effectiveSchedule
      // window (typically 24-48h) even though the run actually crashed.
      // resolveLastRunTime() walks past those reaper entries so the
      // scheduler either finds an older legitimate success in the JSONB
      // history or treats the brand as never-run (eligible).
      const resolvedLastRun = resolveLastRunTime(
        lastRunMap[row.id] || null,
        row.data?.runs as Parameters<typeof resolveLastRunTime>[1],
      );
      const lastRunTime = resolvedLastRun.lastRunTime;
      const lastRunSource = resolvedLastRun.lastRunSource;

      if (lastRunTime) {
        const hoursSince = (Date.now() - lastRunTime) / (1000 * 60 * 60);
        // Daily floor ignores the interval gate entirely - it's the
        // "run at least once per day" safety net.
        if (isDailyFloor) return true;
        // 5 minutes of tolerance so a run that completed at 10:01:42
        // doesn't have to wait until 10:02 the next day to requalify. The
        // previous exact-inequality check was the main cause of the
        // compounding multi-day skip: a 59-minute drift on the in-process
        // self-trigger was enough to push `hoursSince` just below the
        // threshold every tick.
        const toleranceHours = 5 / 60;
        if (hoursSince < effectiveSchedule - toleranceHours) {
          logSkip('interval_not_elapsed', {
            brand_id: row.id,
            plan,
            schedule_hours: scheduleHours,
            effective_schedule_hours: effectiveSchedule,
            hours_since_last_run: Number(hoursSince.toFixed(2)),
            last_run_source: lastRunSource,
            last_run_at: new Date(lastRunTime).toISOString(),
          });
          return false;
        }
      }

      // Crash-backoff gate: if this brand's recent history is all errors
      // (no 'done' mixed in), it's stuck on something the hourly retry
      // can't fix - a 24h-saturated API quota, a misconfigured key, a
      // query the provider is refusing. Stop burning budget on it and
      // back off exponentially. A single successful run resets the
      // counter.
      const backoffCheck = inCrashBackoff(crashInfo.get(row.id));
      if (backoffCheck.backoff) {
        logSkip('crash_backoff', {
          brand_id: row.id,
          plan,
          consecutive_errors: crashInfo.get(row.id)?.consecutiveErrors,
          backoff_minutes: backoffCheck.minutes,
          wait_minutes_remaining: Math.ceil(backoffCheck.waitMs / 60000),
          last_error_at: crashInfo.get(row.id)?.lastErrorAt?.toISOString(),
          last_done_at: crashInfo.get(row.id)?.lastDoneAt?.toISOString() || null,
        });
        return false;
      }
      return true;
    });

    const skipped = result.rows.length - eligible.length;

    // Process eligible brands in parallel (batches of 5 to avoid overwhelming)
    let processed = 0;
    const errors: string[] = [];
    const BATCH_SIZE = 5;
    for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
      const batch = eligible.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (row, batchIdx: number) => {
          const brandIndex = i + batchIdx;
          // Stagger per-brand launches so we don't burst fetches simultaneously
          if (brandIndex > 0) await sleep(brandIndex * BRAND_STAGGER_MS);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 120000); // 120s timeout per run trigger
          try {
            const baseUrl = process.env.APP_URL || request.url;
            const runUrl = new URL(`/api/brands/${row.id}/run`, baseUrl);
            // Send an explicit Origin matching the deployed app so the edge
            // middleware's same-origin check accepts this internal dispatch
            // even if the x-cron-secret bypass is later tightened or
            // removed. Defence in depth — the Apr 2026 outage happened
            // precisely because Node-side fetch sends no Origin and the
            // middleware refused the request before any auth ran.
            const dispatchOrigin = new URL(baseUrl).origin;
            const resp = await fetch(runUrl.toString(), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-cron-secret': cronSecret,
                'Origin': dispatchOrigin,
              },
              signal: controller.signal,
            });
            if (!resp.ok) {
              const body = await resp.text().catch(() => '');
              // Credit-exhaustion (HTTP 402) and daily-cap (HTTP 429
              // with credits.* code) are user-action-required, not
              // cron failures. The /run handler has already emitted a
              // de-duped notification email, so we just record a
              // structured skip and don't surface as an error in the
              // cron summary (which would page ops). The signature
              // ('credits.' string in the body) is stable across
              // future fields we may add to the 402 payload.
              if (body.includes('credits.monthly_exhausted') ||
                  body.includes('credits.daily_cap_reached') ||
                  body.includes('credits.plan_disallows_auto')) {
                throw Object.assign(new Error('credit_blocked'), {
                  creditBlocked: true,
                  detail: body.slice(0, 200),
                });
              }
              throw new Error(`HTTP ${resp.status}: ${body.slice(0, 200)}`);
            }
          } finally {
            clearTimeout(timeout);
          }
        })
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'fulfilled') {
          processed++;
        } else {
          const rejection = (results[j] as PromiseRejectedResult).reason as
            | (Error & { creditBlocked?: boolean; detail?: string })
            | undefined;
          const reason = rejection?.message || 'Unknown error';
          if (rejection?.creditBlocked) {
            // Skip, don't error: the /run handler already notified
            // the owner via email and there's no operational fix
            // until they upgrade or the month rolls over.
            skipCounts.no_credits++;
            logger.info('cron.skip', {
              reason: 'no_credits',
              brand_id: batch[j].id,
              detail: rejection.detail,
            });
            continue;
          }
          errors.push(`${batch[j].id}: ${reason}`);
          logger.error('cron.brand_failed', { brand_id: batch[j].id, error: reason });
        }
      }
    }

    const total = result.rows.length;
    const timestamp = new Date().toISOString();
    // Merge the per-eligibility skip_reasons with stale_reconciled so a
    // single number tells us how many runs were unjammed by the reconciler
    // this tick.
    const skipReasonsWithStale = { ...skipCounts, stale_reconciled: reconciled };
    logger.info('cron.summary', {
      mode,
      processed, skipped, reconciled, total,
      skip_reasons: skipReasonsWithStale,
      errors_count: errors?.length || 0,
      timestamp,
    });

    // Silent-outage alert: if we had eligible brands but every dispatch
    // came back failed, that's the Apr 2026 signature. Streak gates so a
    // single transient blip doesn't page; two consecutive ticks fires
    // console.error('cron.dispatch_all_failed') and resets.
    recordDispatchOutcome({
      eligible: eligible.length,
      processed,
      errors,
      tick: timestamp,
    });

    // Pile-up alert: reconciled>=processed means every brand we tried to
    // run crashed before writing 'done' (the reconciler then flipped their
    // 'running' row to 'error'). Two ticks of this in a row is the exact
    // signature of the Apr 2026 "Last Run frozen" incident, which stayed
    // silent for 3 days because nothing paged on it. Fire a loud
    // logger.error once per alert so Sentry / PagerDuty notice.
    if (processed > 0 && reconciled >= processed) {
      g._cronPileupStreak = (g._cronPileupStreak || 0) + 1;
      if (g._cronPileupStreak >= 2 && !g._cronPileupAlerted) {
        g._cronPileupAlerted = true;
        logger.error('cron.pileup_detected', {
          streak: g._cronPileupStreak,
          processed, reconciled, total,
          reconciled_brand_ids: reconciledBrandIds.slice(0, 20),
          hint: 'Every triggered run is crashing before terminal status. Check provider quotas (Gemini/OpenAI/Anthropic) and runtime logs for 429 cascades.',
          timestamp,
        });
      }
    } else {
      if (g._cronPileupAlerted) {
        logger.info('cron.pileup_resolved', {
          prior_streak: g._cronPileupStreak,
          timestamp,
        });
      }
      g._cronPileupStreak = 0;
      g._cronPileupAlerted = false;
    }
    return Response.json({
      mode,
      processed, skipped, reconciled, total,
      skipReasons: skipReasonsWithStale,
      reconciledBrandIds: reconciled > 0 ? reconciledBrandIds : undefined,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      timestamp,
    });
  } catch (e) {
    logger.error('cron.fatal', { mode, error: (e as Error).message });
    // Match the locked path: every invocation emits exactly one summary
    // line, so absence of cron.summary always means a crashed handler.
    logger.info('cron.summary', {
      mode,
      processed: 0,
      skipped: 0,
      reconciled: 0,
      total: 0,
      reason: 'fatal',
      timestamp: new Date().toISOString(),
    });
    return Response.json({ error: 'Cron job failed' }, { status: 500 });
  } finally {
    // Release lock - compare-and-delete on the Redis path so a stale holder
    // cannot delete a newer owner's lock. Postgres fallback matches on
    // instance_id for the same reason.
    await lock.release();
  }
}
