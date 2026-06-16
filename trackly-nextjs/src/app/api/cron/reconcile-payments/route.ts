import { pool, safeConnect, auditLog } from '@/lib/db';
import { acquireCronLock } from '@/lib/cron-lock';
import { logger } from '@/lib/logger';
import {
  sendPlanUpgradeEmail,
  sendPlanDowngradeEmail,
  sendPlanCancellationEmail,
  planCancellationIdempotencyKey,
} from '@/lib/email';
import { comparePlans } from '@/lib/plan-config';
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
      // Get all users who have a subscription_id in their settings.
      // `email` is selected so we can dispatch plan-change confirmation
      // emails (parity with the webhook handler) when this cron repairs
      // a missed webhook.
      const usersResult = await client.query(
        `SELECT id, email, plan, settings FROM users
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
              // Conditional UPDATE on plan (`AND plan = $2`) so a webhook
              // that beat us to the punch in the narrow window between
              // SELECT and UPDATE doesn't cause a double cancellation
              // email - RETURNING is empty if someone else already
              // wrote 'free' for this user. Webhook's `previousPlan !==
              // 'free'` guard handles the inverse race.
              let didDowngrade = false;
              await client.query('BEGIN');
              if (user.plan !== 'free') {
                const updated = await client.query(
                  `UPDATE users SET plan = $1 WHERE id = $2 AND plan = $3 RETURNING id`,
                  ['free', user.id, user.plan],
                );
                if (updated.rows.length > 0) {
                  didDowngrade = true;
                  details.push({ userId: user.id, action: 'stale_subscription_cleanup', from: user.plan, to: 'free' });
                  reconciled++;
                } else {
                  // Webhook (or another writer) flipped this user to a
                  // different plan between our SELECT and our UPDATE.
                  // Skip the email - whoever won the race owns the
                  // notification. No audit row: this is a no-op, not a
                  // state transition.
                  logger.info('cron.reconcile.plan_already_synced', {
                    user_id: user.id,
                    site: 'stale_subscription_404',
                    observed_plan: user.plan,
                  });
                }
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
              // Fire-and-forget cancellation email (matches webhook
              // DOWNGRADE_EVENTS branch parity). Resend outage must not
              // roll back the cleanup - audit row above gives support a
              // paper trail to resend manually.
              if (didDowngrade && user.email) {
                // Use the SHARED cancellation idempotency-key helper so
                // the cron, webhook, and cancel route all generate the
                // same key for the same logical cancellation. Pre-fix,
                // this site computed `plan_email:${user.id}:${sub}:not_found:free`
                // while the webhook used `plan_cancellation:${user.id}:${sub}`
                // - different keys meant the email_outbox UNIQUE index
                // never collided, and a single cancellation observed by
                // both paths produced two duplicate emails (and a third
                // when the webhook then fired a remapped subscription.updated).
                const idempotencyKey = planCancellationIdempotencyKey(user.id, subscriptionId);
                sendPlanCancellationEmail(user.email, { previousPlan: user.plan }, idempotencyKey)
                  .then((res) => {
                    if (!res.sent) {
                      logger.warn('cron.reconcile.email_failed', {
                        user_id: user.id, kind: 'cancellation', site: 'stale_subscription_404', reason: res.reason,
                      });
                    }
                  })
                  .catch((err) => {
                    logger.error('cron.reconcile.email_error', {
                      user_id: user.id, kind: 'cancellation', site: 'stale_subscription_404', error: (err as Error).message,
                    });
                  });
              }
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

            // Conditional UPDATE on plan (`AND plan = $3`) - same race
            // protection as the 404 path. If a webhook flipped this
            // user between our SELECT and UPDATE, RETURNING is empty
            // and we skip the email so we don't double-send.
            await client.query('BEGIN');
            const updatedRows = await client.query(
              'UPDATE users SET plan = $1 WHERE id = $2 AND plan = $3 RETURNING id',
              [expectedPlan, user.id, user.plan]
            );

            if (updatedRows.rows.length === 0) {
              await client.query('ROLLBACK');
              logger.info('cron.reconcile.plan_already_synced', {
                user_id: user.id,
                site: 'plan_mismatch',
                observed_plan: user.plan,
                expected_plan: expectedPlan,
              });
              continue;
            }

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

            // Dispatch the same plan-change confirmation email the
            // webhook would have sent. Two paths:
            //
            //   - expectedPlan === 'free' (Dodo status flipped to
            //     non-active): cancellation. Mirrors webhook
            //     DOWNGRADE_EVENTS branch (sendPlanCancellationEmail
            //     regardless of `comparePlans` direction).
            //
            //   - expectedPlan is a paid tier: route through
            //     `comparePlans` exactly like webhook upgrade branch
            //     (line 606-622). 'same' (renewal) -> no email.
            //
            // Fire-and-forget: a Resend outage must not roll back a
            // successful plan fix. Audit row above is the support trail.
            if (user.email) {
              const previousPlan = user.plan;
              // Cancellations get the SHARED key shape so the cron's
              // observation of a Dodo-side cancel collides with whatever
              // the webhook (or the cancel route) wrote first. Upgrade/
              // downgrade emails keep the per-event key shape - they're
              // not user-initiated and the dodoStatus segment is what
              // distinguishes a renew from a real plan move.
              const upgradeIdempotencyKey = `plan_email:${user.id}:${subscriptionId}:${dodoStatus}:${expectedPlan}`;
              const cancellationIdempotencyKey = planCancellationIdempotencyKey(user.id, subscriptionId);
              if (expectedPlan === 'free') {
                sendPlanCancellationEmail(user.email, { previousPlan }, cancellationIdempotencyKey)
                  .then((res) => {
                    if (!res.sent) {
                      logger.warn('cron.reconcile.email_failed', {
                        user_id: user.id, kind: 'cancellation', site: 'plan_mismatch', reason: res.reason,
                      });
                    }
                  })
                  .catch((err) => {
                    logger.error('cron.reconcile.email_error', {
                      user_id: user.id, kind: 'cancellation', site: 'plan_mismatch', error: (err as Error).message,
                    });
                  });
              } else {
                const direction = comparePlans(previousPlan, expectedPlan);
                if (direction === 'upgrade') {
                  sendPlanUpgradeEmail(user.email, { previousPlan, newPlan: expectedPlan }, upgradeIdempotencyKey)
                    .then((res) => {
                      if (!res.sent) {
                        logger.warn('cron.reconcile.email_failed', {
                          user_id: user.id, kind: 'upgrade', site: 'plan_mismatch', reason: res.reason,
                        });
                      }
                    })
                    .catch((err) => {
                      logger.error('cron.reconcile.email_error', {
                        user_id: user.id, kind: 'upgrade', site: 'plan_mismatch', error: (err as Error).message,
                      });
                    });
                } else if (direction === 'downgrade') {
                  sendPlanDowngradeEmail(user.email, { previousPlan, newPlan: expectedPlan }, upgradeIdempotencyKey)
                    .then((res) => {
                      if (!res.sent) {
                        logger.warn('cron.reconcile.email_failed', {
                          user_id: user.id, kind: 'downgrade', site: 'plan_mismatch', reason: res.reason,
                        });
                      }
                    })
                    .catch((err) => {
                      logger.error('cron.reconcile.email_error', {
                        user_id: user.id, kind: 'downgrade', site: 'plan_mismatch', error: (err as Error).message,
                      });
                    });
                }
                // 'same' direction: no email (renewal-shaped no-op).
              }
            }
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
