/**
 * DodoPayments integration — checkout, webhooks, customer portal
 * Uses @dodopayments/express adapter for Express.js
 */
const express = require('express');
const https   = require('https');
const router  = express.Router();

const { pool, notify } = require('../config/db');
const { auth } = require('../middleware/auth');
const { safeUser } = require('../lib/helpers');
const { createLogger } = require('../lib/logger');
const { API_ENDPOINTS, TIMEOUTS } = require('../config/constants');
const log = createLogger('Payments');

// Webhook idempotency — prevent duplicate event processing
async function isWebhookProcessed(eventId) {
  if (!eventId) return false;
  try {
    const result = await pool.query('SELECT event_id FROM webhook_events WHERE event_id = $1', [eventId]);
    return result.rows.length > 0;
  } catch(e) { return false; }
}
async function markWebhookProcessed(eventId, eventType) {
  if (!eventId) return;
  try {
    await pool.query(
      'INSERT INTO webhook_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING',
      [eventId, eventType]
    );
  } catch(e) { log.error('Webhook dedup failed', { error: e.message }); }
}

// ─── CONFIGURATION ──────────────────────────────────────────────
const DODO_API_KEY        = process.env.DODO_PAYMENTS_API_KEY || '';
const DODO_WEBHOOK_KEY    = process.env.DODO_PAYMENTS_WEBHOOK_KEY || '';
const DODO_ENVIRONMENT    = process.env.DODO_PAYMENTS_ENVIRONMENT; // 'test_mode' or 'live_mode'
const DODO_RETURN_URL     = process.env.DODO_PAYMENTS_RETURN_URL || '';

// Product IDs — set these in your DodoPayments dashboard, then configure via env vars
const DODO_STARTER_PRODUCT_ID    = process.env.DODO_STARTER_PRODUCT_ID || '';
const DODO_PRO_PRODUCT_ID        = process.env.DODO_PRO_PRODUCT_ID || '';
const DODO_AGENCY_PRODUCT_ID     = process.env.DODO_AGENCY_PRODUCT_ID || '';
const DODO_ENTERPRISE_PRODUCT_ID = process.env.DODO_ENTERPRISE_PRODUCT_ID || '';

// Map product IDs to plans
function planFromProductId(productId) {
  if (productId === DODO_STARTER_PRODUCT_ID) return 'starter';
  if (productId === DODO_PRO_PRODUCT_ID) return 'pro';
  if (productId === DODO_AGENCY_PRODUCT_ID) return 'agency';
  if (productId === DODO_ENTERPRISE_PRODUCT_ID) return 'enterprise';
  return null;
}

