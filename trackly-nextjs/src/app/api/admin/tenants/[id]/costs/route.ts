/**
 * Admin endpoint - per-tenant LLM cost summary.
 *
 *   GET /api/admin/tenants/:id/costs
 *
 * Returns the tenant's daily and monthly USD totals (UTC-aligned), the
 * configured caps, the current window status (`ok` vs which window has
 * been hit), and a small breakdown by platform and model for triage.
 *
 * Banks operating Livesov use this to confirm a tenant has actually hit
 * its cap before raising it, and to attribute spend across providers.
 */
import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';
import {
  checkCostCap,
  ensureCostEventsTable,
  currentDayBoundaryUtc,
  currentMonthBoundaryUtc,
} from '@/lib/cost-tracker';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const { id: tenantId } = await params;
  if (!tenantId) {
    return Response.json({ error: 'tenant id required' }, { status: 400 });
  }

  try {
    await ensureCostEventsTable();

    const now = new Date();
    const status = await checkCostCap(tenantId, now);

    const dayStart = currentDayBoundaryUtc(now).toISOString();
    const monthStart = currentMonthBoundaryUtc(now).toISOString();

    // Per-platform / per-model breakdown for the current month window.
    // Cheap enough at typical tenant volumes; if a tenant ever blows
    // through the monthly window with millions of rows the index on
    // (tenant_id, created_at DESC) keeps the scan bounded.
    const breakdownResult = await pool.query(
      `SELECT platform, model,
              COUNT(*)::int AS calls,
              COALESCE(SUM(tokens_in), 0)::bigint AS tokens_in,
              COALESCE(SUM(tokens_out), 0)::bigint AS tokens_out,
              COALESCE(SUM(usd_cost), 0)::numeric AS usd_cost
         FROM tenant_cost_events
        WHERE tenant_id = $1 AND created_at >= $2
        GROUP BY platform, model
        ORDER BY usd_cost DESC`,
      [tenantId, monthStart],
    );

    const byPlatformModel = breakdownResult.rows.map((r) => ({
      platform: r.platform,
      model: r.model,
      calls: parseInt(r.calls, 10) || 0,
      tokensIn: Number(r.tokens_in) || 0,
      tokensOut: Number(r.tokens_out) || 0,
      usdCost: parseFloat(r.usd_cost) || 0,
    }));

    return Response.json({
      tenantId,
      now: now.toISOString(),
      windows: {
        dayStartUtc: dayStart,
        monthStartUtc: monthStart,
      },
      caps: {
        dailyUsd: status.caps.dailyUsd,
        monthlyUsd: status.caps.monthlyUsd,
      },
      totals: {
        dailyUsd: status.totals.dailyUsd,
        monthlyUsd: status.totals.monthlyUsd,
      },
      capStatus: {
        ok: status.ok,
        window: status.window || null,
        resetAt: status.resetAt || null,
      },
      breakdown: byPlatformModel,
    });
  } catch (e) {
    logger.error('admin.tenant_costs_failed', {
      tenant_id: tenantId, error: (e as Error).message,
    });
    return Response.json({ error: 'Cost summary query failed' }, { status: 500 });
  }
}
