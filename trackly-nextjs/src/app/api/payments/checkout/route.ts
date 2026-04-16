import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';

const PRODUCT_IDS: Record<string, string | undefined> = {
  starter: process.env.DODO_STARTER_PRODUCT_ID,
  pro: process.env.DODO_PRO_PRODUCT_ID,
  agency: process.env.DODO_AGENCY_PRODUCT_ID,
  enterprise: process.env.DODO_ENTERPRISE_PRODUCT_ID,
};

const PLAN_TIER: Record<string, number> = {
  free: 0, starter: 1, pro: 2, agency: 3, enterprise: 4, owner: 5,
};

export async function POST(request: Request) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { plan: rawPlan } = await request.json();
  const plan = typeof rawPlan === 'string' ? rawPlan.toLowerCase() : '';
  if (!plan || !PRODUCT_IDS[plan]) return Response.json({ error: 'Invalid plan' }, { status: 400 });

  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) return Response.json({ error: 'Payment system not configured' }, { status: 503 });

  try {
    const userResult = await pool.query('SELECT email, name, plan FROM users WHERE id = $1', [user.id]);
    const u = userResult.rows[0];
    if (!u) return Response.json({ error: 'User not found' }, { status: 404 });

    // Prevent downgrade attempts via checkout
    const currentTier = PLAN_TIER[u.plan] || 0;
    const targetTier = PLAN_TIER[plan] || 0;
    if (targetTier <= currentTier && u.plan !== 'free') {
      return Response.json({ error: 'Cannot downgrade via checkout. Use the cancel option to downgrade.' }, { status: 400 });
    }

    const env = process.env.DODO_PAYMENTS_ENVIRONMENT || 'test_mode';
    const baseUrl = env === 'live_mode' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';
    const appBase = (process.env.DODO_PAYMENTS_RETURN_URL || process.env.APP_URL || '').replace(/\/+$/, '');
    const returnUrl = appBase + '/dashboard?payment=success';

    const resp = await fetch(`${baseUrl}/checkouts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_link: true,
        product_cart: [
          { product_id: PRODUCT_IDS[plan], quantity: 1 },
        ],
        customer: { email: u.email, name: u.name || u.email },
        metadata: { userId: user.id, plan },
        return_url: returnUrl,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('[Checkout] DodoPayments error:', resp.status, text);
      return Response.json({ error: 'Failed to create checkout. Please try again.' }, { status: 500 });
    }

    const data = await resp.json();
    return Response.json({ url: data.checkout_url, checkoutId: data.session_id });
  } catch (e) {
    console.error('[Checkout]', (e as Error).message);
    return Response.json({ error: 'Payment processing failed' }, { status: 500 });
  }
}
