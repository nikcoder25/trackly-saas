/**
 * Cron endpoint for scheduled brand runs.
 * Call via: Vercel Cron, external cron service, or curl.
 * Secured by CRON_SECRET environment variable.
 *
 * Example Vercel cron config (vercel.json):
 * { "crons": [{ "path": "/api/cron", "schedule": "0 * * * *" }] }
 */
import crypto from 'crypto';
import { pool, safeConnect } from '@/lib/db';
import { getPlanLimits } from '@/lib/constants';

export const maxDuration = 300; // 5 minutes max for cron

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

  // Use a dedicated client so the advisory lock and unlock happen on the
  // same database connection.  Previously pool.query() was used, which could
  // acquire the lock on connection A, return it to the pool, then try to
  // unlock on connection B — leaving the lock permanently stuck.
  const client = await safeConnect();
  try {
    const lockResult = await client.query('SELECT pg_try_advisory_lock(789012345) AS acquired');
    if (!lockResult.rows[0]?.acquired) {
      client.release();
      return Response.json({ skipped: true, reason: 'Another cron job is already running' });
    }

    try {
      // Pre-filter: only fetch brands on paid plans that support scheduled runs.
      // This avoids wasting the LIMIT on free-plan brands which are always ineligible.
      const result = await client.query(`
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
        const runsResult = await client.query(
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
    } finally {
      // Release advisory lock on the SAME client that acquired it
      await client.query('SELECT pg_advisory_unlock(789012345)').catch(() => {});
    }
  } catch (e) {
    console.error('[Cron]', (e as Error).message);
    // Attempt to release the lock before releasing the client
    await client.query('SELECT pg_advisory_unlock(789012345)').catch(() => {});
    return Response.json({ error: 'Cron job failed' }, { status: 500 });
  } finally {
    client.release();
  }
}
