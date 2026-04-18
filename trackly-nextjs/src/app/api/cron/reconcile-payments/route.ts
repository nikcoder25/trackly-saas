import { pool, safeConnect, auditLog } from '@/lib/db';
import { acquireCronLock } from '@/lib/cron-lock';
import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

// PLAN_MAP: product ID -> plan name (must match webhook handler)
const PLAN_MAP: Record<string, string> = {};
if (process.env.DODO_STARTER_PRODUCT_ID) PLAN_MAP[process.env.DODO_STARTER_PRODUCT_ID] = 'starter';
if (process.env.DODO_PRO_PRODUCT_ID) PLAN_MAP[process.env.DODO_PRO_PRODUCT_ID] = 'pro';
if (process.env.DODO_AGENCY_PRODUCT_ID) PLAN_MAP[process.env.DODO_AGENCY_PRODUCT_ID] = 'agency';
if (process.env.DODO_ENTERPRISE_PRODUCT_ID) PLAN_MAP[process.env.DODO_ENTERPRISE_PRODUCT_ID] = 'enterprise';

/**
 * Payment Reconciliation Cron Job
 *
 * Called every 15 minutes by .github/workflows/cron.yml to catch any
 * Dodo Payments webhook events we missed. It walks every user with a
 * stored subscription_id, asks Dodo for the current status, and repairs
 * any plan/status drift (downgrades after cancellation, upgrades after
 * a lost webhook, stale subscription_id cleanup on 404).
 *
 * Authorize with `Authorization: Bearer $CRON_SECRET`. A legacy
 * `?secret=` query param is still accepted for backward compatibility
 * but should be removed from any crontab because query strings leak
 * into access logs.
 */
