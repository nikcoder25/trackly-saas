import { pool, safeConnect, auditLog } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  sendPlanUpgradeEmail,
  sendPlanDowngradeEmail,
  sendPlanCancellationEmail,
} from '@/lib/email';
import { comparePlans } from '@/lib/plan-config';
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

// All event types that indicate an active/upgraded plan
const UPGRADE_EVENTS = new Set([
    'payment.succeeded',
    'subscription.active',
    'subscription.renewed',
    'subscription.updated',
    'subscription.plan_changed',
  ]);

// Events that mutate an EXISTING subscription (as opposed to the first
// activation). On these we require the webhook's subscription_id to
// match the one we have bound to the user, so a webhook referencing a
// different subscription can't silently flip another user's plan.
const SUBSCRIPTION_UPDATE_EVENTS = new Set([
    'subscription.renewed',
    'subscription.updated',
    'subscription.plan_changed',
  ]);

// All event types that indicate a downgrade/cancellation
const DOWNGRADE_EVENTS = new Set([
    'subscription.cancelled',
    'subscription.expired',
    'refund.succeeded',
  ]);

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
      // raw body length. We never log header values — webhook signatures
      // are credentials and logging them would let anyone with log access
      // forge future webhooks. The body preview was also removed: it can
      // contain customer email/name and subscription IDs.
      const headerNames: string[] = [];
      request.headers.forEach((_value, key) => { headerNames.push(key); });
      logger.debug('webhook.dodo.received', {
        header_names: headerNames,
        body_length: rawBody.length,
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

      // Debug-only: full payload context. Suppressed in production stdout
      // (logger.debug skips console output when NODE_ENV=production) so
      // customer/subscription IDs aren't tee'd to App Platform logs; still
      // forwarded to Sentry breadcrumbs where the SDK scrubs PII.
      logger.debug('webhook.dodo.processing', {
              eventId,
              eventType,
              bodyKeys: Object.keys(body),
              product_id: body.product_id || body.data?.product_id || body.payload?.product_id,
              subscription_id: body.subscription_id || body.data?.subscription_id || body.payload?.subscription_id,
              customer_id: body.customer_id || body.data?.customer_id || body.payload?.customer_id,
              metadata: body.metadata || body.data?.metadata || body.payload?.metadata,
      });

      // Extract nested data - DodoPayments may nest under .data or .payload
      const eventData = body.data || body.payload || body;

      // Plan-change confirmation email to dispatch after the DB
      // transaction commits. We don't send mid-transaction because a
      // Resend outage would either burn webhook retries (if we threw)
      // or send a false confirmation (if we then rolled back).
      let pendingPlanEmail:
        | { kind: 'upgrade' | 'downgrade' | 'cancellation'; email: string; from: string; to: string }
        | null = null;

      // Use a transaction with SERIALIZABLE isolation to prevent race conditions
      // on duplicate webhook events and ensure atomic plan updates
      const client = await safeConnect();
          try {
                  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

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

            // Handle plan upgrade events
            if (UPGRADE_EVENTS.has(eventType)) {
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
                      const productId = eventData.product_id || body.product_id;
                      // Resolve plan STRICTLY from product_id. metadata.plan
                      // is never trusted: it's free-form string data attached
                      // at checkout time (and potentially mutable via the
                      // provider's customer portal), and flowing it straight
                      // into users.plan would let a value like 'owner' escalate
                      // into the admin-backend (see lib/admin-auth.ts).
                    const plan = productId ? PLAN_MAP[productId] : null;

                    logger.debug('webhook.dodo.upgrade_resolution', { userId, productId, plan, currentPlan: currentUser.plan, knownProducts: Object.keys(PLAN_MAP) });

                    if (plan && ALLOWED_WEBHOOK_PLANS.has(plan)) {
                                const subscriptionId = eventData.subscription_id || body.subscription_id;
                                const existingSubscriptionId = currentUser.settings?.subscription_id;

                                // On events that mutate an existing subscription,
                                // require the webhook's subscription_id to match
                                // the one already bound to the user. Blocks
                                // cross-user plan updates if a webhook references
                                // someone else's subscription.
                                if (
                                  SUBSCRIPTION_UPDATE_EVENTS.has(eventType)
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

                        const previousPlan = currentUser.plan;
                                await client.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);
                                logger.info('webhook.dodo.plan_updated', { userId, from: previousPlan, to: plan, eventType });

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

                        // Build settings update with all relevant subscription data
                        const settingsUpdate: Record<string, string> = {
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

                        await client.query(
                                      `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
                                      [JSON.stringify(settingsUpdate), userId]
                                    );
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
            if (DOWNGRADE_EVENTS.has(eventType)) {
                      if (!userId || typeof userId !== 'string') {
                                  await client.query('ROLLBACK');
                                  logger.error('webhook.dodo.downgrade_missing_user_id', {
                                              event_id: eventId,
                                              event_type: eventType,
                                              metadata,
                                  });
                                  return Response.json({ error: 'Invalid webhook metadata' }, { status: 400 });
                      }
                      const userCheck2 = await client.query('SELECT id, email, plan FROM users WHERE id = $1', [userId]);
                      if (!userCheck2.rows.length) {
                                  await client.query('ROLLBACK');
                                  logger.error('webhook.dodo.user_not_found_downgrade', { user_id: userId, event_type: eventType });
                                  return Response.json({ error: 'User not found' }, { status: 400 });
                      }

                    const previousPlan = userCheck2.rows[0].plan;
                      const previousEmail = userCheck2.rows[0].email;
                      await client.query('UPDATE users SET plan = $1 WHERE id = $2', ['free', userId]);
                      await client.query(
                                  `UPDATE users SET settings = settings - 'subscription_id' - 'dodo_customer_id' - 'dodo_product_id' || '{"subscription_status":"cancelled"}'::jsonb WHERE id = $1`,
                                  [userId]
                                );
                      logger.info('webhook.dodo.plan_downgraded', { userId, from: previousPlan, to: 'free', eventType });

                      // Queue a cancellation email if the user was actually on a
                      // paid plan. No need to email someone who was already free
                      // (e.g. a webhook fires after a chargeback on a long-since
                      // cancelled subscription).
                      if (previousEmail && previousPlan && previousPlan !== 'free') {
                                pendingPlanEmail = {
                                            kind: 'cancellation',
                                            email: previousEmail,
                                            from: previousPlan,
                                            to: 'free',
                                };
                      }
            }

            // Handle subscription on hold
            if (eventType === 'subscription.on_hold') {
                      if (userId && typeof userId === 'string') {
                                  await client.query(
                                                `UPDATE users SET settings = settings || '{"subscription_status":"on_hold"}'::jsonb WHERE id = $1`,
                                                [userId]
                                              );
                                  logger.info('webhook.dodo.subscription_on_hold', { userId, eventType });
                      }
            }

            // Handle subscription.paused
            if (eventType === 'subscription.paused') {
                      if (userId && typeof userId === 'string') {
                                  await client.query(
                                                `UPDATE users SET settings = settings || '{"subscription_status":"paused"}'::jsonb WHERE id = $1`,
                                                [userId]
                                              );
                                  logger.info('webhook.dodo.subscription_paused', { userId, eventType });
                      }
            }

            await client.query('COMMIT');

            // Audit log after commit (non-critical, fire-and-forget)
            if (userId) {
                      auditLog('system', 'webhook_plan_change', 'user', userId, {
                                  eventId, eventType,
                                  product_id: eventData.product_id || body.product_id,
                                  subscription_id: eventData.subscription_id || body.subscription_id,
                      }, 'webhook');
            }

            // Plan-change confirmation email (Resend). Fire-and-forget: a
            // delivery failure should not retry the webhook — Dodo would
            // re-invoke this handler, the duplicate guard would skip the
            // DB work, and we'd never re-send the email anyway.
            if (pendingPlanEmail) {
                      const planEmail = pendingPlanEmail;
                      const send = planEmail.kind === 'upgrade'
                                ? sendPlanUpgradeEmail(planEmail.email, { previousPlan: planEmail.from, newPlan: planEmail.to })
                                : planEmail.kind === 'downgrade'
                                  ? sendPlanDowngradeEmail(planEmail.email, { previousPlan: planEmail.from, newPlan: planEmail.to })
                                  : sendPlanCancellationEmail(planEmail.email, { previousPlan: planEmail.from });
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

            logger.debug('webhook.dodo.processed', { eventId, eventType });
            return Response.json({ received: true });
          } catch (txErr) {
                  await client.query('ROLLBACK').catch(() => {});
                  throw txErr;
          } finally {
                  client.release();
          }
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
