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
    console.warn('[Email] RESEND_AUDIENCE_ID not set — skipping audience contact creation');
    return { sent: false, reason: 'RESEND_AUDIENCE_ID not configured' };
  }
  if (!EMAIL_API_KEY) {
    console.log(`[Email] DEV MODE — Would add ${email} to audience ${audienceId}`);
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
        We keep things short and useful — no spam, just actionable tips.
      </p>
      <p style="color:#374151;line-height:1.6;">
        If you have any questions, just reply to this email!
      </p>
      <p style="color:#374151;line-height:1.6;">
        — The Livesov Team
      </p>
      <p style="color:#999;font-size:12px;margin-top:24px;">
        You're receiving this because you subscribed to the Livesov newsletter.
      </p>
    </div>
  `;
  return sendEmail(email, 'Welcome to Livesov!', html, 'hello@livesov.com');
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
