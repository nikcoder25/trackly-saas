/**
 * Force-release a wedged cron lock.
 *
 * POST /api/admin/locks/[name]/release
 * Auth: admin role only (see @/lib/admin-auth).
 *
 * Bypasses the Lua compare-and-delete that the normal `release()`
 * uses, so this WILL delete a lock currently held by a live worker
 * on another pod. The risk is documented in
 * src/lib/cron-lock.ts::forceReleaseCronLock — TL;DR: per-brand
 * work is still de-duplicated by the active_runs partial unique
 * index, so the worst case is two `/api/cron` ticks racing the
 * same scheduling loop, which is already handled.
 *
 * Allowlisted lock names only. Operators can't release arbitrary
 * keys (e.g. third-party Bull queue locks that share the
 * `cron:lock:*` prefix in some deployments) by mistake.
 *
 * Audited: cron_locks.force_release event with operator id, lock
 * name, and the prior locked_at + instanceId per backend.
 */
import { requireAdmin } from '@/lib/admin-auth';
import { forceReleaseCronLock } from '@/lib/cron-lock';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/db';

// Names this endpoint is allowed to touch. Mirrors the
// acquireCronLock callsites grep would surface — anything new
// (e.g. PR-B's own /api/cron/reap-stale-runs) must be added here
// to be force-releasable.
const ALLOWED_LOCK_NAMES = new Set([
  'scheduler',
  'scheduler_daily',
  'reconcile-payments',
  'reports:weekly',
  'reports:monthly',
  'reap_stale_runs',
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const { name } = await params;
  if (!ALLOWED_LOCK_NAMES.has(name)) {
    return Response.json(
      {
        error: `Lock name not in allowlist: "${name}"`,
        allowed: Array.from(ALLOWED_LOCK_NAMES).sort(),
      },
      { status: 400 },
    );
  }

  const result = await forceReleaseCronLock(name);

  logger.info('cron_locks.force_release', {
    admin_id: admin.id,
    lock_name: name,
    redis: result.redis,
    postgres: result.postgres,
  });
  auditLog(admin.id, 'cron_locks.force_release', 'cron_lock', name, {
    redis_available: result.redis.available,
    redis_deleted: result.redis.deleted,
    postgres_deleted: result.postgres.deleted,
    prior_locked_at: result.postgres.priorLockedAt,
    prior_instance_id: result.postgres.priorInstanceId,
  });

  return Response.json({
    ok: true,
    name,
    redis: result.redis,
    postgres: result.postgres,
    timestamp: new Date().toISOString(),
  });
}
