/**
 * Email service.
 *
 * Architecture (audit item D — durable email delivery):
 *
 *   - Public senders (sendPlanUpgradeEmail, sendVerificationEmail, etc.)
 *     no longer call the Resend HTTP API directly. They build the
 *     subject/html and hand the message to enqueueEmail(), which
 *     INSERTs a row into the email_outbox Postgres table and returns
 *     immediately with { sent: true }. The "sent" semantics shifts from
 *     "delivered to Resend" to "accepted for delivery"; the outbox is
 *     the new source of truth.
 *
 *   - The /api/cron/process-email-outbox cron worker picks up pending
 *     and failed rows on an every-2-minute schedule, calls
 *     deliverEmailViaProvider() (which is the actual Resend/SendGrid
 *     POST), and updates the row to sent / failed / dead based on the
 *     outcome category. Retries with exponential backoff and a stuck-
 *     sending reaper handle Resend outages, network blips, server
 *     restarts mid-call, and rate limits.
 *
 * Two paths are intentionally NOT in the outbox:
 *
 *   - sendContactFormEmail uses Zoho SMTP via nodemailer (or falls back
 *     to Resend) and is awaited by an interactive caller that already
 *     surfaces failures to the user. Lower-priority for durability;
 *     scoped out of this PR.
 *
 *   - addContactToAudience hits the Resend Audiences API, not the
 *     /emails endpoint — different shape and not technically an email
 *     send.
 */

import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { escapeHtml } from './sanitize';
import { getPlanCredits } from './plan-config';
import { pool } from './db';

const EMAIL_API_KEY = process.env.EMAIL_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Livesov <noreply@livesov.com>';
const EMAIL_API_URL = process.env.EMAIL_API_URL || 'https://api.resend.com/emails';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

export interface EmailResult {
  sent: boolean;
  reason?: string;
}

/**
 * Outcome of a single Resend/SendGrid POST. Used by the outbox worker
 * to decide whether a failed delivery should be retried, marked dead,
 * or counted as success.
 *
 *   - 'sent'      : 2xx response.
 *   - 'retryable' : 429 / 5xx / network throw — try again on the next
 *                   cron tick after the configured backoff.
 *   - 'permanent' : any other 4xx (invalid recipient, malformed
 *                   payload, bad API key, etc.) — never retried, row
 *                   marked dead immediately.
 */
export type DeliveryOutcome =
  | { kind: 'sent' }
  | { kind: 'retryable'; status: number; reason: string }
  | { kind: 'permanent'; status: number; reason: string };

export interface EnqueueEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  templateKey: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

/**
 * Insert an email into the durable outbox. Returns synchronously after
 * the INSERT commits. The cron worker will pick it up and dispatch to
 * the email provider asynchronously.
 *
 * The DEV-mode (EMAIL_API_KEY unset) path bypasses the outbox entirely
 * and logs a placeholder so local development doesn't accumulate stale
 * pending rows that will never be sent.
 *
 * Idempotency: if `idempotencyKey` is provided and a row with the same
 * key already exists, the INSERT is a no-op (ON CONFLICT DO NOTHING).
 * This prevents duplicate sends when two code paths observe the same
 * underlying event — e.g. the webhook and the reconcile cron both
 * detecting a plan_cancellation in the same tick.
 */
export async function enqueueEmail(input: EnqueueEmailInput): Promise<EmailResult> {
  if (!EMAIL_API_KEY) {
    console.log(
      `[Email] DEV MODE - would enqueue ${input.templateKey} to ${input.to} `
      + `subject="${input.subject}" (outbox bypassed; HTML omitted)`,
    );
    return { sent: true };
  }
  try {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO email_outbox
         (id, to_email, subject, body_html, body_text, reply_to,
          template_key, payload_json, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        id, input.to, input.subject, input.html, input.text ?? null, input.replyTo ?? null,
        input.templateKey, JSON.stringify(input.payload ?? {}), input.idempotencyKey ?? null,
      ],
    );
    // Stable structured-log key — see audit item D's observability spec.
    // Don't log the HTML body or recipient PII at info level: this fires
    // on every email enqueue and would flood prod logs with sensitive data.
    console.log(
      `[email.outbox.enqueued] template=${input.templateKey} `
      + `idempotency_key=${input.idempotencyKey ?? '<none>'}`,
    );
    return { sent: true };
  } catch (e) {
    const reason = (e as Error).message;
    console.error(`[email.outbox.enqueue_failed] template=${input.templateKey} reason=${reason}`);
    return { sent: false, reason };
  }
}

