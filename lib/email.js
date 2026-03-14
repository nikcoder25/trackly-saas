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
const { createLogger } = require('./logger');
const log = createLogger('Email');

const EMAIL_FROM = process.env.EMAIL_FROM || '';
const EMAIL_API_KEY = process.env.EMAIL_API_KEY || '';
const EMAIL_API_URL = process.env.EMAIL_API_URL || '';
const APP_URL = process.env.APP_URL || process.env.DODO_PAYMENTS_RETURN_URL || '';

if (!APP_URL) {
  log.warn('APP_URL not set. Email links will be relative and may not work. Set APP_URL in your environment.');
}

function isEmailConfigured() {
  return !!(EMAIL_FROM && EMAIL_API_KEY && EMAIL_API_URL && APP_URL);
}

async function sendEmail(to, subject, html) {
  if (!isEmailConfigured()) {
    log.info(`(dev mode) To: ${to} | Subject: ${subject}`);
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

async function sendReportEmail(to, brandName, report) {
  const dashboardUrl = `${APP_URL}`;
  const sovTrendIcon = report.sovTrend > 0 ? '&#9650;' : report.sovTrend < 0 ? '&#9660;' : '&#9654;';
  const sovTrendColor = report.sovTrend > 0 ? '#16a34a' : report.sovTrend < 0 ? '#dc2626' : '#6b7280';

  // Platform breakdown rows
  let platformRows = '';
  for (const [platform, stats] of Object.entries(report.platformStats || {})) {
    const rate = stats.total ? Math.round((stats.mentioned / stats.total) * 100) : 0;
    platformRows += `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${platform}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${stats.mentioned}/${stats.total}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${rate}%</td></tr>`;
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>AI Visibility Report: ${brandName}</h2>
      <p style="color: #6b7280;">Period: ${report.period?.from || 'N/A'} to ${report.period?.to || 'N/A'}</p>

      <div style="display:flex;gap:16px;margin:20px 0;">
        <div style="flex:1;background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;">${report.lastRunSov}%</div>
          <div style="color:#6b7280;font-size:13px;">Current SOV</div>
          <div style="color:${sovTrendColor};font-size:14px;">${sovTrendIcon} ${report.sovTrend > 0 ? '+' : ''}${report.sovTrend.toFixed(1)}%</div>
        </div>
        <div style="flex:1;background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;">${report.totalRuns}</div>
          <div style="color:#6b7280;font-size:13px;">Total Runs</div>
        </div>
        <div style="flex:1;background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;">${report.totalMentions}</div>
          <div style="color:#6b7280;font-size:13px;">Total Mentions</div>
        </div>
      </div>

      ${platformRows ? `
      <h3 style="margin-top:24px;">Platform Breakdown (Last Run)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#f9fafb;">
          <th style="padding:8px 12px;text-align:left;">Platform</th>
          <th style="padding:8px 12px;text-align:center;">Mentions</th>
          <th style="padding:8px 12px;text-align:center;">Rate</th>
        </tr></thead>
        <tbody>${platformRows}</tbody>
      </table>
      ` : ''}

      <p style="margin-top:24px;">
        <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:white;text-decoration:none;border-radius:6px;">View Dashboard</a>
      </p>
      <p style="color:#999;font-size:12px;margin-top:16px;">You're receiving this because you enabled scheduled reports. Manage settings in your Trackly dashboard.</p>
    </div>
  `;
  return sendEmail(to, `AI Visibility Report: ${brandName} - Trackly`, html);
}

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail, sendReportEmail, isEmailConfigured };
