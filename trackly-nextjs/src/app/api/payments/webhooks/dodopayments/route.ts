import { pool, auditLog } from '@/lib/db';
import crypto from 'crypto';

const PLAN_MAP: Record<string, string> = {};
if (process.env.DODO_STARTER_PRODUCT_ID) PLAN_MAP[process.env.DODO_STARTER_PRODUCT_ID] = 'starter';
if (process.env.DODO_PRO_PRODUCT_ID) PLAN_MAP[process.env.DODO_PRO_PRODUCT_ID] = 'pro';
if (process.env.DODO_AGENCY_PRODUCT_ID) PLAN_MAP[process.env.DODO_AGENCY_PRODUCT_ID] = 'agency';
if (process.env.DODO_ENTERPRISE_PRODUCT_ID) PLAN_MAP[process.env.DODO_ENTERPRISE_PRODUCT_ID] = 'enterprise';


export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    // Webhook signature verification
    const webhookSecret = process.env.DODO_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return Response.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }
    const signature = request.headers.get('x-webhook-signature') || request.headers.get('x-dodo-signature');
    if (!signature) {
      return Response.json({ error: 'Missing signature' }, { status: 401 });
    }
    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody);

    // Require a real event ID from the payload
    const eventId = body.event_id || body.id;
    if (!eventId) {
      return Response.json({ error: 'Missing event_id' }, { status: 400 });
    }
    const eventType = body.type || body.event_type || '';

    // Idempotency: atomically mark as processed to prevent race conditions
    const inserted = await pool.query(
      'INSERT INTO webhook_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
      [eventId, eventType]
    );
    if (inserted.rows.length === 0) {
      return Response.json({ received: true, duplicate: true });
    }

    // Extract userId from metadata
    const metadata = body.metadata || body.data?.metadata || {};
    const userId = metadata.userId;

    // Handle plan upgrade events
    if (eventType === 'payment.succeeded' || eventType === 'subscription.active' || eventType === 'subscription.renewed') {
      if (!userId || typeof userId !== 'string') {
        return Response.json({ error: 'Invalid webhook metadata' }, { status: 400 });
      }
      const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (!userCheck.rows.length) {
        return Response.json({ error: 'User not found' }, { status: 400 });
      }

      const productId = body.product_id || body.data?.product_id;
      const plan = productId ? PLAN_MAP[productId] : null;

      if (plan) {
        // Verify the userId from metadata matches the payment customer for extra security
        const customerId = body.customer_id || body.data?.customer_id;
        if (customerId) {
          const customerCheck = await pool.query(
            `SELECT id FROM users WHERE id = $1 AND (settings->>'dodo_customer_id' = $2 OR settings->>'dodo_customer_id' IS NULL)`,
            [userId, customerId]
          );
          if (!customerCheck.rows.length) {
            return Response.json({ error: 'User/customer mismatch' }, { status: 400 });
          }
        }
        await pool.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);
        // Store subscription ID if available
        const subscriptionId = body.subscription_id || body.data?.subscription_id;
        if (subscriptionId) {
          await pool.query(
            `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
            [JSON.stringify({ subscription_id: subscriptionId, subscription_status: 'active' }), userId]
          );
        }
        auditLog('system', 'webhook_plan_change', 'user', userId, { plan, eventId, eventType }, 'webhook');
      }
    }

    // Handle downgrade events
    if (eventType === 'subscription.cancelled' || eventType === 'subscription.expired' || eventType === 'refund.succeeded') {
      if (!userId || typeof userId !== 'string') {
        return Response.json({ error: 'Invalid webhook metadata' }, { status: 400 });
      }
      const userCheck2 = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (!userCheck2.rows.length) {
        return Response.json({ error: 'User not found' }, { status: 400 });
      }

      await pool.query('UPDATE users SET plan = $1 WHERE id = $2', ['free', userId]);
      await pool.query(
        `UPDATE users SET settings = settings || '{"subscription_status":"cancelled"}'::jsonb WHERE id = $1`,
        [userId]
      );
      auditLog('system', 'webhook_plan_change', 'user', userId, { plan: 'free', eventId, eventType }, 'webhook');
    }

    // Handle subscription on hold
    if (eventType === 'subscription.on_hold') {
      if (userId && typeof userId === 'string') {
        await pool.query(
          `UPDATE users SET settings = settings || '{"subscription_status":"on_hold"}'::jsonb WHERE id = $1`,
          [userId]
        );
        auditLog('system', 'webhook_plan_change', 'user', userId, { status: 'on_hold', eventId, eventType }, 'webhook');
      }
    }

    return Response.json({ received: true });
  } catch (e) {
    console.error('[Webhook] Processing error:', (e as Error).message);
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
