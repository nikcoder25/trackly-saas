import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { isBlockedIP } from '@/lib/safe-fetch';

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  try {
    const result = await pool.query('SELECT settings FROM users WHERE id = $1', [user.id]);
    const settings = result.rows[0]?.settings || {};
    delete settings.totp_secret;
    delete settings.totp_secret_pending;
    delete settings.totp_backup_codes;
    return Response.json({ settings });
  } catch {
    return Response.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

// Keys that must NEVER be set via the settings endpoint
const SETTINGS_BLOCKED_KEYS = new Set([
  'totp_secret', 'totp_enabled', 'totp_backup_codes', 'totp_secret_pending',
  'dodo_subscription_id', 'dodo_customer_id', 'password_hash', 'role', 'plan', 'id', 'email',
  'subscription_id', 'subscription_status', 'failed_login_attempts', 'last_failed_login',
]);

export async function PUT(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  const body = await request.json();
  const allowed: Record<string, string[]> = {
    theme: ['light', 'dark', 'system'],
    emailNotifications: ['true', 'false'],
    timezone: [], // allow any string
    language: ['en', 'es', 'fr', 'de', 'ja', 'ko', 'zh', 'hi'],
    emailReportSchedule: ['off', 'weekly', 'monthly'],
    notifyInApp: ['true', 'false'],
    notifyEmail: ['true', 'false'],
    notifyWebhook: ['true', 'false'],
    webhookUrl: [], // allow any string
    webhookStatus: ['none', 'active', 'error'],
  };
  const booleanKeys = ['emailNotifications', 'notifyInApp', 'notifyEmail', 'notifyWebhook'];
  const updates: Record<string, unknown> = {};
  for (const [key, validValues] of Object.entries(allowed)) {
    if (body[key] === undefined) continue;
    const val = key === 'webhookUrl' ? String(body[key]).slice(0, 500) : String(body[key]).slice(0, 100);
    if (validValues.length > 0 && !validValues.includes(val)) continue; // reject invalid enum
    // Validate webhookUrl format and reject private/internal destinations.
    // The actual delivery path must still re-validate at dispatch time via
    // safeFetch to defeat DNS rebinding; this is a fail-fast UX check.
    if (key === 'webhookUrl' && val) {
      try {
        const parsed = new URL(val);
        if (parsed.protocol !== 'https:') continue;
        const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
        if (!host) continue;
        if (host === 'localhost' || host.endsWith('.localhost')) continue;
        if (host.endsWith('.local') || host.endsWith('.internal')) continue;
        if (host === 'metadata.google.internal') continue;
        if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) continue;
        if (/(^|\.)0\d+/.test(host) || /(^|\.)0x[0-9a-f]+/i.test(host)) continue;
        // Block literal IPs that land in private/loopback/link-local/etc.
        // DNS-resolved rebinding is caught by safeFetch at dispatch time.
        const hostForIp = host.replace(/^\[|\]$/g, '');
        if (/^[0-9.]+$/.test(hostForIp) || hostForIp.includes(':')) {
          if (isBlockedIP(hostForIp)) continue;
        }
      } catch { continue; }
    }
    updates[key] = booleanKeys.includes(key) ? val === 'true' : val;
  }
  // Strip any blocked keys that may have bypassed the allowlist
  for (const key of SETTINGS_BLOCKED_KEYS) {
    delete updates[key];
  }
  if (Object.keys(updates).length === 0) return Response.json({ error: 'No valid settings to update' }, { status: 400 });

  try {
    await pool.query('UPDATE users SET settings = settings || $1::jsonb WHERE id = $2', [JSON.stringify(updates), user.id]);
    return Response.json({ success: true, settings: updates });
  } catch {
    return Response.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
