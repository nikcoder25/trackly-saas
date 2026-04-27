/**
 * Email service - sends verification and password reset emails
 * Supports Resend (default) and SendGrid
 * Contact form emails use Zoho Mail SMTP (via nodemailer) when configured
 */

import nodemailer from 'nodemailer';
import { escapeHtml } from './sanitize';

const EMAIL_API_KEY = process.env.EMAIL_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Livesov <noreply@livesov.com>';
const EMAIL_API_URL = process.env.EMAIL_API_URL || 'https://api.resend.com/emails';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

interface EmailResult {
  sent: boolean;
  reason?: string;
}

async function sendEmail(to: string, subject: string, html: string, replyTo?: string): Promise<EmailResult> {
  if (!EMAIL_API_KEY) {
    // Don't log full HTML (may contain tokens) - just log recipient and subject
    console.log(`[Email] DEV MODE - Would send to ${to}: ${subject} (HTML body omitted for security)`);
    return { sent: true };
  }

  try {
    const isResend = EMAIL_API_URL.includes('resend.com');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    headers['Authorization'] = `Bearer ${EMAIL_API_KEY}`;

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
    if (!resp.ok) {
      const text = await resp.text();
      const reason = `Email API returned ${resp.status}: ${text}`;
      console.error(`[Email] Send failed to=${to} subject="${subject}" reason=${reason}`);
      return { sent: false, reason };
    }
    return { sent: true };
  } catch (e) {
    const reason = (e as Error).message;
    console.error(`[Email] Send error to=${to} subject="${subject}" error=${reason}`);
    return { sent: false, reason };
  }
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
  return sendEmail(email, 'Verify your email - Livesov', html);
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
  return sendEmail(email, 'Reset your password - Livesov', html);
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
  return sendEmail(email, 'Welcome to Livesov!', html, 'hello@livesov.com');
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
  return sendEmail(to, `AI Visibility Report: ${escapeHtml(brandName)} - Livesov`, html);
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
  return sendEmail(email, 'Your Livesov AI credits are running low', html);
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
  return sendEmail(email, `Scheduled scan skipped — ${ctx.brandName}`, html);
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
  return sendEmail(email, 'Your Livesov credits have refreshed', html);
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
