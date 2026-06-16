import { pool, safeConnect, auditLog } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  sendPlanUpgradeEmail,
  sendPlanDowngradeEmail,
  sendPlanCancellationEmail,
  planCancellationIdempotencyKey,
  tryEnqueueRecoveredCancellationEmail,
} from '@/lib/email';
import { comparePlans } from '@/lib/plan-config';
import { recordBillingEvent } from '@/lib/billing-events';
import crypto from 'crypto';

// Constant-time comparison for HMAC signatures. Attempts the given
// encoding first and falls back to utf8, so callers can pass hex or
// base64 without branching.
function safeEqual(a: string, b: string, encoding: 'hex' | 'base64' = 'base64'): boolean {
  try {
    const ab = Buffer.from(a, encoding);
    const bb = Buffer.from(b, encoding);
    if (ab.length !== bb.length || ab.length === 0) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

const PLAN_MAP: Record<string, string> = {};
if (process.env.DODO_STARTER_PRODUCT_ID) PLAN_MAP[process.env.DODO_STARTER_PRODUCT_ID] = 'starter';
if (process.env.DODO_PRO_PRODUCT_ID) PLAN_MAP[process.env.DODO_PRO_PRODUCT_ID] = 'pro';
if (process.env.DODO_AGENCY_PRODUCT_ID) PLAN_MAP[process.env.DODO_AGENCY_PRODUCT_ID] = 'agency';
if (process.env.DODO_ENTERPRISE_PRODUCT_ID) PLAN_MAP[process.env.DODO_ENTERPRISE_PRODUCT_ID] = 'enterprise';

// Reverse map: plan name -> product ID (for reconciliation)
const PLAN_TO_PRODUCT: Record<string, string> = {};
Object.entries(PLAN_MAP).forEach(([productId, planName]) => {
    PLAN_TO_PRODUCT[planName] = productId;
});

// Defense-in-depth: only these values may ever be written to users.plan
// from a webhook. 'owner' is intentionally excluded - it is an internal
// admin marker that grants admin-backend access via lib/admin-auth.ts,
// and must never be settable from webhook-derived data.
const ALLOWED_WEBHOOK_PLANS = new Set(['starter', 'pro', 'agency', 'enterprise']);

// All event types that indicate an active/upgraded plan.
// 'subscription.updated' is intentionally NOT here: Dodo emits it for
// every status change (including cancellations), so it's normalised at
// dispatch time via `effectiveEventType` below - see the remap that
// resolves status → 'subscription.cancelled' or 'subscription.active'.
const UPGRADE_EVENTS = new Set([
    'payment.succeeded',
    'subscription.active',
    'subscription.renewed',
    'subscription.plan_changed',
  ]);

// Events that mutate an EXISTING subscription (as opposed to the first
// activation). On these we require the webhook's subscription_id to
// match the one we have bound to the user, so a webhook referencing a
// different subscription can't silently flip another user's plan.
// 'subscription.updated' is excluded here for the same reason as above.
const SUBSCRIPTION_UPDATE_EVENTS = new Set([
    'subscription.renewed',
    'subscription.plan_changed',
  ]);

// All event types that indicate a downgrade/cancellation
const DOWNGRADE_EVENTS = new Set([
    'subscription.cancelled',
    'subscription.expired',
    'refund.succeeded',
  ]);

// Subscription-level statuses that mean the subscription is NOT active.
// When a 'subscription.updated' / 'subscription.plan_changed' /
// 'subscription.renewed' event carries one of these in its payload, we
// remap the eventType to 'subscription.cancelled' so the downgrade
// branch handles it. Includes both spellings ('cancelled'/'canceled')
// because Dodo's docs and live payloads have used both at different
// times.
const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
    'cancelled',
    'canceled',
    'expired',
    'failed',
    'on_hold',
    'paused',
  ]);

// Postgres SERIALIZABLE retry policy. Webhooks for the same user
// frequently land in close succession (signup -> upgrade -> activate
// fires three writes within a ~5s window per the userId
// mnpwyu6r8730ddlda847 timeline). Concurrent writes against the same
// users row inside our SERIALIZABLE transaction can fail with
// SQLSTATE 40001 (`could not serialize access due to concurrent
// update`); pre-fix the failed transaction was silently rolled back
// and the event lost. Retrying the entire transactional block is the
// canonical handling for 40001.
const MAX_TX_ATTEMPTS = 3;
const TX_RETRY_BACKOFF_MS = [50, 100, 200]; // index = (attempt - 1).
const SERIALIZATION_FAILURE_PG_CODE = '40001';

// Resolve the product_id from a Dodo webhook body. Subscription events
// (subscription.active / .renewed / .updated / .plan_changed / .cancelled)
// expose product_id at the top level of `data` - this is the canonical
// shape and matches what `cron/reconcile-payments` reads from
// GET /subscriptions/{id}. Payment events (payment.succeeded for
// subscription or one-time charges) instead echo the original checkout's
// product_cart, nesting the product under data.product_cart[0].product_id
// - that's what /api/payments/checkout sends. Without the cart fallback
// here, payment.succeeded falls through to the unknown_product 500
// rollback and Dodo retries the same event in a loop.
//
// Order matters: top-level wins over cart so a future event that carries
// both stays deterministic (and consistent with the legacy/canonical
// behaviour from before this fix).
function resolveProductId(eventData: unknown, body: unknown): string | null {
  const direct = pickString(eventData, 'product_id') ?? pickString(body, 'product_id');
  if (direct) return direct;
  const cartFromData = pickCartProductId(eventData);
  if (cartFromData) return cartFromData;
  return pickCartProductId(body);
}

