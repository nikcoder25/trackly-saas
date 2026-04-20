/**
 * Email service - sends verification and password reset emails
 * Supports Resend (default) and SendGrid
 * Contact form emails use Zoho Mail SMTP (via nodemailer) when configured
 */

import nodemailer from 'nodemailer';
import { pool } from '@/lib/db';

const EMAIL_API_KEY = process.env.EMAIL_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Livesov <noreply@livesov.com>';
const EMAIL_API_URL = process.env.EMAIL_API_URL || 'https://api.resend.com/emails';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Suppression check: skip sends to addresses that hard-bounced or
// complained. Transactional mail (verification, password reset) still
// bypasses the list so legitimate recovery flows aren't broken by a
// temporary bounce. Callers opt in to suppression by passing
// { marketing: true } or { respectSuppressions: true }.
async function isSuppressed(email: string): Promise<boolean> {
  try {
    const r = await pool.query(
      `SELECT 1 FROM email_suppressions WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()],
    );
    return r.rowCount ? true : false;
  } catch {
    // Table may not exist yet (webhook never fired). Treat as "not suppressed".
    return false;
  }
}

interface EmailResult {
  sent: boolean;
  reason?: string;
}

interface SendEmailOpts {
  replyTo?: string;
  // When true, attach List-Unsubscribe + List-Unsubscribe-Post headers so
  // Gmail / Outlook render a one-click unsubscribe button. Required for
  // CAN-SPAM and GDPR compliance on marketing/newsletter/report sends.
  marketing?: boolean;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  replyToOrOpts?: string | SendEmailOpts,
): Promise<EmailResult> {
  const opts: SendEmailOpts = typeof replyToOrOpts === 'string'
    ? { replyTo: replyToOrOpts }
    : (replyToOrOpts || {});
  const replyTo = opts.replyTo;

  // Marketing sends never bypass the suppression list. Transactional sends
  // (verification, password reset) still go through so account recovery
  // works even if a prior send hit a transient bounce.
  if (opts.marketing && await isSuppressed(to)) {
    return { sent: false, reason: 'suppressed' };
  }

  if (!EMAIL_API_KEY) {
    // Don't log full HTML (may contain tokens) - just log recipient and subject
    console.log(`[Email] DEV MODE - Would send to ${to}: ${subject} (HTML body omitted for security)`);
    return { sent: true };
  }

  try {
    const isResend = EMAIL_API_URL.includes('resend.com');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    headers['Authorization'] = `Bearer ${EMAIL_API_KEY}`;

    const unsubscribeMailto = `mailto:unsubscribe@livesov.com?subject=unsubscribe%20${encodeURIComponent(to)}`;
    const unsubscribeHttp = `${APP_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(to)}`;

    const resendPayload: Record<string, unknown> = { from: EMAIL_FROM, to: [to], subject, html };
    if (replyTo && isResend) {
      resendPayload.reply_to = replyTo;
    }
    if (opts.marketing && isResend) {
      resendPayload.headers = {
        'List-Unsubscribe': `<${unsubscribeHttp}>, <${unsubscribeMailto}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };
    }

    const body = isResend
      ? JSON.stringify(resendPayload)
      : JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: EMAIL_FROM.match(/<(.+)>/)?.[1] || EMAIL_FROM },
          subject,
          content: [{ type: 'text/html', value: html }],
          ...(opts.marketing
            ? {
                headers: [
                  { name: 'List-Unsubscribe', value: `<${unsubscribeHttp}>, <${unsubscribeMailto}>` },
                  { name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
                ],
              }
            : {}),
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
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h2 style="color:#4f46e5;margin-bottom:16px;">New Contact Form Submission</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;width:140px;">Name</td>
          <td style="padding:8px 12px;color:#111827;border-bottom:1px solid #e5e7eb;">${name}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">Email</td>
          <td style="padding:8px 12px;color:#111827;border-bottom:1px solid #e5e7eb;"><a href="mailto:${email}" style="color:#4f46e5;">${email}</a></td>
        </tr>
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">Inquiry Type</td>
          <td style="padding:8px 12px;color:#111827;border-bottom:1px solid #e5e7eb;">${inquiryType}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">Subject</td>
          <td style="padding:8px 12px;color:#111827;border-bottom:1px solid #e5e7eb;">${subject}</td>
        </tr>
      </table>
      <div style="margin-top:16px;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
        <p style="font-weight:600;color:#374151;margin:0 0 8px 0;">Message</p>
        <p style="color:#111827;margin:0;white-space:pre-wrap;">${message}</p>
      </div>
      <p style="color:#999;font-size:12px;margin-top:16px;">This message was sent via the Livesov contact form. Reply directly to respond to the customer.</p>
    </div>
  `;
  const zohoPassword = process.env.ZOHO_SMTP_PASSWORD;
  if (zohoPassword) {
    return sendContactFormViaZoho(
      `[Contact Form] ${subject} - ${inquiryType}`,
      html,
      email
    );
  }

  return sendEmail(
    'hello@livesov.com',
    `[Contact Form] ${subject} - ${inquiryType}`,
    html,
    email
  );
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
  const unsubUrl = `${APP_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}`;
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
        <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>.
      </p>
    </div>
  `;
  return sendEmail(email, 'Welcome to Livesov!', html, { replyTo: 'hello@livesov.com', marketing: true });
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

function escHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
    platformRows += `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${escHtml(platform)}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${stats.mentioned}/${stats.total}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${rate}%</td></tr>`;
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>AI Visibility Report: ${escHtml(brandName)}</h2>
      <p style="color:#64748b;">Period: ${escHtml(report.period?.from || 'N/A')} to ${escHtml(report.period?.to || 'N/A')}</p>

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
      <p style="color:#9ca3af;font-size:12px;margin-top:16px;">You're receiving this because you enabled scheduled reports. Manage settings in your Livesov dashboard or <a href="${APP_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(to)}" style="color:#9ca3af;">unsubscribe</a>.</p>
    </div>
  `;
  return sendEmail(to, `AI Visibility Report: ${escHtml(brandName)} - Livesov`, html, { marketing: true });
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
