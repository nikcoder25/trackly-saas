/**
 * Admin only.
 * GET  /api/rank-tracking/admin/spend - SERP and volume data spend per day (last 30 days) and per provider.
 * POST /api/rank-tracking/admin/spend {action:'refresh_locations'} - reload the city list.
 */
import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { ensureRankSchema } from '@/lib/rank-tracking/schema';
import { refreshLocations } from '@/lib/rank-tracking/locations';
import { providerChain } from '@/lib/rank-tracking/providers';

export async function GET(request: Request): Promise<Response> {
  const a = await requireAdmin(request);
  if (a instanceof Response) return a;
  await ensureRankSchema();
  const days = await pool.query(
    `SELECT to_char(date_trunc('day', at), 'YYYY-MM-DD') AS day, provider, kind, SUM(units)::int AS units, SUM(cost_usd)::float AS cost
       FROM rt_spend WHERE at >= NOW() - INTERVAL '30 days' GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2, 3`);
  const totals = await pool.query(
    `SELECT COALESCE(SUM(cost_usd) FILTER (WHERE at >= date_trunc('day', NOW())), 0)::float AS today,
            COALESCE(SUM(cost_usd) FILTER (WHERE at >= date_trunc('month', NOW())), 0)::float AS month,
            COALESCE(SUM(cost_usd) FILTER (WHERE at >= NOW() - INTERVAL '30 days'), 0)::float AS last30
       FROM rt_spend`);
  const queue = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE next_check_at <= NOW() AND pending_provider IS NULL)::int AS due,
            COUNT(*) FILTER (WHERE pending_task_id IS NOT NULL)::int AS pending,
            COUNT(*) FILTER (WHERE fail_count > 0)::int AS failing,
            COUNT(*)::int AS keywords
       FROM rt_keywords`);
  const accounts = await pool.query(
    `SELECT s.account_id AS "accountId", u.email, SUM(s.cost_usd)::float AS cost
       FROM rt_spend s LEFT JOIN users u ON u.id = s.account_id
      WHERE s.at >= date_trunc('month', NOW()) GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20`);
  const locations = await pool.query(`SELECT COUNT(*)::int AS n FROM rt_locations`);
  return Response.json({
    days: days.rows, totals: totals.rows[0], queue: queue.rows[0], topAccounts: accounts.rows,
    providers: providerChain().map((p) => ({ name: p.name, costPerPage: p.costPerPage })), locations: locations.rows[0]?.n || 0,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  const a = await requireAdmin(request);
  if (a instanceof Response) return a;
  await ensureRankSchema();
  const n = await refreshLocations();
  return Response.json({ ok: true, locations: n });
}
