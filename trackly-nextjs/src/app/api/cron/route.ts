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
      // Push schedule-eligibility into SQL so the LIMIT only counts brands
      // that are actually due for a run.  Previously, LIMIT 100 was applied
      // *before* JS filtering, so ineligible brands with old updated_at
      // values permanently consumed slots and starved eligible brands further
      // down the table.
      //
      // Cursor-based pagination ensures we can process more than one page of
      // eligible brands per cron invocation without skipping or duplicating.
      const PAGE_SIZE = 50;
      const BATCH_SIZE = 5;
      const MAX_WALL_MS = 240_000; // stop dispatching new batches after 4 min
      const cronStart = Date.now();
      let processed = 0;
      let skipped = 0;
      let totalFetched = 0;
      const errors: string[] = [];

      let cursorUpdatedAt: string | null = null;
      let cursorId: string | null = null;

      pageLoop: while (true) {
        if (Date.now() - cronStart > MAX_WALL_MS) break;

        const params: (string | number)[] = [PAGE_SIZE];
        let cursorClause = '';
        if (cursorUpdatedAt !== null && cursorId !== null) {
          cursorClause = 'AND (b.updated_at, b.id) > ($2, $3)';
          params.push(cursorUpdatedAt, cursorId);
        }

        const result = await client.query(`
          WITH last_runs AS (
            SELECT brand_id, MAX(started_at) AS last_run
            FROM active_runs
            WHERE status IN ('done', 'running')
              AND started_at > NOW() - INTERVAL '30 days'
            GROUP BY brand_id
          )
          SELECT b.id, b.user_id, b.data, u.plan, b.updated_at, lr.last_run
          FROM brands b
          JOIN users u ON u.id = b.user_id
          LEFT JOIN last_runs lr ON lr.brand_id = b.id
          WHERE u.plan IN ('starter', 'pro', 'agency', 'enterprise', 'owner')
            AND (
              lr.last_run IS NULL
              OR EXTRACT(EPOCH FROM (NOW() - lr.last_run)) / 3600 >= GREATEST(
                COALESCE(
                  CASE WHEN b.data->>'schedule' ~ '^[0-9]+$'
                       THEN (b.data->>'schedule')::int
                       ELSE NULL END,
                  24
                ),
                CASE u.plan
                  WHEN 'starter' THEN 72
                  WHEN 'pro' THEN 24
                  WHEN 'agency' THEN 12
                  WHEN 'enterprise' THEN 6
                  WHEN 'owner' THEN 24
                  ELSE 999
                END
              )
            )
            ${cursorClause}
          ORDER BY b.updated_at ASC, b.id ASC
          LIMIT $1
        `, params);

        if (result.rows.length === 0) break;
        totalFetched += result.rows.length;

        // Update cursor for next page
        const lastRow = result.rows[result.rows.length - 1];
        cursorUpdatedAt = lastRow.updated_at;
        cursorId = lastRow.id;

        // Secondary filter: for brands where lr.last_run IS NULL (no
        // active_runs entry), fall back to checking the JSON data.runs array.
        // Brands with a non-null last_run already passed the SQL timing check.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const eligible = result.rows.filter((row: any) => {
          if (row.last_run !== null) return true;

          const runs = row.data?.runs || [];
          if (runs.length === 0) return true;

          const scheduleHours = parseInt(row.data?.schedule, 10) || 24;
          const limits = getPlanLimits(row.plan || 'free');
          const effectiveSchedule = Math.max(scheduleHours, limits.minScheduleHours);

          const lastRun = runs[runs.length - 1];
          const lastRunTime = new Date(lastRun.time || lastRun.date).getTime();
          const hoursSince = (Date.now() - lastRunTime) / (1000 * 60 * 60);
          return hoursSince >= effectiveSchedule;
        });

        skipped += result.rows.length - eligible.length;

        // Process eligible brands in parallel (batches of 5 to avoid overwhelming)
        for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
          if (Date.now() - cronStart > MAX_WALL_MS) break pageLoop;

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

        if (result.rows.length < PAGE_SIZE) break;
      }

      return Response.json({
        processed, skipped, total: totalFetched,
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
