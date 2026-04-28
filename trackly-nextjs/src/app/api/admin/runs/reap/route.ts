/**
 * Manual reap of stuck `active_runs` rows.
 *
 * POST /api/admin/runs/reap
 * Auth: admin role only (see @/lib/admin-auth).
 *
 * Three call shapes (mutually exclusive):
 *
 *   { runId: "..." }
 *     Surgical reap — bypasses the staleness gate (force=true) so
 *     an operator can clear a row that's wedged but technically
 *     still inside the watchdog threshold. The caller has eyes
 *     on the brand and can decide for themselves.
 *
 *   { brandId: "..." }
 *     Reap any stale running row for that brand. Staleness gate
 *     enforced — there's no surgical-by-brand path because the
 *     brand can have at most one running row (partial unique
 *     index), so brandId without staleness already implies "I
 *     don't care which run, kill whatever's there"; the gate
 *     prevents that from killing a healthy in-flight run.
 *
 *   { scope: "stale", minAgeMinutes: number }
 *     Bulk reap. `minAgeMinutes` is REQUIRED and is hard-floored
 *     by RUN_WATCHDOG_STALE_MINUTES — operator can be more
 *     conservative (default UI is 30) but never more aggressive.
 *     Confirm dialog mandatory in the UI.
 *
 * Audit-logged via the `runs.reap.manual` event with operator id,
 * scope, force flag, and the run ids reaped. Read by the
 * `/admin-backend/audit-logs` UI for forensics.
 */
import { requireAdmin } from '@/lib/admin-auth';
import { getStaleRunMinutes, reconcileStaleRuns } from '@/lib/run-reconciler';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/db';

interface ReapBody {
  runId?: string;
  brandId?: string;
  scope?: 'stale';
  minAgeMinutes?: number;
}

const ID_RE = /^[a-z0-9_-]{6,64}$/i;

export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  let body: ReapBody;
  try {
    body = (await request.json()) as ReapBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Exactly one mode must be specified. The shapes are intentionally
  // exclusive so the operator has to be deliberate — a request that
  // tries to set both runId and scope is rejected rather than
  // silently picking one.
  const modes = [body.runId, body.brandId, body.scope].filter(Boolean).length;
  if (modes !== 1) {
    return Response.json(
      { error: 'Specify exactly one of: runId, brandId, scope:"stale"' },
      { status: 400 },
    );
  }

  if (body.runId !== undefined && !ID_RE.test(body.runId)) {
    return Response.json({ error: 'Invalid runId' }, { status: 400 });
  }
  if (body.brandId !== undefined && !ID_RE.test(body.brandId)) {
    return Response.json({ error: 'Invalid brandId' }, { status: 400 });
  }

  // --- Surgical reap by runId (force=true) ---
  if (body.runId) {
    const reason = `reaped by admin ${admin.id} via /api/admin/runs/reap (force, runId)`;
    const result = await reconcileStaleRuns({
      runId: body.runId,
      reason,
      force: true,
    });
    logger.info('runs.reap.manual', {
      admin_id: admin.id,
      mode: 'runId',
      run_id: body.runId,
      forced: true,
      count: result.count,
      brand_ids: result.brandIds,
      run_ids: result.runIds,
    });
    auditLog(admin.id, 'runs.reap.manual', 'active_run', body.runId, {
      mode: 'runId',
      forced: true,
      count: result.count,
      brand_ids: result.brandIds,
    });
    return Response.json({
      ok: true,
      mode: 'runId',
      forced: true,
      count: result.count,
      runIds: result.runIds,
      brandIds: result.brandIds,
    });
  }

  // --- Reap by brandId (staleness gate enforced) ---
  if (body.brandId) {
    const reason = `reaped by admin ${admin.id} via /api/admin/runs/reap (brandId, stale)`;
    const result = await reconcileStaleRuns({
      brandId: body.brandId,
      reason,
    });
    logger.info('runs.reap.manual', {
      admin_id: admin.id,
      mode: 'brandId',
      brand_id: body.brandId,
      forced: false,
      count: result.count,
      run_ids: result.runIds,
    });
    auditLog(admin.id, 'runs.reap.manual', 'brand', body.brandId, {
      mode: 'brandId',
      forced: false,
      count: result.count,
      run_ids: result.runIds,
    });
    return Response.json({
      ok: true,
      mode: 'brandId',
      forced: false,
      count: result.count,
      runIds: result.runIds,
      brandIds: result.brandIds,
    });
  }

  // --- Bulk stale reap ---
  // scope === 'stale'. Require minAgeMinutes explicitly so the
  // operator can't trigger an env-default sweep with a single
  // misclick. Hard floor at the env-default watchdog threshold.
  if (body.scope !== 'stale') {
    return Response.json({ error: 'Unsupported scope' }, { status: 400 });
  }
  const envFloor = getStaleRunMinutes();
  if (typeof body.minAgeMinutes !== 'number' || !Number.isFinite(body.minAgeMinutes)) {
    return Response.json(
      { error: 'minAgeMinutes is required for scope=stale and must be a number' },
      { status: 400 },
    );
  }
  if (body.minAgeMinutes < envFloor) {
    return Response.json(
      {
        error: `minAgeMinutes must be >= RUN_WATCHDOG_STALE_MINUTES (${envFloor}). Bulk reap can only be MORE conservative than the env default, never less.`,
        envFloor,
      },
      { status: 400 },
    );
  }
  const reason = `reaped by admin ${admin.id} via /api/admin/runs/reap (scope=stale, minAge=${body.minAgeMinutes}m)`;
  const result = await reconcileStaleRuns({
    minAgeMinutes: body.minAgeMinutes,
    reason,
  });
  logger.info('runs.reap.manual', {
    admin_id: admin.id,
    mode: 'stale',
    min_age_minutes: body.minAgeMinutes,
    forced: false,
    count: result.count,
    brand_ids: result.brandIds,
    run_ids: result.runIds,
  });
  auditLog(admin.id, 'runs.reap.manual', 'fleet', `minAge=${body.minAgeMinutes}m`, {
    mode: 'stale',
    forced: false,
    count: result.count,
    minAgeMinutes: body.minAgeMinutes,
    brand_ids: result.brandIds,
    run_ids: result.runIds,
  });
  return Response.json({
    ok: true,
    mode: 'stale',
    forced: false,
    minAgeMinutes: body.minAgeMinutes,
    count: result.count,
    runIds: result.runIds,
    brandIds: result.brandIds,
  });
}
