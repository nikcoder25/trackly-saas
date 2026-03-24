/**
 * Email sending utility
 * Supports Resend (default) and SendGrid via HTTP API.
 *
 * Required env vars for email:
 *   EMAIL_FROM       - sender email address (e.g. Trackly <noreply@trackly.so>)
 *   EMAIL_API_KEY    - API key for email provider (Resend: re_xxx, SendGrid: SG.xxx)
 *   APP_URL          - base URL for the app (e.g. https://trackly.so)
 *
 * Optional:
 *   EMAIL_API_URL    - override API endpoint (defaults to Resend: https://api.resend.com/emails)
 *
 * If not configured, emails are logged to console (dev mode).
 */
const https = require('https');
const { createLogger } = require('./logger');
const { TIMEOUTS, EMAIL_COLORS } = require('../config/constants');
const log = createLogger('Email');

const EMAIL_FROM = process.env.EMAIL_FROM || '';
const EMAIL_API_KEY = process.env.EMAIL_API_KEY || '';
const EMAIL_API_URL = process.env.EMAIL_API_URL || 'https://api.resend.com/emails';
const APP_URL = process.env.APP_URL || process.env.DODO_PAYMENTS_RETURN_URL || '';

// HTML-escape dynamic values in email templates to prevent injection
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

if (!APP_URL) {
  log.warn('APP_URL not set. Email links will be relative and may not work. Set APP_URL in your environment.');
} else {
  try {
    const parsed = new URL(APP_URL);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      log.error('APP_URL has invalid protocol (must be http or https): ' + APP_URL);
    }
  } catch(e) {
    log.error('APP_URL is not a valid URL: ' + APP_URL + '. Email links will be broken.');
  }
}

function isEmailConfigured() {
  return !!(EMAIL_FROM && EMAIL_API_KEY && APP_URL);
}

// Detect provider from API URL
function isSendGrid() {
  return EMAIL_API_URL.includes('sendgrid.com');
}

async function sendEmail(to, subject, html) {
  if (!isEmailConfigured()) {
    const missing = [!EMAIL_FROM && 'EMAIL_FROM', !EMAIL_API_KEY && 'EMAIL_API_KEY', !APP_URL && 'APP_URL'].filter(Boolean);
    log.warn(`Email not configured (missing: ${missing.join(', ')}). To: ${to} | Subject: ${subject}`);
    return { sent: false, reason: 'email_not_configured' };
  }

  try {
    // Build request body based on provider
    let body;
    if (isSendGrid()) {
      // SendGrid v3 format
      body = JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: EMAIL_FROM },
        subject,
        content: [{ type: 'text/html', value: html }]
      });
    } else {
      // Resend format (default)
      body = JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        html
      });
    }

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
        timeout: TIMEOUTS.emailApi
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ sent: true });
          } else {
            log.error(`API error ${res.statusCode}`, { response: data.substring(0, 200) });
            resolve({ sent: false, reason: `api_error_${res.statusCode}` });
          }
        });
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('Email API timeout')); });
      req.on('error', (e) => {
        log.error('Send error', { error: e.message });
        resolve({ sent: false, reason: e.message });
      });
      req.write(body);
      req.end();
    });
  } catch(e) {
    log.error('Error', { error: e.message });
    return { sent: false, reason: e.message };
  }
}

async function sendVerificationEmail(to, token) {
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Verify your email</h2>
      <p>Click the button below to verify your email address:</p>
      <p><a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: ${EMAIL_COLORS.primary}; color: white; text-decoration: none; border-radius: 6px;">Verify Email</a></p>
      <p style="color: ${EMAIL_COLORS.muted}; font-size: 14px;">Or copy this link: ${verifyUrl}</p>
      <p style="color: ${EMAIL_COLORS.light}; font-size: 12px;">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
    </div>
  `;
  return sendEmail(to, 'Verify your email - Livesov', html);
}

async function sendPasswordResetEmail(to, token) {
  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Reset your password</h2>
      <p>Click the button below to reset your password:</p>
      <p><a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: ${EMAIL_COLORS.primary}; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
      <p style="color: ${EMAIL_COLORS.muted}; font-size: 14px;">Or copy this link: ${resetUrl}</p>
      <p style="color: ${EMAIL_COLORS.light}; font-size: 12px;">This link expires in 1 hour. If you didn't request a reset, ignore this email.</p>
    </div>
  `;
  return sendEmail(to, 'Reset your password - Livesov', html);
}

