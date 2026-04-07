import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  try {
    const [
      userStats,
      planDistribution,
      recentSignups,
      apiUsage24h,
      topUsers,
      dailySignups,
      verificationStats,
    ] = await Promise.all([
      // Total users + users this week/month
      pool.query(`
        SELECT
          COUNT(*)::int AS total_users,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS users_this_week,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS users_this_month,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS users_today
        FROM users
      `),
      // Plan distribution
      pool.query(`
        SELECT plan, COUNT(*)::int AS count
        FROM users GROUP BY plan ORDER BY count DESC
      `),
      // Recent signups (last 10)
      pool.query(`
        SELECT id, email, name, plan, role, email_verified, created_at
        FROM users ORDER BY created_at DESC LIMIT 10
      `),
      // API usage last 24h
      pool.query(`
        SELECT
          COUNT(*)::int AS total_calls,
          COALESCE(SUM(tokens_in + tokens_out), 0)::bigint AS total_tokens,
          COALESCE(SUM(cost), 0)::numeric AS total_cost,
          COUNT(DISTINCT user_id)::int AS active_users
        FROM api_logs
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `),
      // Top users by query count (last 30 days)
      pool.query(`
        SELECT u.id, u.email, u.name, u.plan,
          COUNT(pr.id)::int AS query_count,
          COALESCE(SUM(al.cost), 0)::numeric AS total_cost
        FROM users u
        LEFT JOIN prompt_runs pr ON pr.brand_id IN (SELECT id FROM brands WHERE user_id = u.id)
          AND pr.created_at >= NOW() - INTERVAL '30 days'
        LEFT JOIN api_logs al ON al.user_id = u.id
          AND al.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY u.id, u.email, u.name, u.plan
        ORDER BY query_count DESC
        LIMIT 10
      `),
      // Daily signups (last 30 days)
      pool.query(`
        SELECT DATE(created_at) AS date, COUNT(*)::int AS count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `),
      // Verification stats
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE email_verified = true)::int AS verified,
          COUNT(*) FILTER (WHERE email_verified = false OR email_verified IS NULL)::int AS unverified
        FROM users
      `),
    ]);

    return Response.json({
      overview: userStats.rows[0],
      planDistribution: planDistribution.rows,
      recentSignups: recentSignups.rows,
      apiUsage24h: apiUsage24h.rows[0],
      topUsers: topUsers.rows,
      dailySignups: dailySignups.rows,
      verificationStats: verificationStats.rows[0],
    });
  } catch (e) {
    console.error('[Admin Stats]', (e as Error).message);
    return Response.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}
