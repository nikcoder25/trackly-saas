/**
 * Dedicated stale-run reaper cron.
 *
 * GET /api/cron/reap-stale-runs
 * Auth: `Authorization: Bearer $CRON_SECRET` (same as /api/cron/*).
 *
 * Independent failure mode from the /api/cron scheduler. If the
 * daily scheduled tick is wedged (deploy mid-flight, network blip,
 * DB lock pile-up), this 5-minute cron still runs and reaps
 * anything past RUN_WATCHDOG_STALE_MINUTES so brand "Last Run"
 * clocks advance and the dashboard doesn't appear frozen.
 *
 * Takes its own `reap_stale_runs` cron lock with a 10-min stale
 * window so two ticks can't race on the same select-for-update.
 * The reconciler's SELECT FOR UPDATE SKIP LOCKED would also serialize
 * the work safely, but the cron lock keeps the no-op return path
 * cheap (one Redis SET / one Postgres UPSERT) instead of a full
 * column introspection + scan.
 *
 * Idempotent: returns `{ skipped: true, reason: 'locked' }` when
 * another tick holds the lock, otherwise `{ reconciled, brand_ids,
 * run_ids }` describing what was reaped.
 */
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { acquireCronLock } from '@/lib/cron-lock';
import { reconcileStaleRuns } from '@/lib/run-reconciler';
import { reapStaleGeoAudits } from '@/lib/geo-audits';
import { logger } from '@/lib/logger';

// Geo-audit reaper threshold (minutes). Mirrors the active_runs
// watchdog window so a stuck Regional Audit gets reaped on the same
// tick as a stuck brand-run.
const GEO_AUDIT_STALE_MINUTES = 10;

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const ok = !!headerToken
    && headerToken.length === cronSecret.length
    && crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(cronSecret));
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 10-min stale window matches the watchdog threshold default. If
  // the cron itself crashes, the next tick (5 min later) inherits
  // after the TTL plus the 10-min stale window — bounded.
  const lock = await acquireCronLock('reap_stale_runs', 10);
  if (!lock) {
    return NextResponse.json({ skipped: true, reason: 'locked' });
  }

  try {
    const start = Date.now();
    const result = await reconcileStaleRuns({
      reason: 'reaped by /api/cron/reap-stale-runs (5-min safety net)',
    });

    // Also reap any Regional Audits stuck in 'running' past the same
    // watchdog window. Refunds the unused portion of the credit
    // reservation so users aren't double-billed for calls that
    // didn't land. Best-effort: a failure here doesn't block the
    // brand-run reconcile that already succeeded above.
    let geoReaped: string[] = [];
    try {
      const geo = await reapStaleGeoAudits(GEO_AUDIT_STALE_MINUTES);
      geoReaped = geo.reaped;
    } catch (e) {
      logger.warn('cron.reap_stale_runs.geo_audit_reap_failed', {
        error: (e as Error).message,
      });
    }
    const durationMs = Date.now() - start;

    if (result.count > 0 || geoReaped.length > 0) {
      logger.info('cron.reap_stale_runs.reaped', {
        count: result.count,
        brand_ids: result.brandIds.slice(0, 20),
        run_ids: result.runIds.slice(0, 20),
        geo_audit_ids: geoReaped.slice(0, 20),
        duration_ms: durationMs,
      });
    }

    return NextResponse.json({
      ok: true,
      reconciled: result.count,
      brandIds: result.brandIds,
      runIds: result.runIds,
      geoAuditsReaped: geoReaped,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    logger.error('cron.reap_stale_runs.failed', {
      error: (e as Error).message,
    });
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  } finally {
    await lock.release();
  }
}
