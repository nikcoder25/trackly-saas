/**
 * Admin monitoring endpoint — returns system health metrics.
 * GET /api/admin/monitoring
 */
import { pool } from '@/lib/db';

export async function GET() {
  try {
    // Active runs count
    const activeRunsResult = await pool.query(
      `SELECT COUNT(*) as count FROM active_runs WHERE status = 'running' AND started_at > NOW() - INTERVAL '30 minutes'`
    );
    const activeRuns = parseInt(activeRunsResult.rows[0]?.count, 10) || 0;

    // Per-platform average response times (last 1 hour)
    const responseTimesResult = await pool.query(
      `SELECT platform,
              ROUND(AVG(response_ms)) as avg_response_ms,
              COUNT(*) as call_count,
              ROUND(MIN(response_ms)) as min_response_ms,
              ROUND(MAX(response_ms)) as max_response_ms
       FROM api_logs
       WHERE created_at > NOW() - INTERVAL '1 hour'
         AND response_ms IS NOT NULL
         AND status = 'ok'
       GROUP BY platform
       ORDER BY platform`
    );
    const platformResponseTimes: Record<string, { avg_ms: number; count: number; min_ms: number; max_ms: number }> = {};
    for (const row of responseTimesResult.rows) {
      platformResponseTimes[row.platform] = {
        avg_ms: parseInt(row.avg_response_ms, 10) || 0,
        count: parseInt(row.call_count, 10) || 0,
        min_ms: parseInt(row.min_response_ms, 10) || 0,
        max_ms: parseInt(row.max_response_ms, 10) || 0,
      };
    }

    // DB pool stats (if available from pg pool)
    let dbPoolStats = null;
    try {
      dbPoolStats = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      };
    } catch { /* pool stats may not be available */ }

    return Response.json({
      timestamp: new Date().toISOString(),
      activeRuns,
      platformResponseTimes,
      dbPool: dbPoolStats,
    });
  } catch (e) {
    return Response.json({ error: 'Monitoring query failed: ' + (e as Error).message }, { status: 500 });
  }
}
