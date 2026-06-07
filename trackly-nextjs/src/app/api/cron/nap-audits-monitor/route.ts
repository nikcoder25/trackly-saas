/**
 * Scheduled monitoring for saved NAP audits.
 *
 * GET /api/cron/nap-audits-monitor?frequency=weekly|monthly
 * Auth: `Authorization: Bearer $CRON_SECRET`.
 *
 * For every saved audit whose schedule matches `frequency` and that is due,
 * re-run it and email the owner when it regressed (score drop, new dead links,
 * or new citations with issues). Hit by GitHub Actions on the weekly/monthly
 * schedules alongside the reports cron.
 */
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { acquireCronLock } from '@/lib/cron-lock';
import { logger } from '@/lib/logger';
import { enqueueEmail } from '@/lib/email';
import { detectRegression } from '@/lib/nap-verify';
import {
  listDueScheduledAudits,
  getNapAudit,
  requeueNapAudit,
  processNapAudit,
  type NapAuditRecord,
} from '@/lib/nap-audits';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const MAX_PER_TICK = 50;
const APP_URL = process.env.APP_URL || 'https://livesov.com';

function alertHtml(audit: NapAuditRecord, reasons: string[]): string {
  const link = `${APP_URL}/dashboard/nap-audits/${audit.id}`;
  const items = reasons.map((r) => `<li>${r}</li>`).join('');
  return `
    <div style="font-family:system-ui,sans-serif;color:#1a1a2e">
      <h2 style="margin:0 0 8px">NAP citation alert: ${audit.label}</h2>
      <p style="color:#475569;margin:0 0 12px">Your scheduled NAP audit detected changes since the last run:</p>
      <ul style="color:#b91c1c">${items}</ul>
      <p style="margin:16px 0"><a href="${link}" style="background:#5B5BD6;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">View the audit</a></p>
      <p style="color:#94a3b8;font-size:12px">Current consistency score: ${audit.score ?? '—'}/100</p>
    </div>`;
}

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

  const frequency = new URL(request.url).searchParams.get('frequency') || 'weekly';
  if (frequency !== 'weekly' && frequency !== 'monthly') {
    return NextResponse.json({ error: "frequency must be 'weekly' or 'monthly'" }, { status: 400 });
  }

  const lock = await acquireCronLock(`nap_monitor:${frequency}`, 15);
  if (!lock) return NextResponse.json({ skipped: true, reason: 'locked' });

  const started = Date.now();
  let processed = 0;
  let alertsSent = 0;
  let failed = 0;

  try {
    const due = (await listDueScheduledAudits(frequency)).slice(0, MAX_PER_TICK);
    for (const item of due) {
      try {
        const prev = await getNapAudit(item.userId, item.id);
        if (!prev) continue;
        if (!(await requeueNapAudit(item.userId, item.id))) continue;
        const next = await processNapAudit(item.id);
        processed++;
        if (!next || prev.score == null || next.score == null || !prev.summary || !next.summary) continue;

        const reg = detectRegression(
          { score: prev.score, deadLinks: prev.summary.deadLinks, withIssues: prev.summary.withIssues },
          { score: next.score, deadLinks: next.summary.deadLinks, withIssues: next.summary.withIssues },
        );
        if (reg.regressed && item.email) {
          const day = new Date().toISOString().slice(0, 10);
          await enqueueEmail({
            to: item.email,
            subject: `NAP citation alert: ${next.label}`,
            html: alertHtml(next, reg.reasons),
            text: `${next.label} regressed:\n- ${reg.reasons.join('\n- ')}\n${APP_URL}/dashboard/nap-audits/${next.id}`,
            templateKey: 'nap_audit_alert',
            idempotencyKey: `nap-alert:${next.id}:${day}`,
          });
          alertsSent++;
        }
      } catch (e) {
        failed++;
        logger.error('cron.nap_monitor.item_failed', { id: item.id, err: (e as Error).message });
      }
    }
    logger.info('cron.nap_monitor.done', { frequency, due: due.length, processed, alertsSent, failed, ms: Date.now() - started });
    return NextResponse.json({ ok: true, frequency, processed, alertsSent, failed, ms: Date.now() - started });
  } catch (e) {
    logger.error('cron.nap_monitor.failed', { error: (e as Error).message });
    return NextResponse.json({ error: 'Monitor tick failed', message: (e as Error).message }, { status: 500 });
  }
}
