import { pool } from '@/lib/db';

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
    const body = await request.json();
    const eventId = body.event_id || body.id || `evt_${Date.now()}`;
    const eventType = body.type || body.event_type || '';

    // Idempotency check
    if (await isWebhookProcessed(eventId)) {
      return Response.json({ received: true, duplicate: true });
    }

    // Handle payment events
    if (eventType === 'payment.succeeded' || eventType === 'subscription.active') {
      const metadata = body.metadata || body.data?.metadata || {};
      const userId = metadata.userId;
      const productId = body.product_id || body.data?.product_id;
      const plan = metadata.plan || (productId ? PLAN_MAP[productId] : null);

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
      }
    }

    if (eventType === 'subscription.cancelled' || eventType === 'subscription.expired') {
      const metadata = body.metadata || body.data?.metadata || {};
      const userId = metadata.userId;
      if (userId) {
        await pool.query('UPDATE users SET plan = $1 WHERE id = $2', ['free', userId]);
        await pool.query(
          `UPDATE users SET settings = settings || '{"subscription_status":"cancelled"}'::jsonb WHERE id = $1`,
          [userId]
        );
        console.log(`[Webhook] Downgraded user ${userId} to free`);
      }
    }

    await markWebhookProcessed(eventId, eventType);
    return Response.json({ received: true });
  } catch (e) {
    console.error('[Webhook]', (e as Error).message);
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
