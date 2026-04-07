import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10), 90);

  try {
    const [
      platformUsage,
      dailyCosts,
      topPlatforms,
      errorRates,
      costByUser,
    ] = await Promise.all([
      // Usage by platform
      pool.query(`
        SELECT platform,
          COUNT(*)::int AS calls,
          COALESCE(SUM(tokens_in), 0)::bigint AS tokens_in,
          COALESCE(SUM(tokens_out), 0)::bigint AS tokens_out,
          COALESCE(SUM(cost), 0)::numeric AS cost,
          COALESCE(AVG(response_ms), 0)::int AS avg_latency_ms
        FROM api_logs
        WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY platform ORDER BY cost DESC
      `, [days]),
      // Daily cost trend
      pool.query(`
        SELECT DATE(created_at) AS date,
          COUNT(*)::int AS calls,
          COALESCE(SUM(cost), 0)::numeric AS cost,
          COUNT(DISTINCT user_id)::int AS active_users
        FROM api_logs
        WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY DATE(created_at) ORDER BY date ASC
      `, [days]),
      // Top platforms by call count
      pool.query(`
        SELECT platform, model,
          COUNT(*)::int AS calls,
          COALESCE(SUM(cost), 0)::numeric AS cost
        FROM api_logs
        WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY platform, model ORDER BY calls DESC LIMIT 20
      `, [days]),
      // Error rates by platform
      pool.query(`
        SELECT platform,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE success = false)::int AS errors,
          ROUND(COUNT(*) FILTER (WHERE success = false)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS error_rate
        FROM api_logs
        WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY platform ORDER BY error_rate DESC
      `, [days]),
      // Cost by user (top 15)
      pool.query(`
        SELECT u.email, u.plan,
          COUNT(al.id)::int AS calls,
          COALESCE(SUM(al.cost), 0)::numeric AS cost
        FROM api_logs al
        JOIN users u ON u.id = al.user_id
        WHERE al.created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY u.email, u.plan ORDER BY cost DESC LIMIT 15
      `, [days]),
    ]);

    return Response.json({
      platformUsage: platformUsage.rows,
      dailyCosts: dailyCosts.rows,
      topPlatforms: topPlatforms.rows,
      errorRates: errorRates.rows,
      costByUser: costByUser.rows,
      period: days,
    });
  } catch (e) {
    console.error('[Admin Analytics]', (e as Error).message);
    return Response.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
