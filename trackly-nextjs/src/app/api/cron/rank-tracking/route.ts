/**
 * Rank tracking scheduler tick.
 *
 * GET /api/cron/rank-tracking
 * Auth: `Authorization: Bearer $CRON_SECRET`.
 *
 * Hit every 10 minutes by .github/workflows/cron-rank-tracking.yml. Each
 * tick collects finished SERP tasks, starts due checks (a bounded number,
 * so checks spread across the day), runs the "mentioned by AI" alert rule
 * and sends scheduled reports on their day. See lib/rank-tracking/scheduler.ts.
 */
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { acquireCronLock } from '@/lib/cron-lock';
import { logger } from '@/lib/logger';
import { runRankTick } from '@/lib/rank-tracking/scheduler';
import { evaluateAiMentionRules } from '@/lib/rank-tracking/alerts';
import { sendDueReports } from '@/lib/rank-tracking/reports';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const ok = !!token && token.length === cronSecret.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(cronSecret));
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lock = await acquireCronLock('rank_tracking', 9);
  if (!lock) return NextResponse.json({ skipped: true, reason: 'locked' });
  const startedAt = Date.now();
  try {
    const tick = await runRankTick();
    const aiAlerts = await evaluateAiMentionRules(2);
    const reports = await sendDueReports();
    logger.info('cron.rank_tracking.done', { ...tick, aiAlerts, reports, durationMs: Date.now() - startedAt });
    return NextResponse.json({ ok: true, ...tick, aiAlerts, reports, durationMs: Date.now() - startedAt });
  } catch (e) {
    logger.error('cron.rank_tracking.failed', { error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await lock.release();
  }
}
