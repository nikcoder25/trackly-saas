import { pool, safeConnect, auditLog } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logError, serverError } from '@/lib/api-error';
import { logger } from '@/lib/logger';

const PLAN_MAP: Record<string, string> = {};
if (process.env.DODO_STARTER_PRODUCT_ID) PLAN_MAP[process.env.DODO_STARTER_PRODUCT_ID] = 'starter';
if (process.env.DODO_PRO_PRODUCT_ID) PLAN_MAP[process.env.DODO_PRO_PRODUCT_ID] = 'pro';
if (process.env.DODO_AGENCY_PRODUCT_ID) PLAN_MAP[process.env.DODO_AGENCY_PRODUCT_ID] = 'agency';
if (process.env.DODO_ENTERPRISE_PRODUCT_ID) PLAN_MAP[process.env.DODO_ENTERPRISE_PRODUCT_ID] = 'enterprise';

const ALLOWED_PLANS = new Set(['starter', 'pro', 'agency', 'enterprise']);

// User-initiated subscription sync. Fetches the live state directly
// from Dodo and reconciles the local DB if it has drifted. Used as the
// escape hatch when a webhook is delayed or dropped — the billing page
// "Refresh status" button calls this, and the post-checkout success
// banner polls it until the plan converges.
//
// Idempotent on the local-DB side: writes only happen when the
// observed Dodo state differs from what's stored. Plan downgrades
// triggered here intentionally do NOT enqueue a cancellation email
// (the webhook + reconcile cron already own that path; piggybacking
// here would risk a fourth duplicate).
export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const rl = await checkUserIpRateLimit('payments_refresh', user.id, getClientIp(request), {
    user: { max: 30, windowMs: 60 * 60 * 1000 },
    ip: { max: 60, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    const before = await pool.query('SELECT plan, settings FROM users WHERE id = $1', [user.id]);
    const row = before.rows[0];
    if (!row) return Response.json({ error: 'User not found' }, { status: 404 });

    const subscriptionId: string | null = row.settings?.subscription_id || null;

    // No bound subscription — nothing to fetch from Dodo. Return the
    // current local plan so the caller can stop polling.
    if (!subscriptionId) {
      logger.info('payments.refresh.no_subscription', { userId: user.id, plan: row.plan });
      return Response.json({
        plan: row.plan || 'free',
        subscriptionId: null,
        subscriptionStatus: row.settings?.subscription_status || null,
        synced: false,
      });
    }

    const apiKey = process.env.DODO_PAYMENTS_API_KEY;
    if (!apiKey) {
      logger.error('payments.refresh.missing_api_key', { userId: user.id });
      return Response.json({ error: 'Payment system not configured' }, { status: 503 });
    }

    const env = process.env.DODO_PAYMENTS_ENVIRONMENT || 'test_mode';
    const baseUrl = env === 'live_mode'
      ? 'https://live.dodopayments.com'
      : 'https://test.dodopayments.com';

    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/subscriptions/${subscriptionId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });
    } catch (fetchErr) {
      logger.error('payments.refresh.provider_network_error', {
        userId: user.id,
        error: (fetchErr as Error).message,
      });
      return serverError({ message: 'Could not reach payment provider. Try again in a moment.' });
    }

    // 404 / 410 — Dodo no longer knows about this subscription. Strip
    // the binding and downgrade locally. Mirrors reconcile-payments
    // cron's stale_subscription_404 branch.
    if (resp.status === 404 || resp.status === 410) {
      const client = await safeConnect();
      let didDowngrade = false;
      try {
        await client.query('BEGIN');
        if (row.plan !== 'free') {
          const updated = await client.query(
            `UPDATE users SET plan = 'free' WHERE id = $1 AND plan = $2 RETURNING id`,
            [user.id, row.plan],
          );
          didDowngrade = updated.rows.length > 0;
        }
        await client.query(
          `UPDATE users SET settings = settings - 'subscription_id' - 'dodo_customer_id' - 'dodo_product_id' || '{"subscription_status":"not_found"}'::jsonb WHERE id = $1`,
          [user.id],
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        logError('payments.refresh.stale_cleanup_failed', e);
        return serverError({ message: 'Failed to sync subscription' });
      } finally {
        client.release();
      }
      logger.info('payments.refresh.stale_subscription_cleaned', {
        userId: user.id,
        subscription_id: subscriptionId,
        downgraded: didDowngrade,
      });
      auditLog(user.id, 'manual_refresh_stale_sub', 'user', user.id, {
        previousPlan: row.plan, subscriptionId,
      }, 'refresh-route').catch(() => {});
      return Response.json({
        plan: 'free',
        subscriptionId: null,
        subscriptionStatus: 'not_found',
        synced: didDowngrade,
      });
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      logger.error('payments.refresh.provider_error', {
        userId: user.id,
        status: resp.status,
        body_preview: text.slice(0, 200),
      });
      return serverError({ message: 'Could not read subscription from payment provider.' });
    }

    const sub = await resp.json();
    const dodoStatus: string = sub.status || 'unknown';
    const dodoProductId: string | null = sub.product_id || null;
    const customerId: string | null = sub.customer?.customer_id || null;

    // Determine target plan from the live Dodo state.
    let expectedPlan: string | null;
    if (dodoStatus !== 'active') {
      expectedPlan = 'free';
    } else {
      expectedPlan = dodoProductId ? PLAN_MAP[dodoProductId] : null;
      if (!expectedPlan || !ALLOWED_PLANS.has(expectedPlan)) {
        logger.warn('payments.refresh.unknown_product_id', {
          userId: user.id,
          dodo_product_id: dodoProductId,
          dodo_status: dodoStatus,
        });
        return Response.json({
          plan: row.plan || 'free',
          subscriptionId,
          subscriptionStatus: row.settings?.subscription_status || null,
          synced: false,
        });
      }
    }

    let synced = false;
    if (row.plan !== expectedPlan || row.settings?.subscription_status !== dodoStatus) {
      const client = await safeConnect();
      try {
        await client.query('BEGIN');
        // Conditional UPDATE — webhook may have flipped this row between
        // our SELECT and UPDATE. RETURNING is empty if so; we treat that
        // as success (the other writer's value is what we'd have written).
        if (row.plan !== expectedPlan) {
          const updated = await client.query(
            `UPDATE users SET plan = $1 WHERE id = $2 AND plan = $3 RETURNING id`,
            [expectedPlan, user.id, row.plan],
          );
          synced = updated.rows.length > 0;
        }
        const settingsUpdate: Record<string, unknown> = {
          subscription_status: dodoStatus,
        };
        if (dodoProductId) settingsUpdate.dodo_product_id = dodoProductId;
        if (customerId) settingsUpdate.dodo_customer_id = customerId;
        if (expectedPlan === 'free') {
          // Mirror cancel/webhook behaviour: strip bindings on downgrade.
          await client.query(
            `UPDATE users SET settings = settings - 'subscription_id' - 'dodo_customer_id' - 'dodo_product_id' || $1::jsonb WHERE id = $2`,
            [JSON.stringify(settingsUpdate), user.id],
          );
        } else {
          await client.query(
            `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
            [JSON.stringify(settingsUpdate), user.id],
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        logError('payments.refresh.update_failed', e);
        return serverError({ message: 'Failed to sync subscription' });
      } finally {
        client.release();
      }
      logger.info('payments.refresh.synced', {
        userId: user.id,
        from_plan: row.plan,
        to_plan: expectedPlan,
        dodo_status: dodoStatus,
        subscription_id: subscriptionId,
      });
      if (synced) {
        auditLog(user.id, 'manual_refresh_synced', 'user', user.id, {
          previousPlan: row.plan, newPlan: expectedPlan, dodoStatus, subscriptionId,
        }, 'refresh-route').catch(() => {});
      }
    } else {
      logger.debug('payments.refresh.already_in_sync', {
        userId: user.id,
        plan: row.plan,
        dodo_status: dodoStatus,
      });
    }

    return Response.json({
      plan: expectedPlan,
      subscriptionId,
      subscriptionStatus: dodoStatus,
      synced,
    });
  } catch (e) {
    logError('payments.refresh.failed', e);
    return serverError({ message: 'Failed to refresh subscription' });
  }
}
