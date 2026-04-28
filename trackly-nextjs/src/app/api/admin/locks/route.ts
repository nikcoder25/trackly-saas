/**
 * Admin view of every cron lock across both backends.
 *
 * GET /api/admin/locks
 * Auth: admin role only (see @/lib/admin-auth).
 *
 * Returns:
 *   - Redis cron:lock:* keys (instanceId + ttlMs remaining)
 *   - Postgres cron_locks rows (locked_at + age + instanceId)
 *   - Per-backend availability + error so the operator can tell
 *     "Redis is down" from "no locks held"
 *
 * The two backends can disagree:
 *   - Redis is the active holder when REDIS_URL is set, but the
 *     Postgres row may be stale residue from a Redis-outage period
 *     that never got DELETEd. Both surfaces matter for force-release.
 */
import { requireAdmin } from '@/lib/admin-auth';
import { listCronLocks } from '@/lib/cron-lock';

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const snapshot = await listCronLocks();

  const resp = Response.json({
    locks: snapshot.locks,
    redis: snapshot.redis,
    postgres: snapshot.postgres,
    timestamp: new Date().toISOString(),
  });
  resp.headers.set('Cache-Control', 'no-store');
  return resp;
}
