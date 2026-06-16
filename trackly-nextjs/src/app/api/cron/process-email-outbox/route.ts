import { logger } from '@/lib/logger';
import { drainOutbox } from '@/lib/email-outbox-drain';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Email Outbox Cron Worker - HTTP entry point.
 *
 * Audit item D - durable email delivery. Originally PR #481's only
 * trigger; the GH Actions every-2-minute schedule curls this endpoint
 * to drain the outbox. Reality check: GH Actions throttles
 * sub-5-minute schedules and our every-2-minute schedule was firing
 * zero times in production, so the primary drain mechanism is now an
 * in-process scheduler started by instrumentation.ts (see
 * `lib/email-outbox-drain.ts`).
 *
 * This route is kept as a backup external-trigger path: useful for
 * manual `workflow_dispatch` runs from GitHub, on-call drain via
 * `curl -H "Authorization: Bearer $CRON_SECRET" …`, or future
 * scheduler migrations off GH Actions.
 *
 * Authorize with `Authorization: Bearer $CRON_SECRET`.
 */

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization') || '';
    const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const { searchParams } = new URL(request.url);
    const queryToken = searchParams.get('secret') || '';
    const candidate = headerToken || queryToken;

    const ok = !!candidate
      && candidate.length === cronSecret.length
      && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(cronSecret));
    if (!ok) {
      // Log the auth failure so an external caller (operator,
      // monitoring) can tell the difference between "endpoint not
      // reached at all" and "endpoint reached but rejected my token".
      // PR #481's silent-401 path was one of the suspected reasons no
      // worker logs ever appeared in production.
      logger.warn('email.outbox.http.unauthorized', {
        had_token: candidate.length > 0,
        token_length: candidate.length,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await drainOutbox();
    if (!result.ran) {
      return NextResponse.json({ skipped: true, reason: result.skipReason });
    }
    return NextResponse.json({
      claimed: result.claimed,
      sent: result.sent,
      retried: result.retried,
      dead: result.dead,
      reaped: result.reaped,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    logger.error('email.outbox.fatal', { error: (e as Error)?.message || String(e) });
    return NextResponse.json({ error: 'Outbox processing failed' }, { status: 500 });
  }
}
