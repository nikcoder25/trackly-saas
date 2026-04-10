import { pool, safeConnect, auditLog } from '@/lib/db';
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
        return Response.json({ received: true, duplicate: true });
      }

      // Extract userId from metadata
      const metadata = body.metadata || body.data?.metadata || {};
      const userId = metadata.userId;

      // Handle plan upgrade events
      if (eventType === 'payment.succeeded' || eventType === 'subscription.active' || eventType === 'subscription.renewed') {
        if (!userId || typeof userId !== 'string') {
          await client.query('ROLLBACK');
          return Response.json({ error: 'Invalid webhook metadata' }, { status: 400 });
        }
        const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
        if (!userCheck.rows.length) {
          await client.query('ROLLBACK');
          return Response.json({ error: 'User not found' }, { status: 400 });
        }

        const productId = body.product_id || body.data?.product_id;
        const plan = productId ? PLAN_MAP[productId] : null;

        if (plan) {
          const customerId = body.customer_id || body.data?.customer_id;
          if (customerId) {
            const customerCheck = await client.query(
              `SELECT id FROM users WHERE id = $1 AND (settings->>'dodo_customer_id' = $2 OR settings->>'dodo_customer_id' IS NULL)`,
              [userId, customerId]
            );
            if (!customerCheck.rows.length) {
              await client.query('ROLLBACK');
              return Response.json({ error: 'User/customer mismatch' }, { status: 400 });
            }
          }
          await client.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);
          const subscriptionId = body.subscription_id || body.data?.subscription_id;
          if (subscriptionId) {
            await client.query(
              `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
              [JSON.stringify({ subscription_id: subscriptionId, subscription_status: 'active' }), userId]
            );
          }
        }
      }

      // Handle downgrade events
      if (eventType === 'subscription.cancelled' || eventType === 'subscription.expired' || eventType === 'refund.succeeded') {
        if (!userId || typeof userId !== 'string') {
          await client.query('ROLLBACK');
          return Response.json({ error: 'Invalid webhook metadata' }, { status: 400 });
        }
        const userCheck2 = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
        if (!userCheck2.rows.length) {
          await client.query('ROLLBACK');
          return Response.json({ error: 'User not found' }, { status: 400 });
        }

        await client.query('UPDATE users SET plan = $1 WHERE id = $2', ['free', userId]);
        await client.query(
          `UPDATE users SET settings = settings || '{"subscription_status":"cancelled"}'::jsonb WHERE id = $1`,
          [userId]
        );
      }

      // Handle subscription on hold
      if (eventType === 'subscription.on_hold') {
        if (userId && typeof userId === 'string') {
          await client.query(
            `UPDATE users SET settings = settings || '{"subscription_status":"on_hold"}'::jsonb WHERE id = $1`,
            [userId]
          );
        }
      }

      await client.query('COMMIT');

      // Audit log after commit (non-critical, fire-and-forget)
      const metadata2 = body.metadata || body.data?.metadata || {};
      const auditUserId = metadata2.userId;
      if (auditUserId) {
        auditLog('system', 'webhook_plan_change', 'user', auditUserId, { eventId, eventType }, 'webhook');
      }

      return Response.json({ received: true });
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[Webhook] Processing error:', (e as Error).message);
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
