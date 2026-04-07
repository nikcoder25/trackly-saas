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
          COUNT(DISTINCT user_id)::int AS active_users,
          COUNT(*) FILTER (WHERE status != 'ok')::int AS total_errors
        FROM api_logs
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `),
      // Top users by query count (last 30 days)
      pool.query(`
        SELECT u.id, u.email, u.name, u.plan,
          COALESCE(pr_counts.query_count, 0)::int AS query_count,
          COALESCE(al_counts.api_calls, 0)::int AS api_calls
        FROM users u
        LEFT JOIN (
          SELECT b.user_id, COUNT(pr.id)::int AS query_count
          FROM prompt_runs pr
          JOIN brands b ON b.id = pr.brand_id
          WHERE pr.created_at >= NOW() - INTERVAL '30 days'
          GROUP BY b.user_id
        ) pr_counts ON pr_counts.user_id = u.id
        LEFT JOIN (
          SELECT user_id, COUNT(*)::int AS api_calls
          FROM api_logs
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY user_id
        ) al_counts ON al_counts.user_id = u.id
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
