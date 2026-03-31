import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { runId } = await params;

  // Read from active_runs table (DB-persisted state)
  const result = await pool.query(
    `SELECT id, brand_id, user_id, status, total_expected, received, found_count,
            error_count, results, final_data, error, platforms, queries,
            started_at, completed_at, updated_at
     FROM active_runs WHERE id = $1 LIMIT 1`,
    [runId]
  );

  if (result.rows.length === 0) {
    return Response.json({ error: 'Run not found' }, { status: 404 });
  }

  const run = result.rows[0];

  // Verify ownership
  if (run.user_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

  // Support "since" param — only return results after a given index
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
