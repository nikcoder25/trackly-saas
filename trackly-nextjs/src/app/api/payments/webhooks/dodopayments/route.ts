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

export async function POST(request: Request) {
    try {
          const rawBody = await request.text();

      // Webhook signature verification
      const webhookSecret = process.env.DODO_PAYMENTS_WEBHOOK_KEY || process.env.DODO_WEBHOOK_SECRET;
          if (!webhookSecret) {
                  console.error('[Webhook] DODO_PAYMENTS_WEBHOOK_KEY not configured');
                  return Response.json({ error: 'Webhook secret not configured' }, { status: 500 });
          }
          const signature = request.headers.get('x-webhook-signature') || request.headers.get('x-dodo-signature');
          if (!signature) {
                  console.error('[Webhook] Missing signature header');
                  return Response.json({ error: 'Missing signature' }, { status: 401 });
          }
          const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
          const sigBuffer = Buffer.from(signature, 'hex');
          const expectedBuffer = Buffer.from(expected, 'hex');
          if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
                  console.error('[Webhook] Invalid signature');
                  return Response.json({ error: 'Invalid signature' }, { status: 401 });
          }

      const body = JSON.parse(rawBody);

      // Require a real event ID from the payload
      const eventId = body.event_id || body.id;
          if (!eventId) {
                  console.error('[Webhook] Missing event_id in payload');
                  return Response.json({ error: 'Missing event_id' }, { status: 400 });
          }
          const eventType = body.type || body.event_type || '';

      // Log the full webhook payload for debugging (redact sensitive fields)
      console.log('[Webhook] Received:', JSON.stringify({
              eventId,
              eventType,
              product_id: body.product_id || body.data?.product_id,
              subscription_id: body.subscription_id || body.data?.subscription_id,
              customer_id: body.customer_id || body.data?.customer_id,
              metadata: body.metadata || body.data?.metadata,
      }));

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
            const metadata = body.metadata || body.data?.metadata || {};
                  const userId = metadata.userId || metadata.user_id;

            // Handle plan upgrade events
            if (UPGRADE_EVENTS.has(eventType)) {
                      if (!userId || typeof userId !== 'string') {
                                  await client.query('ROLLBACK');
                                  console.error('[Webhook] Upgrade event missing userId:', { eventId, eventType, metadata });
                                  return Response.json({ error: 'Invalid webhook metadata' }, { status: 400 });
                      }
                      const userCheck = await client.query('SELECT id, plan, settings FROM users WHERE id = $1', [userId]);
                      if (!userCheck.rows.length) {
                                  await client.query('ROLLBACK');
                                  console.error('[Webhook] User not found:', userId);
                                  return Response.json({ error: 'User not found' }, { status: 400 });
                      }

                    const currentUser = userCheck.rows[0];
                      const productId = body.product_id || body.data?.product_id;
                      // Also check metadata.plan as fallback (set during checkout)
                    const plan = productId ? PLAN_MAP[productId] : (metadata.plan || null);

                    if (plan) {
                                const customerId = body.customer_id || body.data?.customer_id;
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
                                const subscriptionId = body.subscription_id || body.data?.subscription_id;
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
                                  `UPDATE users SET settings = settings || '{"subscription_status":"cancelled"}'::jsonb WHERE id = $1`,
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
                                  product_id: body.product_id || body.data?.product_id,
                                  subscription_id: body.subscription_id || body.data?.subscription_id,
                      }, 'webhook');
            }

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
          // Return 200 for transient/parse errors so Dodo doesn't stop retrying permanently
      // Only return 500 for truly fatal configuration errors
      if (errorMessage.includes('Webhook secret') || errorMessage.includes('not configured')) {
              return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
      }
          // Return 500 to trigger Dodo's retry mechanism for transient errors
      return Response.json({ error: 'Webhook processing failed, will retry' }, { status: 500 });
    }
}
