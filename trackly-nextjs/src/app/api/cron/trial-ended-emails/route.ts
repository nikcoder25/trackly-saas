/**
 * Trial-ended email cron.
 *
 * GET /api/cron/trial-ended-emails
 * Auth: `Authorization: Bearer $CRON_SECRET`.
 *
 * Sends one transactional email per user whose trial just expired but
 * who hasn't logged back in to see the in-app TrialEndedBanner. Runs
 * daily at 02:15 UTC (15 minutes before /api/cron?mode=daily_floor so
 * the two don't lockstep on the scheduler lock).
 *
 * Idempotency:
 * - Cluster-level: acquireCronLock('trial_ended_emails', 10) dedupes
 *   overlapping invocations across deploys / GH Actions reruns.
 * - Row-level: the claim UPDATE stamps trial_end_email_sent_at = NOW()
 *   inside the same query that selects rows, so two concurrent workers
 *   can't both claim the same user. On Resend failure we null the
 *   stamp back so the next tick retries.
 *
 * Selection criteria:
 * - plan = 'trial'         (rawPlan; users who upgraded already have
 *                           plan = 'starter'/'pro'/etc.)
 * - trial_ends_at < NOW()  (trial actually expired)
 * - trial_ends_at > NOW() - INTERVAL '14 days'
 *                          (14-day staleness window: older trials are
 *                           cold leads handled by win-back, not this
 *                           transactional path. Also self-limits the
 *                           first-deploy backlog without a data
 *                           migration.)
 * - email_verified = TRUE  (skip unverified to protect deliverability;
 *                           those users see the dashboard banner +
 *                           verification nudge instead)
 * - trial_end_email_sent_at IS NULL  (haven't been emailed for this
 *                                     trial cycle yet)
 */
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { acquireCronLock } from '@/lib/cron-lock';
import { sendTrialEndedEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

export const maxDuration = 300;

const BATCH_LIMIT = 200;

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const ok = !!headerToken
    && headerToken.length === cronSecret.length
    && crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(cronSecret));
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lock = await acquireCronLock('trial_ended_emails', 10);
  if (!lock) {
    return NextResponse.json({ skipped: true, reason: 'locked' });
  }

  const start = Date.now();
  let claimed = 0;
  let sent = 0;
  let failed = 0;

  try {
    // Atomic claim: stamp + return in a single UPDATE so two workers
    // can't double-send. Inner SELECT ... FOR UPDATE SKIP LOCKED makes
    // the LIMIT well-defined under concurrency (UPDATE doesn't accept
    // LIMIT directly in Postgres).
    const claim = await pool.query<{ id: string; email: string }>(
      `UPDATE users
          SET trial_end_email_sent_at = NOW()
        WHERE id IN (
          SELECT id FROM users
           WHERE plan = 'trial'
             AND trial_ends_at < NOW()
             AND trial_ends_at > NOW() - INTERVAL '14 days'
             AND email_verified = TRUE
             AND trial_end_email_sent_at IS NULL
           ORDER BY trial_ends_at DESC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING id, email`,
      [BATCH_LIMIT],
    );
    claimed = claim.rows.length;

    for (const row of claim.rows) {
      try {
        const result = await sendTrialEndedEmail(row.email);
        if (result.sent) {
          sent++;
        } else {
          failed++;
          // Release the claim so the next tick can retry. A failure
          // here means Resend returned non-2xx (rate limit, transient
          // outage, invalid recipient). We log enough to investigate
          // but don't let one user's failure block the rest of the
          // batch.
          await pool.query(
            'UPDATE users SET trial_end_email_sent_at = NULL WHERE id = $1',
            [row.id],
          );
          logger.warn('cron.trial_ended_emails.send_failed', {
            user_id: row.id,
            reason: result.reason,
          });
        }
      } catch (e) {
        failed++;
        await pool.query(
          'UPDATE users SET trial_end_email_sent_at = NULL WHERE id = $1',
          [row.id],
        ).catch(() => { /* best effort - row stays stamped on rollback failure */ });
        logger.error('cron.trial_ended_emails.send_threw', {
          user_id: row.id,
          error: (e as Error).message,
        });
      }
    }

    const durationMs = Date.now() - start;
    logger.info('cron.trial_ended_emails.summary', {
      claimed, sent, failed, duration_ms: durationMs,
    });

    return NextResponse.json({
      ok: true,
      claimed, sent, failed,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    logger.error('cron.trial_ended_emails.fatal', {
      error: (e as Error).message,
      claimed, sent, failed,
    });
    return NextResponse.json(
      { ok: false, error: (e as Error).message, claimed, sent, failed },
      { status: 500 },
    );
  } finally {
    await lock.release();
  }
}