// ─── CHECKOUT — Create a payment link for plan upgrade ──────────
router.post('/checkout', auth, async (req, res) => {
  if (!DODO_API_KEY) {
    return res.status(503).json({ error: 'Payment system not configured. Contact support.' });
  }

  const { plan } = req.body;
  if (!['starter', 'pro', 'agency', 'enterprise'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan. Choose starter, pro, agency, or enterprise.' });
  }

  const productIdMap = { starter: DODO_STARTER_PRODUCT_ID, pro: DODO_PRO_PRODUCT_ID, agency: DODO_AGENCY_PRODUCT_ID, enterprise: DODO_ENTERPRISE_PRODUCT_ID };
  const productId = productIdMap[plan];
  if (!productId) {
    return res.status(503).json({ error: 'Payment product not configured for this plan. Contact support.' });
  }

  try {
    // Get current user info
    const userResult = await pool.query('SELECT id, email, name, plan FROM users WHERE id = $1', [req.user.id]);
    if (!userResult.rows.length) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];

    // Don't allow if already on same or higher plan
    const tiers = { free: 0, starter: 1, pro: 2, agency: 3, enterprise: 4, owner: 5 };
    const currentTier = tiers[user.plan];
    const targetTier = tiers[plan];
    // Guard against unknown plan values (undefined tier would bypass the check)
    if (currentTier === undefined || targetTier === undefined || currentTier >= targetTier) {
      return res.status(400).json({ error: `You are already on the ${user.plan} plan.` });
    }

    const baseUrl = DODO_ENVIRONMENT === 'live_mode'
      ? API_ENDPOINTS.dodopayments.live
      : API_ENDPOINTS.dodopayments.test;

    const returnUrl = DODO_RETURN_URL || `${req.protocol}://${req.get('host')}`;

    const checkoutPayload = {
      product_cart: [{ product_id: productId, quantity: 1 }],
      payment_link: true,
      return_url: returnUrl,
      customer: {
        email: user.email,
        name: user.name || user.email.split('@')[0]
      },
      metadata: {
        user_id: user.id,
        plan: plan
      }
    };

    // Create checkout session via DodoPayments API
    const body = JSON.stringify(checkoutPayload);
    const checkoutUrl = await new Promise((resolve, reject) => {
      const reqOpts = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DODO_API_KEY}`,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: TIMEOUTS.paymentApi
      };

      const apiReq = https.request(`${baseUrl}/checkouts`, reqOpts, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => { data += chunk; });
        apiRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (apiRes.statusCode >= 400) {
              reject(new Error(parsed.message || parsed.error || 'Checkout creation failed'));
            } else {
              resolve(parsed.checkout_url || parsed.payment_link || parsed.url);
            }
          } catch(e) {
            reject(new Error('Invalid response from payment service'));
          }
        });
      });
      apiReq.on('timeout', () => { apiReq.destroy(); reject(new Error('Payment service timeout')); });
      apiReq.on('error', reject);
      apiReq.write(body);
      apiReq.end();
    });

    if (!checkoutUrl) {
      return res.status(500).json({ error: 'Failed to create checkout session' });
    }

    res.json({ checkout_url: checkoutUrl, plan });
  } catch(e) {
    log.error('Checkout failed', { error: e.message });
    res.status(500).json({ error: 'Failed to create checkout. Please try again.' });
  }
});

// ─── WEBHOOK — Handle DodoPayments events ──────────────────────
// Uses @dodopayments/express Webhooks handler for signature verification
if (DODO_WEBHOOK_KEY) {
  const { Webhooks } = require('@dodopayments/express');

  router.post('/webhooks/dodopayments',
    express.raw({ type: 'application/json' }),
    Webhooks({
      webhookKey: DODO_WEBHOOK_KEY,

      // Payment succeeded — upgrade user plan
      onPaymentSucceeded: async (payload) => {
        try {
          const data = payload.data || payload;
          const eventId = data.payment_id || data.id || payload.id;
          if (!eventId) { log.warn('payment.succeeded missing event ID'); return; }
          if (await isWebhookProcessed(eventId)) return;
          const metadata = data.metadata || {};
          const userId = metadata.user_id;
          const plan = metadata.plan;

          if (!userId || !plan) {
            log.warn('payment.succeeded missing user_id or plan in metadata');
            return;
          }

          if (!['starter', 'pro', 'agency', 'enterprise'].includes(plan)) {
            log.warn('Invalid plan in metadata', { plan });
            return;
          }

          // Upgrade user plan
          const result = await pool.query(
            'UPDATE users SET plan = $1 WHERE id = $2 RETURNING id, email, plan',
            [plan, userId]
          );
          if (result.rows.length) {
            log.info(`Upgraded user ${result.rows[0].email} to ${plan} plan`);
            await markWebhookProcessed(eventId, 'payment.succeeded');
          } else {
            log.warn('User not found for upgrade', { userId });
          }
        } catch(e) {
          log.error('payment.succeeded error', { error: e.message });
        }
      },

      // Payment failed
      onPaymentFailed: async (payload) => {
        const data = payload.data || payload;
        const metadata = data.metadata || {};
        log.warn('Payment failed', { userId: metadata.user_id || 'unknown', paymentId: data.payment_id || null });
      },

      // Subscription activated
      onSubscriptionActive: async (payload) => {
        try {
          const data = payload.data || payload;
          const eventId = data.subscription_id || data.id || payload.id;
          if (!eventId) { log.warn('subscription.active missing event ID'); return; }
          if (await isWebhookProcessed('sub_active_' + eventId)) return;
          const metadata = data.metadata || {};
          const userId = metadata.user_id;
          const productId = data.product_id;
          const plan = metadata.plan || planFromProductId(productId);

          if (!userId || !plan) {
            log.warn('subscription.active missing user_id or plan');
            return;
          }

          if (!['starter', 'pro', 'agency', 'enterprise'].includes(plan)) return;

          // Store subscription ID for future reference
          const subscriptionId = data.subscription_id;
          await pool.query(
            `UPDATE users SET plan = $1, settings = settings || $2::jsonb WHERE id = $3`,
            [plan, JSON.stringify({ dodo_subscription_id: subscriptionId }), userId]
          );
          log.info(`Subscription activated for user ${userId}: ${plan}`);
          await markWebhookProcessed('sub_active_' + eventId, 'subscription.active');
        } catch(e) {
          log.error('subscription.active error', { error: e.message });
        }
      },

      // Subscription renewed — re-confirm the plan is active
      onSubscriptionRenewed: async (payload) => {
        try {
          const data = payload.data || payload;
          const metadata = data.metadata || {};
          const userId = metadata.user_id;
          const productId = data.product_id;
          const plan = metadata.plan || planFromProductId(productId);
          if (userId && plan && ['starter', 'pro', 'agency', 'enterprise'].includes(plan)) {
            await pool.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);
            log.info(`Subscription renewed for user ${userId}, confirmed plan: ${plan}`);
          } else if (userId) {
            log.info(`Subscription renewed for user ${userId} (no plan to confirm)`);
          }
        } catch(e) {
          log.error('subscription.renewed error', { error: e.message });
        }
      },

      // Subscription cancelled — downgrade to free
      onSubscriptionCancelled: async (payload) => {
        try {
          const data = payload.data || payload;
          const eventId = data.subscription_id || data.id || payload.id;
          if (!eventId) { log.warn('subscription.cancelled missing event ID'); return; }
          if (await isWebhookProcessed('sub_cancel_' + eventId)) return;
          const metadata = data.metadata || {};
          let targetUserId = metadata.user_id;
          if (!targetUserId) {
            // Try to find user by subscription ID
            const subscriptionId = data.subscription_id;
            if (subscriptionId) {
              const result = await pool.query(
                `SELECT id FROM users WHERE settings->>'dodo_subscription_id' = $1`,
                [subscriptionId]
              );
              if (result.rows.length) targetUserId = result.rows[0].id;
            }
          }
          if (!targetUserId) {
            log.warn('subscription.cancelled — could not resolve user');
            return;
          }
          await pool.query(
            `UPDATE users SET plan = 'free', settings = settings - 'dodo_subscription_id' WHERE id = $1`,
            [targetUserId]
          );
          log.info(`Subscription cancelled, downgraded user ${targetUserId} to free`);
          await markWebhookProcessed('sub_cancel_' + eventId, 'subscription.cancelled');
        } catch(e) {
          log.error('subscription.cancelled error', { error: e.message });
        }
      },

      // Subscription expired — downgrade to free
      onSubscriptionExpired: async (payload) => {
        try {
          const data = payload.data || payload;
          const eventId = data.subscription_id || data.id || payload.id;
          if (!eventId) { log.warn('subscription.expired missing event ID'); return; }
          if (await isWebhookProcessed('sub_expired_' + eventId)) return;
          const metadata = data.metadata || {};
          let targetUserId = metadata.user_id;
          if (!targetUserId) {
            const subscriptionId = data.subscription_id;
            if (subscriptionId) {
              const result = await pool.query(
                `SELECT id FROM users WHERE settings->>'dodo_subscription_id' = $1`,
                [subscriptionId]
              );
              if (result.rows.length) targetUserId = result.rows[0].id;
            }
          }
          if (!targetUserId) {
            log.warn('subscription.expired — could not resolve user');
            return;
          }
          await pool.query(
            `UPDATE users SET plan = 'free', settings = settings - 'dodo_subscription_id' WHERE id = $1`,
            [targetUserId]
          );
          log.info(`Subscription expired, downgraded user ${targetUserId} to free`);
          await markWebhookProcessed('sub_expired_' + eventId, 'subscription.expired');
        } catch(e) {
          log.error('subscription.expired error', { error: e.message });
        }
      },

      // Subscription on hold — keep plan but warn user
      onSubscriptionOnHold: async (payload) => {
        const data = payload.data || payload;
        const metadata = data.metadata || {};
        const userId = metadata.user_id;
        log.warn('Subscription on hold', { userId: userId || 'unknown' });
        if (userId) {
          await notify(userId, 'billing', 'Payment Issue',
            'Your subscription payment is on hold. Please update your payment method to avoid service interruption.',
            { type: 'subscription_on_hold', subscription_id: data.subscription_id }
          );
        }
      },

      // Refund succeeded — downgrade to free
      onRefundSucceeded: async (payload) => {
        try {
          const data = payload.data || payload;
          const eventId = data.refund_id || data.payment_id || data.id || payload.id;
          if (!eventId) { log.warn('refund.succeeded missing event ID'); return; }
          if (await isWebhookProcessed('refund_' + eventId)) return;
          const metadata = data.metadata || {};
          let targetUserId = metadata.user_id;
          if (!targetUserId) {
            const subscriptionId = data.subscription_id;
            if (subscriptionId) {
              const result = await pool.query(
                `SELECT id FROM users WHERE settings->>'dodo_subscription_id' = $1`,
                [subscriptionId]
              );
              if (result.rows.length) targetUserId = result.rows[0].id;
            }
          }
          if (!targetUserId) {
            log.warn('refund.succeeded — could not resolve user');
            return;
          }
          await pool.query(
            `UPDATE users SET plan = 'free', settings = settings - 'dodo_subscription_id' WHERE id = $1`,
            [targetUserId]
          );
          log.info(`Refund processed, downgraded user ${targetUserId} to free`);
          await markWebhookProcessed('refund_' + eventId, 'refund.succeeded');
        } catch(e) {
          log.error('refund.succeeded error', { error: e.message });
        }
      },

      // Log all payloads for debugging
      onPayload: async (payload) => {
        log.info(`Webhook event: ${payload.type}`);
      }
    })
  );
} else {
  // No webhook key configured — return 503 for webhook requests
  router.post('/webhooks/dodopayments', (req, res) => {
    res.status(503).json({ error: 'Webhook not configured' });
  });
}

// ─── CANCEL SUBSCRIPTION — Called during self-service downgrade ─
async function cancelDodoSubscription(subscriptionId) {
  if (!DODO_API_KEY || !subscriptionId) return false;
  const baseUrl = DODO_ENVIRONMENT === 'live_mode'
    ? API_ENDPOINTS.dodopayments.live
    : API_ENDPOINTS.dodopayments.test;

  return new Promise((resolve) => {
    const reqOpts = {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DODO_API_KEY}`,
      },
      timeout: TIMEOUTS.paymentApi
    };
    const body = JSON.stringify({ status: 'cancelled' });
    reqOpts.headers['Content-Length'] = Buffer.byteLength(body);

    const apiReq = https.request(`${baseUrl}/subscriptions/${subscriptionId}`, reqOpts, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => { data += chunk; });
      apiRes.on('end', () => {
        if (apiRes.statusCode < 300) {
          log.info(`Cancelled DodoPayments subscription ${subscriptionId}`);
          resolve(true);
        } else {
          log.error(`Failed to cancel subscription ${subscriptionId}`, { status: apiRes.statusCode, body: data });
          resolve(false);
        }
      });
    });
    apiReq.on('timeout', () => { apiReq.destroy(); resolve(false); });
    apiReq.on('error', (e) => { log.error('Subscription cancel request failed', { error: e.message }); resolve(false); });
    apiReq.write(body);
    apiReq.end();
  });
}

