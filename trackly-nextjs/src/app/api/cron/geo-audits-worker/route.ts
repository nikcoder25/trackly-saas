/**
 * Cron safety-net dispatcher for Regional Audits.
 *
 * GET /api/cron/geo-audits-worker
 * Auth: `Authorization: Bearer $CRON_SECRET` (same as /api/cron/*).
 *
 * 99% of audits are processed by `processGeoAudit` running inside the
 * Next.js after() callback fired from POST /api/geo-audits. This cron
 * is the 1% safety net: it picks up any 'queued' rows that didn't get
 * after()'d (deploy mid-flight, OOM, runtime crash) and processes them
 * here. Rows already 'running' or terminal are skipped — claimAuditForRunning
 * is atomic and short-circuits the redundant work.
 *
 * Runs every minute on GitHub Actions; GH Actions has a documented
 * soft-minimum of ~5 min for cron schedules and frequently doesn't
 * fire * * * * * exactly on time. That's fine — this is a safety net,
 * not the happy path.
 *
 * Idempotent: returns `{ skipped: true, reason: 'locked' }` when
 * another tick holds the cron lock.
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { acquireCronLock } from '@/lib/cron-lock';
import { logger } from '@/lib/logger';
import { findStuckQueuedAudits, processGeoAudit } from '@/lib/geo-audits';

// Tick budget: cap how many we process in a single invocation so a
// burst of stuck rows doesn't tie up the cron handler. Anything not
// processed this tick gets picked up on the next one.
const MAX_PER_TICK = 8;

// Stuck threshold: if a row has been 'queued' longer than this, we
// assume after() didn't fire and pick it up here. 60s is a safe lower
// bound — happy-path audits are claimed by after() within ms of POST.
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
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 5-min stale lock — outlives the worst expected per-audit runtime
  // (a 5-region × 20-prompt audit at 5 platforms = 500 calls; at the
  // per-audit cap of 5 in flight, that's ~100 sequential rounds; even
  // at 2s per call that's still under 4 min). If a tick crashes mid-
  // flight, the next tick inherits after the lock TTL.
  const lock = await acquireCronLock('geo_audits_worker', 5);
  if (!lock) {
    return NextResponse.json({ skipped: true, reason: 'locked' });
  }

  const startedAt = Date.now();
  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    const stuck = await findStuckQueuedAudits(STUCK_AFTER_SECONDS);
    const slice = stuck.slice(0, MAX_PER_TICK);
    claimed = slice.length;

    // Process sequentially — multiple stuck audits are rare, and the
    // per-audit semaphore inside processGeoAudit already saturates the
    // 5 platform slots. Running them in parallel here would only add
    // contention without throughput.
    for (const auditId of slice) {
      try {
        await processGeoAudit(auditId);
        succeeded++;
      } catch (e) {
        failed++;
        errors.push(`${auditId}: ${(e as Error).message}`);
      }
    }

    logger.info('cron.geo_audits_worker.done', {
      stuckFound: stuck.length,
      claimed,
      succeeded,
      failed,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ok: true,
      stuckFound: stuck.length,
      claimed,
      succeeded,
      failed,
      errors: errors.slice(0, 5),
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    logger.error('cron.geo_audits_worker.failed', {
      error: (e as Error).message,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { error: 'Worker tick failed', message: (e as Error).message },
      { status: 500 },
    );
  }
}
