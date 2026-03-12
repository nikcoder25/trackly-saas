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
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'trackly-dev-encryption-key';
const ALGO = 'aes-256-gcm';

function deriveKey(secret) {
  return crypto.scryptSync(secret, 'trackly-salt', 32);
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
    if (parts.length !== 3) return encrypted; // Not encrypted (legacy plain text)
    const key = deriveKey(ENCRYPTION_KEY);
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(parts[2], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch(e) {
    return encrypted; // Return as-is if decryption fails (legacy data)
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
  return { id: u.id, email: u.email, name: u.name, plan, role: u.role || null, createdAt: u.created_at,
           emailVerified: u.email_verified || false,
           hasKeys: Object.keys(decrypted).filter(k => decrypted[k]),
           settings: u.settings || {},
           limits: getPlanLimits(plan) };
}

function getServerKeys() {
  // Support multiple keys per platform (comma-separated)
  // e.g. OPENAI_API_KEY=sk-key1,sk-key2,sk-key3
  function parseKeys(envVar) {
    const raw = (process.env[envVar] || '').trim();
    if (!raw) return [];
    return raw.split(',').map(k => k.trim()).filter(k => k.length > 0);
  }
  return {
    openai:     parseKeys('OPENAI_API_KEY'),
    perplexity: parseKeys('PERPLEXITY_API_KEY'),
    gemini:     parseKeys('GEMINI_API_KEY'),
    claude:     parseKeys('CLAUDE_API_KEY'),
    grok:       parseKeys('GROK_API_KEY'),
    deepseek:   parseKeys('DEEPSEEK_API_KEY'),
    mistral:    parseKeys('MISTRAL_API_KEY')
  };
}

async function getBrand(brandId, userId) {
  const result = await pool.query('SELECT * FROM brands WHERE id = $1 AND user_id = $2', [brandId, userId]);
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return { id: row.id, userId: row.user_id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function saveBrand(brand) {
  const { id, userId, createdAt, updatedAt, ...data } = brand;
  await pool.query(
    'UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(data), id]
  );
}

module.exports = { uid, safeUser, getServerKeys, getBrand, saveBrand, encryptApiKeys, decryptApiKeys, encryptValue, decryptValue };
