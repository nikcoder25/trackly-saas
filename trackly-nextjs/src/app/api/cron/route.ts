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

  try {
    // Acquire advisory lock to prevent concurrent cron executions
    const lockResult = await pool.query('SELECT pg_try_advisory_lock(789012345) AS acquired');
    if (!lockResult.rows[0]?.acquired) {
      return Response.json({ skipped: true, reason: 'Another cron job is already running' });
    }

    try {
    // Find all brands — include those with schedule null (default to 24h)
    const result = await pool.query(`
      SELECT b.id, b.user_id, b.data, u.plan
      FROM brands b
      JOIN users u ON u.id = b.user_id
      ORDER BY b.updated_at ASC
      LIMIT 50
    `);

    // Filter eligible brands
    const eligible = result.rows.filter(row => {
      // Default schedule to 24h if null/missing/zero
      const scheduleHours = parseInt(row.data?.schedule, 10) || 24;
      const limits = getPlanLimits(row.plan || 'free');
      if (!limits.scheduledRuns) return false;
      // Use the greater of brand schedule or plan minimum
      const effectiveSchedule = Math.max(scheduleHours, limits.minScheduleHours);
      const runs = row.data?.runs || [];
      if (runs.length > 0) {
        const lastRun = runs[runs.length - 1];
        const lastRunTime = new Date(lastRun.time || lastRun.date).getTime();
        const hoursSince = (Date.now() - lastRunTime) / (1000 * 60 * 60);
        if (hoursSince < effectiveSchedule) return false;
      }
      return true;
    });

    const skipped = result.rows.length - eligible.length;

    // Process eligible brands in parallel (batches of 5 to avoid overwhelming)
    let processed = 0;
    const BATCH_SIZE = 5;
    for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
      const batch = eligible.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (row) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout per run trigger
          try {
            const runUrl = new URL(`/api/brands/${row.id}/run`, request.url);
            await fetch(runUrl.toString(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeout);
          }
        })
      );
      processed += results.filter(r => r.status === 'fulfilled').length;
      results.filter(r => r.status === 'rejected').forEach((r, idx) => {
        console.error(`[Cron] Failed brand ${batch[idx].id}:`, (r as PromiseRejectedResult).reason?.message);
      });
    }

    return Response.json({ processed, skipped, total: result.rows.length, timestamp: new Date().toISOString() });
    } finally {
      // Release advisory lock
      await pool.query('SELECT pg_advisory_unlock(789012345)').catch(() => {});
    }
  } catch (e) {
    console.error('[Cron]', (e as Error).message);
    await pool.query('SELECT pg_advisory_unlock(789012345)').catch(() => {});
    return Response.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