export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization') || '';
    const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const { searchParams } = new URL(request.url);
    const queryToken = searchParams.get('secret') || '';
    const candidate = headerToken || queryToken;

    const ok = !!candidate
      && candidate.length === cronSecret.length
      && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(cronSecret));
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dodoBearerToken = process.env.DODO_PAYMENTS_API_KEY;
    if (!dodoBearerToken) {
      logger.error('cron.reconcile.missing_api_key');
      return NextResponse.json({ error: 'Dodo API key not configured' }, { status: 500 });
    }

    const isLiveMode = process.env.DODO_LIVE_MODE === 'true';
    const baseUrl = isLiveMode
      ? 'https://live.dodopayments.com'
      : 'https://test.dodopayments.com';

    // Dedupe concurrent runs. We now run this every 15 minutes from GH
    // Actions; a slow run must not overlap with the next tick or they
    // will race on the same users. 10-min stale window is safe because
    // maxDuration is 5 min and reconciliation work per user is bounded.
    const lock = await acquireCronLock('reconcile-payments', 10);
    if (!lock) {
      return NextResponse.json({ skipped: true, reason: 'locked' });
    }

    try {
      const client = await safeConnect();
      if (!client) {
        return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
      }

      try {
      // Get all users who have a subscription_id in their settings
      const usersResult = await client.query(
        `SELECT id, plan, settings FROM users
         WHERE settings->>'subscription_id' IS NOT NULL
         AND settings->>'subscription_id' != ''`
      );

      let reconciled = 0;
      let checked = 0;
      let errors = 0;
      const details: Array<{ userId: string; action: string; from?: string; to?: string }> = [];

      for (const user of usersResult.rows) {
        checked++;
        const subscriptionId = user.settings?.subscription_id;
        
        if (!subscriptionId) continue;

        try {
          // Fetch subscription status from Dodo Payments API
          const response = await fetch(`${baseUrl}/subscriptions/${subscriptionId}`, {
            headers: {
              'Authorization': `Bearer ${dodoBearerToken}`,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            if (response.status === 404) {
              // Subscription no longer exists at DodoPayments - clean up stale data
              logger.info('cron.reconcile.stale_subscription_404', {
                subscription_id: subscriptionId,
                user_id: user.id,
              });
              await client.query('BEGIN');
              if (user.plan !== 'free') {
                await client.query('UPDATE users SET plan = $1 WHERE id = $2', ['free', user.id]);
                details.push({ userId: user.id, action: 'stale_subscription_cleanup', from: user.plan, to: 'free' });
                reconciled++;
              }
              await client.query(
                `UPDATE users SET settings = settings - 'subscription_id' - 'dodo_customer_id' - 'dodo_product_id' || '{"subscription_status":"not_found"}'::jsonb WHERE id = $1`,
                [user.id]
              );
              await client.query('COMMIT');
              logger.info('cron.reconcile.stale_subscription_cleaned', { user_id: user.id });
              await auditLog('system', 'cron_reconcile_stale_sub', 'user', user.id, {
                previousPlan: user.plan, subscriptionId, reason: 'subscription_not_found_404',
              }, 'cron').catch(() => {});
              continue;
            }
            logger.warn('cron.reconcile.fetch_failed', {
              subscription_id: subscriptionId,
              user_id: user.id,
              status: response.status,
            });
            errors++;
            continue;
          }

          const subscription = await response.json();
          const dodoStatus = subscription.status;
          const dodoProductId = subscription.product_id;
          
          // Determine what plan the user should have based on Dodo data
          let expectedPlan = dodoProductId ? PLAN_MAP[dodoProductId] : null;
          
          // If subscription is not active, user should be on free plan
          if (dodoStatus !== 'active') {
            expectedPlan = 'free';
          }

          if (!expectedPlan && dodoStatus === 'active') {
            logger.warn('cron.reconcile.unknown_product_id', {
              dodo_product_id: dodoProductId,
              user_id: user.id,
            });
            errors++;
            continue;
          }

          // Check if the user current plan matches what Dodo says
          if (expectedPlan && user.plan !== expectedPlan) {
            logger.info('cron.reconcile.plan_mismatch', {
              user_id: user.id,
              db_plan: user.plan,
              dodo_plan: expectedPlan,
              dodo_status: dodoStatus,
            });
            
            await client.query('BEGIN');
            await client.query(
              'UPDATE users SET plan = $1 WHERE id = $2',
              [expectedPlan, user.id]
            );

            const settingsUpdate: Record<string, string> = {
              subscription_status: dodoStatus,
            };
            
            if (dodoProductId) {
              settingsUpdate.dodo_product_id = dodoProductId;
            }
            if (subscription.customer?.customer_id) {
              settingsUpdate.dodo_customer_id = subscription.customer.customer_id;
            }

            await client.query(
              `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
              [JSON.stringify(settingsUpdate), user.id]
            );

            await client.query('COMMIT');

            reconciled++;
            details.push({
              userId: user.id,
              action: 'plan_updated',
              from: user.plan,
              to: expectedPlan,
            });

            logger.info('cron.reconcile.plan_fixed', {
              user_id: user.id,
              from: user.plan,
              to: expectedPlan,
            });

            await auditLog('system', 'cron_reconcile_plan', 'user', user.id, {
              previousPlan: user.plan,
              newPlan: expectedPlan,
              subscriptionId,
              dodoStatus,
              dodoProductId,
            }, 'cron').catch(() => {});
          }

          // Also check if subscription_status in settings matches Dodo status
          const currentStatus = user.settings?.subscription_status;
          if (currentStatus !== dodoStatus && user.plan === expectedPlan) {
            await client.query(
              `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
              [JSON.stringify({ subscription_status: dodoStatus }), user.id]
            );
            logger.info('cron.reconcile.subscription_status_updated', {
              user_id: user.id,
              from: currentStatus,
              to: dodoStatus,
            });
          }

        } catch (userError) {
          logger.error('cron.reconcile.user_error', {
            user_id: user.id,
            error: (userError as Error)?.message || String(userError),
          });
          errors++;
          await client.query('ROLLBACK').catch(() => {});
        }
      }

      const summary = {
        checked,
        reconciled,
        errors,
        details,
        timestamp: new Date().toISOString(),
      };

      logger.info('cron.reconcile.complete', {
        checked,
        reconciled,
        errors,
        details_count: details.length,
      });

      return NextResponse.json(summary);

      } finally {
        client.release();
      }
    } finally {
      await lock.release();
    }

  } catch (e) {
    logger.error('cron.reconcile.fatal', { error: (e as Error)?.message || String(e) });
    return NextResponse.json({ error: 'Reconciliation failed' }, { status: 500 });
  }
}
