/**
 * Cron endpoint for scheduled brand runs.
 * Call via: Vercel Cron, external cron service, or curl.
 * Secured by CRON_SECRET environment variable.
 *
 * Example Vercel cron config (vercel.json):
 * { "crons": [{ "path": "/api/cron", "schedule": "0 * * * *" }] }
 */
import crypto from 'crypto';
import { pool } from '@/lib/db';
import { getPlanLimits } from '@/lib/constants';

export const maxDuration = 300; // 5 minutes max for cron

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

// Stagger between brand triggers - each brand waits brand_index * this many
// milliseconds so scheduled runs don't all hit providers at the same instant.
const BRAND_STAGGER_MS = 8000;

// Auto-create the cron_locks table on first call (cached in globalThis)
const g = globalThis as unknown as { _cronLocksReady?: boolean };
async function ensureCronLocksTable() {
  if (g._cronLocksReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cron_locks (
      name TEXT PRIMARY KEY,
      locked_at TIMESTAMPTZ,
      instance_id TEXT
    )
  `);
  g._cronLocksReady = true;
}

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
async function reconcileStaleActiveRuns(): Promise<{ count: number; brandIds: string[] }> {
  let columns: Set<string>;
  try {
    const colRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'active_runs'`
    );
    columns = new Set((colRes.rows as { column_name: string }[]).map(r => r.column_name));
  } catch {
    return { count: 0, brandIds: [] };
  }
  if (!columns.has('status') || !columns.has('started_at') || !columns.has('brand_id')) {
    return { count: 0, brandIds: [] };
  }

  const sets: string[] = [`status = 'error'`];
  if (columns.has('completed_at')) sets.push(`completed_at = NOW()`);
  else if (columns.has('finished_at')) sets.push(`finished_at = NOW()`);
  const errCol = columns.has('error_message') ? 'error_message'
    : columns.has('error') ? 'error'
    : null;
  if (errCol) {
    sets.push(`${errCol} = COALESCE(${errCol}, 'reconciled: stale running row (>30min)')`);
  }

  try {
    const res = await pool.query(
      `UPDATE active_runs SET ${sets.join(', ')}
       WHERE status = 'running' AND started_at < NOW() - INTERVAL '30 minutes'
       RETURNING brand_id`
    );
    const brandIds = Array.from(new Set((res.rows as { brand_id: string }[]).map(r => r.brand_id)));
    const count = res.rowCount || 0;
    if (count > 0) {
      console.log(`[Cron] Reconciled ${count} stale running rows for brands:`, brandIds);
    }
    return { count, brandIds };
  } catch (e) {
    console.warn('[Cron] reconcileStaleActiveRuns failed:', (e as Error).message);
    return { count: 0, brandIds: [] };
  }
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

  await ensureCronLocksTable();

  // Table-based lock with auto-expiry.  Replaces pg_try_advisory_lock which
  // was fundamentally broken with connection pooling: advisory locks are
  // session-scoped, so pool.query() could acquire the lock on connection A
  // and try to release on connection B, leaving the lock permanently stuck
  // and silently blocking ALL future cron executions.
  //
  // This table-based approach works correctly with any pooling setup:
  // - Fresh lock (<10 min old) blocks concurrent runs
  // - Stale lock (>10 min old) is auto-reclaimed
  // - Released lock (locked_at = NULL) is immediately reacquirable
  const instanceId = crypto.randomUUID();
  const lockResult = await pool.query(
    `INSERT INTO cron_locks (name, locked_at, instance_id)
     VALUES ('scheduler', NOW(), $1)
     ON CONFLICT (name) DO UPDATE
     SET locked_at = NOW(), instance_id = $1
     WHERE cron_locks.locked_at IS NULL
        OR cron_locks.locked_at < NOW() - INTERVAL '10 minutes'
     RETURNING name`,
    [instanceId]
  );

  if (lockResult.rows.length === 0) {
    return Response.json({ skipped: true, reason: 'Another cron job is already running' });
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
    const eligible = (result.rows as CronBrandRow[]).filter((row) => {
      const scheduleRaw = row.data?.schedule;
      const scheduleHours = (scheduleRaw !== undefined && scheduleRaw !== null)
        ? (parseInt(String(scheduleRaw), 10) || 24)
        : 24;
      const limits = getPlanLimits(row.plan || 'free');
      if (!limits.scheduledRuns) return false;
      // Use the greater of brand schedule or plan minimum
      const effectiveSchedule = Math.max(scheduleHours, limits.minScheduleHours);

      // Check last run time: prefer active_runs table, fall back to brand data
      let lastRunTime: number | null = lastRunMap[row.id] || null;
      if (!lastRunTime) {
        const runs = row.data?.runs || [];
        if (runs.length > 0) {
          const lastRun = runs[runs.length - 1];
          const stamp = lastRun.time ?? lastRun.date;
          if (stamp !== undefined && stamp !== null) {
            lastRunTime = new Date(stamp).getTime();
          }
        }
      }

      if (lastRunTime) {
        const hoursSince = (Date.now() - lastRunTime) / (1000 * 60 * 60);
        if (hoursSince < effectiveSchedule) return false;
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
            const resp = await fetch(runUrl.toString(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
              signal: controller.signal,
            });
            if (!resp.ok) {
              const body = await resp.text().catch(() => '');
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
          const reason = (results[j] as PromiseRejectedResult).reason?.message || 'Unknown error';
          errors.push(`${batch[j].id}: ${reason}`);
          console.error(`[Cron] Failed brand ${batch[j].id}:`, reason);
        }
      }
    }

    const total = result.rows.length;
    const timestamp = new Date().toISOString();
    console.log('[Cron] Summary:', JSON.stringify({
      processed, skipped, reconciled, total,
      errors_count: errors?.length || 0,
      timestamp,
    }));
    return Response.json({
      processed, skipped, reconciled, total,
      reconciledBrandIds: reconciled > 0 ? reconciledBrandIds : undefined,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      timestamp,
    });
  } catch (e) {
    console.error('[Cron]', (e as Error).message);
    return Response.json({ error: 'Cron job failed' }, { status: 500 });
  } finally {
    // Release lock - only the holder (matching instance_id) can release
    await pool.query(
      `UPDATE cron_locks SET locked_at = NULL WHERE name = 'scheduler' AND instance_id = $1`,
      [instanceId]
    ).catch(() => {});
  }
}
