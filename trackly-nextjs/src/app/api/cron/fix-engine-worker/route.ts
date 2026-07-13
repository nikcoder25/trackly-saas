/**
 * Cron safety-net dispatcher for Fix Engine scans.
 *
 * GET /api/cron/fix-engine-worker
 * Auth: `Authorization: Bearer $CRON_SECRET` (same as /api/cron/*).
 *
 * The happy path runs runScan() inside the Next.js after() callback fired
 * from POST /api/brands/[id]/fixes. This cron picks up any scan batches
 * stuck in 'queued' (deploy mid-flight, OOM, crash) and processes them.
 * Idempotent via claimBatchForRunning + the cron lock.
 *
 * Mirrors /api/cron/geo-audits-worker.
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { acquireCronLock } from '@/lib/cron-lock';
import { logger } from '@/lib/logger';
import { findStuckQueuedBatches } from '@/lib/fix-engine/schema';
import { runScan } from '@/lib/fix-engine/engine';
import { runConnectorWatchdog } from '@/lib/fix-engine/connector-watchdog';
import { runOutcomePass, runRegressionWatch, runShipVerifyPass } from '@/lib/fix-engine/outcomes';

const MAX_PER_TICK = 5;
const STUCK_AFTER_SECONDS = 60;

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
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lock = await acquireCronLock('fix_engine_worker', 5);
  if (!lock) return NextResponse.json({ skipped: true, reason: 'locked' });

  const startedAt = Date.now();
  let claimed = 0, succeeded = 0, failed = 0;
  const errors: string[] = [];
  try {
    const stuck = await findStuckQueuedBatches(STUCK_AFTER_SECONDS);
    const slice = stuck.slice(0, MAX_PER_TICK);
    claimed = slice.length;
    for (const batchId of slice) {
      try { await runScan(batchId); succeeded++; }
      catch (e) { failed++; errors.push(`${batchId}: ${(e as Error).message}`); }
    }
    // Flag Channel-B fixes the Connector never applied (offline/broken).
    let watchdog = { stuck: 0, flagged: 0 };
    try { watchdog = await runConnectorWatchdog(); }
    catch (e) { logger.warn('cron.fix_engine_worker.watchdog_failed', { err: (e as Error).message }); }

    // Retry verification for recently shipped fixes a CDN cache may still
    // be hiding, so they flip to 'verified' without a manual Re-check.
    let shipVerify = { checked: 0, verified: 0 };
    try { shipVerify = await runShipVerifyPass(); }
    catch (e) { logger.warn('cron.fix_engine_worker.ship_verify_failed', { err: (e as Error).message }); }

    // Measure 28-day outcomes for shipped fixes with a GSC baseline.
    let outcomes = { measured: 0, improved: 0, declined: 0 };
    try { outcomes = await runOutcomePass(); }
    catch (e) { logger.warn('cron.fix_engine_worker.outcomes_failed', { err: (e as Error).message }); }

    // Regression watch: re-confirm old verified fixes are still live.
    let regressions = { checked: 0, regressed: 0 };
    try { regressions = await runRegressionWatch(); }
    catch (e) { logger.warn('cron.fix_engine_worker.regression_failed', { err: (e as Error).message }); }

    logger.info('cron.fix_engine_worker.done', { stuckFound: stuck.length, claimed, succeeded, failed, watchdog, shipVerify, outcomes, regressions, durationMs: Date.now() - startedAt });
    return NextResponse.json({
      ok: true, stuckFound: stuck.length, claimed, succeeded, failed, watchdog, shipVerify, outcomes, regressions,
      errors: errors.slice(0, 5), durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    logger.error('cron.fix_engine_worker.failed', { error: (e as Error).message, durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: 'Worker tick failed', message: (e as Error).message }, { status: 500 });
  }
}