async function sendReportEmail(to, brandName, report) {
  const dashboardUrl = `${APP_URL}`;
  const sovTrendIcon = report.sovTrend > 0 ? '&#9650;' : report.sovTrend < 0 ? '&#9660;' : '&#9654;';
  const sovTrendColor = report.sovTrend > 0 ? EMAIL_COLORS.success : report.sovTrend < 0 ? EMAIL_COLORS.danger : EMAIL_COLORS.neutral;

  // Platform breakdown rows
  let platformRows = '';
  for (const [platform, stats] of Object.entries(report.platformStats || {})) {
    const rate = stats.total ? Math.round((stats.mentioned / stats.total) * 100) : 0;
    platformRows += `<tr><td style="padding:6px 12px;border-bottom:1px solid ${EMAIL_COLORS.border};">${escHtml(platform)}</td><td style="padding:6px 12px;border-bottom:1px solid ${EMAIL_COLORS.border};text-align:center;">${stats.mentioned}/${stats.total}</td><td style="padding:6px 12px;border-bottom:1px solid ${EMAIL_COLORS.border};text-align:center;">${rate}%</td></tr>`;
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>AI Visibility Report: ${escHtml(brandName)}</h2>
      <p style="color: ${EMAIL_COLORS.neutral};">Period: ${escHtml(report.period?.from || 'N/A')} to ${escHtml(report.period?.to || 'N/A')}</p>

      <div style="display:flex;gap:16px;margin:20px 0;">
        <div style="flex:1;background:${EMAIL_COLORS.bgLight};border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;">${report.lastRunSov}%</div>
          <div style="color:${EMAIL_COLORS.neutral};font-size:13px;">Current SOV</div>
          <div style="color:${sovTrendColor};font-size:14px;">${sovTrendIcon} ${report.sovTrend > 0 ? '+' : ''}${report.sovTrend.toFixed(1)}%</div>
        </div>
        <div style="flex:1;background:${EMAIL_COLORS.bgLight};border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;">${report.totalRuns}</div>
          <div style="color:${EMAIL_COLORS.neutral};font-size:13px;">Total Runs</div>
        </div>
        <div style="flex:1;background:${EMAIL_COLORS.bgLight};border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;">${report.totalMentions}</div>
          <div style="color:${EMAIL_COLORS.neutral};font-size:13px;">Total Mentions</div>
        </div>
      </div>

      ${platformRows ? `
      <h3 style="margin-top:24px;">Platform Breakdown (Last Run)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:${EMAIL_COLORS.bgLighter};">
          <th style="padding:8px 12px;text-align:left;">Platform</th>
          <th style="padding:8px 12px;text-align:center;">Mentions</th>
          <th style="padding:8px 12px;text-align:center;">Rate</th>
        </tr></thead>
        <tbody>${platformRows}</tbody>
      </table>
      ` : ''}

      <p style="margin-top:24px;">
        <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:${EMAIL_COLORS.primary};color:white;text-decoration:none;border-radius:6px;">View Dashboard</a>
      </p>
      <p style="color:${EMAIL_COLORS.light};font-size:12px;margin-top:16px;">You're receiving this because you enabled scheduled reports. Manage settings in your Livesov dashboard.</p>
    </div>
  `;
  return sendEmail(to, `AI Visibility Report: ${escHtml(brandName)} - Livesov`, html);
}

async function sendAlertEmail(to, alertName, message) {
  const dashboardUrl = `${APP_URL}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">&#9888; Alert: ${escHtml(alertName)}</h2>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;font-size:15px;">${escHtml(message)}</p>
      </div>
      <p>
        <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:${EMAIL_COLORS.primary};color:white;text-decoration:none;border-radius:6px;">View Dashboard</a>
      </p>
      <p style="color:${EMAIL_COLORS.light};font-size:12px;">You're receiving this because you configured alert rules in Livesov. Manage alerts in your dashboard settings.</p>
    </div>
  `;
  return sendEmail(to, `Alert: ${escHtml(alertName)} - Livesov`, html);
}

async function sendPaymentReceiptEmail(to, { plan, amount, currency, paymentId, date }) {
  const dashboardUrl = `${APP_URL}`;
  const formattedAmount = amount != null ? `${currency || 'USD'} $${(amount / 100).toFixed(2)}` : 'N/A';
  const formattedDate = date ? new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const invoiceUrl = paymentId ? `${APP_URL}/api/payments/invoice/${encodeURIComponent(paymentId)}` : null;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Payment Received</h2>
      <p>Thank you for your payment! Here's your receipt:</p>
      <div style="background:${EMAIL_COLORS.bgLight};border-radius:8px;padding:20px;margin:20px 0;">
        <table style="width:100%;font-size:15px;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:${EMAIL_COLORS.neutral};">Plan</td><td style="padding:8px 0;text-align:right;font-weight:700;text-transform:uppercase;">${escHtml(plan || 'N/A')}</td></tr>
          <tr><td style="padding:8px 0;color:${EMAIL_COLORS.neutral};border-top:1px solid ${EMAIL_COLORS.border};">Amount</td><td style="padding:8px 0;text-align:right;font-weight:700;border-top:1px solid ${EMAIL_COLORS.border};">${escHtml(formattedAmount)}</td></tr>
          <tr><td style="padding:8px 0;color:${EMAIL_COLORS.neutral};border-top:1px solid ${EMAIL_COLORS.border};">Date</td><td style="padding:8px 0;text-align:right;border-top:1px solid ${EMAIL_COLORS.border};">${escHtml(formattedDate)}</td></tr>
          ${paymentId ? `<tr><td style="padding:8px 0;color:${EMAIL_COLORS.neutral};border-top:1px solid ${EMAIL_COLORS.border};">Payment ID</td><td style="padding:8px 0;text-align:right;font-size:12px;color:${EMAIL_COLORS.muted};border-top:1px solid ${EMAIL_COLORS.border};">${escHtml(paymentId)}</td></tr>` : ''}
        </table>
      </div>
      ${invoiceUrl ? `<p><a href="${invoiceUrl}" style="display:inline-block;padding:10px 20px;background:${EMAIL_COLORS.bgLight};color:${EMAIL_COLORS.primary};text-decoration:none;border:1px solid ${EMAIL_COLORS.border};border-radius:6px;font-size:14px;">Download Invoice (PDF)</a></p>` : ''}
      <p><a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:${EMAIL_COLORS.primary};color:white;text-decoration:none;border-radius:6px;">Go to Dashboard</a></p>
      <p style="color:${EMAIL_COLORS.light};font-size:12px;margin-top:16px;">You're receiving this because you made a payment on Livesov. Manage your subscription in your account settings.</p>
    </div>
  `;
  return sendEmail(to, `Payment Receipt — ${escHtml(plan || '').toUpperCase()} plan - Livesov`, html);
}

async function sendSubscriptionCancelledEmail(to, { plan }) {
  const dashboardUrl = `${APP_URL}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Subscription Cancelled</h2>
      <p>Your <strong style="text-transform:uppercase;">${escHtml(plan || '')}</strong> plan subscription has been cancelled. You've been moved to the free plan.</p>
      <div style="background:${EMAIL_COLORS.bgLight};border-radius:8px;padding:16px;margin:20px 0;font-size:14px;color:${EMAIL_COLORS.neutral};">
        You'll still have access to your existing data, but plan limits have been reduced. Upgrade anytime to restore full access.
      </div>
      <p><a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:${EMAIL_COLORS.primary};color:white;text-decoration:none;border-radius:6px;">View Plans</a></p>
      <p style="color:${EMAIL_COLORS.light};font-size:12px;margin-top:16px;">If you didn't request this cancellation, please contact support immediately.</p>
    </div>
  `;
  return sendEmail(to, 'Subscription Cancelled - Livesov', html);
}

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail, sendReportEmail, sendAlertEmail, sendPaymentReceiptEmail, sendSubscriptionCancelledEmail, isEmailConfigured };
