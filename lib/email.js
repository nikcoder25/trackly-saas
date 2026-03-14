/**
 * Email sending utility
 * Supports configurable providers via SMTP relay or HTTP API.
 * Currently uses a simple HTTPS POST to a configurable email endpoint.
 *
 * Required env vars for email:
 *   EMAIL_FROM       - sender email address (e.g. noreply@trackly.app)
 *   EMAIL_API_KEY    - API key for email provider
 *   EMAIL_API_URL    - email API endpoint (e.g. https://api.sendgrid.com/v3/mail/send)
 *   APP_URL          - base URL for the app (e.g. https://trackly.app)
 *
 * If not configured, emails are logged to console (dev mode).
 */
const https = require('https');

const EMAIL_FROM = process.env.EMAIL_FROM || '';
const EMAIL_API_KEY = process.env.EMAIL_API_KEY || '';
const EMAIL_API_URL = process.env.EMAIL_API_URL || '';
const APP_URL = process.env.APP_URL || process.env.DODO_PAYMENTS_RETURN_URL || '';

function isEmailConfigured() {
  return !!(EMAIL_FROM && EMAIL_API_KEY && EMAIL_API_URL);
}

async function sendEmail(to, subject, html) {
  if (!isEmailConfigured()) {
    console.log(`[Email] (dev mode) To: ${to} | Subject: ${subject}`);
    return { sent: false, reason: 'email_not_configured' };
  }

  try {
    const body = JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: EMAIL_FROM },
      subject,
      content: [{ type: 'text/html', value: html }]
    });

    return new Promise((resolve, reject) => {
      const url = new URL(EMAIL_API_URL);
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${EMAIL_API_KEY}`,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ sent: true });
          } else {
            console.error(`[Email] API error ${res.statusCode}: ${data.substring(0, 200)}`);
            resolve({ sent: false, reason: `api_error_${res.statusCode}` });
          }
        });
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('Email API timeout')); });
      req.on('error', (e) => {
        console.error('[Email] Send error:', e.message);
        resolve({ sent: false, reason: e.message });
      });
      req.write(body);
      req.end();
    });
  } catch(e) {
    console.error('[Email] Error:', e.message);
    return { sent: false, reason: e.message };
  }
}

async function sendVerificationEmail(to, token) {
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Verify your email</h2>
      <p>Click the button below to verify your email address:</p>
      <p><a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px;">Verify Email</a></p>
      <p style="color: #666; font-size: 14px;">Or copy this link: ${verifyUrl}</p>
      <p style="color: #999; font-size: 12px;">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
    </div>
  `;
  return sendEmail(to, 'Verify your email - Trackly', html);
}

async function sendPasswordResetEmail(to, token) {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Reset your password</h2>
      <p>Click the button below to reset your password:</p>
      <p><a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
      <p style="color: #666; font-size: 14px;">Or copy this link: ${resetUrl}</p>
      <p style="color: #999; font-size: 12px;">This link expires in 1 hour. If you didn't request a reset, ignore this email.</p>
    </div>
  `;
  return sendEmail(to, 'Reset your password - Trackly', html);
}

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail, isEmailConfigured };
