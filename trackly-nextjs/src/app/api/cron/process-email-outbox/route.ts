import { pool, safeConnect, auditLog } from '@/lib/db';
import { acquireCronLock } from '@/lib/cron-lock';
import { logger } from '@/lib/logger';
import { deliverEmailViaProvider } from '@/lib/email';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Email Outbox Cron Worker
 *
 * Audit item D — durable email delivery. Runs every ~2 minutes from
 * GitHub Actions, picks up pending and failed rows from email_outbox,
 * and dispatches them to the email provider (Resend/SendGrid).
 *
 * Authorize with `Authorization: Bearer $CRON_SECRET`.
 *
 * Per-tick flow:
 *
 *   1. Reaper: stuck-sending recovery. Any row in status='sending' with
 *      updated_at older than 5 minutes is flipped back to 'failed'.
 *      Worker crashes mid-fetch leave such rows; without this, they
 *      would never be retried because the pickup query only looks at
 *      'pending' and 'failed'.
 *
 *   2. Claim. SELECT … FOR UPDATE SKIP LOCKED inside a short tx, then
 *      UPDATE status='sending' and increment attempts. COMMIT releases
 *      the row lock. Holding the lock through the network call would
 *      block other workers and stall the connection pool.
 *
 *   3. Send. For each claimed row, deliverEmailViaProvider() outside
 *      the claim tx. Categorise the response and update the row to
 *      'sent' / 'failed' / 'dead'.
 *
 *      - 2xx                       -> 'sent', sent_at = now()
 *      - 429 / 5xx / network throw -> 'failed' if attempts < max,
 *                                     next_attempt_at = now() + backoff
 *                                     'dead' if attempts >= max
 *      - any other 4xx             -> 'dead' immediately, audit row
 */

// Backoff schedule (1m, 5m, 15m, 1h, 6h). Index = attempts after this
// delivery (so the first failed attempt waits BACKOFF_MS[0]=1m).
const BACKOFF_MS = [
  60_000,
  300_000,
  900_000,
  3_600_000,
  21_600_000,
];

const CLAIM_BATCH = 50;
const STUCK_SENDING_TIMEOUT_MS = 5 * 60_000;

