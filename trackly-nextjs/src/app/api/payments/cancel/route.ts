import { pool, auditLog } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const rl = await checkUserIpRateLimit('payments_cancel', user.id, getClientIp(request), {
    user: { max: 5, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    const result = await pool.query('SELECT plan, settings FROM users WHERE id = $1', [user.id]);
    const row = result.rows[0];
    if (!row) return Response.json({ error: 'User not found' }, { status: 404 });
    if (row.plan === 'free') return Response.json({ error: 'You are already on the free plan.' }, { status: 400 });

    const subId = row.settings?.subscription_id;

    // Cancel with DodoPayments if there's an active subscription
    if (subId) {
      const apiKey = process.env.DODO_PAYMENTS_API_KEY;
      if (!apiKey) return Response.json({ error: 'Payment system not configured' }, { status: 503 });

      const env = process.env.DODO_PAYMENTS_ENVIRONMENT || 'test_mode';
      const baseUrl = env === 'live_mode' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';

      // DodoPayments uses PATCH with status: 'cancelled' (not a /cancel subpath)
      const resp = await fetch(`${baseUrl}/subscriptions/${subId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        console.error('[Cancel] DodoPayments error:', resp.status, text);
        return Response.json({ error: 'Failed to cancel subscription with payment provider. Please contact support or try again.' }, { status: 500 });
      }
    }

    // Downgrade to free and clean up subscription data
    await pool.query(
      `UPDATE users SET plan = 'free', settings = settings - 'subscription_id' - 'dodo_customer_id' - 'dodo_product_id' || '{"subscription_status":"cancelled"}'::jsonb WHERE id = $1`,
      [user.id]
    );

    auditLog(user.id, 'subscription_cancelled', 'user', user.id, { previousPlan: row.plan }, '');

    return Response.json({ success: true, message: 'Subscription cancelled. You are now on the free plan.' });
  } catch (e) {
    console.error('[Cancel]', (e as Error).message);
    return Response.json({ error: 'Failed to cancel subscription' }, { status: 500 });
  }
}
