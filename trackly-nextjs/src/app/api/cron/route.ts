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

    // Fetch last run times from active_runs table (more reliable than brand
    // JSON data which may be stale if a previous run failed to save fully)
    const brandIds = result.rows.map((r: { id: string }) => r.id);
    const lastRunMap: Record<string, number> = {};
    if (brandIds.length > 0) {
      const runsResult = await pool.query(
        `SELECT brand_id, MAX(started_at) AS last_run
         FROM active_runs
         WHERE brand_id = ANY($1) AND status IN ('done', 'running')
         GROUP BY brand_id`,
        [brandIds]
      );
      for (const row of runsResult.rows) {
        lastRunMap[row.brand_id] = new Date(row.last_run).getTime();
      }
    }

    // Filter eligible brands
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eligible = result.rows.filter((row: any) => {
      const scheduleHours = parseInt(row.data?.schedule, 10) || 24;
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
          lastRunTime = new Date(lastRun.time || lastRun.date).getTime();
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        batch.map(async (row: any) => {
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

    return Response.json({
      processed, skipped, total: result.rows.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      timestamp: new Date().toISOString(),
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
