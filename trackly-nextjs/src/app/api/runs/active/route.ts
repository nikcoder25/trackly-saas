import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getStaleRunMinutes } from '@/lib/run-reconciler';

/**
 * User-scoped fleet view of in-progress runs.
 *
 * Returns every `active_runs` row at status='running' for brands the
 * caller can see - owner brands plus team-member brands. Lets a
 * single user spot a stuck run across their accessible brands
 * without bouncing between brand selectors. Read-only.
 *
 * Each row includes `last_attempt_at` and progress (received /
 * total_expected) so the caller can tell stuck from slow without
 * admin access.
 *
 * Stale-flag math mirrors src/lib/run-reconciler.ts so the frontend
 * doesn't need its own threshold.
 */
export async function GET(request: Request) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const staleMinutes = getStaleRunMinutes();

  // The OR + EXISTS form matches getBrandWithAccess(): owner brand OR
  // any team_members row where the caller is a member of the brand
  // owner. Single query, both branches use indexes (brands.user_id
  // and team_members composite) - no fan-out per brand.
  let result;
  try {
    result = await pool.query(
      `SELECT ar.id, ar.brand_id, ar.status, ar.total_expected, ar.received,
              ar.found_count, ar.error_count, ar.platforms, ar.started_at,
              ar.updated_at, ar.last_attempt_at, ar.last_platform_attempted,
              ar.last_query_attempted,
              COALESCE(b.data->>'name', '') AS brand_name,
              (COALESCE(ar.updated_at, ar.started_at)
                 < NOW() - ($1::int || ' minutes')::interval) AS stale
         FROM active_runs ar
         JOIN brands b ON ar.brand_id = b.id
        WHERE ar.status = 'running'
          AND (
            b.user_id = $2
            OR EXISTS (
              SELECT 1 FROM team_members tm
               WHERE tm.owner_id = b.user_id AND tm.member_id = $2
            )
          )
        ORDER BY ar.started_at DESC
        LIMIT 100`,
      [staleMinutes, user.id]
    );
  } catch (e) {
    // active_runs table not yet provisioned (fresh deploy, no run has
    // been triggered). Return an empty fleet rather than 500.
    if ((e as { code?: string }).code === '42P01') {
      const resp = Response.json({ runs: [], staleThresholdMinutes: staleMinutes });
      resp.headers.set('Cache-Control', 'no-store');
      return resp;
    }
    throw e;
  }

  const runs = result.rows.map(row => ({
    runId: row.id,
    brandId: row.brand_id,
    brandName: row.brand_name || null,
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
    stale: !!row.stale,
  }));

  const resp = Response.json({
    runs,
    staleThresholdMinutes: staleMinutes,
  });
  resp.headers.set('Cache-Control', 'no-store');
  return resp;
}
