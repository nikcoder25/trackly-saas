import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';

// Accepts the same shape as ./[runId]/route.ts so callers don't have to
// learn two regexes. Path params flow into SQL only after this check.
const ID_RE = /^[a-z0-9_-]{6,64}$/i;

/**
 * Per-brand run status WITHOUT a runId.
 *
 * Returns the current `status='running'` row for this brand if one
 * exists, otherwise the most recent terminal row (status in
 * ('done','error')). Used by the dashboard to recover when a client
 * has lost track of the active runId (page refresh, cookie clear,
 * crashed tab) and to power "is this brand currently running?"
 * checks at the brand level. Read-only — does not invoke the
 * watchdog. The runId variant (./[runId]/route.ts) keeps the
 * defensive watchdog because it polls every 2-5s; this route is
 * called once per page load, so reaping decisions belong with the
 * cron + the runId-poll path.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id } = await params;
  if (!ID_RE.test(id)) {
    return Response.json({ error: 'Invalid brand id' }, { status: 400 });
  }

  // Authorize at the brand level BEFORE touching active_runs. Owner or
  // any team-member role (including viewer) can read run status — this
  // matches the read-only nature of the runId variant which gates only
  // on `run.user_id !== caller.id`. Viewers can already see runs in the
  // dashboard UI; this endpoint is the JSON form of that read.
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  // Prefer an in-progress row; otherwise return the most recent terminal
  // row so the client can render "Last Run" without a second request.
  // Single query keeps the round-trip count down on the dashboard load.
  const result = await pool.query(
    `SELECT id, brand_id, status, total_expected, received, found_count,
            error_count, error, platforms, queries,
            started_at, completed_at, updated_at, last_attempt_at,
            last_platform_attempted, last_query_attempted
       FROM active_runs
      WHERE brand_id = $1
      ORDER BY (status = 'running') DESC, started_at DESC
      LIMIT 1`,
    [id]
  );

  if (result.rows.length === 0) {
    const resp = Response.json({ status: 'none', brandId: id });
    resp.headers.set('Cache-Control', 'no-store');
    return resp;
  }

  const run = result.rows[0];
  const resp = Response.json({
    status: run.status,
    runId: run.id,
    brandId: run.brand_id,
    totalExpected: run.total_expected || 0,
    received: run.received || 0,
    foundCount: run.found_count || 0,
    errorCount: run.error_count || 0,
    platforms: run.platforms || [],
    queries: run.queries || [],
    startedAt: run.started_at,
    updatedAt: run.updated_at,
    completedAt: run.completed_at,
    lastAttemptAt: run.last_attempt_at,
    lastPlatformAttempted: run.last_platform_attempted,
    lastQueryAttempted: run.last_query_attempted,
    error: run.status === 'error' ? run.error : undefined,
  });
  resp.headers.set('Cache-Control', 'no-store');
  return resp;
}
