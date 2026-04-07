import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  try {
    const [
      planRevenue,
      subscriptionStats,
      recentPayments,
      monthlyGrowth,
      churnedUsers,
    ] = await Promise.all([
      // Estimated MRR by plan (based on current user counts × plan prices)
      pool.query(`
        SELECT plan, COUNT(*)::int AS count,
          CASE plan
            WHEN 'starter' THEN 9
            WHEN 'pro' THEN 29
            WHEN 'agency' THEN 89
            WHEN 'enterprise' THEN 199
            ELSE 0
          END AS price_per_user,
          COUNT(*)::int * CASE plan
            WHEN 'starter' THEN 9
            WHEN 'pro' THEN 29
            WHEN 'agency' THEN 89
            WHEN 'enterprise' THEN 199
            ELSE 0
          END AS estimated_mrr
        FROM users
        WHERE plan != 'free' AND plan != 'owner'
        GROUP BY plan ORDER BY estimated_mrr DESC
      `),
      // Users with subscriptions vs free
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE plan != 'free' AND plan != 'owner')::int AS paid_users,
          COUNT(*) FILTER (WHERE plan = 'free')::int AS free_users,
          COUNT(*) FILTER (WHERE settings->>'dodo_subscription_id' IS NOT NULL)::int AS active_subscriptions
        FROM users
      `),
      // Recent webhook/payment events
      pool.query(`
        SELECT event_type, payload->>'subscription_id' AS subscription_id,
          payload->>'product_id' AS product_id,
          created_at
        FROM webhook_events
        ORDER BY created_at DESC LIMIT 25
      `),
      // Monthly user growth (last 6 months)
      pool.query(`
        SELECT
          DATE_TRUNC('month', created_at) AS month,
          COUNT(*)::int AS new_users,
          COUNT(*) FILTER (WHERE plan != 'free')::int AS new_paid
        FROM users
        WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month ASC
      `),
      // Recently downgraded/churned users (last 30 days)
      pool.query(`
        SELECT u.email, u.plan, al.details, al.created_at
        FROM audit_logs al
        JOIN users u ON u.id = al.user_id
        WHERE al.action IN ('plan_downgrade', 'subscription_cancelled', 'plan_change')
          AND al.created_at >= NOW() - INTERVAL '30 days'
        ORDER BY al.created_at DESC LIMIT 20
      `),
    ]);

    const totalMrr = planRevenue.rows.reduce((sum: number, r: { estimated_mrr: number }) => sum + r.estimated_mrr, 0);

    return Response.json({
      totalMrr,
      planRevenue: planRevenue.rows,
      subscriptionStats: subscriptionStats.rows[0],
      recentPayments: recentPayments.rows,
      monthlyGrowth: monthlyGrowth.rows,
      churnedUsers: churnedUsers.rows,
    });
  } catch (e) {
    console.error('[Admin Revenue]', (e as Error).message);
    return Response.json({ error: 'Failed to load revenue data' }, { status: 500 });
  }
}
