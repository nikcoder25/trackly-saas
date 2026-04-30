import { pool, safeConnect, auditLog } from '@/lib/db';
import { acquireCronLock } from '@/lib/cron-lock';
import { logger } from '@/lib/logger';
import { deliverEmailViaProvider } from '@/lib/email';

/**
 * Email outbox drain — shared logic between the HTTP worker route
 * (src/app/api/cron/process-email-outbox/route.ts) and the in-process
 * scheduler started by instrumentation.ts.
 *
 * Audit item D depends on this draining the outbox at a reliable
 * cadence. PR #481 originally relied solely on a GitHub Actions
 * every-2-minute schedule curling the HTTP route — but GH Actions
 * documents a soft minimum of ~5 minutes for cron schedules, and in
 * production the every-2-minute schedule was getting throttled enough
 * that the worker never ran at all. The in-process scheduler is the
 * primary mechanism now; the HTTP route stays as a manual /
 * external-trigger backup.
 */

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

export interface DrainOutboxResult {
  /** True iff this caller actually ran the drain (false when cron lock was held by another worker). */
  ran: boolean;
  /** When `ran === false`, why we skipped (`'locked'`). */
  skipReason?: 'locked';
  /** Total rows claimed in this tick. */
  claimed: number;
  /** Rows that successfully sent and are now status='sent'. */
  sent: number;
  /** Rows that failed retryably and were re-scheduled with backoff. */
  retried: number;
  /** Rows that hit a permanent error or exhausted max_attempts. */
  dead: number;
  /** Rows the reaper recovered from a stuck status='sending'. */
  reaped: number;
}

/**
 * Drain a batch of email_outbox rows. Per-tick flow:
 *
 *   1. Reaper: flip stuck status='sending' rows back to 'failed' so the
 *      pickup query can see them again. Recovers rows from a worker
 *      that died mid-fetch (the 'pending'/'failed' pickup query alone
 *      wouldn't see them).
 *   2. Claim up to CLAIM_BATCH rows in a short transaction:
 *        SELECT … FOR UPDATE SKIP LOCKED;
 *        UPDATE status='sending', attempts=attempts+1;
 *        COMMIT;
 *      Releases the row lock before the network calls.
 *   3. Dispatch each claimed row outside the claim tx via
 *      deliverEmailViaProvider. Update each row to 'sent' / 'failed' /
 *      'dead' based on the outcome category.
 *
 * Always logs `email.outbox.tick` at the end (even when nothing was
 * claimed) so prod has a heartbeat confirming the worker is alive.
 */
export async function drainOutbox(): Promise<DrainOutboxResult> {
  const lock = await acquireCronLock('process-email-outbox', 5);
  if (!lock) {
    logger.info('email.outbox.tick.skipped', { reason: 'locked' });
    return { ran: false, skipReason: 'locked', claimed: 0, sent: 0, retried: 0, dead: 0, reaped: 0 };
  }

  try {
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
          [claimed.map((r) => r.id)],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    let sent = 0;
    let retried = 0;
    let dead = 0;
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

    // Always emit a tick log — the heartbeat that confirms the worker
    // is alive in production. PR #481 had no such log; when GH Actions
    // never fired, ops had no signal anywhere that delivery was stuck.
    logger.info('email.outbox.tick', {
      processed: claimed.length,
      sent,
      retried,
      dead,
      reaped: reaped.rows.length,
    });

    return {
      ran: true,
      claimed: claimed.length,
      sent,
      retried,
      dead,
      reaped: reaped.rows.length,
    };
  } finally {
    await lock.release();
  }
}
