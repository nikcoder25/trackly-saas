/**
 * DodoPayments integration — checkout, webhooks, customer portal
 * Uses @dodopayments/express adapter for Express.js
 */
const express = require('express');
const router  = express.Router();

const { pool } = require('../config/db');
const { auth } = require('../middleware/auth');
const { safeUser } = require('../lib/helpers');

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
  } catch(e) { console.error('[Webhook dedup]', e.message); }
}

// ─── CONFIGURATION ──────────────────────────────────────────────
const DODO_API_KEY        = process.env.DODO_PAYMENTS_API_KEY || '';
const DODO_WEBHOOK_KEY    = process.env.DODO_PAYMENTS_WEBHOOK_KEY || '';
const DODO_ENVIRONMENT    = process.env.DODO_PAYMENTS_ENVIRONMENT || 'test_mode'; // 'test_mode' or 'live_mode'
const DODO_RETURN_URL     = process.env.DODO_PAYMENTS_RETURN_URL || '';

// Product IDs — set these in your DodoPayments dashboard, then configure via env vars
const DODO_PRO_PRODUCT_ID    = process.env.DODO_PRO_PRODUCT_ID || '';
const DODO_AGENCY_PRODUCT_ID = process.env.DODO_AGENCY_PRODUCT_ID || '';

// Map product IDs to plans
function planFromProductId(productId) {
  if (productId === DODO_PRO_PRODUCT_ID) return 'pro';
  if (productId === DODO_AGENCY_PRODUCT_ID) return 'agency';
  return null;
}

