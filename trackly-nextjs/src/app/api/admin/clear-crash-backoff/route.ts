/**
 * Clear the cron crash_backoff state for one or more brands.
 *
 * POST /api/admin/clear-crash-backoff
 * Auth: admin or owner.
 *
 * Body:
 *   { "brandId": "mnpzo..." }    clear one brand
 *   { "all": true }              clear every brand currently in backoff
 *
 * Sets brands.crash_backoff_cleared_at = NOW(). The cron's
 * getBrandCrashInfo query ignores error rows with started_at <= that
 * timestamp, so the consecutive-error streak for the targeted brands
 * drops to zero on the next tick and they become eligible again.
 *
 * Use after fixing the underlying root cause (provider quota, expired
 * API key, etc.) - clearing alone won't help if the next run just
 * crashes the same way.
 */
import { pool, ensureColumns } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  await ensureColumns();

  let body: { brandId?: string; all?: boolean } = {};
  try { body = await request.json(); } catch { /* empty body */ }

  if (!body.brandId && !body.all) {
    return Response.json({
      error: 'Provide { brandId } or { all: true }',
    }, { status: 400 });
  }

  try {
    let result;
    if (body.brandId) {
      result = await pool.query(
        `UPDATE brands SET crash_backoff_cleared_at = NOW() WHERE id = $1 RETURNING id`,
        [body.brandId],
      );
    } else {
      // Target only brands that actually have a recent error, to avoid
      // stamping every row in the table.
      result = await pool.query(
        `UPDATE brands SET crash_backoff_cleared_at = NOW()
         WHERE id IN (
           SELECT DISTINCT brand_id FROM active_runs
           WHERE status = 'error' AND started_at > NOW() - INTERVAL '7 days'
         )
         RETURNING id`,
      );
    }

    const cleared: string[] = (result.rows as { id: string }[]).map(r => r.id);
    logger.info('admin.clear_crash_backoff', {
      actor_id: admin.id,
      cleared_count: cleared.length,
      scope: body.brandId ? 'single' : 'all',
    });

    return Response.json({
      cleared_count: cleared.length,
      cleared_brand_ids: cleared,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({
      error: (e as Error).message,
    }, { status: 500 });
  }
}