interface OutboxRow {
  id: string;
  to_email: string;
  subject: string;
  body_html: string;
  reply_to: string | null;
  template_key: string;
  attempts: number;
  max_attempts: number;
}

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization') || '';
    const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const { searchParams } = new URL(request.url);
    const queryToken = searchParams.get('secret') || '';
    const candidate = headerToken || queryToken;

    const ok = !!candidate
      && candidate.length === cronSecret.length
      && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(cronSecret));
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 5 min stale window matches the stuck-sending reaper. If a worker
    // dies mid-tick, the next tick's reaper recovers stranded rows and
    // the cron lock releases naturally.
    const lock = await acquireCronLock('process-email-outbox', 5);
    if (!lock) {
      return NextResponse.json({ skipped: true, reason: 'locked' });
    }

    try {
      // (1) Reaper: flip stuck-sending rows back to failed so the
      // pickup query can see them again. last_error captures the
      // recovery so support has a paper trail.
      const reaped = await pool.query(
        `UPDATE email_outbox
           SET status = 'failed',
               last_error = 'worker crashed mid-send',
               updated_at = NOW()
         WHERE status = 'sending'
           AND updated_at < NOW() - $1::interval
         RETURNING id`,
        [`${STUCK_SENDING_TIMEOUT_MS} milliseconds`],
      );
      if (reaped.rows.length > 0) {
        logger.info('email.outbox.reaped', { count: reaped.rows.length });
      }

      // (2) Claim a batch atomically. SELECT FOR UPDATE SKIP LOCKED
      // means a hypothetical second worker (e.g. cron lock failure)
      // sees disjoint rows; combined with the cron lock this is
      // belt-and-braces.
      const client = await safeConnect();
      let claimed: OutboxRow[] = [];
      try {
        await client.query('BEGIN');
        const pickup = await client.query<OutboxRow>(
          `SELECT id, to_email, subject, body_html, reply_to, template_key,
                  attempts, max_attempts
             FROM email_outbox
            WHERE status IN ('pending', 'failed')
              AND next_attempt_at <= NOW()
            ORDER BY next_attempt_at ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED`,
          [CLAIM_BATCH],
        );
        claimed = pickup.rows;
        if (claimed.length > 0) {
          await client.query(
            `UPDATE email_outbox
                SET status = 'sending',
                    attempts = attempts + 1,
                    updated_at = NOW()
              WHERE id = ANY($1)`,
            [claimed.map(r => r.id)],
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }

      // (3) Dispatch each claimed row outside the claim tx. The
      // attempts counter we read at SELECT was the pre-increment
      // value; after the UPDATE above, the row's stored attempts is
      // (read + 1), which is what we use to decide 'dead' vs 'failed'.
      let sent = 0, retried = 0, dead = 0;
      for (const row of claimed) {
        const newAttempts = row.attempts + 1;
        const outcome = await deliverEmailViaProvider(
          row.to_email,
          row.subject,
          row.body_html,
          row.reply_to,
        );

        if (outcome.kind === 'sent') {
          await pool.query(
            `UPDATE email_outbox
                SET status = 'sent',
                    sent_at = NOW(),
                    updated_at = NOW(),
                    last_error = NULL
              WHERE id = $1`,
            [row.id],
          );
          logger.info('email.outbox.sent', {
            id: row.id, template_key: row.template_key, attempts: newAttempts,
          });
          sent++;
          continue;
        }

        const isPermanent = outcome.kind === 'permanent';
        const exhausted = newAttempts >= row.max_attempts;
        if (isPermanent || exhausted) {
          await pool.query(
            `UPDATE email_outbox
                SET status = 'dead',
                    last_error = $2,
                    updated_at = NOW()
              WHERE id = $1`,
            [row.id, outcome.reason],
          );
          logger.warn('email.outbox.dead', {
            id: row.id,
            template_key: row.template_key,
            attempts: newAttempts,
            reason: outcome.reason,
            kind: outcome.kind,
          });
          await auditLog('system', 'email_outbox_dead', 'email', row.id, {
            template_key: row.template_key,
            attempts: newAttempts,
            kind: outcome.kind,
            reason: outcome.reason,
          }, 'cron').catch(() => {});
          dead++;
          continue;
        }

        // Retryable + attempts remaining. Schedule the next attempt
        // using the backoff schedule. Index clamps so attempt 6+ keeps
        // waiting at the longest interval (defensive — max_attempts
        // default is 5 so we shouldn't hit it).
        const backoffIdx = Math.min(newAttempts - 1, BACKOFF_MS.length - 1);
        const backoffMs = BACKOFF_MS[backoffIdx];
        await pool.query(
          `UPDATE email_outbox
              SET status = 'failed',
                  next_attempt_at = NOW() + ($2 || ' milliseconds')::interval,
                  last_error = $3,
                  updated_at = NOW()
            WHERE id = $1`,
          [row.id, String(backoffMs), outcome.reason],
        );
        logger.info('email.outbox.retry', {
          id: row.id,
          template_key: row.template_key,
          attempts: newAttempts,
          next_attempt_in_ms: backoffMs,
          reason: outcome.reason,
        });
        retried++;
      }

      return NextResponse.json({
        claimed: claimed.length,
        sent,
        retried,
        dead,
        reaped: reaped.rows.length,
        timestamp: new Date().toISOString(),
      });
    } finally {
      await lock.release();
    }
  } catch (e) {
    logger.error('email.outbox.fatal', { error: (e as Error)?.message || String(e) });
    return NextResponse.json({ error: 'Outbox processing failed' }, { status: 500 });
  }
}