// ─── CHECKOUT — Create a payment link for plan upgrade ──────────
router.post('/checkout', auth, async (req, res) => {
  if (!DODO_API_KEY) {
    return res.status(503).json({ error: 'Payment system not configured. Contact support.' });
  }

  const { plan } = req.body;
  if (!['pro', 'agency'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan. Choose pro or agency.' });
  }

  const productId = plan === 'pro' ? DODO_PRO_PRODUCT_ID : DODO_AGENCY_PRODUCT_ID;
  if (!productId) {
    return res.status(503).json({ error: 'Payment product not configured for this plan. Contact support.' });
  }

  // Get current user info
  const userResult = await pool.query('SELECT id, email, name, plan FROM users WHERE id = $1', [req.user.id]);
  if (!userResult.rows.length) return res.status(404).json({ error: 'User not found' });
  const user = userResult.rows[0];

  // Don't allow if already on same or higher plan
  const tiers = { free: 0, pro: 1, agency: 2, owner: 3 };
  if ((tiers[user.plan] || 0) >= (tiers[plan] || 0)) {
    return res.status(400).json({ error: `You are already on the ${user.plan} plan.` });
  }

  try {
    const baseUrl = DODO_ENVIRONMENT === 'live_mode'
      ? 'https://live.dodopayments.com'
      : 'https://test.dodopayments.com';

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
    const https = require('https');
    const body = JSON.stringify(checkoutPayload);
    const checkoutUrl = await new Promise((resolve, reject) => {
      const reqOpts = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DODO_API_KEY}`,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 15000
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
    console.error('[DodoPayments Checkout]', e.message);
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
          if (await isWebhookProcessed(eventId)) return;
          const metadata = data.metadata || {};
          const userId = metadata.user_id;
          const plan = metadata.plan;

          if (!userId || !plan) {
            console.warn('[DodoPayments Webhook] payment.succeeded missing user_id or plan in metadata');
            return;
          }

          if (!['pro', 'agency'].includes(plan)) {
            console.warn('[DodoPayments Webhook] Invalid plan in metadata:', plan);
            return;
          }

          // Upgrade user plan
          const result = await pool.query(
            'UPDATE users SET plan = $1 WHERE id = $2 RETURNING id, email, plan',
            [plan, userId]
          );
          if (result.rows.length) {
            console.log(`[DodoPayments] Upgraded user ${result.rows[0].email} to ${plan} plan`);
            await markWebhookProcessed(eventId, 'payment.succeeded');
          } else {
            console.warn(`[DodoPayments] User not found for upgrade: ${userId}`);
          }
        } catch(e) {
          console.error('[DodoPayments Webhook] payment.succeeded error:', e.message);
        }
      },

      // Payment failed
      onPaymentFailed: async (payload) => {
        const data = payload.data || payload;
        const metadata = data.metadata || {};
        console.warn(`[DodoPayments] Payment failed for user ${metadata.user_id || 'unknown'}:`,
          data.payment_id || 'no payment id');
      },

      // Subscription activated
      onSubscriptionActive: async (payload) => {
        try {
          const data = payload.data || payload;
          const eventId = data.subscription_id || data.id || payload.id;
          if (await isWebhookProcessed('sub_active_' + eventId)) return;
          const metadata = data.metadata || {};
          const userId = metadata.user_id;
          const productId = data.product_id;
          const plan = metadata.plan || planFromProductId(productId);

          if (!userId || !plan) {
            console.warn('[DodoPayments Webhook] subscription.active missing user_id or plan');
            return;
          }

          if (!['pro', 'agency'].includes(plan)) return;

          // Store subscription ID for future reference
          const subscriptionId = data.subscription_id;
          await pool.query(
            `UPDATE users SET plan = $1, settings = settings || $2::jsonb WHERE id = $3`,
            [plan, JSON.stringify({ dodo_subscription_id: subscriptionId }), userId]
          );
          console.log(`[DodoPayments] Subscription activated for user ${userId}: ${plan}`);
          await markWebhookProcessed('sub_active_' + eventId, 'subscription.active');
        } catch(e) {
          console.error('[DodoPayments Webhook] subscription.active error:', e.message);
        }
      },

      // Subscription renewed — keep plan active
      onSubscriptionRenewed: async (payload) => {
        try {
          const data = payload.data || payload;
          const metadata = data.metadata || {};
          const userId = metadata.user_id;
          if (userId) {
            console.log(`[DodoPayments] Subscription renewed for user ${userId}`);
          }
        } catch(e) {
          console.error('[DodoPayments Webhook] subscription.renewed error:', e.message);
        }
      },

      // Subscription cancelled — downgrade to free
      onSubscriptionCancelled: async (payload) => {
        try {
          const data = payload.data || payload;
          const eventId = data.subscription_id || data.id || payload.id;
          if (await isWebhookProcessed('sub_cancel_' + eventId)) return;
          const metadata = data.metadata || {};
          const userId = metadata.user_id;
          if (!userId) {
            // Try to find user by subscription ID
            const subscriptionId = data.subscription_id;
            if (subscriptionId) {
              const result = await pool.query(
                `SELECT id FROM users WHERE settings->>'dodo_subscription_id' = $1`,
                [subscriptionId]
              );
              if (result.rows.length) {
                await pool.query('UPDATE users SET plan = $1 WHERE id = $2', ['free', result.rows[0].id]);
                console.log(`[DodoPayments] Subscription cancelled, downgraded user ${result.rows[0].id} to free`);
              }
            }
            return;
          }
          await pool.query('UPDATE users SET plan = $1 WHERE id = $2', ['free', userId]);
          console.log(`[DodoPayments] Subscription cancelled, downgraded user ${userId} to free`);
          await markWebhookProcessed('sub_cancel_' + eventId, 'subscription.cancelled');
        } catch(e) {
          console.error('[DodoPayments Webhook] subscription.cancelled error:', e.message);
        }
      },

      // Subscription expired — downgrade to free
      onSubscriptionExpired: async (payload) => {
        try {
          const data = payload.data || payload;
          const metadata = data.metadata || {};
          const userId = metadata.user_id;
          if (!userId) return;
          await pool.query('UPDATE users SET plan = $1 WHERE id = $2', ['free', userId]);
          console.log(`[DodoPayments] Subscription expired, downgraded user ${userId} to free`);
        } catch(e) {
          console.error('[DodoPayments Webhook] subscription.expired error:', e.message);
        }
      },

      // Subscription on hold — keep plan but log warning
      onSubscriptionOnHold: async (payload) => {
        const data = payload.data || payload;
        const metadata = data.metadata || {};
        console.warn(`[DodoPayments] Subscription on hold for user ${metadata.user_id || 'unknown'}`);
      },

      // Refund succeeded — downgrade to free
      onRefundSucceeded: async (payload) => {
        try {
          const data = payload.data || payload;
          const eventId = data.refund_id || data.payment_id || data.id || payload.id;
          if (await isWebhookProcessed('refund_' + eventId)) return;
          const metadata = data.metadata || {};
          const userId = metadata.user_id;
          if (!userId) return;
          await pool.query('UPDATE users SET plan = $1 WHERE id = $2', ['free', userId]);
          console.log(`[DodoPayments] Refund processed, downgraded user ${userId} to free`);
          await markWebhookProcessed('refund_' + eventId, 'refund.succeeded');
        } catch(e) {
          console.error('[DodoPayments Webhook] refund.succeeded error:', e.message);
        }
      },

      // Log all payloads for debugging
      onPayload: async (payload) => {
        console.log(`[DodoPayments Webhook] Event: ${payload.type}`);
      }
    })
  );
} else {
  // No webhook key configured — return 503 for webhook requests
  router.post('/webhooks/dodopayments', (req, res) => {
    res.status(503).json({ error: 'Webhook not configured' });
  });
}

// ─── PAYMENT STATUS — Check if DodoPayments is configured ──────
router.get('/payment-status', auth, (req, res) => {
  res.json({
    configured: !!(DODO_API_KEY && DODO_WEBHOOK_KEY),
    environment: DODO_ENVIRONMENT,
    products: {
      pro: !!DODO_PRO_PRODUCT_ID,
      agency: !!DODO_AGENCY_PRODUCT_ID
    }
  });
});

module.exports = router;
