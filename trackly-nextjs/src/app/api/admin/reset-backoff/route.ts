/**
 * Reset crash_backoff state for one brand or all paid-plan brands.
 *
 * POST /api/admin/reset-backoff
 * Auth: admin or owner (see @/lib/admin-auth).
 *
 * Body:
 *   { "brandId": "mnpzo..." }   reset a single brand
 *   { "brandId": "all" }        reset every brand currently in backoff
 *
 * How it works: the cron scheduler (see getBrandCrashInfo in
 * /api/cron/route.ts) derives `consecutive_errors` from the active_runs
 * table by counting consecutive 'error' rows since the most recent
 * 'done' row. The cleanest reset — without mutating real run history —
 * is to insert a synthetic sentinel row with status='done' and
 * started_at=NOW() per target brand. The next cron tick's window
 * function then sees a 'done' at rn=1, done_seen_after becomes >=1 for
 * every older 'error' row, and `consecutive_errors` collapses to 0. The
 * in-memory `g._cronPileupStreak` counter also resets because
 * `reconciled >= processed` stops holding.
 *
 * NOT a scheduled job. Intended for on-call use after fixing the root
 * cause of a provider outage (e.g. expanding a Gemini quota) to let
 * brands resume immediately instead of waiting out the backoff window.
 */
import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';
import { uid } from '@/lib/helpers';

// Match the defaults in /api/cron/route.ts so we only count brands that
// would actually be gated. These are hydrated from env at invocation
// time so an operator raising the threshold doesn't need a redeploy
// for this endpoint to notice.
function getThreshold(): number {
  return Number(process.env.CRON_CRASH_BACKOFF_THRESHOLD) || 3;
}

interface ResetResult {
  brand_id: string;
  prior_consecutive_errors: number;
  sentinel_id: string;
}

async function findBrandsInBackoff(threshold: number): Promise<Array<{ brand_id: string; consecutive_errors: number }>> {
  const res = await pool.query(
    `WITH ranked AS (
      SELECT
        brand_id,
        status,
        started_at,
        ROW_NUMBER() OVER (PARTITION BY brand_id ORDER BY started_at DESC) AS rn
      FROM active_runs
      WHERE status IN ('done', 'error')
    ),
    with_done_marker AS (
      SELECT
        brand_id,
        status,
        rn,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)
          OVER (PARTITION BY brand_id ORDER BY rn) AS done_seen_after
      FROM ranked
    )
    SELECT
      brand_id,
      COUNT(*) FILTER (WHERE status = 'error' AND done_seen_after = 0) AS consecutive_errors
    FROM with_done_marker
    GROUP BY brand_id
    HAVING COUNT(*) FILTER (WHERE status = 'error' AND done_seen_after = 0) >= $1`,
    [threshold],
  );
  return (res.rows as Array<{ brand_id: string; consecutive_errors: string | number }>).map(r => ({
    brand_id: r.brand_id,
    consecutive_errors: Number(r.consecutive_errors || 0),
  }));
}

async function consecutiveErrorsFor(brandId: string): Promise<number> {
  const res = await pool.query(
    `WITH ranked AS (
      SELECT status, started_at,
             ROW_NUMBER() OVER (ORDER BY started_at DESC) AS rn
      FROM active_runs
      WHERE brand_id = $1 AND status IN ('done', 'error')
    ),
    with_done_marker AS (
      SELECT status, rn,
             SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)
               OVER (ORDER BY rn) AS done_seen_after
      FROM ranked
    )
    SELECT COUNT(*) FILTER (WHERE status = 'error' AND done_seen_after = 0) AS n
    FROM with_done_marker`,
    [brandId],
  );
  return Number(res.rows[0]?.n || 0);
}

async function insertSentinel(brandId: string): Promise<string> {
  const brandRow = await pool.query('SELECT user_id FROM brands WHERE id = $1', [brandId]);
  const userId = brandRow.rows[0]?.user_id || 'system';
  const sentinelId = uid();
  await pool.query(
    `INSERT INTO active_runs
      (id, brand_id, user_id, status, total_expected, received,
       found_count, error_count, started_at, completed_at, updated_at, error)
     VALUES ($1, $2, $3, 'done', 0, 0, 0, 0, NOW(), NOW(), NOW(),
             'backoff reset sentinel')`,
    [sentinelId, brandId, userId],
  );
  return sentinelId;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  let body: { brandId?: string } = {};
  try { body = await request.json(); } catch { /* empty body handled below */ }
  const target = body.brandId?.trim();
  if (!target) {
    return Response.json(
      { error: 'Provide { brandId: "<id>" } or { brandId: "all" }' },
      { status: 400 },
    );
  }

  const threshold = getThreshold();
  const results: ResetResult[] = [];

  if (target === 'all') {
    const brands = await findBrandsInBackoff(threshold);
    for (const b of brands) {
      const sentinelId = await insertSentinel(b.brand_id);
      results.push({
        brand_id: b.brand_id,
        prior_consecutive_errors: b.consecutive_errors,
        sentinel_id: sentinelId,
      });
    }
  } else {
    const exists = await pool.query('SELECT id FROM brands WHERE id = $1', [target]);
    if (!exists.rows.length) {
      return Response.json({ error: 'Brand not found' }, { status: 404 });
    }
    const prior = await consecutiveErrorsFor(target);
    const sentinelId = await insertSentinel(target);
    results.push({
      brand_id: target,
      prior_consecutive_errors: prior,
      sentinel_id: sentinelId,
    });
  }

  logger.info('admin.reset_backoff', {
    admin_id: admin.id,
    target,
    threshold,
    reset_count: results.length,
  });

  return Response.json({
    ok: true,
    threshold,
    reset_count: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
