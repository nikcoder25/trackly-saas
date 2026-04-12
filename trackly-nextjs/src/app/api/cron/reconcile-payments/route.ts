import { pool, safeConnect, auditLog } from '@/lib/db';
import { NextResponse } from 'next/server';

// PLAN_MAP: product ID -> plan name (must match webhook handler)
const PLAN_MAP: Record<string, string> = {};
if (process.env.DODO_STARTER_PRODUCT_ID) PLAN_MAP[process.env.DODO_STARTER_PRODUCT_ID] = 'starter';
if (process.env.DODO_PRO_PRODUCT_ID) PLAN_MAP[process.env.DODO_PRO_PRODUCT_ID] = 'pro';
if (process.env.DODO_AGENCY_PRODUCT_ID) PLAN_MAP[process.env.DODO_AGENCY_PRODUCT_ID] = 'agency';
if (process.env.DODO_ENTERPRISE_PRODUCT_ID) PLAN_MAP[process.env.DODO_ENTERPRISE_PRODUCT_ID] = 'enterprise';

/**
 * Payment Reconciliation Cron Job
 * 
 * This endpoint should be called periodically (e.g., every 15-30 minutes)
 * to catch any missed webhook events from Dodo Payments.
 * 
 * It checks all users who have a subscription_id in their settings
 * and verifies their plan matches what Dodo Payments reports.
 * 
 * Trigger via DigitalOcean cron or external cron service:
 * GET /api/cron/reconcile-payments?secret=YOUR_CRON_SECRET
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret to prevent unauthorized access
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dodoBearerToken = process.env.DODO_PAYMENTS_API_KEY;
    if (!dodoBearerToken) {
      console.error('[Reconciliation] DODO_PAYMENTS_API_KEY not configured');
      return NextResponse.json({ error: 'Dodo API key not configured' }, { status: 500 });
    }

    const isLiveMode = process.env.DODO_LIVE_MODE === 'true';
    const baseUrl = isLiveMode
      ? 'https://live.dodopayments.com'
      : 'https://test.dodopayments.com';

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
            console.warn(`[Reconciliation] Failed to fetch subscription ${subscriptionId} for user ${user.id}: ${response.status}`);
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
            console.warn(`[Reconciliation] Unknown product ID ${dodoProductId} for user ${user.id}`);
            errors++;
            continue;
          }

          // Check if the user current plan matches what Dodo says
          if (expectedPlan && user.plan !== expectedPlan) {
            console.log(`[Reconciliation] Plan mismatch for user ${user.id}: DB has '${user.plan}', Dodo says '${expectedPlan}' (status: ${dodoStatus})`);
            
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

            console.log(`[Reconciliation] Fixed user ${user.id}: ${user.plan} -> ${expectedPlan}`);
            
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
            console.log(`[Reconciliation] Updated subscription_status for user ${user.id}: ${currentStatus} -> ${dodoStatus}`);
          }

        } catch (userError) {
          console.error(`[Reconciliation] Error processing user ${user.id}:`, userError);
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

      console.log('[Reconciliation] Complete:', summary);
      
      return NextResponse.json(summary);

    } finally {
      client.release();
    }

  } catch (e) {
    console.error('[Reconciliation] Fatal error:', e);
    return NextResponse.json({ error: 'Reconciliation failed' }, { status: 500 });
  }
}
