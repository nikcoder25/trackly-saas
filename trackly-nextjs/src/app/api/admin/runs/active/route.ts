/**
 * Admin fleet view of in-progress runs.
 *
 * GET /api/admin/runs/active
 * Auth: admin role only (see @/lib/admin-auth).
 *
 * Same data shape as /api/runs/active (PR-A) but unscoped — every
 * `active_runs` row at status='running' across the fleet, plus
 * brand owner email so the operator can decide whose run is safe
 * to reap.
 *
 * Read-only. Reaping is a separate POST /api/admin/runs/reap so
 * confirm dialogs in the UI map cleanly to one endpoint per action.
 */
import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { getStaleRunMinutes } from '@/lib/run-reconciler';

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const staleMinutes = getStaleRunMinutes();

  let runs: unknown[] = [];
  let tableMissing = false;
  try {
    const result = await pool.query(
      `SELECT ar.id, ar.brand_id, ar.user_id, ar.status,
              ar.total_expected, ar.received, ar.found_count, ar.error_count,
              ar.platforms, ar.started_at, ar.updated_at, ar.last_attempt_at,
              ar.last_platform_attempted, ar.last_query_attempted,
              COALESCE(b.data->>'name', '') AS brand_name,
              u.email AS owner_email,
              EXTRACT(EPOCH FROM (NOW() - ar.started_at))::int AS age_seconds,
              EXTRACT(EPOCH FROM (NOW() - COALESCE(ar.updated_at, ar.started_at)))::int AS no_progress_seconds,
              (COALESCE(ar.updated_at, ar.started_at)
                 < NOW() - ($1::int || ' minutes')::interval) AS stale
         FROM active_runs ar
         LEFT JOIN brands b ON ar.brand_id = b.id
         LEFT JOIN users u ON b.user_id = u.id
        WHERE ar.status = 'running'
        ORDER BY ar.started_at ASC`,
      [staleMinutes]
    );
    runs = result.rows.map(row => ({
      runId: row.id,
      brandId: row.brand_id,
      userId: row.user_id,
      brandName: row.brand_name || null,
      ownerEmail: row.owner_email || null,
      status: row.status,
      totalExpected: row.total_expected || 0,
      received: row.received || 0,
      foundCount: row.found_count || 0,
      errorCount: row.error_count || 0,
      platforms: row.platforms || [],
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      lastAttemptAt: row.last_attempt_at,
      lastPlatformAttempted: row.last_platform_attempted,
      lastQueryAttempted: row.last_query_attempted,
      ageSeconds: row.age_seconds,
      noProgressSeconds: row.no_progress_seconds,
      stale: !!row.stale,
    }));
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') {
      tableMissing = true;
    } else {
      throw e;
    }
  }

  const resp = Response.json({
    runs,
    tableMissing,
    staleThresholdMinutes: staleMinutes,
    timestamp: new Date().toISOString(),
  });
  resp.headers.set('Cache-Control', 'no-store');
  return resp;
}
