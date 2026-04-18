/**
 * Force-run diagnostic endpoint.
 *
 * POST /api/admin/force-run
 * Auth: admin or owner.
 *
 * Body:
 *   { "brandId": "mnpzo..." }         run a single brand
 *   { "allOverdue": true }            run every paid brand whose next
 *                                     scheduled run is due, up to `limit`
 *   { "allOverdue": true, "limit": 5 }
 *
 * For each target brand, calls POST /api/brands/:id/run?sync=1 so
 * executeRunBackground runs inline and the HTTP response waits for it
 * to finish. This bypasses Next.js after() entirely, so the response
 * tells us whether the scan itself works end-to-end (AI calls ->
 * parsing -> brand data write -> active_runs done).
 *
 * Target audience: operator on the command line, or another Claude
 * session calling it with admin credentials to diagnose why the
 * scheduled cron isn't producing fresh runs.
 */
import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { getPlanLimits } from '@/lib/constants';

interface BrandRow {
  id: string;
  user_id: string;
  plan: string;
  data: { schedule?: string | number; runs?: Array<{ time?: string; date?: string }> } | null;
}

// Per-brand sync run can take several minutes. Give it plenty of
// headroom so a slow provider doesn't kill the whole batch.
const PER_RUN_TIMEOUT_MS = 10 * 60_000;

interface BrandResult {
  brand_id: string;
  status: 'ok' | 'error' | 'skipped' | 'timeout';
  run_id?: string;
  http_status?: number;
  error?: string;
  duration_ms: number;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ error: 'CRON_SECRET not configured on server' }, { status: 500 });
  }

  let body: { brandId?: string; allOverdue?: boolean; limit?: number } = {};
  try { body = await request.json(); } catch { /* empty body allowed */ }

  const targets: string[] = [];
  if (body.brandId) {
    targets.push(body.brandId);
  } else if (body.allOverdue) {
    const limit = Math.min(Math.max(1, body.limit ?? 10), 50);
    const paidPlans = ['starter', 'pro', 'agency', 'enterprise', 'owner'];
    const brandsResult = await pool.query<BrandRow>(
      `SELECT b.id, b.user_id, b.data, u.plan
       FROM brands b
       JOIN users u ON u.id = b.user_id
       WHERE u.plan = ANY($1::text[])
       ORDER BY b.updated_at ASC
       LIMIT 100`,
      [paidPlans]
    );
    const brandIds = brandsResult.rows.map(r => r.id);
    const lastDoneMap: Record<string, number> = {};
    if (brandIds.length) {
      const r = await pool.query<{ brand_id: string; last_run: string }>(
        `SELECT brand_id, MAX(COALESCE(completed_at, started_at))::text AS last_run
         FROM active_runs
         WHERE brand_id = ANY($1) AND status = 'done'
         GROUP BY brand_id`,
        [brandIds]
      );
      for (const row of r.rows) lastDoneMap[row.brand_id] = new Date(row.last_run).getTime();
    }
    const now = Date.now();
    for (const row of brandsResult.rows) {
      const limits = getPlanLimits(row.plan || 'free');
      if (!limits.scheduledRuns) continue;
      const scheduleRaw = row.data?.schedule;
      const scheduleHours = (scheduleRaw !== undefined && scheduleRaw !== null)
        ? (parseInt(String(scheduleRaw), 10) || 24)
        : 24;
      const effectiveSchedule = Math.max(scheduleHours, limits.minScheduleHours);
      let lastTime = lastDoneMap[row.id] ?? null;
      if (!lastTime) {
        const runs = row.data?.runs || [];
        const last = runs[runs.length - 1];
        const stamp = last?.time ?? last?.date ?? null;
        if (stamp) lastTime = new Date(stamp).getTime();
      }
      const hoursSince = lastTime ? (now - lastTime) / 3_600_000 : Number.POSITIVE_INFINITY;
      if (hoursSince >= effectiveSchedule) targets.push(row.id);
      if (targets.length >= limit) break;
    }
  } else {
    return Response.json({
      error: 'Provide { brandId } or { allOverdue: true, limit?: <n> }',
    }, { status: 400 });
  }

  if (!targets.length) {
    return Response.json({
      message: 'No overdue brands found',
      overall: { attempted: 0, ok: 0, errors: 0, skipped: 0 },
      results: [],
    });
  }

  // Work out base URL for the internal fetch. Prefer APP_URL so this works
  // when the request comes in from localhost / an internal VPC.
  const baseUrl = process.env.APP_URL || new URL(request.url).origin;

  const results: BrandResult[] = [];
  for (const brandId of targets) {
    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PER_RUN_TIMEOUT_MS);
    try {
      const resp = await fetch(`${baseUrl}/api/brands/${encodeURIComponent(brandId)}/run?sync=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
        signal: controller.signal,
        body: '{}',
      });
      const text = await resp.text();
      let parsed: { runId?: string; syncCompleted?: boolean; error?: string } | null = null;
      try { parsed = JSON.parse(text); } catch { /* keep raw */ }
      results.push({
        brand_id: brandId,
        status: resp.ok && parsed?.syncCompleted ? 'ok' : 'error',
        run_id: parsed?.runId,
        http_status: resp.status,
        error: !resp.ok || !parsed?.syncCompleted ? (parsed?.error || text.slice(0, 300)) : undefined,
        duration_ms: Date.now() - t0,
      });
    } catch (err) {
      const isTimeout = (err as Error).name === 'AbortError';
      results.push({
        brand_id: brandId,
        status: isTimeout ? 'timeout' : 'error',
        error: (err as Error).message,
        duration_ms: Date.now() - t0,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return Response.json({
    overall: {
      attempted: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      errors: results.filter(r => r.status === 'error').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      timeouts: results.filter(r => r.status === 'timeout').length,
    },
    results,
    timestamp: new Date().toISOString(),
  });
}
