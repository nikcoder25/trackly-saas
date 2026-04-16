/**
 * Shared utility helpers
 */
const crypto = require('crypto');
const { pool } = require('../config/db');
const { getPlanLimits } = require('./plans');

function uid() {
  return Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

// ── API Key Encryption ───────────────────────────────
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
if (!ENCRYPTION_KEY) {
  console.error('[FATAL] ENCRYPTION_KEY or JWT_SECRET is required for API key encryption.');
  process.exit(1);
}
if (!process.env.ENCRYPTION_KEY) {
  console.warn('[WARN] ENCRYPTION_KEY not set - falling back to JWT_SECRET for API key encryption.');
  console.warn('       ⚠ Rotating JWT_SECRET will make ALL encrypted API keys UNRECOVERABLE.');
  console.warn('       Set a dedicated ENCRYPTION_KEY to decouple auth token rotation from data encryption.');
  console.warn('       Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}
if (ENCRYPTION_KEY.length < 16) {
  console.error('[FATAL] ENCRYPTION_KEY (or JWT_SECRET fallback) must be at least 16 characters.');
  process.exit(1);
}
const ALGO = 'aes-256-gcm';
const ENCRYPTION_SALT = process.env.ENCRYPTION_SALT || crypto.createHash('sha256').update(ENCRYPTION_KEY).digest('hex').slice(0, 32);

function deriveKey(secret) {
  return crypto.scryptSync(secret, ENCRYPTION_SALT, 32);
}

function encryptValue(text) {
  if (!text) return null;
  const key = deriveKey(ENCRYPTION_KEY);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + tag + ':' + encrypted;
}

function decryptValue(encrypted) {
  if (!encrypted) return null;
  try {
    const parts = encrypted.split(':');
    if (parts.length !== 3) return null; // Not valid encrypted format - return null instead of leaking raw value
    const key = deriveKey(ENCRYPTION_KEY);
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(parts[2], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch(e) {
    // Log warning for decryption failures - could indicate key rotation or corrupt data
    console.warn('[Decrypt] Failed to decrypt value - returning null. Cause:', e.message);
    return null;
  }
}

function encryptApiKeys(keys) {
  if (!keys || typeof keys !== 'object') return {};
  const encrypted = {};
  for (const [platform, value] of Object.entries(keys)) {
    encrypted[platform] = value ? encryptValue(value) : null;
  }
  return encrypted;
}

function decryptApiKeys(keys) {
  if (!keys || typeof keys !== 'object') return {};
  const decrypted = {};
  for (const [platform, value] of Object.entries(keys)) {
    decrypted[platform] = value ? decryptValue(value) : null;
  }
  return decrypted;
}

function safeUser(u) {
  const plan = u.plan || 'free';
  // Decrypt api_keys to check which platforms have keys set
  const rawKeys = u.api_keys || {};
  const decrypted = decryptApiKeys(rawKeys);
  // Strip sensitive fields from settings before sending to client
  const settings = { ...(u.settings || {}) };
  delete settings.totp_secret;
  delete settings.totp_secret_pending;
  delete settings.totp_backup_codes;
  return { id: u.id, email: u.email, username: u.username || null, name: u.name, plan, role: u.role || null, createdAt: u.created_at,
           emailVerified: u.email_verified || false,
           avatarUrl: u.avatar_url || null,
           hasGoogle: !!u.google_id,
           hasKeys: Object.keys(decrypted).filter(k => decrypted[k]),
           settings,
           totpEnabled: !!(u.settings?.totp_enabled),
           limits: getPlanLimits(plan) };
}

function getServerKeys() {
  // Support multiple keys per platform via:
  //   1. Comma-separated in one var: OPENAI_API_KEY=sk-key1,sk-key2,sk-key3
  //   2. Numbered vars: OPENAI_API_KEY_1=sk-key1, OPENAI_API_KEY_2=sk-key2, etc.
  // Both formats can be combined - all unique keys are merged.
  function parseKeys(envVar) {
    const keys = [];
    // Parse comma-separated keys from base var
    const raw = (process.env[envVar] || '').trim();
    if (raw) {
      raw.split(',').map(k => k.trim()).filter(k => k.length > 0).forEach(k => keys.push(k));
    }
    // Parse numbered vars: ENVVAR_1, ENVVAR_2, ... ENVVAR_10
    for (let i = 1; i <= 10; i++) {
      const numbered = (process.env[envVar + '_' + i] || '').trim();
      if (numbered) {
        numbered.split(',').map(k => k.trim()).filter(k => k.length > 0).forEach(k => keys.push(k));
      }
    }
    // Deduplicate (in case same key appears in both formats)
    return [...new Set(keys)];
  }
  return {
    openai:     parseKeys('OPENAI_API_KEY'),
    perplexity: parseKeys('PERPLEXITY_API_KEY'),
    gemini:     parseKeys('GEMINI_API_KEY'),
    claude:     parseKeys('CLAUDE_API_KEY'),
    grok:       parseKeys('GROK_API_KEY')
  };
}

async function getBrand(brandId, userId) {
  const result = await pool.query('SELECT * FROM brands WHERE id = $1 AND user_id = $2', [brandId, userId]);
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return { id: row.id, userId: row.user_id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at };
}

// Get brand with team access check - returns { brand, role } where role is 'owner', 'editor', or 'viewer'
// Returns null if user has no access at all
async function getBrandWithAccess(brandId, userId) {
  // Check direct ownership first
  const ownResult = await pool.query('SELECT * FROM brands WHERE id = $1 AND user_id = $2', [brandId, userId]);
  if (ownResult.rows.length) {
    const row = ownResult.rows[0];
    return { brand: { id: row.id, userId: row.user_id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at }, role: 'owner' };
  }
  // Check team membership
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

async function saveBrand(brand) {
  const { id, userId, createdAt, updatedAt, ...data } = brand;
  await pool.query(
    'UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(data), id]
  );
}

module.exports = { uid, safeUser, getServerKeys, getBrand, getBrandWithAccess, saveBrand, encryptApiKeys, decryptApiKeys, encryptValue, decryptValue };
