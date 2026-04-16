import { pool, safeConnect, auditLog } from '@/lib/db';
import crypto from 'crypto';

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

// All event types that indicate an active/upgraded plan
const UPGRADE_EVENTS = new Set([
    'payment.succeeded',
    'subscription.active',
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

// Collect all configured webhook secrets to try (handles env var name mismatches)
function getWebhookSecrets(): string[] {
  const secrets: string[] = [];
  const key = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (key) secrets.push(key);
  if (secret && secret !== key) secrets.push(secret);
  return secrets;
}

// Verify HMAC-SHA256 signature against one or more secrets
function verifySignature(rawBody: string, signature: string, secrets: string[]): boolean {
  for (const secret of secrets) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expected, 'hex');
      if (sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        return true;
      }
    } catch {
      // Signature might not be valid hex — try base64 comparison
    }
    // Also try direct string comparison for non-hex signatures
    if (signature === expected) return true;
  }
  return false;
}

export async function POST(request: Request) {
    try {
          const rawBody = await request.text();

      // Diagnostic: log all incoming headers for debugging
      const allHeaders: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        // Redact auth tokens but keep signature headers
        if (key.toLowerCase().includes('authorization')) {
          allHeaders[key] = '[REDACTED]';
        } else {
          allHeaders[key] = value;
        }
      });
      console.log('[Webhook] Incoming request headers:', JSON.stringify(allHeaders));
      console.log('[Webhook] Raw body length:', rawBody.length);
      console.log('[Webhook] Raw body preview:', rawBody.substring(0, 200));

      // Webhook signature verification
      const secrets = getWebhookSecrets();
          if (!secrets.length) {
                  console.error('[Webhook] No webhook secrets configured (checked DODO_PAYMENTS_WEBHOOK_KEY and DODO_WEBHOOK_SECRET)');
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
        console.error('[Webhook] No signature header found. Checked:', signatureHeaders.join(', '));
        console.error('[Webhook] Available headers:', Object.keys(allHeaders).join(', '));
        return Response.json({ error: 'Missing signature' }, { status: 401 });
      }

      console.log('[Webhook] Signature found in header:', matchedHeader, '=', signature.substring(0, 20) + '...');

      // DodoPayments Standard Webhooks format: "v1,<base64-signature>"
      // Try extracting the actual signature if it has a version prefix
      let rawSignature = signature;
      if (signature.startsWith('v1,')) {
        const base64Sig = signature.slice(3);
        // Convert base64 signature to hex for comparison
        rawSignature = Buffer.from(base64Sig, 'base64').toString('hex');
        console.log('[Webhook] Detected v1 prefix, decoded base64 signature to hex');
      }

      // Also handle Standard Webhooks which use webhook-id + webhook-timestamp + body
      const webhookId = request.headers.get('webhook-id');
      const webhookTimestamp = request.headers.get('webhook-timestamp');
      let verified = false;

      if (webhookId && webhookTimestamp) {
        // Standard Webhooks format: sign(webhookId.webhookTimestamp.body)
        const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
        console.log('[Webhook] Using Standard Webhooks format: webhook-id=%s, webhook-timestamp=%s', webhookId, webhookTimestamp);

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
            if (sigValue === expected) {
              verified = true;
              console.log('[Webhook] Signature verified using Standard Webhooks format');
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
          console.log('[Webhook] Signature verified using simple HMAC(body) format');
        }
      }

      if (!verified) {
        // Log detailed diagnostic info for debugging
        const firstSecret = secrets[0];
        const simpleExpected = crypto.createHmac('sha256', firstSecret).update(rawBody).digest('hex');
        console.error('[Webhook] Signature verification FAILED');
        console.error('[Webhook] Received signature:', signature);
        console.error('[Webhook] Expected (simple HMAC hex):', simpleExpected.substring(0, 20) + '...');
        if (webhookId && webhookTimestamp) {
          const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
          let keyBytes: Buffer;
          if (firstSecret.startsWith('whsec_')) {
            keyBytes = Buffer.from(firstSecret.slice(6), 'base64');
          } else {
            keyBytes = Buffer.from(firstSecret, 'utf8');
          }
          const stdExpected = crypto.createHmac('sha256', keyBytes).update(signedContent).digest('base64');
          console.error('[Webhook] Expected (Standard Webhooks base64):', stdExpected.substring(0, 20) + '...');
        }
        console.error('[Webhook] Number of secrets tried:', secrets.length);
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }

      const body = JSON.parse(rawBody);

      // Require a real event ID from the payload
      const eventId = body.event_id || body.id || body.payload?.payment_id || body.payload?.subscription_id;
          if (!eventId) {
                  console.error('[Webhook] Missing event_id in payload. Keys:', Object.keys(body).join(', '));
                  return Response.json({ error: 'Missing event_id' }, { status: 400 });
          }
          const eventType = body.type || body.event_type || '';

      // Log the full webhook payload for debugging
      console.log('[Webhook] Processing event:', JSON.stringify({
              eventId,
              eventType,
              bodyKeys: Object.keys(body),
              product_id: body.product_id || body.data?.product_id || body.payload?.product_id,
              subscription_id: body.subscription_id || body.data?.subscription_id || body.payload?.subscription_id,
              customer_id: body.customer_id || body.data?.customer_id || body.payload?.customer_id,
              metadata: body.metadata || body.data?.metadata || body.payload?.metadata,
      }));

      // Extract nested data — DodoPayments may nest under .data or .payload
      const eventData = body.data || body.payload || body;

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
                            console.log('[Webhook] Duplicate event skipped:', eventId);
                            return Response.json({ received: true, duplicate: true });
                  }

            // Extract userId from metadata (check multiple possible locations)
            const metadata = body.metadata || body.data?.metadata || body.payload?.metadata || {};
                  const userId = metadata.userId || metadata.user_id;

            // Handle plan upgrade events
            if (UPGRADE_EVENTS.has(eventType)) {
                      if (!userId || typeof userId !== 'string') {
                                  await client.query('ROLLBACK');
                                  console.error('[Webhook] Upgrade event missing userId:', { eventId, eventType, metadata, bodyKeys: Object.keys(body) });
                                  return Response.json({ error: 'Invalid webhook metadata' }, { status: 400 });
                      }
                      const userCheck = await client.query('SELECT id, plan, settings FROM users WHERE id = $1', [userId]);
                      if (!userCheck.rows.length) {
                                  await client.query('ROLLBACK');
                                  console.error('[Webhook] User not found:', userId);
                                  return Response.json({ error: 'User not found' }, { status: 400 });
                      }

                    const currentUser = userCheck.rows[0];
                      const productId = eventData.product_id || body.product_id;
                      // Also check metadata.plan as fallback (set during checkout)
                    const plan = productId ? PLAN_MAP[productId] : (metadata.plan || null);

                    console.log('[Webhook] Upgrade resolution:', { userId, productId, plan, currentPlan: currentUser.plan, knownProducts: Object.keys(PLAN_MAP) });

                    if (plan) {
                                const customerId = eventData.customer_id || body.customer_id;
                                if (customerId) {
                                              const existingCustomerId = currentUser.settings?.dodo_customer_id;
                                              if (existingCustomerId && existingCustomerId !== customerId) {
                                                              await client.query('ROLLBACK');
                                                              console.error('[Webhook] Customer ID mismatch:', {
                                                                                userId, existingCustomerId, webhookCustomerId: customerId
                                                              });
                                                              return Response.json({ error: 'User/customer mismatch' }, { status: 400 });
                                              }
                                }

                        const previousPlan = currentUser.plan;
                                await client.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);
                                console.log('[Webhook] Plan updated:', { userId, from: previousPlan, to: plan, eventType });

                        // Build settings update with all relevant subscription data
                        const settingsUpdate: Record<string, string> = {
                                      subscription_status: 'active',
                        };
                                const subscriptionId = eventData.subscription_id || body.subscription_id;
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
                                console.warn('[Webhook] Could not determine plan from event:', {
                                              eventId, eventType, productId,
                                              knownProducts: Object.keys(PLAN_MAP),
                                              metadataPlan: metadata.plan,
                                });
                    }
            }

            // Handle downgrade events
            if (DOWNGRADE_EVENTS.has(eventType)) {
                      if (!userId || typeof userId !== 'string') {
                                  await client.query('ROLLBACK');
                                  console.error('[Webhook] Downgrade event missing userId:', { eventId, eventType, metadata });
                                  return Response.json({ error: 'Invalid webhook metadata' }, { status: 400 });
                      }
                      const userCheck2 = await client.query('SELECT id, plan FROM users WHERE id = $1', [userId]);
                      if (!userCheck2.rows.length) {
                                  await client.query('ROLLBACK');
                                  console.error('[Webhook] User not found for downgrade:', userId);
                                  return Response.json({ error: 'User not found' }, { status: 400 });
                      }

                    const previousPlan = userCheck2.rows[0].plan;
                      await client.query('UPDATE users SET plan = $1 WHERE id = $2', ['free', userId]);
                      await client.query(
                                  `UPDATE users SET settings = settings - 'subscription_id' - 'dodo_customer_id' - 'dodo_product_id' || '{"subscription_status":"cancelled"}'::jsonb WHERE id = $1`,
                                  [userId]
                                );
                      console.log('[Webhook] Plan downgraded:', { userId, from: previousPlan, to: 'free', eventType });
            }

            // Handle subscription on hold
            if (eventType === 'subscription.on_hold') {
                      if (userId && typeof userId === 'string') {
                                  await client.query(
                                                `UPDATE users SET settings = settings || '{"subscription_status":"on_hold"}'::jsonb WHERE id = $1`,
                                                [userId]
                                              );
                                  console.log('[Webhook] Subscription on hold:', { userId, eventType });
                      }
            }

            // Handle subscription.paused
            if (eventType === 'subscription.paused') {
                      if (userId && typeof userId === 'string') {
                                  await client.query(
                                                `UPDATE users SET settings = settings || '{"subscription_status":"paused"}'::jsonb WHERE id = $1`,
                                                [userId]
                                              );
                                  console.log('[Webhook] Subscription paused:', { userId, eventType });
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

            console.log('[Webhook] Successfully processed event:', eventId, eventType);
            return Response.json({ received: true });
          } catch (txErr) {
                  await client.query('ROLLBACK').catch(() => {});
                  throw txErr;
          } finally {
                  client.release();
          }
    } catch (e) {
          const errorMessage = (e as Error).message;
          console.error('[Webhook] Processing error:', errorMessage, (e as Error).stack);
          // Return 500 for all errors to trigger Dodo's retry mechanism
          return Response.json({ error: 'Webhook processing failed, will retry' }, { status: 500 });
    }
}
