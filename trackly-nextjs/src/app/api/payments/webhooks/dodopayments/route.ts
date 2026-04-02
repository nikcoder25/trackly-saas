import { pool, auditLog } from '@/lib/db';
import crypto from 'crypto';

const PLAN_MAP: Record<string, string> = {};
if (process.env.DODO_STARTER_PRODUCT_ID) PLAN_MAP[process.env.DODO_STARTER_PRODUCT_ID] = 'starter';
if (process.env.DODO_PRO_PRODUCT_ID) PLAN_MAP[process.env.DODO_PRO_PRODUCT_ID] = 'pro';
if (process.env.DODO_AGENCY_PRODUCT_ID) PLAN_MAP[process.env.DODO_AGENCY_PRODUCT_ID] = 'agency';
if (process.env.DODO_ENTERPRISE_PRODUCT_ID) PLAN_MAP[process.env.DODO_ENTERPRISE_PRODUCT_ID] = 'enterprise';

async function isWebhookProcessed(eventId: string): Promise<boolean> {
  const result = await pool.query('SELECT event_id FROM webhook_events WHERE event_id = $1', [eventId]);
  return result.rows.length > 0;
}

async function markWebhookProcessed(eventId: string, eventType: string) {
  await pool.query(
    'INSERT INTO webhook_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING',
    [eventId, eventType]
  );
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    // Webhook signature verification
    const webhookSecret = process.env.DODO_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[Webhook] DODO_WEBHOOK_SECRET is not set');
      return Response.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }
    if (webhookSecret) {
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
    }

    const body = JSON.parse(rawBody);

    // Require a real event ID from the payload
    const eventId = body.event_id || body.id;
    if (!eventId) {
      return Response.json({ error: 'Missing event_id' }, { status: 400 });
    }
    const eventType = body.type || body.event_type || '';

    // Idempotency check
    if (await isWebhookProcessed(eventId)) {
      return Response.json({ received: true, duplicate: true });
    }

    // Handle payment events
    if (eventType === 'payment.succeeded' || eventType === 'subscription.active') {
      const metadata = body.metadata || body.data?.metadata || {};
      const userId = metadata.userId;

      if (!userId || typeof userId !== 'string') {
        console.error('[Webhook] Missing or invalid userId in metadata');
        return Response.json({ error: 'Invalid webhook metadata' }, { status: 400 });
      }
      // Verify user actually exists
      const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (!userCheck.rows.length) {
        console.error('[Webhook] userId not found:', userId);
        return Response.json({ error: 'User not found' }, { status: 400 });
      }

      const productId = body.product_id || body.data?.product_id;
      const plan = productId ? PLAN_MAP[productId] : null;

      if (userId && plan) {
        await pool.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);
        // Store subscription ID if available
        const subscriptionId = body.subscription_id || body.data?.subscription_id;
        if (subscriptionId) {
          await pool.query(
            `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
            [JSON.stringify({ subscription_id: subscriptionId, subscription_status: 'active' }), userId]
          );
        }
        console.log(`[Webhook] Upgraded user ${userId} to ${plan}`);
        auditLog('system', 'webhook_plan_change', 'user', userId, { plan, eventId, eventType }, 'webhook');
      }
    }

    if (eventType === 'subscription.cancelled' || eventType === 'subscription.expired') {
      const metadata = body.metadata || body.data?.metadata || {};
      const userId = metadata.userId;

      if (!userId || typeof userId !== 'string') {
        console.error('[Webhook] Missing or invalid userId in metadata');
        return Response.json({ error: 'Invalid webhook metadata' }, { status: 400 });
      }
      // Verify user actually exists
      const userCheck2 = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (!userCheck2.rows.length) {
        console.error('[Webhook] userId not found:', userId);
        return Response.json({ error: 'User not found' }, { status: 400 });
      }

      if (userId) {
        await pool.query('UPDATE users SET plan = $1 WHERE id = $2', ['free', userId]);
        await pool.query(
          `UPDATE users SET settings = settings || '{"subscription_status":"cancelled"}'::jsonb WHERE id = $1`,
          [userId]
        );
        console.log(`[Webhook] Downgraded user ${userId} to free`);
        auditLog('system', 'webhook_plan_change', 'user', userId, { plan: 'free', eventId, eventType }, 'webhook');
      }
    }

    await markWebhookProcessed(eventId, eventType);
    return Response.json({ received: true });
  } catch (e) {
    console.error('[Webhook] Processing error:', (e as Error).message);
    return Response.json({ error: 'Webhook processing failed' }, { status: 200 });
  }
}
