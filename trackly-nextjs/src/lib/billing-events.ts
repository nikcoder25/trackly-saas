/**
 * Billing-events recorder.
 *
 * The user-facing Billing History on /dashboard/account is sourced from
 * this table. Every plan lifecycle transition - upgrade, downgrade,
 * renewal, cancellation, on-hold/paused, and the orphan-old-sub
 * cancellations the webhook issues during plan upgrades - must produce
 * exactly one row here so the user can audit the full history of their
 * subscription, not just the most recent cancellation (the pre-fix
 * behaviour, which surfaced 'subscription cancelled' rows only).
 *
 * Design notes:
 *   - Separate table from `audit_logs` because audit_logs.user_id is
 *     rewritten to NULL for system-actor rows by db.ts auditLog(), which
 *     hid every webhook-driven plan change from the user-scoped history
 *     query (the original symptom). Keeping the two trails separate
 *     makes the user-facing intent explicit.
 *   - Idempotent on `dodo_event_id` (UNIQUE WHERE NOT NULL): webhook
 *     replays of the same Dodo event id collapse to a single billing
 *     row. Non-webhook callers (cancel route, backfill) leave dodo_event_id
 *     NULL and rely on caller-side dedup or are inherently idempotent
 *     transitions (cancel route is gated by the SERIALIZABLE plan='free'
 *     guard).
 *   - Accepts an optional pg client so webhook callers can write inside
 *     the same SERIALIZABLE transaction that mutates users.plan; that's
 *     the only way to keep "plan changed" and "billing event recorded"
 *     atomic. Cancel-route + post-commit callers pass the global pool.
 *   - A failed billing-event INSERT must NEVER roll back the user-facing
 *     operation that triggered it. In pool mode errors are logged and
 *     swallowed. In tx mode (a client is passed) the INSERT runs inside a
 *     SAVEPOINT: on failure we ROLLBACK TO SAVEPOINT so the outer
 *     transaction stays usable and COMMITs the plan change without the
 *     billing row. Without the savepoint a swallowed error would leave
 *     the outer transaction aborted, so its COMMIT silently became a
 *     ROLLBACK and the plan change was lost while the webhook returned
 *     200. Serialization failures (40001 / 40P01) and savepoint errors
 *     are rethrown so the caller retries or rolls back the whole tx.
 *     Callers passing `client` MUST be inside a transaction block.
 */
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { pool } from './db';
import { logger } from './logger';

export type BillingEventType =
  | 'plan_upgraded'
  | 'plan_downgraded'
  | 'plan_cancelled'
  | 'plan_renewed'
  | 'subscription_on_hold'
  | 'subscription_paused'
  | 'payment_succeeded'
  | 'superseded_sub_cancelled';

export interface RecordBillingEventInput {
  /**
   * When provided, the INSERT runs on this client inside a SAVEPOINT
   * (joins the caller's transaction, which must already be open).
   */
  client?: { query: PoolClient['query'] };
  userId: string;
  eventType: BillingEventType;
  /** Plan the user was on before this event. NULL for purely informational rows. */
  fromPlan?: string | null;
  /** Plan the user is on after this event. NULL for purely informational rows. */
  toPlan?: string | null;
  /** Dodo subscription_id this event is about, when available. */
  subscriptionId?: string | null;
  /** Dodo's webhook-id, when this event was triggered by a webhook delivery. */
  dodoEventId?: string | null;
  /** Producer of the row - one of 'webhook', 'cancel_route', 'backfill', 'reconcile'. */
  source: string;
  /** Free-form payload (productId, amount, raw event type, etc). */
  details?: Record<string, unknown>;
}

const BILLING_EVENT_SAVEPOINT = 'billing_event_insert';
const RETRYABLE_TX_PG_CODES = new Set(['40001', '40P01']);

const INSERT_SQL = `INSERT INTO billing_events
         (id, user_id, event_type, from_plan, to_plan, subscription_id,
          dodo_event_id, source, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (dodo_event_id)
         WHERE dodo_event_id IS NOT NULL
         DO NOTHING
       RETURNING id`;

function logRecordFailure(input: RecordBillingEventInput, e: unknown): void {
  logger.error('billing_events.record_failed', {
    userId: input.userId,
    eventType: input.eventType,
    source: input.source,
    error: (e as Error)?.message,
  });
}

/**
 * Insert a billing-events row. Returns the inserted id, or null when the
 * insert was a duplicate (ON CONFLICT (dodo_event_id) DO NOTHING) or the
 * write failed. In pool mode it never throws. In tx mode it only throws
 * when the outer transaction itself must be retried or abandoned
 * (serialization failure, deadlock, or the savepoint cannot be managed).
 */
export async function recordBillingEvent(
  input: RecordBillingEventInput,
): Promise<string | null> {
  const id = crypto.randomUUID();
  const params = [
    id,
    input.userId,
    input.eventType,
    input.fromPlan ?? null,
    input.toPlan ?? null,
    input.subscriptionId ?? null,
    input.dodoEventId ?? null,
    input.source,
    JSON.stringify(input.details ?? {}),
  ];

  const client = input.client;
  if (!client) {
    try {
      const result = await pool.query<{ id: string }>(INSERT_SQL, params);
      return result.rows[0]?.id ?? null;
    } catch (e) {
      logRecordFailure(input, e);
      return null;
    }
  }

  // Tx mode. If SAVEPOINT itself fails the outer tx is already broken;
  // let that propagate so the caller rolls back instead of "committing".
  await client.query(`SAVEPOINT ${BILLING_EVENT_SAVEPOINT}`);
  try {
    const result = await client.query<{ id: string }>(INSERT_SQL, params);
    await client.query(`RELEASE SAVEPOINT ${BILLING_EVENT_SAVEPOINT}`);
    return result.rows[0]?.id ?? null;
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code && RETRYABLE_TX_PG_CODES.has(code)) {
      // The whole transaction must be retried; rolling back to the
      // savepoint would not make the eventual COMMIT safe.
      throw e;
    }
    logRecordFailure(input, e);
    // Undo only the failed INSERT so the outer tx can still COMMIT. Any
    // error here propagates: the caller must not believe it committed.
    await client.query(`ROLLBACK TO SAVEPOINT ${BILLING_EVENT_SAVEPOINT}`);
    await client.query(`RELEASE SAVEPOINT ${BILLING_EVENT_SAVEPOINT}`);
    return null;
  }
}
