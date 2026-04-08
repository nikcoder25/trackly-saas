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
      costSummary,
      costByPlatform,
      dailyCostTrend,
      costByUserRanked,
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
      // Total cost summary
      pool.query(`
        SELECT
          COALESCE(SUM(cost), 0)::numeric AS total_cost,
          COALESCE(SUM(tokens_in), 0)::bigint AS total_tokens_in,
          COALESCE(SUM(tokens_out), 0)::bigint AS total_tokens_out,
          COALESCE(SUM(tokens_in) + SUM(tokens_out), 0)::bigint AS total_tokens
        FROM api_logs
        WHERE created_at >= NOW() - INTERVAL '1 day' * $1 AND status = 'ok'
      `, [days]),
      // Cost breakdown by platform
      pool.query(`
        SELECT platform,
          COALESCE(SUM(cost), 0)::numeric AS cost,
          COALESCE(SUM(tokens_in), 0)::bigint AS tokens_in,
          COALESCE(SUM(tokens_out), 0)::bigint AS tokens_out,
          COUNT(*) FILTER (WHERE status = 'ok')::int AS successful_calls
        FROM api_logs
        WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY platform ORDER BY cost DESC
      `, [days]),
      // Daily cost trend
      pool.query(`
        SELECT DATE(created_at) AS date,
          COALESCE(SUM(cost), 0)::numeric AS cost,
          COALESCE(SUM(tokens_in), 0)::bigint AS tokens_in,
          COALESCE(SUM(tokens_out), 0)::bigint AS tokens_out
        FROM api_logs
        WHERE created_at >= NOW() - INTERVAL '1 day' * $1 AND status = 'ok'
        GROUP BY DATE(created_at) ORDER BY date ASC
      `, [days]),
      // Top users by cost
      pool.query(`
        SELECT u.email, u.plan,
          COALESCE(SUM(al.cost), 0)::numeric AS cost,
          COALESCE(SUM(al.tokens_in), 0)::bigint AS tokens_in,
          COALESCE(SUM(al.tokens_out), 0)::bigint AS tokens_out,
          COUNT(al.id)::int AS calls
        FROM api_logs al
        JOIN users u ON u.id = al.user_id
        WHERE al.created_at >= NOW() - INTERVAL '1 day' * $1 AND al.status = 'ok'
        GROUP BY u.email, u.plan ORDER BY cost DESC LIMIT 15
      `, [days]),
    ]);

    return Response.json({
      platformUsage: platformUsage.rows,
      dailyCosts: dailyStats.rows,
      topPlatforms: topPlatforms.rows,
      errorRates: errorRates.rows,
      costByUser: topUsersByQueries.rows,
      costSummary: costSummary.rows[0] || { total_cost: 0, total_tokens_in: 0, total_tokens_out: 0, total_tokens: 0 },
      costByPlatform: costByPlatform.rows,
      dailyCostTrend: dailyCostTrend.rows,
      costByUserRanked: costByUserRanked.rows,
      period: days,
    });
  } catch (e) {
    console.error('[Admin Analytics]', (e as Error).message);
    return Response.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
