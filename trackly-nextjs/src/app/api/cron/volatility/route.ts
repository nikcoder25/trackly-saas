/**
 * Daily AI Volatility Index computation.
 *
 * GET /api/cron/volatility
 * Auth: `Authorization: Bearer $CRON_SECRET` (same as /api/cron/*).
 *
 * Scores how much each engine's answers moved day over day, reading the
 * cross-tenant `prompt_runs` corpus rather than a paid panel of its own.
 * See src/lib/volatility.ts for why it is built that way and what the
 * score actually measures.
 *
 * Runs after midnight UTC for the day that just closed. `?day=YYYY-MM-DD`
 * recomputes a specific day (idempotent - the upsert overwrites), and
 * `?backfill=N` walks the N days before that, which is how the index is
 * seeded on first deploy.
 */
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { acquireCronLock } from '@/lib/cron-lock';
import { computeVolatilityForDay } from '@/lib/volatility';
import { logger } from '@/lib/logger';

const MAX_BACKFILL = 120;
const DEADLINE_MS = 4 * 60 * 1000;

function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function shiftDay(day: string, byDays: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + byDays);
  return d.toISOString().slice(0, 10);
}

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

  const sp = new URL(request.url).searchParams;
  const dayParam = sp.get('day');
  if (dayParam && !/^\d{4}-\d{2}-\d{2}$/.test(dayParam)) {
    return NextResponse.json({ error: 'day must be YYYY-MM-DD' }, { status: 400 });
  }
  const startDay = dayParam || yesterdayUtc();
  const backfill = Math.min(MAX_BACKFILL, Math.max(0, Number(sp.get('backfill')) || 0));

  const lock = await acquireCronLock('volatility', 30);
  if (!lock) return NextResponse.json({ skipped: true, reason: 'locked' });

  const started = Date.now();
  try {
    const days: string[] = [startDay];
    for (let i = 1; i <= backfill; i++) days.push(shiftDay(startDay, -i));

    const results: Array<{ day: string; platforms: number; scored: number }> = [];
    let deadlineHit = false;
    for (const day of days) {
      if (Date.now() - started > DEADLINE_MS) { deadlineHit = true; break; }
      const points = await computeVolatilityForDay(day);
      results.push({
        day,
        platforms: points.length,
        scored: points.filter(p => p.score !== null).length,
      });
    }

    if (deadlineHit) {
      logger.warn('volatility.deadline_hit', {
        requested: days.length,
        completed: results.length,
      });
    }

    return NextResponse.json({
      ok: true,
      // Reported explicitly so a truncated backfill can't be mistaken for
      // a complete one - the caller re-runs with an earlier ?day= to
      // finish the range.
      daysRequested: days.length,
      daysComputed: results.length,
      deadlineHit,
      results,
    });
  } catch (e) {
    logger.error('volatility.cron_failed', { errorMessage: (e as Error).message });
    return NextResponse.json({ error: 'Volatility computation failed' }, { status: 500 });
  } finally {
    await lock.release();
  }
}
