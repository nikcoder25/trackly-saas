import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logError, serverError } from '@/lib/api-error';
import { logger } from '@/lib/logger';
import {
  annualAvailability,
  billingCycleForProduct,
  monthlyProductIds,
  parseBillingCycle,
  resolveCheckout,
} from '@/lib/dodo-products';

// Tells the billing UI which plans can be bought annually and which cycle
// the user is on now, so the Monthly/Annual toggle only shows when usable.
export async function GET(request: Request) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const result = await pool.query('SELECT settings FROM users WHERE id = $1', [authResult.id]);
  const settings = (result.rows[0]?.settings ?? {}) as Record<string, unknown>;
  return Response.json({
    annual: annualAvailability(),
    currentBilling: billingCycleForProduct(settings.dodo_product_id),
  });
}

export async function POST(request: Request) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  // Each checkout call hits DodoPayments; bound spend + API chatter.
  const rl = await checkUserIpRateLimit('payments_checkout', user.id, getClientIp(request), {
    user: { max: 10, windowMs: 60 * 60 * 1000 },
    ip: { max: 20, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { plan: rawPlan, billing: rawBilling } = await request.json();
  const plan = typeof rawPlan === 'string' ? rawPlan.toLowerCase() : '';
  if (!plan || !monthlyProductIds()[plan]) return Response.json({ error: 'Invalid plan' }, { status: 400 });
  const billing = parseBillingCycle(rawBilling);
  if (!billing) return Response.json({ error: 'Invalid billing cycle' }, { status: 400 });

  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) return Response.json({ error: 'Payment system not configured' }, { status: 503 });

  try {
    const userResult = await pool.query('SELECT email, name, plan, settings FROM users WHERE id = $1', [user.id]);
    const u = userResult.rows[0];
    if (!u) return Response.json({ error: 'User not found' }, { status: 404 });

    // Picks the monthly or annual product and blocks downgrades via
    // checkout. A monthly -> annual switch of the same plan is allowed.
    const decision = resolveCheckout({
      plan,
      billing,
      currentPlan: u.plan,
      currentProductId: u.settings?.dodo_product_id,
    });
    if (!decision.ok) return Response.json({ error: decision.error }, { status: 400 });

    const env = process.env.DODO_PAYMENTS_ENVIRONMENT || 'test_mode';
    const baseUrl = env === 'live_mode' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';
    const appBase = (process.env.DODO_PAYMENTS_RETURN_URL || process.env.APP_URL || '').replace(/\/+$/, '');
    // Pass the user's pre-checkout plan back via the return URL so the
    // dashboard's success banner can detect when the upgrade hasn't
    // applied yet (Dodo webhook still in flight) and render
    // "Payment received, upgrade processing…" instead of the wrong
    // "Welcome to {currentPlan}!" message that Bug 1 in the
    // mnpwyu6r8730ddlda847 timeline was producing.
    // A monthly -> annual switch keeps the same plan, so `from` would leave
    // the banner stuck on "processing"; omit it for that case.
    const fromPlanParam = encodeURIComponent(u.plan || 'free');
    const returnUrl = plan === u.plan
      ? `${appBase}/dashboard?payment=success`
      : `${appBase}/dashboard?payment=success&from=${fromPlanParam}`;

    const resp = await fetch(`${baseUrl}/checkouts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_link: true,
        product_cart: [
          { product_id: decision.productId, quantity: 1 },
        ],
        customer: { email: u.email, name: u.name || u.email },
        metadata: { userId: user.id, plan, billing },
        return_url: returnUrl,
      }),
    });

    if (!resp.ok) {
      // Provider response body may echo the checkout payload (customer
      // email/name, metadata). Log only the status + a short preview so
      // PII can't leak into Sentry or App Platform logs.
      const text = await resp.text().catch(() => '');
      logger.error('payments.checkout.provider_error', {
        status: resp.status,
        body_preview: text.slice(0, 200),
      });
      return serverError({ message: 'Failed to create checkout. Please try again.' });
    }

    const data = await resp.json();
    return Response.json({ url: data.checkout_url, checkoutId: data.session_id });
  } catch (e) {
    logError('payments.checkout.failed', e);
    return serverError({ message: 'Payment processing failed' });
  }
}
