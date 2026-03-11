/**
 * Shared utility helpers
 */
const { pool } = require('../config/db');
const { getPlanLimits } = require('./plans');

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function safeUser(u) {
  const plan = u.plan || 'free';
  return { id: u.id, email: u.email, name: u.name, plan, role: u.role || null, createdAt: u.created_at,
           hasKeys: Object.keys(u.api_keys||{}).filter(k => u.api_keys[k]),
           settings: u.settings || {},
           limits: getPlanLimits(plan) };
}

function getServerKeys() {
  return {
    openai:     (process.env.OPENAI_API_KEY     || '').trim(),
    perplexity: (process.env.PERPLEXITY_API_KEY || '').trim(),
    gemini:     (process.env.GEMINI_API_KEY     || '').trim(),
    claude:     (process.env.CLAUDE_API_KEY     || '').trim(),
    grok:       (process.env.GROK_API_KEY       || '').trim(),
    deepseek:   (process.env.DEEPSEEK_API_KEY   || '').trim(),
    mistral:    (process.env.MISTRAL_API_KEY    || '').trim()
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
