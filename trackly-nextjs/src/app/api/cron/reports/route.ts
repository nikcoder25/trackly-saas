import crypto from 'crypto';
import { pool } from '@/lib/db';
import { sendReportEmail, type ScheduledReportSummary } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Scheduled weekly / monthly report cron. Ported from the Express
// sendScheduledReports() helper that ran via node-cron on Monday 8am
// (weekly) and on the 1st of the month at 8am (monthly). In the Next.js
// deployment, a scheduler (Vercel Cron, DigitalOcean scheduled task, or
// our own instrumentation trigger) hits this endpoint with
// `Authorization: Bearer $CRON_SECRET` and `?frequency=weekly|monthly`.
//
//   Example vercel.json entries:
//     { "path": "/api/cron/reports?frequency=weekly",  "schedule": "0 8 * * 1" }
//     { "path": "/api/cron/reports?frequency=monthly", "schedule": "0 8 1 * *" }
export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const frequency = searchParams.get('frequency') || 'weekly';
  if (frequency !== 'weekly' && frequency !== 'monthly') {
    return Response.json({ error: "frequency must be 'weekly' or 'monthly'" }, { status: 400 });
  }

  const started = Date.now();
  let usersTargeted = 0;
  let emailsSent = 0;
  let emailsFailed = 0;

  try {
    const users = await pool.query(
      `SELECT id, email, settings FROM users WHERE settings->'reportSchedule'->>'frequency' = $1`,
      [frequency],
    );
    usersTargeted = users.rows.length;
    if (!usersTargeted) {
      return Response.json({ frequency, usersTargeted: 0, emailsSent: 0, emailsFailed: 0, ms: Date.now() - started });
    }

    for (const user of users.rows) {
      const reportSettings = user.settings?.reportSchedule || {};
      const brandFilter: string[] = Array.isArray(reportSettings.brandIds) ? reportSettings.brandIds : [];

      const brandsQuery = brandFilter.length
        ? await pool.query(
            'SELECT id, data FROM brands WHERE user_id = $1 AND id = ANY($2::text[])',
            [user.id, brandFilter],
          )
        : await pool.query('SELECT id, data FROM brands WHERE user_id = $1', [user.id]);

      for (const row of brandsQuery.rows) {
        interface BrandRun {
          sov?: number;
          date?: string;
          allResults?: Array<{ platform: string; mentioned: boolean }>;
        }
        const data = (row.data || {}) as { name?: string; runs?: BrandRun[] };
        const runs: BrandRun[] = data.runs || [];
        if (!runs.length) continue;

        const lastRun = runs[runs.length - 1];
        const totalMentions = runs.reduce(
          (sum, r) => sum + (r.allResults || []).filter(m => m.mentioned).length,
          0,
        );
        const avgSov = runs.length
          ? runs.reduce((sum, r) => sum + (r.sov || 0), 0) / runs.length
          : 0;
        const sovTrend = runs.length >= 2
          ? (runs[runs.length - 1].sov || 0) - (runs[runs.length - 2].sov || 0)
          : 0;

        const platformStats: Record<string, { total: number; mentioned: number }> = {};
        if (lastRun.allResults) {
          for (const r of lastRun.allResults) {
            if (!platformStats[r.platform]) platformStats[r.platform] = { total: 0, mentioned: 0 };
            platformStats[r.platform].total++;
            if (r.mentioned) platformStats[r.platform].mentioned++;
          }
        }

        const summary: ScheduledReportSummary = {
          totalRuns: runs.length,
          totalMentions,
          averageSov: parseFloat(avgSov.toFixed(1)),
          sovTrend,
          lastRunSov: lastRun.sov || 0,
          platformStats,
          period: { from: runs[0]?.date || null, to: lastRun.date || null },
        };

        try {
          const result = await sendReportEmail(user.email, data.name || 'Your brand', summary);
          if (result.sent) emailsSent++;
          else emailsFailed++;
        } catch (e) {
          emailsFailed++;
          console.error('[Cron/reports] sendReportEmail threw:', (e as Error).message, { userId: user.id, brand: data.name });
        }
      }

      // Persist lastSent so dashboards can show "last delivery at …" without
      // having to scan email logs.
      await pool.query(
        `UPDATE users SET settings = jsonb_set(settings, '{reportSchedule,lastSent}', $1::jsonb) WHERE id = $2`,
        [JSON.stringify(new Date().toISOString()), user.id],
      );
    }

    return Response.json({
      frequency,
      usersTargeted,
      emailsSent,
      emailsFailed,
      ms: Date.now() - started,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (process.env.NODE_ENV === 'production') {
      console.error('[Cron/reports] Fatal error:', msg);
    } else {
      console.error('[Cron/reports] Fatal error:', msg, (e as Error).stack);
    }
    return Response.json({ error: 'Report cron failed' }, { status: 500 });
  }
}
