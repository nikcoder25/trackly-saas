/**
 * Email service - sends verification and password reset emails
 * Supports Resend (default) and SendGrid
 */

const EMAIL_API_KEY = process.env.EMAIL_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Livesov <noreply@livesov.com>';
const EMAIL_API_URL = process.env.EMAIL_API_URL || 'https://api.resend.com/emails';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

interface EmailResult {
  sent: boolean;
  reason?: string;
}

async function sendEmail(to: string, subject: string, html: string): Promise<EmailResult> {
  if (!EMAIL_API_KEY) {
    console.log(`[Email] DEV MODE — Would send to ${to}: ${subject}`);
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

    const body = isResend
      ? JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html })
      : JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: EMAIL_FROM.match(/<(.+)>/)?.[1] || EMAIL_FROM },
          subject,
          content: [{ type: 'text/html', value: html }],
        });

    const resp = await fetch(EMAIL_API_URL, { method: 'POST', headers, body });
    if (!resp.ok) {
      const text = await resp.text();
      return { sent: false, reason: `Email API returned ${resp.status}: ${text}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}

export async function sendVerificationEmail(email: string, token: string): Promise<EmailResult> {
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;
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
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
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
