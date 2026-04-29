import { pool, auditLog } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logError, serverError } from '@/lib/api-error';
import { logger } from '@/lib/logger';
import { sendPlanCancellationEmail } from '@/lib/email';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const rl = await checkUserIpRateLimit('payments_cancel', user.id, getClientIp(request), {
    user: { max: 5, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    const result = await pool.query('SELECT email, plan, settings FROM users WHERE id = $1', [user.id]);
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
        logger.error('payments.cancel.provider_error', {
          status: resp.status,
          body_preview: text.slice(0, 200),
        });
        return serverError({ message: 'Failed to cancel subscription with payment provider. Please contact support or try again.' });
      }
    }

    // Downgrade to free and clean up subscription data
    await pool.query(
      `UPDATE users SET plan = 'free', settings = settings - 'subscription_id' - 'dodo_customer_id' - 'dodo_product_id' || '{"subscription_status":"cancelled"}'::jsonb WHERE id = $1`,
      [user.id]
    );

    auditLog(user.id, 'subscription_cancelled', 'user', user.id, { previousPlan: row.plan }, '');

    // Cancellation confirmation (Resend). Fire-and-forget — a delivery
    // failure should not roll back a successful cancellation, and we
    // already audit-logged the event so support can resend manually if
    // a customer reports never receiving it.
    if (row.email) {
      sendPlanCancellationEmail(row.email, { previousPlan: row.plan })
        .then((res) => {
          if (!res.sent) {
            logger.warn('payments.cancel.email_failed', { userId: user.id, reason: res.reason });
          }
        })
        .catch((err) => {
          logger.error('payments.cancel.email_error', { userId: user.id, error: (err as Error).message });
        });
    }

    return Response.json({ success: true, message: 'Subscription cancelled. You are now on the free plan.' });
  } catch (e) {
    logError('payments.cancel.failed', e);
    return serverError({ message: 'Failed to cancel subscription' });
  }
}
