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
 *   - Never throws: a billing-event write must NEVER roll back the user-
 *     facing operation that triggered it. Errors are logged + swallowed.
 *     For tx-mode callers, swallowing means the OUTER transaction COMMITs
 *     without a billing row - acceptable because audit_logs still
 *     captures the underlying event for ops, and a follow-up backfill
 *     (P4) can recover.
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
  /** When provided, the INSERT runs on this client (joins the caller's transaction). */
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

/**
 * Insert a billing-events row. Returns the inserted id, or null when the
 * insert was a duplicate (ON CONFLICT (dodo_event_id) DO NOTHING) or the
 * write failed. Never throws.
 */
export async function recordBillingEvent(
  input: RecordBillingEventInput,
): Promise<string | null> {
  const id = crypto.randomUUID();
  const exec = input.client ?? pool;
  try {
    const result = await exec.query<{ id: string }>(
      `INSERT INTO billing_events
         (id, user_id, event_type, from_plan, to_plan, subscription_id,
          dodo_event_id, source, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (dodo_event_id)
         WHERE dodo_event_id IS NOT NULL
         DO NOTHING
       RETURNING id`,
      [
        id,
        input.userId,
        input.eventType,
        input.fromPlan ?? null,
        input.toPlan ?? null,
        input.subscriptionId ?? null,
        input.dodoEventId ?? null,
        input.source,
        JSON.stringify(input.details ?? {}),
      ],
    );
    return result.rows[0]?.id ?? null;
  } catch (e) {
    logger.error('billing_events.record_failed', {
      userId: input.userId,
      eventType: input.eventType,
      source: input.source,
      error: (e as Error).message,
    });
    return null;
  }
}
