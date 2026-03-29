/**
 * Cron endpoint for scheduled brand runs.
 * Call via: Vercel Cron, external cron service, or curl.
 * Secured by CRON_SECRET environment variable.
 *
 * Example Vercel cron config (vercel.json):
 * { "crons": [{ "path": "/api/cron", "schedule": "0 * * * *" }] }
 */
import { pool } from '@/lib/db';
import { getPlanLimits } from '@/lib/constants';

export const maxDuration = 300; // 5 minutes max for cron

export async function GET(request: Request) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // Find brands with active schedules that are due
    const result = await pool.query(`
      SELECT b.id, b.user_id, b.data, u.plan
      FROM brands b
      JOIN users u ON u.id = b.user_id
      WHERE b.data->>'schedule' IS NOT NULL
        AND (b.data->>'schedule')::int > 0
      ORDER BY b.updated_at ASC
      LIMIT 50
    `);

    // Filter eligible brands
    const eligible = result.rows.filter(row => {
      const scheduleHours = parseInt(row.data?.schedule, 10);
      if (!scheduleHours || scheduleHours <= 0) return false;
      const limits = getPlanLimits(row.plan || 'free');
      if (!limits.scheduledRuns) return false;
      if (scheduleHours < limits.minScheduleHours) return false;
      const runs = row.data?.runs || [];
      if (runs.length > 0) {
        const lastRun = runs[runs.length - 1];
        const lastRunTime = new Date(lastRun.date).getTime();
        const hoursSince = (Date.now() - lastRunTime) / (1000 * 60 * 60);
        if (hoursSince < scheduleHours) return false;
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
          const runUrl = new URL(`/api/brands/${row.id}/run`, request.url);
          await fetch(runUrl.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
        })
      );
      processed += results.filter(r => r.status === 'fulfilled').length;
      results.filter(r => r.status === 'rejected').forEach((r, idx) => {
        console.error(`[Cron] Failed brand ${batch[idx].id}:`, (r as PromiseRejectedResult).reason?.message);
      });
    }

    return Response.json({ processed, skipped, total: result.rows.length, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error('[Cron]', (e as Error).message);
    return Response.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
