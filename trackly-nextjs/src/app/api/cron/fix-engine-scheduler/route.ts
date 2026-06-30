/**
 * Cron: Fix Engine scheduled-scan + auto-pilot driver.
 *
 * GET /api/cron/fix-engine-scheduler  (Authorization: Bearer $CRON_SECRET)
 *
 * Finds brands whose scheduled scan is due, runs each scan to completion,
 * applies auto-pilot (generate + deterministic auto-ship), and reschedules
 * the next run. Idempotent via the cron lock; bounded per tick.
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { acquireCronLock } from '@/lib/cron-lock';
import { logger } from '@/lib/logger';
import { findDueScans, processScheduledScan } from '@/lib/fix-engine/automation';

const MAX_PER_TICK = 5;

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  const authHeader = request.headers.get('authorization') || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const ok = !!headerToken && headerToken.length === cronSecret.length
    && crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(cronSecret));
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lock = await acquireCronLock('fix_engine_scheduler', 10);
  if (!lock) return NextResponse.json({ skipped: true, reason: 'locked' });

  const startedAt = Date.now();
  let processed = 0, generated = 0, shipped = 0;
  try {
    const due = (await findDueScans(MAX_PER_TICK));
    for (const brandId of due) {
      const r = await processScheduledScan(brandId);
      if (r.scanned) processed++;
      generated += r.generated; shipped += r.shipped;
    }
    logger.info('cron.fix_engine_scheduler.done', { due: due.length, processed, generated, shipped, durationMs: Date.now() - startedAt });
    return NextResponse.json({ ok: true, processed, generated, shipped, durationMs: Date.now() - startedAt, timestamp: new Date().toISOString() });
  } catch (e) {
    logger.error('cron.fix_engine_scheduler.failed', { error: (e as Error).message });
    return NextResponse.json({ error: 'Scheduler tick failed', message: (e as Error).message }, { status: 500 });
  }
}
