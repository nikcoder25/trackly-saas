/**
 * Email service - sends verification and password reset emails
 * Supports Resend (default) and SendGrid
 * Contact form emails use Zoho Mail SMTP (via nodemailer) when configured
 */

import nodemailer from 'nodemailer';

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
    // Don't log full HTML (may contain tokens) — just log recipient and subject
    console.log(`[Email] DEV MODE — Would send to ${to}: ${subject} (HTML body omitted for security)`);
    return { sent: true };
  }

  try {
    const isResend = EMAIL_API_URL.includes('resend.com');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (isResend) {
      headers['Authorization'] = `Bearer ${EMAIL_API_KEY}`;
    } else {
      headers['Authorization'] = `Bearer ${EMAIL_API_KEY}`;
    }

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

// ── Weekly Digest Email ─────────────────────────────────────────
export interface DigestData {
  brandName: string;
  currentSov: number;
  previousSov: number | null;
  totalRuns: number;
  brandMentions: number;
  totalQueries: number;
  topPlatform: string | null;
  topPlatformSov: number;
  competitorChanges: Array<{ name: string; mentions: number; change: number }>;
}

export async function sendWeeklyDigestEmail(email: string, digest: DigestData): Promise<EmailResult> {
  const sovChange = digest.previousSov !== null ? digest.currentSov - digest.previousSov : null;
  const sovArrow = sovChange === null ? '' : sovChange > 0 ? '&#9650;' : sovChange < 0 ? '&#9660;' : '&#8212;';
  const sovColor = sovChange === null ? '#6b7280' : sovChange > 0 ? '#16a34a' : sovChange < 0 ? '#dc2626' : '#6b7280';
  const sovChangeText = sovChange !== null ? `${sovChange > 0 ? '+' : ''}${sovChange}%` : 'N/A';
  const dashboardUrl = `${APP_URL}/dashboard`;

  const competitorRows = digest.competitorChanges.length > 0
    ? digest.competitorChanges.map(c => {
        const changeColor = c.change > 0 ? '#dc2626' : c.change < 0 ? '#16a34a' : '#6b7280';
        const changeArrow = c.change > 0 ? '&#9650;' : c.change < 0 ? '&#9660;' : '&#8212;';
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;">${c.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:center;">${c.mentions}x</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:${changeColor};text-align:center;font-weight:600;">${changeArrow} ${c.change > 0 ? '+' : ''}${c.change}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="3" style="padding:12px;text-align:center;color:#9ca3af;">No competitor data this week</td></tr>';

  const html = `
    <div style="font-family:Inter,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:0;">
      <div style="background:#4f46e5;padding:24px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:20px;">Weekly AI Visibility Report</h1>
        <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:14px;">${digest.brandName}</p>
      </div>
      <div style="background:#fff;padding:24px 32px;border:1px solid #e5e7eb;border-top:none;">
        <div style="display:flex;gap:16px;margin-bottom:24px;">
          <div style="flex:1;background:#f9fafb;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:32px;font-weight:800;color:#111827;">${digest.currentSov}%</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px;">Share of Voice</div>
            <div style="font-size:13px;color:${sovColor};font-weight:600;margin-top:4px;">${sovArrow} ${sovChangeText} vs last week</div>
          </div>
        </div>
        <table style="width:100%;margin-bottom:16px;">
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px;">Runs this week</td>
            <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;text-align:right;">${digest.totalRuns}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px;">Brand mentions</td>
            <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;text-align:right;">${digest.brandMentions} / ${digest.totalQueries}</td>
          </tr>
          ${digest.topPlatform ? `<tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px;">Top platform</td>
            <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;text-align:right;">${digest.topPlatform} (${digest.topPlatformSov}%)</td>
          </tr>` : ''}
        </table>
        ${digest.competitorChanges.length > 0 ? `
        <h3 style="color:#374151;font-size:14px;margin:20px 0 8px;">Competitor Activity</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600;">Competitor</th>
              <th style="padding:8px 12px;text-align:center;color:#6b7280;font-weight:600;">Mentions</th>
              <th style="padding:8px 12px;text-align:center;color:#6b7280;font-weight:600;">Change</th>
            </tr>
          </thead>
          <tbody>${competitorRows}</tbody>
        </table>` : ''}
        <div style="margin-top:24px;text-align:center;">
          <a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Full Dashboard</a>
        </div>
      </div>
      <div style="padding:16px 32px;text-align:center;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;background:#f9fafb;">
        <p style="color:#9ca3af;font-size:11px;margin:0;">You're receiving this because you have a Livesov account. <a href="${APP_URL}/dashboard/account" style="color:#6b7280;">Manage preferences</a></p>
      </div>
    </div>
  `;
  return sendEmail(email, `Weekly Report: ${digest.brandName} — ${digest.currentSov}% SOV`, html);
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
