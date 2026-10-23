/**
 * Trial nurture email cron.
 *
 * GET /api/cron/trial-nurture
 * Auth: `Authorization: Bearer $CRON_SECRET` (same as /api/cron/*).
 *
 * Hourly tick from .github/workflows/cron-trial-nurture.yml. First moves
 * every expired trial to 'free' (see lib/trial-expiry.ts), then enqueues
 * the next due email in each trial user's sequence (see
 * lib/trial-nurture.ts); the email outbox worker does the actual delivery.
 */
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { runTrialNurture } from '@/lib/trial-nurture';
import { expireStaleTrials } from '@/lib/trial-expiry';
import { logger } from '@/lib/logger';

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

  // The expiry sweep is an idempotent UPDATE, so it runs on every tick even
  // when another tick holds the nurture lock. A failure here must not block
  // the email sequence (getEffectivePlan still gates access at read time).
  let trialsExpired = 0;
  try {
    trialsExpired = (await expireStaleTrials()).expired;
  } catch (e) {
    logger.error('trial_expiry.failed', { error: (e as Error)?.message || String(e) });
  }

  try {
    const result = await runTrialNurture();
    if (!result.ran) {
      return NextResponse.json({ skipped: true, reason: 'locked', trialsExpired });
    }
    return NextResponse.json({ ...result, trialsExpired, timestamp: new Date().toISOString() });
  } catch (e) {
    logger.error('trial_nurture.fatal', { error: (e as Error)?.message || String(e) });
    return NextResponse.json({ error: 'Trial nurture failed' }, { status: 500 });
  }
}
