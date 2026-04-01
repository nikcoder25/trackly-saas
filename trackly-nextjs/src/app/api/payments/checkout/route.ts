import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

const PRODUCT_IDS: Record<string, string | undefined> = {
  starter: process.env.DODO_STARTER_PRODUCT_ID,
  pro: process.env.DODO_PRO_PRODUCT_ID,
  agency: process.env.DODO_AGENCY_PRODUCT_ID,
  enterprise: process.env.DODO_ENTERPRISE_PRODUCT_ID,
};

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const { plan } = await request.json();
  if (!plan || !PRODUCT_IDS[plan]) return Response.json({ error: 'Invalid plan' }, { status: 400 });

  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) return Response.json({ error: 'Payment system not configured' }, { status: 503 });

  try {
    const userResult = await pool.query('SELECT email, name FROM users WHERE id = $1', [user.id]);
    const u = userResult.rows[0];
    if (!u) return Response.json({ error: 'User not found' }, { status: 404 });

    const env = process.env.DODO_PAYMENTS_ENVIRONMENT || 'test_mode';
    const baseUrl = env === 'live_mode' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';
    const returnUrl = process.env.DODO_PAYMENTS_RETURN_URL || process.env.APP_URL || 'http://localhost:3000';

    const resp = await fetch(`${baseUrl}/checkouts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: PRODUCT_IDS[plan],
        payment_link: true,
        quantity: 1,
        customer: { email: u.email, name: u.name || u.email },
        metadata: { userId: user.id },
        return_url: returnUrl,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('[Checkout] DodoPayments error:', resp.status, text);
      return Response.json({ error: 'Failed to create checkout. Please try again.' }, { status: 500 });
    }

    const data = await resp.json();
    return Response.json({ url: data.payment_link || data.url, checkoutId: data.id });
  } catch (e) {
    console.error('[Checkout]', (e as Error).message);
    return Response.json({ error: 'Payment processing failed' }, { status: 500 });
  }
}