function pickString(source: unknown, key: string): string | null {
  if (!source || typeof source !== 'object') return null;
  const v = (source as Record<string, unknown>)[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function pickCartProductId(source: unknown): string | null {
  if (!source || typeof source !== 'object') return null;
  const cart = (source as Record<string, unknown>).product_cart;
  if (!Array.isArray(cart) || cart.length === 0) return null;
  return pickString(cart[0], 'product_id');
}

// Parse the event timestamp Dodo attached to this webhook delivery. Used
// to order events PER-subscription-id and skip stale arrivals (e.g. a
// retried cancellation that arrives AFTER a fresh subscription.active
// for a different sub_id). Falls back to null when missing - caller
// treats null as "process this event without an ordering check".
function parseEventTimestamp(body: unknown, eventData: unknown): Date | null {
  const candidates: unknown[] = [];
  if (body && typeof body === 'object') {
    candidates.push((body as Record<string, unknown>).timestamp);
  }
  if (eventData && typeof eventData === 'object') {
    candidates.push((eventData as Record<string, unknown>).timestamp);
    candidates.push((eventData as Record<string, unknown>).created_at);
  }
  for (const c of candidates) {
    if (typeof c === 'string' || typeof c === 'number') {
      const d = new Date(c);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

interface SubscriptionEventState {
  status: string;
  last_event_at: string;
  // Tie-break key for the rare case where two events for the same
  // subscription_id share an identical Dodo timestamp. event_ids are
  // opaque strings; lexicographic comparison gives a deterministic
  // total order. Optional only because rows written before this field
  // existed don't have it (they fall through to timestamp-only ordering
  // in isStaleSubscriptionEvent).
  last_event_id?: string;
}

// Read this user's per-subscription event state. Populated as we
// process each event so we can (a) order events by their Dodo
// timestamp per subscription_id and (b) scope the post-cancel guard
// to the specific cancelled subscription instead of user-wide.
//
// settings.subscription_events is an additive map; settings.subscription_status
// is preserved for backwards compat with admin-backend / billing UI /
// reconcile-cron readers.
function getSubscriptionEvents(settings: unknown): Record<string, SubscriptionEventState> {
  if (!settings || typeof settings !== 'object') return {};
  const map = (settings as Record<string, unknown>).subscription_events;
  if (!map || typeof map !== 'object') return {};
  return map as Record<string, SubscriptionEventState>;
}

// Returns true if we've already processed a NEWER event for the same
// subscription_id. The caller should skip the current event entirely
// (no DB mutation, no email) when this returns true.
//
// Ordering:
//   1. event_timestamp < prior.last_event_at  -> stale (skip).
//   2. event_timestamp > prior.last_event_at  -> fresh (process).
//   3. event_timestamp == prior.last_event_at -> tie-break by event_id
//      (lexicographic). The current event is stale iff its event_id
//      is <= the recorded last_event_id. The same-event-id case is
//      already filtered by the webhook_events idempotency INSERT
//      earlier; the only rows that reach this comparison are different
//      events sharing a millisecond - real, e.g. the userId
//      mnpwyu6r8730ddlda847 logs from the new bug report had two
//      different events stamped at 2026-04-30T16:15:34.008Z.
function isStaleSubscriptionEvent(
  events: Record<string, SubscriptionEventState>,
  subscriptionId: string | null | undefined,
  eventTimestamp: Date | null,
  eventId: string | null | undefined,
): boolean {
  if (!subscriptionId || !eventTimestamp) return false;
  const prior = events[subscriptionId];
  if (!prior) return false;
  const priorAt = new Date(prior.last_event_at);
  if (Number.isNaN(priorAt.getTime())) return false;
  if (eventTimestamp.getTime() < priorAt.getTime()) return true;
  if (eventTimestamp.getTime() > priorAt.getTime()) return false;
  // Same-millisecond tie-break.
  if (!prior.last_event_id || !eventId) {
    // Missing tie-break info on either side. Fall back to the prior
    // (pre-tie-break) behaviour: same timestamp -> treat as stale.
    return true;
  }
  return eventId <= prior.last_event_id;
}

// Cancel a stale Dodo subscription that's been orphaned by a plan
// upgrade. Mirrors the same PATCH /subscriptions/{id} status='cancelled'
// call used by /api/payments/cancel.
//
// Soft-fail policy:
//   - 2xx                     -> info log, audit row.
//   - 404 / 409 / 410         -> already cancelled or not found at Dodo.
//                                Treated as success: info log, no audit row.
//   - other 4xx / 5xx / throw -> warn log + audit row, but the webhook
//                                handler continues activating the new
//                                plan. The orphan is recorded for support
//                                follow-up rather than blocking the
//                                user's just-paid-for upgrade.
//
// `auditLog` and `logger` come from the outer module scope; we avoid
// importing them here so the helper stays a closure-free file-scope fn.
async function cancelOldDodoSubscription(opts: {
  userId: string;
  oldSubscriptionId: string;
  newSubscriptionId: string;
}): Promise<void> {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) {
    logger.warn('webhook.dodo.old_sub_cancel_skipped_no_api_key', {
      userId: opts.userId,
      old_subscription_id: opts.oldSubscriptionId,
    });
    return;
  }

  const env = process.env.DODO_PAYMENTS_ENVIRONMENT || 'test_mode';
  const baseUrl = env === 'live_mode'
    ? 'https://live.dodopayments.com'
    : 'https://test.dodopayments.com';

  let status = 0;
  let bodyPreview = '';
  try {
    const resp = await fetch(`${baseUrl}/subscriptions/${opts.oldSubscriptionId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    status = resp.status;
    if (resp.ok) {
      logger.info('webhook.dodo.old_sub_cancelled', {
        userId: opts.userId,
        old_subscription_id: opts.oldSubscriptionId,
        new_subscription_id: opts.newSubscriptionId,
      });
      auditLog('system', 'old_subscription_cancelled', 'user', opts.userId, {
        oldSubscriptionId: opts.oldSubscriptionId,
        newSubscriptionId: opts.newSubscriptionId,
        reason: 'plan_upgrade',
      }, 'webhook').catch(() => {});
      return;
    }

    if (status === 404 || status === 409 || status === 410) {
      logger.info('webhook.dodo.old_sub_already_gone', {
        userId: opts.userId,
        old_subscription_id: opts.oldSubscriptionId,
        new_subscription_id: opts.newSubscriptionId,
        status,
      });
      return;
    }

    bodyPreview = (await resp.text().catch(() => '')).slice(0, 200);
  } catch (e) {
    bodyPreview = (e as Error).message;
  }

  // Soft-fail: continue activating the new plan; record the orphan so
  // support can chase it manually.
  logger.warn('webhook.dodo.old_sub_cancel_failed', {
    userId: opts.userId,
    old_subscription_id: opts.oldSubscriptionId,
    new_subscription_id: opts.newSubscriptionId,
    status,
    body_preview: bodyPreview,
  });
  auditLog('system', 'orphan_subscription_cancel_failed', 'user', opts.userId, {
    oldSubscriptionId: opts.oldSubscriptionId,
    newSubscriptionId: opts.newSubscriptionId,
    status,
    bodyPreview,
  }, 'webhook').catch(() => {});
}

// The canonical env var is DODO_PAYMENTS_WEBHOOK_KEY (matches .env.example
// and the provider dashboard). DODO_WEBHOOK_SECRET is accepted as a legacy
// alias; if both are set to different values we log a warning so the
// misconfiguration is caught before it silently drops webhooks.
let _loggedSecretConflict = false;
function getWebhookSecrets(): string[] {
  const secrets: string[] = [];
  const canonical = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
  const legacy = process.env.DODO_WEBHOOK_SECRET;
  if (canonical) secrets.push(canonical);
  if (legacy && legacy !== canonical) {
    secrets.push(legacy);
    if (canonical && !_loggedSecretConflict) {
      _loggedSecretConflict = true;
      console.warn(
        '[Webhook] Both DODO_PAYMENTS_WEBHOOK_KEY and DODO_WEBHOOK_SECRET are set ' +
        'with different values. The canonical name is DODO_PAYMENTS_WEBHOOK_KEY; ' +
        'remove DODO_WEBHOOK_SECRET once you confirm webhooks are flowing.'
      );
    }
  }
  return secrets;
}

// Verify HMAC-SHA256 signature against one or more secrets
function verifySignature(rawBody: string, signature: string, secrets: string[]): boolean {
  for (const secret of secrets) {
    const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (safeEqual(signature, expectedHex, 'hex')) return true;
  }
  return false;
}

export async function POST(request: Request) {
    try {
          const rawBody = await request.text();

      // Diagnostic: record which headers were sent (names only) and the
      // raw body length. We never log header values - webhook signatures
      // are credentials and logging them would let anyone with log access
      // forge future webhooks. The body preview was also removed: it can
      // contain customer email/name and subscription IDs.
      const headerNames: string[] = [];
      request.headers.forEach((_value, key) => { headerNames.push(key); });
      // Info-level so it shows up in DigitalOcean's runtime logs (debug
      // is suppressed in production). Without this, a grep for "webhook"
      // or "dodo" returns nothing during an incident - which is exactly
      // the gap surfaced by the subscription-sync postmortem.
      const previewWebhookId = request.headers.get('webhook-id');
      logger.info('webhook.dodo.received', {
        header_names: headerNames,
        body_length: rawBody.length,
        webhook_id: previewWebhookId,
      });

      // Webhook signature verification
      const secrets = getWebhookSecrets();
          if (!secrets.length) {
                  logger.error('webhook.dodo.missing_secret');
                  return Response.json({ error: 'Webhook secret not configured' }, { status: 500 });
          }

      // Check all common signature header names that DodoPayments might use
      const signatureHeaders = [
        'webhook-signature',
        'x-webhook-signature',
        'x-dodo-signature',
        'x-signature',
        'dodo-signature',
      ];
      let signature: string | null = null;
      let matchedHeader = '';
      for (const headerName of signatureHeaders) {
        const val = request.headers.get(headerName);
        if (val) {
          signature = val;
          matchedHeader = headerName;
          break;
        }
      }

      if (!signature) {
        logger.error('webhook.dodo.missing_signature', {
          checked_headers: signatureHeaders,
          available_headers: headerNames,
        });
        return Response.json({ error: 'Missing signature' }, { status: 401 });
      }

      // `matchedHeader` tells us which header variant carried the signature
      // (helpful when Dodo changes the header name); `signature` itself is
      // a credential and is deliberately not logged.
      logger.debug('webhook.dodo.signature_found', { header: matchedHeader });

      // DodoPayments Standard Webhooks format: "v1,<base64-signature>"
      // Try extracting the actual signature if it has a version prefix
      let rawSignature = signature;
      if (signature.startsWith('v1,')) {
        const base64Sig = signature.slice(3);
        // Convert base64 signature to hex for comparison
        rawSignature = Buffer.from(base64Sig, 'base64').toString('hex');
        logger.debug('webhook.dodo.signature.v1_prefix_decoded');
      }

      // Also handle Standard Webhooks which use webhook-id + webhook-timestamp + body
      const webhookId = request.headers.get('webhook-id');
      const webhookTimestamp = request.headers.get('webhook-timestamp');
      let verified = false;

      if (webhookId && webhookTimestamp) {
        // Standard Webhooks format: sign(webhookId.webhookTimestamp.body)
        const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
        logger.debug('webhook.dodo.standard_format', { webhookId, webhookTimestamp });

        for (const secret of secrets) {
          // Standard Webhooks secrets may be prefixed with "whsec_" and base64-encoded
          let keyBytes: Buffer;
          if (secret.startsWith('whsec_')) {
            keyBytes = Buffer.from(secret.slice(6), 'base64');
          } else {
            keyBytes = Buffer.from(secret, 'utf8');
          }
          const expected = crypto.createHmac('sha256', keyBytes).update(signedContent).digest('base64');

          // The signature header may contain multiple space-separated signatures (v1,<sig> v1,<sig2>)
          const sigParts = signature.split(' ');
          for (const part of sigParts) {
            const sigValue = part.startsWith('v1,') ? part.slice(3) : part;
            if (safeEqual(sigValue, expected, 'base64')) {
              verified = true;
              logger.debug('webhook.dodo.signature_verified', { format: 'standard' });
              break;
            }
          }
          if (verified) break;
        }
      }

      // Fallback: try simple HMAC(body) verification
      if (!verified) {
        verified = verifySignature(rawBody, rawSignature, secrets);
        if (verified) {
          logger.debug('webhook.dodo.signature_verified', { format: 'simple_hmac' });
        }
      }

      if (!verified) {
        // Log detailed diagnostic info for debugging. Signatures are
        // truncated to 20 chars so we don't dump full HMACs into Sentry.
        const firstSecret = secrets[0];
        const simpleExpected = crypto.createHmac('sha256', firstSecret).update(rawBody).digest('hex');
        let stdExpectedPreview: string | undefined;
        if (webhookId && webhookTimestamp) {
          const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
          const keyBytes = firstSecret.startsWith('whsec_')
            ? Buffer.from(firstSecret.slice(6), 'base64')
            : Buffer.from(firstSecret, 'utf8');
          stdExpectedPreview = crypto.createHmac('sha256', keyBytes).update(signedContent).digest('base64').substring(0, 20) + '...';
        }
        logger.error('webhook.dodo.signature_failed', {
          received_preview: signature.substring(0, 20) + '...',
          expected_simple_preview: simpleExpected.substring(0, 20) + '...',
          expected_standard_preview: stdExpectedPreview,
          secrets_tried: secrets.length,
        });
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }

      const body = JSON.parse(rawBody);

      // DodoPayments payload structure: { business_id, data, timestamp, type }
      // The event ID comes from the webhook-id header (Standard Webhooks), not the payload
      const eventId = webhookId || body.event_id || body.id;
          if (!eventId) {
                  logger.error('webhook.dodo.missing_event_id', { body_keys: Object.keys(body) });
                  return Response.json({ error: 'Missing event_id' }, { status: 400 });
          }
          const eventType = body.type || body.event_type || '';

      // Extract nested data - DodoPayments may nest under .data or .payload
      const eventData = body.data || body.payload || body;

      // Dodo's 'subscription.updated' fires for every status change,
      // including cancellations. Read the embedded status (checking
      // every field name Dodo has used across versions) and remap the
      // eventType so the dispatch logic below sees a single,
      // unambiguous semantic event:
      //
      //   - 'subscription.updated'/'plan_changed'/'renewed' + inactive
      //     status -> 'subscription.cancelled' (handled by DOWNGRADE_EVENTS)
      //   - 'subscription.updated' otherwise -> 'subscription.active'
      //     (handled by UPGRADE_EVENTS)
      //   - everything else -> unchanged
      //
      // Without this, a cancellation-triggered 'subscription.updated'
      // would be treated as an upgrade event (because we still need to
      // honour active 'plan_changed' / 'renewed' notifications) and the
      // webhook would resurrect the cancelled plan a few seconds after
      // the user's explicit cancel.
      const rawStatus = eventData.status ?? eventData.subscription_status ?? body.status;
      const payloadStatus = typeof rawStatus === 'string' ? rawStatus : null;

      let effectiveEventType = eventType;
      if (
        (eventType === 'subscription.updated'
          || eventType === 'subscription.plan_changed'
          || eventType === 'subscription.renewed')
        && payloadStatus
        && INACTIVE_SUBSCRIPTION_STATUSES.has(payloadStatus)
      ) {
        effectiveEventType = 'subscription.cancelled';
        logger.info('webhook.dodo.event_remapped', {
          from: eventType,
          to: 'subscription.cancelled',
          payload_status: payloadStatus,
        });
      } else if (eventType === 'subscription.updated') {
        effectiveEventType = 'subscription.active';
      }

      // Per-subscription event ordering. Dodo doesn't guarantee
      // delivery order; a retried cancellation can arrive AFTER a
      // fresh subscription.active for a *different* subscription_id
      // for the same user. We track per-subscription_id last-seen
      // event timestamp in users.settings.subscription_events and
      // reject events older than what we've already processed.
      // Globally null when Dodo's payload omits a timestamp - we
      // process the event (no ordering check) and log a warning so
      // ops can spot the issue if it ever happens at volume.
      const eventTimestamp = parseEventTimestamp(body, eventData);
      if (!eventTimestamp) {
        logger.warn('webhook.dodo.missing_event_timestamp', { eventId, eventType });
      }
      const incomingSubscriptionId: string | null =
        (typeof eventData.subscription_id === 'string' && eventData.subscription_id)
          || (typeof body.subscription_id === 'string' && body.subscription_id)
          || null;

      // Debug-only: full payload context. Suppressed in production stdout
      // (logger.debug skips console output when NODE_ENV=production) so
      // customer/subscription IDs aren't tee'd to App Platform logs; still
      // forwarded to Sentry breadcrumbs where the SDK scrubs PII.
      logger.debug('webhook.dodo.processing', {
              eventId,
              eventType,
              effectiveEventType,
              payloadStatus,
              bodyKeys: Object.keys(body),
              product_id: resolveProductId(eventData, body),
              subscription_id: body.subscription_id || body.data?.subscription_id || body.payload?.subscription_id,
              customer_id: body.customer_id || body.data?.customer_id || body.payload?.customer_id,
              metadata: body.metadata || body.data?.metadata || body.payload?.metadata,
      });
      // Info-level dispatch summary - matches the postmortem requirement
      // ("event ID, event type, customer ID, plan, success or failure
      // status"). Excludes anything PII-shaped (no email, no full
      // metadata blob). Customer ID is acceptable because it's the
      // payment provider's opaque id, not a user-supplied identifier.
      logger.info('webhook.dodo.dispatch', {
        event_id: eventId,
        event_type: eventType,
        effective_event_type: effectiveEventType,
        payload_status: payloadStatus,
        product_id: resolveProductId(eventData, body),
        subscription_id: incomingSubscriptionId,
        customer_id: body.customer_id || body.data?.customer_id || body.payload?.customer_id || null,
      });

      // Plan-change confirmation email to dispatch after the DB
      // transaction commits. We don't send mid-transaction because a
      // Resend outage would either burn webhook retries (if we threw)
      // or send a false confirmation (if we then rolled back).
      let pendingPlanEmail:
        | { kind: 'upgrade' | 'downgrade' | 'cancellation'; email: string; from: string; to: string; subscriptionId?: string | null }
        | null = null;

      // SERIALIZABLE transaction wrapped in a retry loop. Concurrent
      // webhooks for the same user can collide on the SERIALIZABLE
      // isolation level and fail with SQLSTATE 40001; we retry up to
      // MAX_TX_ATTEMPTS with the configured backoff. Each attempt gets
      // a fresh client connection - pg_advisory_xact_lock releases on
      // ROLLBACK, so the retry re-acquires cleanly. Non-40001 errors
      // throw immediately and propagate to the outer catch.
      for (let attempt = 1; attempt <= MAX_TX_ATTEMPTS; attempt++) {
      const client = await safeConnect();
      let shouldRetryAfterRollback = false;
          try {
                  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

                  // Per-subscription advisory lock. Serializes processing
                  // for a single subscription_id across concurrent webhook
                  // deliveries - the database-side guarantee behind the
                  // stale-event-skip + per-subscription state writes.
                  // Without this, two webhooks for the same sub can both
                  // pass the in-tx stale check (each reads the prior
                  // state before the other commits) and both proceed,
                  // re-introducing the race that the stale-skip alone
                  // can't prevent. Lock releases at COMMIT/ROLLBACK.
                  if (incomingSubscriptionId) {
                    await client.query(
                      'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
                      [incomingSubscriptionId],
                    );
                  }

            // Idempotency: atomically mark as processed
            const inserted = await client.query(
                      'INSERT INTO webhook_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
                      [eventId, eventType]
                    );
                  if (inserted.rows.length === 0) {
                            await client.query('ROLLBACK');
                            logger.debug('webhook.dodo.duplicate_skipped', { eventId });
                            return Response.json({ received: true, duplicate: true });
                  }

            // Extract userId from metadata (check multiple possible locations)
            const metadata = body.metadata || body.data?.metadata || body.payload?.metadata || {};
                  const userId = metadata.userId || metadata.user_id;

            // Per-subscription stale-event skip (Bug 1a). Reject events
            // whose Dodo timestamp is older than the most recent event
            // we've already processed for the same subscription_id.
            // Catches out-of-order delivery on retries - e.g. a late
            // `subscription.cancelled` arriving after a fresh
            // `subscription.active` for the same sub. Only applies when
            // we have BOTH a subscription_id and a parsable timestamp;
            // events that miss either fall through to normal handling.
            if (incomingSubscriptionId && eventTimestamp && userId && typeof userId === 'string') {
              const userPrior = await client.query<{ settings: unknown }>(
                'SELECT settings FROM users WHERE id = $1',
                [userId],
              );
              if (userPrior.rows.length) {
                const priorEvents = getSubscriptionEvents(userPrior.rows[0].settings);
                if (isStaleSubscriptionEvent(priorEvents, incomingSubscriptionId, eventTimestamp, eventId)) {
                  await client.query('ROLLBACK');
                  logger.info('webhook.dodo.stale_event_skipped', {
                    userId,
                    eventId,
                    eventType,
                    effectiveEventType,
                    subscription_id: incomingSubscriptionId,
                    event_timestamp: eventTimestamp.toISOString(),
                    prior_event_at: priorEvents[incomingSubscriptionId].last_event_at,
                  });
                  return Response.json({ received: true, skipped: 'stale' });
                }
              }
            }

            // Handle plan upgrade events
            if (UPGRADE_EVENTS.has(effectiveEventType)) {
                      if (!userId || typeof userId !== 'string') {
                                  await client.query('ROLLBACK');
                                  logger.error('webhook.dodo.upgrade_missing_user_id', {
                                              event_id: eventId,
                                              event_type: eventType,
                                              metadata,
                                              body_keys: Object.keys(body),
                                  });
                                  return Response.json({ error: 'Invalid webhook metadata' }, { status: 400 });
                      }
                      const userCheck = await client.query('SELECT id, email, plan, settings FROM users WHERE id = $1', [userId]);
                      if (!userCheck.rows.length) {
                                  await client.query('ROLLBACK');
                                  logger.error('webhook.dodo.user_not_found', { user_id: userId, event_type: eventType });
                                  return Response.json({ error: 'User not found' }, { status: 400 });
                      }

                    const currentUser = userCheck.rows[0];

                      // Defense-in-depth, scoped per subscription_id:
                      // a late 'subscription.*' retry for an already-
                      // cancelled subscription cannot resurrect that
                      // SAME subscription. But a NEW subscription_id
                      // for the same user (re-subscribe after cancel,
                      // or upgrade-and-old-sub-cancellation race) is
                      // legitimate and must pass through.
                      //
                      // Pre-fix this guard was user-scoped - any
                      // settings.subscription_status='cancelled' value
                      // blocked every non-payment.succeeded event for
                      // the user, including activations on a fresh
                      // subscription_id. That dropped legitimate Pro
                      // upgrades (see the userId mnpwyu6r8730ddlda847
                      // log timeline from Apr 30 15:08).
                      const userEvents = getSubscriptionEvents(currentUser.settings);
                      const sameSubAlreadyCancelled =
                        !!incomingSubscriptionId
                        && userEvents[incomingSubscriptionId]?.status === 'cancelled';
                      if (
                        sameSubAlreadyCancelled
                        && effectiveEventType !== 'payment.succeeded'
                      ) {
                                await client.query('ROLLBACK');
                                logger.warn('webhook.dodo.ignored_post_cancel_event', {
                                            userId,
                                            eventType,
                                            effectiveEventType,
                                            payload_status: payloadStatus,
                                            subscription_id: incomingSubscriptionId,
                                });
                                return Response.json({ received: true, ignored: 'post_cancel' });
                      }

                      const productId = resolveProductId(eventData, body);
                      // Plan resolution is product-id-first. metadata.plan
                      // is checkout-supplied free-form data and was rejected
                      // outright in #474 to prevent plan_hijack escalation
                      // into 'owner'. We've since seen real Dodo deliveries
                      // (userId mnpwyu6r8730ddlda847, Apr 30 15:08) where
                      // payment.succeeded arrives with product_id=null even
                      // though metadata.plan is set - successful payments
                      // were silently dropped as unknown_product.
                      //
                      // Compromise: when product_id resolution fails, fall
                      // back to metadata.plan ONLY if it's in
                      // ALLOWED_WEBHOOK_PLANS (which excludes 'owner').
                      // Every fallback emits a warn-level log + audit row so
                      // the cross-tier escalation surface (e.g. attacker
                      // setting metadata.plan='enterprise' while paying for
                      // 'starter') is observable.
                    let plan: string | null = productId ? PLAN_MAP[productId] : null;
                    let planSource: 'product_id' | 'metadata_fallback' = 'product_id';
                    if (!plan
                      && typeof metadata.plan === 'string'
                      && ALLOWED_WEBHOOK_PLANS.has(metadata.plan)
                    ) {
                      plan = metadata.plan;
                      planSource = 'metadata_fallback';
                      logger.warn('webhook.dodo.metadata_plan_fallback', {
                        userId,
                        eventId,
                        eventType,
                        effectiveEventType,
                        productId,
                        fallback_plan: plan,
                        payload_status: payloadStatus,
                      });
                      await auditLog('system', 'webhook_metadata_plan_fallback', 'payment', eventId, {
                        eventType, effectiveEventType, productId, userId, fallback_plan: plan,
                      }, 'dodopayments').catch(() => {});
                    }

                    logger.debug('webhook.dodo.upgrade_resolution', { userId, productId, plan, planSource, currentPlan: currentUser.plan, knownProducts: Object.keys(PLAN_MAP) });

                    if (plan && ALLOWED_WEBHOOK_PLANS.has(plan)) {
                                const subscriptionId = eventData.subscription_id || body.subscription_id;
                                const existingSubscriptionId = currentUser.settings?.subscription_id;

                                // On events that mutate an existing subscription,
                                // require the webhook's subscription_id to match
                                // the one already bound to the user. Blocks
                                // cross-user plan updates if a webhook references
                                // someone else's subscription.
                                if (
                                  SUBSCRIPTION_UPDATE_EVENTS.has(effectiveEventType)
                                  && existingSubscriptionId
                                  && subscriptionId
                                  && existingSubscriptionId !== subscriptionId
                                ) {
                                              await client.query('ROLLBACK');
                                              logger.error('webhook.dodo.subscription_id_mismatch', {
                                                                user_id: userId,
                                                                event_type: eventType,
                                                                existing_subscription_id: existingSubscriptionId,
                                                                webhook_subscription_id: subscriptionId,
                                              });
                                              return Response.json({ error: 'Subscription mismatch' }, { status: 400 });
                                }

                                const customerId = eventData.customer_id || body.customer_id;
                                if (customerId) {
                                              const existingCustomerId = currentUser.settings?.dodo_customer_id;
                                              if (existingCustomerId && existingCustomerId !== customerId) {
                                                              await client.query('ROLLBACK');
                                                              logger.error('webhook.dodo.customer_id_mismatch', {
                                                                                user_id: userId,
                                                                                existing_customer_id: existingCustomerId,
                                                                                webhook_customer_id: customerId,
                                                              });
                                                              return Response.json({ error: 'User/customer mismatch' }, { status: 400 });
                                              }
                                }

                                // Plan upgrade from one paid plan to another: a different
                                // subscription_id arrived for an activation-style event.
                                // Dodo created a brand-new subscription via /checkouts and
                                // we never told Dodo about the old one, so it would
                                // continue to bill monthly until support intervened -
                                // the audit's double-billing finding (#475 follow-up A).
                                //
                                // Cancel the old subscription with Dodo before we
                                // overwrite the binding below. Gated on activation events
                                // only (subscription.active / payment.succeeded). The
                                // renewal/plan_changed paths still 400 on subscription_id
                                // mismatch via SUBSCRIPTION_UPDATE_EVENTS above - we don't
                                // broaden cancel-old-sub to those because a renewal of a
                                // *different* subscription remains genuinely suspicious.
                                //
                                // Soft-fail on 5xx / network errors: continue activating
                                // the new plan and emit an audit row. Hard-failing here
                                // would mean the user paid but doesn't see their plan
                                // until Dodo's API recovers and the webhook is replayed,
                                // which is worse UX than a tracked orphan.
                                if (
                                  existingSubscriptionId
                                  && subscriptionId
                                  && existingSubscriptionId !== subscriptionId
                                  && !SUBSCRIPTION_UPDATE_EVENTS.has(effectiveEventType)
                                ) {
                                              await cancelOldDodoSubscription({
                                                              userId,
                                                              oldSubscriptionId: existingSubscriptionId,
                                                              newSubscriptionId: subscriptionId,
                                              });
                                }

                        const previousPlan = currentUser.plan;
                                await client.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);
                                logger.info('webhook.dodo.plan_updated', { userId, from: previousPlan, to: plan, eventType, effectiveEventType, payloadStatus });

                        // Queue an upgrade/downgrade confirmation email when the
                        // plan actually moved. Renewals (same → same) don't
                        // surface to the user as a plan change, so suppress.
                        if (currentUser.email && previousPlan !== plan) {
                                  const direction = comparePlans(previousPlan, plan);
                                  if (direction === 'upgrade') {
                                              pendingPlanEmail = {
                                                          kind: 'upgrade',
                                                          email: currentUser.email,
                                                          from: previousPlan,
                                                          to: plan,
                                              };
                                  } else if (direction === 'downgrade') {
                                              pendingPlanEmail = {
                                                          kind: 'downgrade',
                                                          email: currentUser.email,
                                                          from: previousPlan,
                                                          to: plan,
                                              };
                                  }
                        }

                        // Build settings update with all relevant subscription data.
                        // settings.subscription_events tracks per-subscription_id
                        // status + timestamp so the post-cancel guard above can
                        // be subscription-scoped instead of user-scoped (Bug 1b).
                        // We compute the merged map in JS because Postgres JSONB
                        // `||` is shallow merge - writing
                        // {subscription_events: {sub_X: ...}} would replace the
                        // entire map and clobber other subscriptions' state.
                        const settingsUpdate: Record<string, unknown> = {
                                      subscription_status: 'active',
                        };
                                if (subscriptionId) {
                                              settingsUpdate.subscription_id = subscriptionId;
                                }
                                if (customerId) {
                                              settingsUpdate.dodo_customer_id = customerId;
                                }
                                // Store the product ID for reconciliation purposes
                        if (productId) {
                                      settingsUpdate.dodo_product_id = productId;
                        }
                        if (subscriptionId) {
                          const priorEvents = getSubscriptionEvents(currentUser.settings);
                          settingsUpdate.subscription_events = {
                            ...priorEvents,
                            [subscriptionId]: {
                              status: 'active',
                              last_event_at: (eventTimestamp ?? new Date()).toISOString(),
                              last_event_id: eventId,
                            },
                          };
                        }

                        await client.query(
                                      `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
                                      [JSON.stringify(settingsUpdate), userId]
                                    );

                        // Record the billing event inside the same SERIALIZABLE
                        // tx as the plan UPDATE so the user's billing history
                        // can never lag behind their actual plan. Three rules:
                        //   - previousPlan !== plan -> upgrade or downgrade.
                        //   - subscription.renewed with previousPlan === plan
                        //     -> renewal (the user-meaningful "you were billed
                        //     again" row).
                        //   - everything else (e.g. subscription.active firing
                        //     a second time after the upgrade already landed,
                        //     or payment.succeeded for an upgrade we just
                        //     recorded as plan_upgraded) -> skip; we already
                        //     captured the user-meaningful transition.
                        if (previousPlan !== plan) {
                                  const direction = comparePlans(previousPlan, plan);
                                  const billingEventType = direction === 'upgrade'
                                              ? 'plan_upgraded'
                                              : direction === 'downgrade'
                                                          ? 'plan_downgraded'
                                                          : null;
                                  if (billingEventType) {
                                              await recordBillingEvent({
                                                          client,
                                                          userId,
                                                          eventType: billingEventType,
                                                          fromPlan: previousPlan,
                                                          toPlan: plan,
                                                          subscriptionId: subscriptionId ?? null,
                                                          dodoEventId: eventId,
                                                          source: 'webhook',
                                                          details: {
                                                                      eventType,
                                                                      effectiveEventType,
                                                                      productId,
                                                                      planSource,
                                                          },
                                              });
                                  }
                        } else if (effectiveEventType === 'subscription.renewed') {
                                  await recordBillingEvent({
                                              client,
                                              userId,
                                              eventType: 'plan_renewed',
                                              fromPlan: previousPlan,
                                              toPlan: plan,
                                              subscriptionId: subscriptionId ?? null,
                                              dodoEventId: eventId,
                                              source: 'webhook',
                                              details: { eventType, effectiveEventType, productId, planSource },
                                  });
                        }
                    } else {
                                // Fail loudly - silently marking this event as processed
                                // would leave the user on their old plan forever despite
                                // their money clearing. Roll back so DodoPayments retries;
                                // if the env vars really are misconfigured, the retried
                                // deliveries will queue visibly in the provider dashboard
                                // and in our webhook_events table once we fix them.
                                await client.query('ROLLBACK');
                                logger.error('webhook.dodo.unknown_product', {
                                              event_id: eventId,
                                              event_type: eventType,
                                              product_id: productId,
                                              known_products: Object.keys(PLAN_MAP),
                                              metadata_plan: metadata.plan,
                                });
                                await auditLog('system', 'webhook_unknown_product', 'payment', eventId, {
                                              eventType, productId, userId, metadataPlan: metadata.plan,
                                }, 'dodopayments').catch(() => {});
                                return Response.json({
                                              error: 'Could not resolve plan from product_id. Check DODO_*_PRODUCT_ID env vars.',
                                }, { status: 500 });
                    }
            }

            // Handle downgrade events
            if (DOWNGRADE_EVENTS.has(effectiveEventType)) {
                      if (!userId || typeof userId !== 'string') {
                                  await client.query('ROLLBACK');
                                  logger.error('webhook.dodo.downgrade_missing_user_id', {
                                              event_id: eventId,
                                              event_type: eventType,
                                              metadata,
                                  });
                                  return Response.json({ error: 'Invalid webhook metadata' }, { status: 400 });
                      }
                      // Include `settings` in the SELECT so we can merge the
                      // subscription_events map without clobbering other
                      // subscription_ids' state (Bug 1b).
                      const userCheck2 = await client.query('SELECT id, email, plan, settings FROM users WHERE id = $1', [userId]);
                      if (!userCheck2.rows.length) {
                                  await client.query('ROLLBACK');
                                  logger.error('webhook.dodo.user_not_found_downgrade', { user_id: userId, event_type: eventType });
                                  return Response.json({ error: 'User not found' }, { status: 400 });
                      }

                    const previousPlan = userCheck2.rows[0].plan;
                      const previousEmail = userCheck2.rows[0].email;
                      const previousSettings = userCheck2.rows[0].settings;

                      // Filter cancellation events by active subscription.
                      // Dodo emits `subscription.cancelled` for the OLD
                      // subscription when a user changes plans (the old
                      // sub is replaced, not the new one). Without this
                      // filter the handler unconditionally applies any
                      // cancellation to the user's current plan,
                      // knocking a freshly-upgraded user back to free.
                      // Real Pro→Agency reproduction: cancellation for
                      // the now-superseded Pro sub
                      // sub_0NdpihUI8fnMDYR0pFDHI arrived AFTER the
                      // Agency activation for sub_0NdpjSV2ntpOQN8CNyYTg
                      // and clobbered plan='free'.
                      //
                      // Strict policy: only apply the cancellation if
                      // the payload's subscription_id matches the user's
                      // currently-bound `settings.subscription_id`. Any
                      // mismatch (or no bound subscription_id) -> skip
                      // the plan/email side-effects, but still record
                      // the cancellation in `subscription_events` so
                      // future events for that sub_id are ordered
                      // correctly.
                      const activeSubscriptionId = previousSettings && typeof previousSettings === 'object'
                        ? (previousSettings as Record<string, unknown>).subscription_id
                        : null;
                      const cancellationMatchesActive =
                        !!incomingSubscriptionId
                        && typeof activeSubscriptionId === 'string'
                        && activeSubscriptionId === incomingSubscriptionId;

                      if (!cancellationMatchesActive) {
                        // Record the cancellation in subscription_events
                        // for ordering, but DO NOT mutate plan or strip
                        // settings. The user's active sub stays bound.
                        if (incomingSubscriptionId) {
                          const priorEvents = getSubscriptionEvents(previousSettings);
                          const supersededMerge = {
                            subscription_events: {
                              ...priorEvents,
                              [incomingSubscriptionId]: {
                                status: 'cancelled',
                                last_event_at: (eventTimestamp ?? new Date()).toISOString(),
                                last_event_id: eventId,
                              },
                            },
                          };
                          await client.query(
                            `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
                            [JSON.stringify(supersededMerge), userId],
                          );
                        }

                        // Record the orphan-cancellation row inside the
                        // tx, but only for case (1) - a genuine orphan
                        // from a plan-upgrade race (previousPlan !== 'free').
                        // For case (2) the cancel route already wrote a
                        // plan_cancelled row, and emitting another
                        // superseded_sub_cancelled row on top would be
                        // user-visible noise. The plan_upgraded row from
                        // the new sub remains the user's primary record;
                        // this orphan row is informational and tagged so
                        // the UI can render it as "Old subscription
                        // cancelled" rather than the more alarming
                        // "Plan cancelled".
                        if (previousPlan !== 'free') {
                          await recordBillingEvent({
                            client,
                            userId,
                            eventType: 'superseded_sub_cancelled',
                            fromPlan: null,
                            toPlan: null,
                            subscriptionId: incomingSubscriptionId,
                            dodoEventId: eventId,
                            source: 'webhook',
                            details: {
                              eventType,
                              effectiveEventType,
                              active_subscription_id: typeof activeSubscriptionId === 'string' ? activeSubscriptionId : null,
                              previousPlan,
                              reason: 'orphan_post_upgrade',
                            },
                          });
                        }
                        await client.query('COMMIT');
                        logger.info('webhook.dodo.cancel_skipped_superseded_sub', {
                          userId,
                          eventId,
                          eventType,
                          effectiveEventType,
                          payload_subscription_id: incomingSubscriptionId,
                          active_subscription_id: typeof activeSubscriptionId === 'string' ? activeSubscriptionId : null,
                          previousPlan,
                        });

                        // Safety-net cancellation email. We landed in
                        // superseded_sub for one of two reasons:
                        //   (1) genuine orphan-upgrade race - the user
                        //       was upgraded to a NEW subscription_id
                        //       and Dodo is now sending a delayed
                        //       cancellation for the OLD sub_id. The
                        //       user is currently on a paid plan and
                        //       must NOT be told their subscription was
                        //       cancelled.
                        //   (2) cancel-route-ran-first race - the
                        //       /api/payments/cancel handler stripped
                        //       settings.subscription_id before this
                        //       delivery arrived, so cancellationMatchesActive
                        //       is false even though the user genuinely
                        //       cancelled. The user is now on 'free' and
                        //       must receive the confirmation email.
                        // We distinguish on previousPlan: 'free' means
                        // (2), anything else means (1). For (2) we
                        // enqueue under the SAME shared idempotency key
                        // the cancel route uses, so this is a UNIQUE-
                        // constraint no-op when the cancel route already
                        // succeeded, and fills the gap when it didn't.
                        if (previousPlan === 'free' && previousEmail && userId) {
                          tryEnqueueRecoveredCancellationEmail({
                            userId,
                            email: previousEmail,
                            source: 'webhook_superseded_sub',
                          })
                            .catch((err) => {
                              logger.error('webhook.dodo.superseded_recovery_email_error', {
                                userId,
                                error: (err as Error).message,
                              });
                            });
                        }

                        return Response.json({ received: true, skipped: 'superseded_sub' });
                      }

                      await client.query('UPDATE users SET plan = $1 WHERE id = $2', ['free', userId]);

                      // Strip user-bound subscription IDs (existing behaviour
                      // preserved for backwards compat with admin/billing
                      // readers) AND merge in the per-subscription event
                      // state for the specific cancelled subscription_id.
                      // Subscription_events is computed in JS because Postgres
                      // JSONB `||` is shallow merge - naive
                      // {subscription_events: {sub_X: ...}} would overwrite
                      // the entire map.
                      const downgradeMerge: Record<string, unknown> = {
                        subscription_status: 'cancelled',
                      };
                      if (incomingSubscriptionId) {
                        const priorEvents = getSubscriptionEvents(previousSettings);
                        downgradeMerge.subscription_events = {
                          ...priorEvents,
                          [incomingSubscriptionId]: {
                            status: 'cancelled',
                            last_event_at: (eventTimestamp ?? new Date()).toISOString(),
                            last_event_id: eventId,
                          },
                        };
                      }
                      await client.query(
                                  `UPDATE users SET settings = settings - 'subscription_id' - 'dodo_customer_id' - 'dodo_product_id' || $1::jsonb WHERE id = $2`,
                                  [JSON.stringify(downgradeMerge), userId]
                                );
                      logger.info('webhook.dodo.plan_downgraded', { userId, from: previousPlan, to: 'free', eventType, effectiveEventType, payloadStatus });

                      // Record the cancellation inside the tx. Dedup is
                      // by dodo_event_id so a webhook replay of this
                      // exact event does not duplicate. The cancel route
                      // path writes a separate row under
                      // source='cancel_route' with no dodo_event_id -
                      // those collide when the cancel route ran first
                      // (see the superseded_sub case (2) branch above,
                      // which suppresses the superseded row in that
                      // case). Net effect: every genuine cancellation
                      // produces exactly one user-visible row.
                      await recordBillingEvent({
                                  client,
                                  userId,
                                  eventType: 'plan_cancelled',
                                  fromPlan: previousPlan ?? null,
                                  toPlan: 'free',
                                  subscriptionId: incomingSubscriptionId,
                                  dodoEventId: eventId,
                                  source: 'webhook',
                                  details: { eventType, effectiveEventType, payloadStatus },
                      });

                      // Bug 2: always queue the cancellation email for a
                      // genuine cancellation event, even when previousPlan
                      // is already 'free' (e.g. the cancel route ran
                      // synchronously first and updated DB plan='free' a
                      // few seconds before this webhook arrived).
                      // Pre-fix the `previousPlan !== 'free'` guard
                      // suppressed exactly this scenario, which is why
                      // seo@thecontractorkingdom.com received no email.
                      // Cancel route now intentionally does NOT send its
                      // own email (Q3 - webhook owns it), so this is the
                      // sole owner of the cancellation message.
                      if (previousEmail) {
                                pendingPlanEmail = {
                                            kind: 'cancellation',
                                            email: previousEmail,
                                            from: previousPlan || 'free',
                                            to: 'free',
                                            subscriptionId: incomingSubscriptionId,
                                };
                      }
            }

            // Handle subscription on hold
            if (effectiveEventType === 'subscription.on_hold') {
                      if (userId && typeof userId === 'string') {
                                  await client.query(
                                                `UPDATE users SET settings = settings || '{"subscription_status":"on_hold"}'::jsonb WHERE id = $1`,
                                                [userId]
                                              );
                                  logger.info('webhook.dodo.subscription_on_hold', { userId, eventType });
                                  await recordBillingEvent({
                                              client,
                                              userId,
                                              eventType: 'subscription_on_hold',
                                              subscriptionId: incomingSubscriptionId,
                                              dodoEventId: eventId,
                                              source: 'webhook',
                                              details: { eventType, effectiveEventType, payloadStatus },
                                  });
                      }
            }

            // Handle subscription.paused
            if (effectiveEventType === 'subscription.paused') {
                      if (userId && typeof userId === 'string') {
                                  await client.query(
                                                `UPDATE users SET settings = settings || '{"subscription_status":"paused"}'::jsonb WHERE id = $1`,
                                                [userId]
                                              );
                                  logger.info('webhook.dodo.subscription_paused', { userId, eventType });
                                  await recordBillingEvent({
                                              client,
                                              userId,
                                              eventType: 'subscription_paused',
                                              subscriptionId: incomingSubscriptionId,
                                              dodoEventId: eventId,
                                              source: 'webhook',
                                              details: { eventType, effectiveEventType, payloadStatus },
                                  });
                      }
            }

            await client.query('COMMIT');

            // Audit log after commit (non-critical, fire-and-forget)
            if (userId) {
                      auditLog('system', 'webhook_plan_change', 'user', userId, {
                                  eventId, eventType,
                                  product_id: resolveProductId(eventData, body),
                                  subscription_id: eventData.subscription_id || body.subscription_id,
                      }, 'webhook');
            }

            // Plan-change confirmation email - enqueued to the durable
            // outbox (audit item D) instead of dispatched in-process.
            //
            // Idempotency keys:
            //   - upgrade / downgrade kinds   -> plan_email:userId:eventId
            //     (per-webhook-event scope; webhook_events idempotency
            //     above prevents the same event_id from re-emitting).
            //   - cancellation kind           -> planCancellationIdempotencyKey
            //     (per-subscription scope, shared formula with the
            //     cancel route - see lib/email.ts. Dedups the cancel-
            //     route + webhook race AND the case where Dodo emits
            //     both `subscription.updated`+status=cancelled AND a
            //     separate `subscription.cancelled` for the same
            //     logical cancellation. The pre-fix random-UUID
            //     fallback for missing subscription_id is replaced by
            //     a stable 'no_sub' marker so the dedup still holds
            //     when the binding has been stripped.)
            if (pendingPlanEmail) {
                      const planEmail = pendingPlanEmail;
                      const idempotencyKey = planEmail.kind === 'cancellation'
                        ? planCancellationIdempotencyKey(userId, planEmail.subscriptionId)
                        : `plan_email:${userId}:${eventId}`;
                      const send = planEmail.kind === 'upgrade'
                                ? sendPlanUpgradeEmail(planEmail.email, { previousPlan: planEmail.from, newPlan: planEmail.to }, idempotencyKey)
                                : planEmail.kind === 'downgrade'
                                  ? sendPlanDowngradeEmail(planEmail.email, { previousPlan: planEmail.from, newPlan: planEmail.to }, idempotencyKey)
                                  : sendPlanCancellationEmail(planEmail.email, { previousPlan: planEmail.from }, idempotencyKey);
                      send
                                .then((res) => {
                                            if (!res.sent) {
                                                        logger.warn('webhook.dodo.plan_email_failed', {
                                                                    userId, kind: planEmail.kind, reason: res.reason,
                                                        });
                                            } else {
                                                        logger.debug('webhook.dodo.plan_email_sent', { userId, kind: planEmail.kind });
                                            }
                                })
                                .catch((err) => {
                                            logger.error('webhook.dodo.plan_email_error', {
                                                        userId, kind: planEmail.kind, error: (err as Error).message,
                                            });
                                });
            }

            logger.info('webhook.dodo.processed', { event_id: eventId, event_type: eventType, effective_event_type: effectiveEventType });
            return Response.json({ received: true });
          } catch (txErr) {
                  await client.query('ROLLBACK').catch(() => {});
                  const code = (txErr as { code?: string })?.code;
                  if (code === SERIALIZATION_FAILURE_PG_CODE && attempt < MAX_TX_ATTEMPTS) {
                    shouldRetryAfterRollback = true;
                    logger.info('webhook.dodo.serialization_retry', {
                      eventId,
                      eventType,
                      attempt,
                      error: (txErr as Error).message,
                    });
                  } else {
                    throw txErr;
                  }
          } finally {
                  client.release();
          }
          // If the catch flagged a 40001-class failure with attempts
          // remaining, sleep the backoff and let the for loop iterate.
          // Any other code path either returned a Response inside the
          // try (success / early-return paths) or threw out of catch.
          if (shouldRetryAfterRollback) {
            await new Promise((r) => setTimeout(r, TX_RETRY_BACKOFF_MS[attempt - 1]));
            continue;
          }
      }
      // The for loop only exits through `return` (success path) or a
      // thrown error (catch re-throw). Reaching this line means we
      // exhausted MAX_TX_ATTEMPTS retries without a successful commit.
      logger.error('webhook.dodo.serialization_retries_exhausted', { eventId, eventType });
      return Response.json({ error: 'Webhook processing failed after retries' }, { status: 500 });
    } catch (e) {
          const errorMessage = (e as Error).message;
          // Stack traces can expose file paths and internal layout; log them
          // only outside production. Sentry already captures the full trace
          // via the instrumentation hook regardless.
          const stack = process.env.NODE_ENV === 'production' ? undefined : (e as Error).stack;
          logger.error('webhook.dodo.processing_error', { error: errorMessage, stack });
          // Return 500 for all errors to trigger Dodo's retry mechanism
          return Response.json({ error: 'Webhook processing failed, will retry' }, { status: 500 });
    }
}
