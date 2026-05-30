import crypto from 'crypto';
import { pool } from '@/lib/db';
import { acquireCronLock } from '@/lib/cron-lock';
import { logger } from '@/lib/logger';
import { sendReportEmail, type ScheduledReportSummary } from '@/lib/email';
import { runDueReportSchedules } from '@/lib/report-schedule';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Scheduled weekly / monthly report cron. Hit by GitHub Actions
// (.github/workflows/cron.yml) on Monday 8:00 UTC and on the 1st of the
// month at 8:00 UTC, with `Authorization: Bearer $CRON_SECRET` and
// `?frequency=weekly|monthly`. A cron_locks dedupe guards against
// workflow_dispatch + scheduled overlaps.
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

  // Dedupe concurrent triggers (GH Actions schedule, workflow_dispatch, and
  // the in-process instrumentation trigger can all fire together). Without
  // this a manual run kicked off while the scheduled run is mid-flight
  // would re-send every report. 15-minute stale window is well above
  // maxDuration and far below the weekly cadence.
  const lock = await acquireCronLock(`reports:${frequency}`, 15);
  if (!lock) {
    return Response.json({ skipped: true, reason: 'locked' });
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
      // Per-user counters so we only advance `lastSent` when this user's
      // reports actually went out. A full delivery outage would otherwise
      // advance the pointer and mask the failure - next week the cron
      // treats the missed run as done.
      let userSent = 0;
      let userFailed = 0;
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
          if (result.sent) { emailsSent++; userSent++; }
          else { emailsFailed++; userFailed++; }
        } catch (e) {
          emailsFailed++;
          userFailed++;
          logger.error('cron.reports.send_email_threw', {
            error: (e as Error).message,
            user_id: user.id,
            brand: data.name,
          });
        }
      }

      // Persist lastSent only when this user was either fully successful
      // or had nothing to send. If every delivery attempt failed, leave
      // the pointer so next tick retries instead of silently advancing.
      const allFailed = userSent === 0 && userFailed > 0;
      if (!allFailed) {
        await pool.query(
          `UPDATE users SET settings = jsonb_set(settings, '{reportSchedule,lastSent}', $1::jsonb) WHERE id = $2`,
          [JSON.stringify(new Date().toISOString()), user.id],
        );
      }
    }

    logger.info('cron.reports.summary', {
      frequency,
      users_targeted: usersTargeted,
      emails_sent: emailsSent,
      emails_failed: emailsFailed,
      ms: Date.now() - started,
    });

    // Auto-generate the standard PDF into report history for brands with a
    // matching auto-generate schedule (independent of the email schedule above).
    const autoReports = await runDueReportSchedules(frequency);

    return Response.json({
      frequency,
      usersTargeted,
      emailsSent,
      emailsFailed,
      autoReports,
      ms: Date.now() - started,
    });
  } catch (e) {
    const msg = (e as Error).message;
    const stack = process.env.NODE_ENV === 'production' ? undefined : (e as Error).stack;
    logger.error('cron.reports.fatal', { frequency, error: msg, stack });
    return Response.json({ error: 'Report cron failed' }, { status: 500 });
  } finally {
    await lock.release();
  }
}
