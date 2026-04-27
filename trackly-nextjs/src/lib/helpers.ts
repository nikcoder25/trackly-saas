/**
 * Shared utility helpers - ported from Express app's lib/helpers.js
 */
import crypto from 'crypto';
import { pool } from './db';
import { getPlanLimits, getEffectivePlan } from './constants';

export function uid(): string {
  return Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

/**
 * Collapse variant addresses (Gmail dots, +tags) to one identity so a single
 * person can't grab multiple trials from the same mailbox.
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
 * Coarse /24 (IPv4) or /64 (IPv6) bucket for abuse-pattern detection.
 */
export function ipBlockKey(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown';
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (ip.includes(':')) {
    const parts = ip.split(':').slice(0, 4).join(':');
    return `${parts}::/64`;
  }
  return ip;
}

export async function getUserEffectivePlan(userId: string): Promise<string> {
  const result = await pool.query('SELECT plan, trial_ends_at FROM users WHERE id = $1', [userId]);
  const row = result.rows[0] as { plan?: string; trial_ends_at?: string | Date } | undefined;
  if (!row) return 'free';
  return getEffectivePlan(row.plan, row.trial_ends_at);
}

// ── API Key Encryption ───────────────────────────────
const ALGO = 'aes-256-gcm';

function getEncryptionKey(): string {
  // In production we refuse to fall back to JWT_SECRET: reusing a signing
  // secret as an AEAD key conflates two cryptographic purposes and breaks
  // key rotation (rotating JWT_SECRET would silently invalidate every
  // encrypted-at-rest API key). instrumentation.ts also blocks boot when
  // ENCRYPTION_KEY is missing in production, so this branch is just a
  // belt-and-braces guard for the runtime.
  const key = process.env.ENCRYPTION_KEY
    || (process.env.NODE_ENV !== 'production' ? process.env.JWT_SECRET : undefined);
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is required');
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
  // Expired trials transparently resolve to 'free'. The DB row isn't mutated
  // here - it's re-evaluated on every read so the countdown stays accurate.
  const plan = getEffectivePlan(u.plan, u.trial_ends_at);
  const rawKeys = u.api_keys || {};
  const decrypted = decryptApiKeys(rawKeys);
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

// ── Tenant fairness settings ─────────────────────────────────
// Resolves a tenant's per-platform fairness knobs (weight + max
// queue depth) from `users.settings`, with sane defaults. Cached
// in-process via the fairness scheduler's `setTenantFairness` so
// hot-path acquires don't hit the DB. Plan-tier defaults give paid
// plans a higher share of platform slots than free; explicit
// per-user overrides in `users.settings` win over both.
export interface TenantFairnessSettings {
  weight: number;
  maxQueueDepth: number;
}

const PLAN_FAIRNESS_WEIGHTS: Record<string, number> = {
  free: 1,
  trial: 1,
  starter: 1,
  pro: 2,
  agency: 4,
  enterprise: 8,
  owner: 8,
};

export async function loadTenantFairnessSettings(userId: string): Promise<TenantFairnessSettings> {
  const defaults: TenantFairnessSettings = {
    weight: 1,
    maxQueueDepth: Number(process.env.AI_FAIRNESS_MAX_QUEUE_DEPTH) || 100,
  };
  if (!userId) return defaults;
  try {
    const result = await pool.query(
      'SELECT plan, trial_ends_at, settings FROM users WHERE id = $1',
      [userId],
    );
    const row = result.rows[0];
    if (!row) return defaults;
    const plan = getEffectivePlan(row.plan, row.trial_ends_at);
    const planWeight = PLAN_FAIRNESS_WEIGHTS[plan] ?? 1;
    const settings = row.settings || {};
    const userWeight = Number(settings.fairness_weight);
    const userMaxQueue = Number(settings.fairness_max_queue);
    return {
      weight: Number.isFinite(userWeight) && userWeight > 0 ? userWeight : planWeight,
      maxQueueDepth:
        Number.isFinite(userMaxQueue) && userMaxQueue > 0 ? userMaxQueue : defaults.maxQueueDepth,
    };
  } catch {
    // DB hiccup at run start should not block the run - fall back to defaults.
    return defaults;
  }
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