// ─── CANCEL SUBSCRIPTION — User self-service cancellation ───────
router.post('/cancel', auth, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT id, plan, settings FROM users WHERE id = $1', [req.user.id]);
    if (!userResult.rows.length) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];
    const settings = user.settings || {};
    const subscriptionId = settings.dodo_subscription_id;

    if (user.plan === 'free') {
      return res.status(400).json({ error: 'You are already on the free plan.' });
    }

    // Cancel with DodoPayments if there's an active subscription
    if (subscriptionId) {
      const cancelled = await cancelDodoSubscription(subscriptionId);
      if (!cancelled) {
        return res.status(500).json({ error: 'Failed to cancel subscription with payment provider. Please contact support or try again.' });
      }
    }

    // Downgrade to free
    const result = await pool.query(
      `UPDATE users SET plan = 'free', settings = settings - 'dodo_subscription_id' WHERE id = $1 RETURNING *`,
      [req.user.id]
    );
    log.info(`User ${req.user.id} cancelled subscription, downgraded to free`);
    res.json({ user: safeUser(result.rows[0]), message: 'Subscription cancelled. You are now on the free plan.' });
  } catch(e) {
    log.error('Cancel subscription failed', { error: e.message });
    res.status(500).json({ error: 'Failed to cancel subscription. Please try again.' });
  }
});

// ─── SUBSCRIPTION STATUS — Get current subscription info ────────
router.get('/subscription', auth, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT plan, settings FROM users WHERE id = $1', [req.user.id]);
    if (!userResult.rows.length) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];
    const settings = user.settings || {};
    const subscriptionId = settings.dodo_subscription_id;

    res.json({
      plan: user.plan,
      hasSubscription: !!subscriptionId,
      subscriptionId: subscriptionId || null
    });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load subscription info' });
  }
});

// ─── PAYMENT STATUS — Check if DodoPayments is configured ──────
router.get('/payment-status', auth, (req, res) => {
  res.json({
    configured: !!(DODO_API_KEY && DODO_WEBHOOK_KEY),
    environment: DODO_ENVIRONMENT,
    products: {
      starter: !!DODO_STARTER_PRODUCT_ID,
      pro: !!DODO_PRO_PRODUCT_ID,
      agency: !!DODO_AGENCY_PRODUCT_ID,
      enterprise: !!DODO_ENTERPRISE_PRODUCT_ID
    }
  });
});

module.exports = router;
module.exports.cancelDodoSubscription = cancelDodoSubscription;