/**
 * Issue the actual Resend/SendGrid POST. Used by the outbox cron
 * worker; not exported to feature code, which goes through enqueueEmail
 * instead.
 *
 * Categorisation rules:
 *   - 2xx                       -> { kind: 'sent' }
 *   - 429 / 5xx / network throw -> { kind: 'retryable', ... }
 *   - any other 4xx             -> { kind: 'permanent', ... }
 */
export async function deliverEmailViaProvider(
  to: string,
  subject: string,
  html: string,
  replyTo?: string | null,
): Promise<DeliveryOutcome> {
  if (!EMAIL_API_KEY) {
    // Outbox shouldn't have rows in DEV-mode (enqueueEmail short-circuits
    // before INSERT), but if a leftover pending row is processed in DEV
    // we treat it as sent so the worker doesn't retry forever.
    console.log(`[Email] DEV MODE - would deliver to ${to} subject="${subject}" (HTML omitted)`);
    return { kind: 'sent' };
  }

  try {
    const isResend = EMAIL_API_URL.includes('resend.com');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${EMAIL_API_KEY}`,
    };

    const resendPayload: Record<string, unknown> = { from: EMAIL_FROM, to: [to], subject, html };
    if (replyTo && isResend) {
      resendPayload.reply_to = replyTo;
    }

    const body = isResend
      ? JSON.stringify(resendPayload)
      : JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: EMAIL_FROM.match(/<(.+)>/)?.[1] || EMAIL_FROM },
          subject,
          content: [{ type: 'text/html', value: html }],
        });

    const resp = await fetch(EMAIL_API_URL, { method: 'POST', headers, body });
    if (resp.ok) return { kind: 'sent' };

    const text = await resp.text().catch(() => '');
    const reason = `Email API returned ${resp.status}: ${text.slice(0, 200)}`;
    // 429 (rate limit) and 5xx are retryable. All other 4xx (auth,
    // invalid recipient, malformed payload, bounced address) are
    // permanent — retrying won't help and would burn provider quota.
    if (resp.status === 429 || resp.status >= 500) {
      return { kind: 'retryable', status: resp.status, reason };
    }
    return { kind: 'permanent', status: resp.status, reason };
  } catch (e) {
    // Network errors, DNS failures, fetch timeout — all retryable.
    return { kind: 'retryable', status: 0, reason: (e as Error).message };
  }
}

/**
 * Legacy in-process sender used only by the contact-form path (kept
 * out of the outbox per scope). Wraps deliverEmailViaProvider and
 * collapses the outcome back into the original EmailResult shape so
 * the contact form's awaited callers continue to work unchanged.
 */
async function sendEmail(to: string, subject: string, html: string, replyTo?: string): Promise<EmailResult> {
  const outcome = await deliverEmailViaProvider(to, subject, html, replyTo);
  if (outcome.kind === 'sent') return { sent: true };
  console.error(`[Email] Direct send failed to=${to} subject="${subject}" reason=${outcome.reason}`);
  return { sent: false, reason: outcome.reason };
}

export async function sendVerificationEmail(email: string, token: string): Promise<EmailResult> {
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#4f46e5;">Verify your email</h2>
      <p>Click the button below to verify your email address:</p>
      <a href="${verifyUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">Verify Email</a>
      <p style="color:#999;font-size:12px;">If you didn't create an account, you can ignore this email.</p>
    </div>
  `;
  // No idempotency key: each verification request is a fresh logical
  // event (new token, new email row). The verify-token unique index
  // already guarantees you can't reuse a token across two emails.
  return enqueueEmail({
    to: email,
    subject: 'Verify your email - Livesov',
    html,
    templateKey: 'verification',
    idempotencyKey: `verification:${crypto.randomUUID()}`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<EmailResult> {
  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#4f46e5;">Reset your password</h2>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">Reset Password</a>
      <p style="color:#999;font-size:12px;">If you didn't request a password reset, you can ignore this email.</p>
    </div>
  `;
  return enqueueEmail({
    to: email,
    subject: 'Reset your password - Livesov',
    html,
    templateKey: 'password_reset',
    idempotencyKey: `password_reset:${crypto.randomUUID()}`,
  });
}

export async function sendContactFormEmail({
  name,
  email,
  subject,
  inquiryType,
  message,
}: {
  name: string;
  email: string;
  subject: string;
  inquiryType: string;
  message: string;
}): Promise<EmailResult> {
  // Every field is attacker-controlled: without escaping, a submission
  // with "<img src=x onerror=...>" would execute in the support mailbox.
  const nameE = escapeHtml(name);
  const emailE = escapeHtml(email);
  const subjectE = escapeHtml(subject);
  const inquiryE = escapeHtml(inquiryType);
  const messageE = escapeHtml(message);
  // mailto: href needs URL-percent-encoding, not HTML-escaping.
  const mailtoHref = `mailto:${encodeURIComponent(email)}`;
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h2 style="color:#4f46e5;margin-bottom:16px;">New Contact Form Submission</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;width:140px;">Name</td>
          <td style="padding:8px 12px;color:#111827;border-bottom:1px solid #e5e7eb;">${nameE}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">Email</td>
          <td style="padding:8px 12px;color:#111827;border-bottom:1px solid #e5e7eb;"><a href="${mailtoHref}" style="color:#4f46e5;">${emailE}</a></td>
        </tr>
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">Inquiry Type</td>
          <td style="padding:8px 12px;color:#111827;border-bottom:1px solid #e5e7eb;">${inquiryE}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">Subject</td>
          <td style="padding:8px 12px;color:#111827;border-bottom:1px solid #e5e7eb;">${subjectE}</td>
        </tr>
      </table>
      <div style="margin-top:16px;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
        <p style="font-weight:600;color:#374151;margin:0 0 8px 0;">Message</p>
        <p style="color:#111827;margin:0;white-space:pre-wrap;">${messageE}</p>
      </div>
      <p style="color:#999;font-size:12px;margin-top:16px;">This message was sent via the Livesov contact form. Reply directly to respond to the customer.</p>
    </div>
  `;
  // Subject line goes into mail headers; strip CR/LF to prevent header
  // injection and keep it a single line.
  const safeSubject = `[Contact Form] ${subject} - ${inquiryType}`.replace(/[\r\n]+/g, ' ').slice(0, 200);
  const zohoPassword = process.env.ZOHO_SMTP_PASSWORD;
  if (zohoPassword) {
    return sendContactFormViaZoho(safeSubject, html, email);
  }

  return sendEmail('hello@livesov.com', safeSubject, html, email);
}

export async function addContactToAudience(email: string): Promise<EmailResult> {
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!audienceId) {
    console.warn('[Email] RESEND_AUDIENCE_ID not set - skipping audience contact creation');
    return { sent: false, reason: 'RESEND_AUDIENCE_ID not configured' };
  }
  if (!EMAIL_API_KEY) {
    console.log(`[Email] DEV MODE - Would add ${email} to audience ${audienceId}`);
    return { sent: true };
  }

  try {
    const resp = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EMAIL_API_KEY}`,
      },
      body: JSON.stringify({ email, unsubscribed: false }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      const reason = `Resend Audience API returned ${resp.status}: ${text}`;
      console.error(`[Email] Failed to add contact=${email} to audience: ${reason}`);
      return { sent: false, reason };
    }

    return { sent: true };
  } catch (e) {
    const reason = (e as Error).message;
    console.error(`[Email] Audience contact error email=${email} error=${reason}`);
    return { sent: false, reason };
  }
}

export async function sendWelcomeEmail(email: string): Promise<EmailResult> {
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#4f46e5;">Welcome to Livesov! 🎉</h2>
      <p style="color:#374151;line-height:1.6;">
        Thanks for subscribing! You'll receive AI visibility tips and insights to help you
        grow your online presence.
      </p>
      <p style="color:#374151;line-height:1.6;">
        We keep things short and useful - no spam, just actionable tips.
      </p>
      <p style="color:#374151;line-height:1.6;">
        If you have any questions, just reply to this email!
      </p>
      <p style="color:#374151;line-height:1.6;">
        - The Livesov Team
      </p>
      <p style="color:#999;font-size:12px;margin-top:24px;">
        You're receiving this because you subscribed to the Livesov newsletter.
      </p>
    </div>
  `;
  return enqueueEmail({
    to: email,
    subject: 'Welcome to Livesov!',
    html,
    replyTo: 'hello@livesov.com',
    templateKey: 'welcome',
    idempotencyKey: `welcome:${crypto.randomUUID()}`,
  });
}

// Scheduled AI-visibility report email - a periodic digest sent by the
// /api/cron/reports endpoint. Keeps the same shape as the Express
// implementation so existing tests and templates map 1:1.
export interface ScheduledReportSummary {
  totalRuns: number;
  totalMentions: number;
  averageSov: number;
  sovTrend: number;
  lastRunSov: number;
  platformStats: Record<string, { total: number; mentioned: number }>;
  period: { from: string | null; to: string | null };
}

export async function sendReportEmail(
  to: string,
  brandName: string,
  report: ScheduledReportSummary,
): Promise<EmailResult> {
  const dashboardUrl = APP_URL;
  const sovTrendIcon = report.sovTrend > 0 ? '&#9650;' : report.sovTrend < 0 ? '&#9660;' : '&#9654;';
  const sovTrendColor = report.sovTrend > 0 ? '#16a34a' : report.sovTrend < 0 ? '#dc2626' : '#64748b';

  let platformRows = '';
  for (const [platform, stats] of Object.entries(report.platformStats || {})) {
    const rate = stats.total ? Math.round((stats.mentioned / stats.total) * 100) : 0;
    platformRows += `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(platform)}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${stats.mentioned}/${stats.total}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${rate}%</td></tr>`;
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>AI Visibility Report: ${escapeHtml(brandName)}</h2>
      <p style="color:#64748b;">Period: ${escapeHtml(report.period?.from || 'N/A')} to ${escapeHtml(report.period?.to || 'N/A')}</p>

      <div style="display:flex;gap:16px;margin:20px 0;">
        <div style="flex:1;background:#f8fafc;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;">${report.lastRunSov}%</div>
          <div style="color:#64748b;font-size:13px;">Current SOV</div>
          <div style="color:${sovTrendColor};font-size:14px;">${sovTrendIcon} ${report.sovTrend > 0 ? '+' : ''}${report.sovTrend.toFixed(1)}%</div>
        </div>
        <div style="flex:1;background:#f8fafc;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;">${report.totalRuns}</div>
          <div style="color:#64748b;font-size:13px;">Total Runs</div>
        </div>
        <div style="flex:1;background:#f8fafc;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;">${report.totalMentions}</div>
          <div style="color:#64748b;font-size:13px;">Total Mentions</div>
        </div>
      </div>

      ${platformRows ? `
      <h3 style="margin-top:24px;">Platform Breakdown (Last Run)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#f1f5f9;">
          <th style="padding:8px 12px;text-align:left;">Platform</th>
          <th style="padding:8px 12px;text-align:center;">Mentions</th>
          <th style="padding:8px 12px;text-align:center;">Rate</th>
        </tr></thead>
        <tbody>${platformRows}</tbody>
      </table>
      ` : ''}

      <p style="margin-top:24px;">
        <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;">View Dashboard</a>
      </p>
      <p style="color:#9ca3af;font-size:12px;margin-top:16px;">You're receiving this because you enabled scheduled reports. Manage settings in your Livesov dashboard.</p>
    </div>
  `;
  return enqueueEmail({
    to,
    subject: `AI Visibility Report: ${escapeHtml(brandName)} - Livesov`,
    html,
    templateKey: 'scheduled_report',
    payload: { brandName, period: report.period },
    idempotencyKey: `scheduled_report:${crypto.randomUUID()}`,
  });
}

// ── Livesov v2 credit-system emails ──────────────────────────────

const BILLING_URL = `${APP_URL}/dashboard/billing`;

function fmtResetDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

/**
 * Low-credit warning fired when a user crosses below 20% remaining.
 * De-duped via `usage_counters.last_low_balance_notify_at` so it
 * only sends once per UTC month.
 */
export async function sendLowCreditsEmail(
  email: string,
  ctx: { remaining: number; monthlyCap: number; nextResetAt: string },
): Promise<EmailResult> {
  const pct = Math.round((ctx.remaining / Math.max(1, ctx.monthlyCap)) * 100);
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#f59e0b;margin:0 0 12px 0;">Heads up: AI credits running low</h2>
      <p style="color:#374151;line-height:1.6;">
        You have <strong>${ctx.remaining.toLocaleString()}</strong> of
        ${ctx.monthlyCap.toLocaleString()} credits remaining
        (${pct}%) for this billing period.
      </p>
      <p style="color:#374151;line-height:1.6;">
        Credits reset on <strong>${escapeHtml(fmtResetDate(ctx.nextResetAt))}</strong>.
        Upgrade now to keep your scheduled scans running through the rest of the month.
      </p>
      <a href="${BILLING_URL}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;font-weight:600;">View Billing</a>
      <p style="color:#9ca3af;font-size:12px;margin-top:16px;">
        You're receiving this because your Livesov account dropped
        below 20% of its monthly credit allowance. We send this
        once per month — no further reminders this period.
      </p>
    </div>
  `;
  return enqueueEmail({
    to: email,
    subject: 'Your Livesov AI credits are running low',
    html,
    templateKey: 'low_credits',
    payload: { remaining: ctx.remaining, monthlyCap: ctx.monthlyCap },
    idempotencyKey: `low_credits:${crypto.randomUUID()}`,
  });
}

/**
 * "We skipped your scheduled scan because you're out of credits"
 * email. Fires the first time a cron tick rejects an auto-run for
 * monthly_exhausted. De-duped via the same row as the low-balance
 * email so the user gets at most one of each per month.
 */
export async function sendAutoSkipEmail(
  email: string,
  ctx: { brandName: string; monthlyCap: number; nextResetAt: string },
): Promise<EmailResult> {
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#dc2626;margin:0 0 12px 0;">Scheduled scan skipped — out of credits</h2>
      <p style="color:#374151;line-height:1.6;">
        We tried to run a scheduled scan for
        <strong>${escapeHtml(ctx.brandName)}</strong> but your account
        has used all ${ctx.monthlyCap.toLocaleString()} credits for this
        billing period.
      </p>
      <p style="color:#374151;line-height:1.6;">
        Your credits will reset automatically on
        <strong>${escapeHtml(fmtResetDate(ctx.nextResetAt))}</strong>.
        Until then, your scheduled scans are paused.
      </p>
      <a href="${BILLING_URL}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;font-weight:600;">Upgrade Plan</a>
      <p style="color:#9ca3af;font-size:12px;margin-top:16px;">
        We won't send this notification again this billing period.
      </p>
    </div>
  `;
  return enqueueEmail({
    to: email,
    subject: `Scheduled scan skipped — ${ctx.brandName}`,
    html,
    templateKey: 'auto_skip',
    payload: { brandName: ctx.brandName },
    idempotencyKey: `auto_skip:${crypto.randomUUID()}`,
  });
}

/**
 * Confirmation that the monthly credit allowance has been topped up.
 * Sent on the user's first request of the new month after the
 * counter rolls over.
 */
export async function sendMonthlyResetEmail(
  email: string,
  ctx: { plan: string; monthlyCap: number; nextResetAt: string },
): Promise<EmailResult> {
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#10b981;margin:0 0 12px 0;">Your credits are back</h2>
      <p style="color:#374151;line-height:1.6;">
        Your <strong>${escapeHtml(ctx.plan)}</strong> plan has been topped up to
        <strong>${ctx.monthlyCap.toLocaleString()}</strong> AI credits for the
        new billing period.
      </p>
      <p style="color:#374151;line-height:1.6;">
        The next reset is on <strong>${escapeHtml(fmtResetDate(ctx.nextResetAt))}</strong>.
      </p>
      <a href="${APP_URL}/dashboard" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;font-weight:600;">Open Dashboard</a>
    </div>
  `;
  return enqueueEmail({
    to: email,
    subject: 'Your Livesov credits have refreshed',
    html,
    templateKey: 'monthly_reset',
    payload: { plan: ctx.plan, monthlyCap: ctx.monthlyCap },
    idempotencyKey: `monthly_reset:${crypto.randomUUID()}`,
  });
}

/**
 * Shared idempotency-key shape for plan-cancellation emails.
 *
 * Three call sites construct this key for the SAME logical cancellation:
 *   1. /api/payments/cancel post-commit (user-initiated cancel),
 *   2. the Dodo webhook handler on subscription.cancelled / .expired /
 *      refund.succeeded,
 *   3. the reconcile-payments cron when it detects a Dodo-side cancel
 *      we missed.
 *
 * They MUST agree on the exact string so the email_outbox.idempotency_key
 * UNIQUE constraint collapses concurrent enqueues into one row. When the
 * subscription_id has been stripped from settings before one of the
 * paths reads it (the bug fixed by this PR), we fall back to a stable
 * 'no_sub' marker rather than a random UUID — a UUID would produce
 * different keys per call site and silently break dedup.
 *
 * Note: re-subscribe-then-cancel-again with no sub_id on either side
 * will dedupe to a single email per user, ever. That's fine for the
 * confirmation-email use case (the second cancel is a no-op transition
 * if the user was already free), and a fresh sub_id breaks the tie
 * naturally.
 */
export function planCancellationIdempotencyKey(
  userId: string,
  subscriptionId: string | null | undefined,
): string {
  return `plan_cancellation:${userId}:${subscriptionId || 'no_sub'}`;
}

/**
 * Best-effort enqueue of a plan_cancellation email when the caller has
 * detected that the user has already transitioned to free but doesn't
 * itself hold the previousPlan / subscription_id needed to construct
 * the message. Recovers both from the most recent relevant audit_logs
 * row.
 *
 * Two callers:
 *   - /api/payments/cancel: when the route is invoked against a user
 *     who is already on plan='free' (e.g. the webhook beat us to the
 *     transition or the user double-clicked).
 *   - the Dodo webhook handler: when the cancellation event lands in
 *     the superseded_sub branch because the cancel route stripped
 *     settings.subscription_id before this delivery arrived.
 *
 * Behaviour:
 *   - Looks up the latest 'subscription_cancelled' (cancel-route audit)
 *     or 'webhook_plan_change' (webhook audit) row for the user.
 *   - Reads previousPlan + subscription_id from details.
 *   - Calls sendPlanCancellationEmail with the SHARED idempotency key,
 *     so an INSERT here is a UNIQUE-constraint no-op against any prior
 *     enqueue from either path.
 *
 * Never throws. Returns silently when there's no audit history to
 * recover from (e.g. brand-new accounts that were never on a paid
 * plan), no email on file, or the audit lookup itself errors.
 */
export interface RecoveredCancellationEnqueueInput {
  userId: string;
  email: string | null;
  /** Free-form caller tag for log lines, e.g. 'cancel_route_already_free'. */
  source: string;
}

export async function tryEnqueueRecoveredCancellationEmail(
  input: RecoveredCancellationEnqueueInput,
): Promise<void> {
  if (!input.email) return;

  let auditRows: Array<{ action: string; details: unknown }>;
  try {
    const result = await pool.query<{ action: string; details: unknown }>(
      `SELECT action, details
         FROM audit_logs
        WHERE target_type = 'user'
          AND target_id = $1
          AND action IN ('subscription_cancelled', 'webhook_plan_change')
        ORDER BY created_at DESC
        LIMIT 5`,
      [input.userId],
    );
    auditRows = result.rows;
  } catch (e) {
    console.warn(
      `[email.cancellation_recovery.audit_lookup_failed] userId=${input.userId} `
      + `source=${input.source} reason=${(e as Error).message}`,
    );
    return;
  }

  let previousPlan: string | null = null;
  let subscriptionId: string | null = null;
  for (const r of auditRows) {
    const d = parseAuditDetails(r.details);
    const candidatePlan = typeof d.previousPlan === 'string' ? d.previousPlan : null;
    const candidateSub =
      (typeof d.previousSubscriptionId === 'string' && d.previousSubscriptionId)
      || (typeof d.subscription_id === 'string' && d.subscription_id)
      || null;
    if (candidatePlan && candidatePlan !== 'free') {
      previousPlan = candidatePlan;
      subscriptionId = candidateSub || subscriptionId;
      break;
    }
    if (!subscriptionId && candidateSub) {
      subscriptionId = candidateSub;
    }
  }

  if (!previousPlan) {
    // No prior paid-plan evidence in audit history — nothing to recover.
    // Common for users who never had a paid plan; not an error.
    return;
  }

  const idempotencyKey = planCancellationIdempotencyKey(input.userId, subscriptionId);
  try {
    await sendPlanCancellationEmail(input.email, { previousPlan }, idempotencyKey);
    console.log(
      `[email.cancellation_recovery.enqueued] userId=${input.userId} `
      + `source=${input.source} previousPlan=${previousPlan} `
      + `idempotency_key=${idempotencyKey}`,
    );
  } catch (err) {
    console.error(
      `[email.cancellation_recovery.enqueue_failed] userId=${input.userId} `
      + `source=${input.source} reason=${(err as Error).message}`,
    );
  }
}

function parseAuditDetails(raw: unknown): Record<string, unknown> {
  // pg returns JSONB columns as already-parsed objects, but some legacy
  // audit rows may have been written by the Express app as TEXT — handle
  // both shapes so the recovery doesn't silently miss older history.
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

// ── Plan upgrade / downgrade / cancellation confirmations ──────────
//
// Fired from the DodoPayments webhook (and the user-initiated
// /api/payments/cancel route) right after the users.plan column has
// been updated. Resend handles delivery via the same sendEmail helper
// used by every other transactional message in this file. These are
// best-effort: callers fire-and-forget so a Resend outage never causes
// a webhook to 500 and trigger Dodo's retry storm.

export interface PlanChangeContext {
  /** Plan the account was on before this transition (e.g. 'starter'). */
  previousPlan: string;
  /** Plan the account is on now (e.g. 'pro'). */
  newPlan: string;
}

function planFeatureBullets(plan: string): string {
  const cfg = getPlanCredits(plan);
  const manualCap = cfg.manualDailyCap >= 9999 ? 'Unlimited' : cfg.manualDailyCap.toLocaleString();
  const promptCap = cfg.trackedPromptsPerAccount >= 9999
    ? 'Unlimited'
    : cfg.trackedPromptsPerAccount.toLocaleString();
  return `
    <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.7;">
      <li><strong>${cfg.monthlyCredits.toLocaleString()}</strong> AI credits per month</li>
      <li>Up to <strong>${cfg.maxPlatforms}</strong> AI platforms tracked per brand</li>
      <li><strong>${promptCap}</strong> tracked prompts across your account</li>
      <li><strong>${manualCap}</strong> manual runs per day</li>
      <li><strong>${cfg.modelTier === 'premium' ? 'Premium' : 'Economy'}</strong> model tier</li>
    </ul>
  `;
}

/**
 * Confirmation that a paid upgrade (free→pro, starter→agency, etc.)
 * has taken effect. Sent from the DodoPayments webhook after the
 * users.plan UPDATE commits.
 */
export async function sendPlanUpgradeEmail(
  email: string,
  ctx: PlanChangeContext,
  idempotencyKey?: string,
): Promise<EmailResult> {
  const fromCfg = getPlanCredits(ctx.previousPlan);
  const toCfg = getPlanCredits(ctx.newPlan);
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="color:#10b981;margin:0 0 12px 0;">You're on ${escapeHtml(toCfg.label)} now &#127881;</h2>
      <p style="color:#374151;line-height:1.6;">
        Thanks for upgrading from <strong>${escapeHtml(fromCfg.label)}</strong> to
        <strong>${escapeHtml(toCfg.label)}</strong>. Your new plan is active immediately and
        the additional credits are already available in your account.
      </p>
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 8px 0;color:#065f46;font-weight:600;">What's now unlocked</p>
        ${planFeatureBullets(ctx.newPlan)}
      </div>
      <a href="${BILLING_URL}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;font-weight:600;">View Billing</a>
      <p style="color:#9ca3af;font-size:12px;margin-top:16px;">
        Your next renewal is billed at <strong>${escapeHtml(toCfg.price)}</strong>. Manage or cancel
        anytime from the billing page. Questions? Just reply to this email.
      </p>
    </div>
  `;
  return enqueueEmail({
    to: email,
    subject: `You're on the ${toCfg.label} plan — Livesov`,
    html,
    templateKey: 'plan_upgrade',
    payload: { from: ctx.previousPlan, to: ctx.newPlan },
    idempotencyKey,
  });
}

/**
 * Confirmation that a paid plan changed to a lower-ranked paid plan
 * (e.g. agency → starter via the customer portal). NOT used for full
 * cancellations down to free — see `sendPlanCancellationEmail`.
 */
export async function sendPlanDowngradeEmail(
  email: string,
  ctx: PlanChangeContext,
  idempotencyKey?: string,
): Promise<EmailResult> {
  const fromCfg = getPlanCredits(ctx.previousPlan);
  const toCfg = getPlanCredits(ctx.newPlan);
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="color:#4f46e5;margin:0 0 12px 0;">Your plan has changed</h2>
      <p style="color:#374151;line-height:1.6;">
        We've moved your account from <strong>${escapeHtml(fromCfg.label)}</strong> to
        <strong>${escapeHtml(toCfg.label)}</strong>. The change is effective immediately and
        your next invoice will be billed at <strong>${escapeHtml(toCfg.price)}</strong>.
      </p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 8px 0;color:#374151;font-weight:600;">Your ${escapeHtml(toCfg.label)} plan now includes</p>
        ${planFeatureBullets(ctx.newPlan)}
      </div>
      <p style="color:#374151;line-height:1.6;">
        Need more capacity again? You can switch back any time from the billing page —
        your existing brands, prompts, and history all stay put.
      </p>
      <a href="${BILLING_URL}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;font-weight:600;">Manage Plan</a>
      <p style="color:#9ca3af;font-size:12px;margin-top:16px;">
        If you didn't make this change, reply to this email and we'll roll it back.
      </p>
    </div>
  `;
  return enqueueEmail({
    to: email,
    subject: `Your Livesov plan changed to ${toCfg.label}`,
    html,
    templateKey: 'plan_downgrade',
    payload: { from: ctx.previousPlan, to: ctx.newPlan },
    idempotencyKey,
  });
}

/**
 * Confirmation that a paid subscription was cancelled and the account
 * has dropped to the Free plan. Sent both from the user-initiated
 * /api/payments/cancel route and from the DodoPayments webhook on
 * subscription.cancelled / subscription.expired / refund.succeeded.
 */
export async function sendPlanCancellationEmail(
  email: string,
  ctx: { previousPlan: string },
  idempotencyKey?: string,
): Promise<EmailResult> {
  const fromCfg = getPlanCredits(ctx.previousPlan);
  const freeCfg = getPlanCredits('free');
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="color:#dc2626;margin:0 0 12px 0;">Your subscription was cancelled</h2>
      <p style="color:#374151;line-height:1.6;">
        We've cancelled your <strong>${escapeHtml(fromCfg.label)}</strong> subscription and
        moved your account to the <strong>${escapeHtml(freeCfg.label)}</strong> plan. You won't
        be billed again.
      </p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 8px 0;color:#991b1b;font-weight:600;">What you keep on Free</p>
        ${planFeatureBullets('free')}
      </div>
      <p style="color:#374151;line-height:1.6;">
        Your brands, prompts, and run history are preserved — re-subscribe any time from
        the billing page to restore your previous capacity.
      </p>
      <a href="${BILLING_URL}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;font-weight:600;">View Billing</a>
      <p style="color:#9ca3af;font-size:12px;margin-top:16px;">
        If you didn't request this cancellation, please reply to this email so we can investigate.
      </p>
    </div>
  `;
  return enqueueEmail({
    to: email,
    subject: 'Your Livesov subscription was cancelled',
    html,
    templateKey: 'plan_cancellation',
    payload: { from: ctx.previousPlan },
    idempotencyKey,
  });
}

/**
 * "Your free trial has ended" email. Sent once by the
 * /api/cron/trial-ended-emails job after a user's trial expires
 * (rawPlan='trial', trial_ends_at < now). Idempotency lives in the
 * caller via the users.trial_end_email_sent_at column — this function
 * is stateless so the email body can be regenerated/resent in dev
 * without consulting the DB.
 */
export async function sendTrialEndedEmail(email: string): Promise<EmailResult> {
  const upgradeUrl = `${APP_URL}/dashboard/account`;
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#f59e0b;margin:0 0 12px 0;">Your free trial has ended</h2>
      <p style="color:#374151;line-height:1.6;">
        Your 7-day free trial has ended. You're now on the Free plan
        with reduced limits. Upgrade to restore
        <strong>5 AI platforms</strong>, <strong>30 tracked prompts</strong>,
        and <strong>200 credits per month</strong>.
      </p>
      <a href="${upgradeUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;font-weight:600;">Upgrade →</a>
      <p style="color:#9ca3af;font-size:12px;margin-top:16px;">
        You're receiving this because your Trackly trial just ended.
        We send this once per trial — no further reminders.
      </p>
    </div>
  `;
  return sendEmail(email, 'Your Trackly free trial has ended', html);
}

async function sendContactFormViaZoho(
  subject: string,
  html: string,
  replyTo: string
): Promise<EmailResult> {
  const host = process.env.ZOHO_SMTP_HOST || 'smtppro.zoho.in';
  const port = parseInt(process.env.ZOHO_SMTP_PORT || '465', 10);
  const user = process.env.ZOHO_SMTP_USER || 'hello@livesov.com';
  const pass = process.env.ZOHO_SMTP_PASSWORD!;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `Livesov <${user}>`,
      to: 'hello@livesov.com',
      replyTo,
      subject,
      html,
    });

    return { sent: true };
  } catch (e) {
    const reason = (e as Error).message;
    console.error(`[Email] Zoho SMTP error subject="${subject}" error=${reason}`);
    return { sent: false, reason };
  }
}
