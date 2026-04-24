import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { reconcileStaleRuns } from '@/lib/run-reconciler';

// URL params go straight to SQL. Shape-check them before any DB call.
// Matches the output of uid(): base36 timestamp + hex chars.
const ID_RE = /^[a-z0-9_-]{6,64}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id, runId } = await params;
  if (!ID_RE.test(id) || !ID_RE.test(runId)) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  // Read from active_runs first so we can check ownership BEFORE any
  // state-mutating watchdog call. Without this, any authed user could
  // trigger a reconcile on arbitrary tenants' runs.
  let result = await pool.query(
    `SELECT id, brand_id, user_id, status, total_expected, received, found_count,
            error_count, results, final_data, error, platforms, queries,
            started_at, completed_at, updated_at
     FROM active_runs WHERE id = $1 LIMIT 1`,
    [runId]
  );

  if (result.rows.length === 0) {
    return Response.json({ error: 'Run not found' }, { status: 404 });
  }

  let run = result.rows[0];

  // Verify ownership and that this run belongs to the requested brand.
  if (run.user_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });
  if (run.brand_id !== id) return Response.json({ error: 'Run does not belong to this brand' }, { status: 403 });

  // Defensive watchdog: if the row has been 'running' with no progress
  // for longer than the stale threshold, finalize it BEFORE returning so
  // the client sees 'error' on this very poll instead of hanging until
  // the next hourly cron tick. Now safe to call — ownership is verified.
  if (run.status === 'running') {
    try {
      await reconcileStaleRuns({ brandId: id, runId });
      // Re-read so the response reflects any reap that just happened.
      const fresh = await pool.query(
        `SELECT id, brand_id, user_id, status, total_expected, received, found_count,
                error_count, results, final_data, error, platforms, queries,
                started_at, completed_at, updated_at
         FROM active_runs WHERE id = $1 LIMIT 1`,
        [runId]
      );
      if (fresh.rows.length) run = fresh.rows[0];
    } catch {
      // never let watchdog errors break the status endpoint
    }
  }

  // Support "since" param - only return results after a given index
  const since = parseInt(new URL(request.url).searchParams.get('since') || '0', 10);
  const allResults = run.results || [];
  const newResults = since > 0 ? allResults.slice(since) : allResults;

  const resp: Record<string, unknown> = {
    status: run.status,
    runId: run.id,
    received: run.received || 0,
    totalExpected: run.total_expected || 0,
    foundCount: run.found_count || 0,
    errorCount: run.error_count || 0,
    platforms: run.platforms || [],
    results: newResults,
    resultOffset: since,
    totalResults: allResults.length,
    startedAt: run.started_at,
  };

  if (run.status === 'done') resp.finalData = run.final_data;
  if (run.status === 'error') resp.error = run.error;

  return Response.json(resp);
}
