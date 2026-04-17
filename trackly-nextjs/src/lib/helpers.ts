/**
 * Shared utility helpers - ported from Express app's lib/helpers.js
 */
import crypto from 'crypto';
import { pool } from './db';
import { getPlanLimits, getEffectivePlan } from './constants';

/**
 * Normalise an email so variant addresses collapse to a single identity.
 * Strips `+tag`, lower-cases, and removes dots for Gmail / Googlemail.
 * Used for anti-abuse dedup when handing out free trials.
 */
export function normaliseEmail(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const lower = raw.trim().toLowerCase();
  const [local, domain] = lower.split('@');
  if (!local || !domain) return lower;
  const stripped = local.split('+')[0];
  const isGoogle = domain === 'gmail.com' || domain === 'googlemail.com';
  const cleaned = isGoogle ? stripped.replace(/\./g, '') : stripped;
  return `${cleaned}@${isGoogle ? 'gmail.com' : domain}`;
}

/**
 * Returns the /24 block of an IPv4 address (e.g. "203.0.113.0/24") or the
 * /64 prefix for IPv6, for coarse abuse-pattern bucketing. Returns the
 * original string when the address can't be parsed.
 */
export function ipBlockKey(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown';
  // IPv4
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  // IPv6 — take the first four hextets as an approximate /64
  if (ip.includes(':')) {
    const parts = ip.split(':').slice(0, 4).join(':');
    return `${parts}::/64`;
  }
  return ip;
}

/**
 * Look up a user's effective plan, respecting trial expiration.
 * Returns 'free' if the user's trial has expired or they aren't found.
 */
export async function getUserEffectivePlan(userId: string): Promise<string> {
  const result = await pool.query('SELECT plan, trial_ends_at FROM users WHERE id = $1', [userId]);
  const row = result.rows[0] as { plan?: string; trial_ends_at?: string | Date } | undefined;
  if (!row) return 'free';
  return getEffectivePlan(row.plan, row.trial_ends_at);
}

export function uid(): string {
  return Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

// ── API Key Encryption ───────────────────────────────
const ALGO = 'aes-256-gcm';

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!key) throw new Error('ENCRYPTION_KEY or JWT_SECRET environment variable is required');
  return key;
}

function getEncryptionSalt(): string {
  return process.env.ENCRYPTION_SALT ||
    crypto.createHash('sha256').update(getEncryptionKey()).digest('hex').slice(0, 32);
}

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, getEncryptionSalt(), 32);
}

export function encryptValue(text: string): string | null {
  if (!text) return null;
  const key = deriveKey(getEncryptionKey());
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + tag + ':' + encrypted;
}

export function decryptValue(encrypted: string): string | null {
  if (!encrypted) return null;
  try {
    const parts = encrypted.split(':');
    if (parts.length !== 3) return null;
    const key = deriveKey(getEncryptionKey());
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(parts[2], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

export function encryptApiKeys(keys: Record<string, string>): Record<string, string | null> {
  if (!keys || typeof keys !== 'object') return {};
  const encrypted: Record<string, string | null> = {};
  for (const [platform, value] of Object.entries(keys)) {
    encrypted[platform] = value ? encryptValue(value) : null;
  }
  return encrypted;
}

export function decryptApiKeys(keys: Record<string, string>): Record<string, string | null> {
  if (!keys || typeof keys !== 'object') return {};
  const decrypted: Record<string, string | null> = {};
  for (const [platform, value] of Object.entries(keys)) {
    decrypted[platform] = value ? decryptValue(value) : null;
  }
  return decrypted;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeUser(u: any) {
  // Expired trials are transparently treated as 'free'. The stored plan in the
  // DB isn't touched here — it's re-evaluated on every read so the countdown
  // stays accurate until the user upgrades or the trial is cleared elsewhere.
  const plan = getEffectivePlan(u.plan, u.trial_ends_at);
  const rawKeys = u.api_keys || {};
  const decrypted = decryptApiKeys(rawKeys);
  // Explicitly strip ALL sensitive keys from settings (defense-in-depth)
  const rawSettings = u.settings || {};
  const SENSITIVE_KEYS = new Set([
    'totp_secret', 'totp_secret_pending', 'totp_backup_codes',
    'password_hash', 'failed_login_attempts', 'last_failed_login',
  ]);
  const settings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawSettings)) {
    if (!SENSITIVE_KEYS.has(key)) settings[key] = value;
  }
  return {
    id: u.id,
    email: u.email,
    username: u.username || null,
    name: u.name,
    plan,
    rawPlan: u.plan || 'free',
    trialEndsAt: u.trial_ends_at ? new Date(u.trial_ends_at).toISOString() : null,
    role: u.role || null,
    createdAt: u.created_at,
    emailVerified: u.email_verified || false,
    avatarUrl: u.avatar_url || null,
    hasGoogle: !!u.google_id,
    hasKeys: Object.keys(decrypted).filter((k) => decrypted[k]),
    settings,
    totpEnabled: !!(u.settings?.totp_enabled),
    limits: getPlanLimits(plan),
  };
}

export async function getBrandWithAccess(brandId: string, userId: string) {
  const ownResult = await pool.query('SELECT * FROM brands WHERE id = $1 AND user_id = $2', [brandId, userId]);
  if (ownResult.rows.length) {
    const row = ownResult.rows[0];
    return { brand: { id: row.id, userId: row.user_id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at }, role: 'owner' };
  }
  const teamResult = await pool.query(
    `SELECT b.*, tm.role AS team_role FROM brands b
     JOIN team_members tm ON b.user_id = tm.owner_id
     WHERE b.id = $1 AND tm.member_id = $2`,
    [brandId, userId]
  );
  if (teamResult.rows.length) {
    const row = teamResult.rows[0];
    return { brand: { id: row.id, userId: row.user_id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at, shared: true, teamRole: row.team_role }, role: row.team_role };
  }
  return null;
}
