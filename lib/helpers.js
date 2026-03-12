/**
 * Shared utility helpers
 */
const crypto = require('crypto');
const { pool } = require('../config/db');
const { getPlanLimits } = require('./plans');

function uid() {
  return Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

function safeUser(u) {
  const plan = u.plan || 'free';
  return { id: u.id, email: u.email, name: u.name, plan, role: u.role || null, createdAt: u.created_at,
           emailVerified: u.email_verified || false,
           hasKeys: Object.keys(u.api_keys||{}).filter(k => u.api_keys[k]),
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

module.exports = { uid, safeUser, getServerKeys, getBrand, saveBrand };
