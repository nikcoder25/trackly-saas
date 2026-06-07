/**
 * Cron safety-net dispatcher for saved NAP audits.
 *
 * GET /api/cron/nap-audits-worker
 * Auth: `Authorization: Bearer $CRON_SECRET`.
 *
 * Happy path: processNapAudit runs inside the after() callback fired from
 * POST /api/nap-audits (and the rerun POST). This cron is the safety net for
 * 'queued' rows that didn't get after()'d (deploy mid-flight, OOM, crash).
 * claimNapAuditForRunning is atomic, so already-running/terminal rows are
 * skipped. Hit every ~15 min by GitHub Actions.
 */
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { acquireCronLock } from '@/lib/cron-lock';
import { logger } from '@/lib/logger';
import { findStuckQueuedNapAudits, processNapAudit } from '@/lib/nap-audits';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const MAX_PER_TICK = 8;
const STUCK_AFTER_SECONDS = 60;

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const ok =
    !!token &&
    token.length === cronSecret.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(cronSecret));
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lock = await acquireCronLock('nap_audits_worker', 5);
  if (!lock) return NextResponse.json({ skipped: true, reason: 'locked' });

  const startedAt = Date.now();
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];
  try {
    const stuck = await findStuckQueuedNapAudits(STUCK_AFTER_SECONDS);
    const slice = stuck.slice(0, MAX_PER_TICK);
    for (const id of slice) {
      try {
        await processNapAudit(id);
        succeeded++;
      } catch (e) {
        failed++;
        errors.push(`${id}: ${(e as Error).message}`);
      }
    }
    logger.info('cron.nap_audits_worker.done', { stuckFound: stuck.length, claimed: slice.length, succeeded, failed, durationMs: Date.now() - startedAt });
    return NextResponse.json({ ok: true, stuckFound: stuck.length, claimed: slice.length, succeeded, failed, errors: errors.slice(0, 5), durationMs: Date.now() - startedAt });
  } catch (e) {
    logger.error('cron.nap_audits_worker.failed', { error: (e as Error).message });
    return NextResponse.json({ error: 'Worker tick failed', message: (e as Error).message }, { status: 500 });
  }
}
