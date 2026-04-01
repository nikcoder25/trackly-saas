/**
 * Shared utility helpers - ported from Express app's lib/helpers.js
 */
import crypto from 'crypto';
import { pool } from './db';
import { getPlanLimits } from './constants';

export function uid(): string {
  return Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

// ── API Key Encryption ───────────────────────────────
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
if (!ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY or JWT_SECRET environment variable is required');
const ALGO = 'aes-256-gcm';
const ENCRYPTION_SALT =
  process.env.ENCRYPTION_SALT ||
  crypto.createHash('sha256').update(ENCRYPTION_KEY).digest('hex').slice(0, 32);

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, ENCRYPTION_SALT, 32);
}

export function encryptValue(text: string): string | null {
  if (!text) return null;
  const key = deriveKey(ENCRYPTION_KEY);
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
    const key = deriveKey(ENCRYPTION_KEY);
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
  const plan = u.plan || 'free';
  const rawKeys = u.api_keys || {};
  const decrypted = decryptApiKeys(rawKeys);
  const settings = { ...(u.settings || {}) };
  delete settings.totp_secret;
  delete settings.totp_secret_pending;
  delete settings.totp_backup_codes;
  return {
    id: u.id,
    email: u.email,
    username: u.username || null,
    name: u.name,
    plan,
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
