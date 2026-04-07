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
      dailyStats,
      topPlatforms,
      errorRates,
      topUsersByQueries,
    ] = await Promise.all([
      // Usage by platform
      pool.query(`
        SELECT platform,
          COUNT(*)::int AS calls,
          COALESCE(AVG(response_ms), 0)::int AS avg_latency_ms,
          COUNT(*) FILTER (WHERE status != 'ok')::int AS errors
        FROM api_logs
        WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY platform ORDER BY calls DESC
      `, [days]),
      // Daily call trend
      pool.query(`
        SELECT DATE(created_at) AS date,
          COUNT(*)::int AS calls,
          COUNT(DISTINCT user_id)::int AS active_users,
          COALESCE(AVG(response_ms), 0)::int AS avg_latency
        FROM api_logs
        WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY DATE(created_at) ORDER BY date ASC
      `, [days]),
      // Top platforms by model
      pool.query(`
        SELECT platform, model,
          COUNT(*)::int AS calls
        FROM api_logs
        WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY platform, model ORDER BY calls DESC LIMIT 20
      `, [days]),
      // Error rates by platform
      pool.query(`
        SELECT platform,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status != 'ok')::int AS errors,
          ROUND(COUNT(*) FILTER (WHERE status != 'ok')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS error_rate
        FROM api_logs
        WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY platform ORDER BY error_rate DESC
      `, [days]),
      // Top users by API call count
      pool.query(`
        SELECT u.email, u.plan,
          COUNT(al.id)::int AS calls
        FROM api_logs al
        JOIN users u ON u.id = al.user_id
        WHERE al.created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY u.email, u.plan ORDER BY calls DESC LIMIT 15
      `, [days]),
    ]);

    return Response.json({
      platformUsage: platformUsage.rows,
      dailyCosts: dailyStats.rows,
      topPlatforms: topPlatforms.rows,
      errorRates: errorRates.rows,
      costByUser: topUsersByQueries.rows,
      period: days,
    });
  } catch (e) {
    console.error('[Admin Analytics]', (e as Error).message);
    return Response.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
