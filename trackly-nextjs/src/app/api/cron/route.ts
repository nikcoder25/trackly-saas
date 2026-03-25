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
      LIMIT 10
    `);

    let processed = 0;
    let skipped = 0;

    for (const row of result.rows) {
      const scheduleHours = parseInt(row.data?.schedule, 10);
      if (!scheduleHours || scheduleHours <= 0) { skipped++; continue; }

      const limits = getPlanLimits(row.plan || 'free');
      if (!limits.scheduledRuns) { skipped++; continue; }
      if (scheduleHours < limits.minScheduleHours) { skipped++; continue; }

      // Check if enough time has passed since last run
      const runs = row.data?.runs || [];
      if (runs.length > 0) {
        const lastRun = runs[runs.length - 1];
        const lastRunTime = new Date(lastRun.date).getTime();
        const hoursSince = (Date.now() - lastRunTime) / (1000 * 60 * 60);
        if (hoursSince < scheduleHours) { skipped++; continue; }
      }

      // Trigger run via internal API
      try {
        const runUrl = new URL(`/api/brands/${row.id}/run`, request.url);
        await fetch(runUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        processed++;
      } catch (e) {
        console.error(`[Cron] Failed to run brand ${row.id}:`, (e as Error).message);
      }
    }

    return Response.json({ processed, skipped, total: result.rows.length, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error('[Cron]', (e as Error).message);
    return Response.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
