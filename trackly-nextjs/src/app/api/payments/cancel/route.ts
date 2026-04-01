import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  try {
    const result = await pool.query('SELECT settings FROM users WHERE id = $1', [user.id]);
    const subId = result.rows[0]?.settings?.subscription_id;
    if (!subId) return Response.json({ error: 'No active subscription found' }, { status: 400 });

    const apiKey = process.env.DODO_PAYMENTS_API_KEY;
    if (!apiKey) return Response.json({ error: 'Payment system not configured' }, { status: 503 });

    const env = process.env.DODO_PAYMENTS_ENVIRONMENT || 'test_mode';
    const baseUrl = env === 'live_mode' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';

    const resp = await fetch(`${baseUrl}/subscriptions/${subId}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });

    if (!resp.ok) {
      console.error('[Cancel] DodoPayments error:', resp.status);
      return Response.json({ error: 'Failed to cancel subscription' }, { status: 500 });
    }

    await pool.query(
      `UPDATE users SET plan = 'free', settings = settings || '{"subscription_status":"cancelled"}'::jsonb WHERE id = $1`,
      [user.id]
    );

    return Response.json({ success: true, message: 'Subscription cancelled' });
  } catch (e) {
    return Response.json({ error: 'Failed to cancel subscription' }, { status: 500 });
  }
}
