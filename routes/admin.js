/**
 * Admin routes — user management, plan changes
 */
const express = require('express');
const router  = express.Router();

const { pool } = require('../config/db');
const { auth } = require('../middleware/auth');
const { safeUser, getServerKeys } = require('../lib/helpers');
const { PLAN_LIMITS, getPlanLimits } = require('../lib/plans');
const { PLATFORM_MODELS } = require('../lib/ai-platforms');

// API key status
router.get('/keys/status', auth, (req, res) => {
  const keys = getServerKeys();
  res.json({
    openai: keys.openai.length > 0, perplexity: keys.perplexity.length > 0,
    gemini: keys.gemini.length > 0, claude: keys.claude.length > 0,
    grok: keys.grok.length > 0, deepseek: keys.deepseek.length > 0, mistral: keys.mistral.length > 0
  });
});

// Plan info
router.get('/plans', auth, (req, res) => {
  res.json({ plans: PLAN_LIMITS, current: null });
});

// Self-service plan change (downgrade to free only; upgrades require payment integration)
router.post('/upgrade', auth, async (req, res) => {
  const { plan } = req.body;
  if (!['free', 'pro', 'agency'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  // Only allow downgrade to free without payment verification
  // TODO: Integrate Stripe or payment provider for pro/agency upgrades
  const currentUser = await pool.query('SELECT plan FROM users WHERE id = $1', [req.user.id]);
  if (!currentUser.rows.length) return res.status(404).json({ error: 'User not found' });
  const currentPlan = currentUser.rows[0].plan || 'free';
  const tiers = { free: 0, pro: 1, agency: 2 };
  if (tiers[plan] > tiers[currentPlan]) {
    return res.status(403).json({ error: 'Payment required for plan upgrades. Contact support or use the billing portal.' });
  }
  try {
    const result = await pool.query(
      'UPDATE users SET plan = $1 WHERE id = $2 RETURNING *',
      [plan, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: safeUser(result.rows[0]), message: `Plan updated to ${plan}` });
  } catch(e) {
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

// Admin middleware
async function requireAdmin(req, res, next) {
  const adminCheck = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
  if (!adminCheck.rows[0] || adminCheck.rows[0].role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// Admin: list users with brand counts
router.get('/admin/users', auth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.*, COUNT(b.id)::int AS brand_count
      FROM users u LEFT JOIN brands b ON b.user_id = u.id
      GROUP BY u.id ORDER BY u.created_at
    `);
    const users = result.rows.map(row => ({ ...safeUser(row), brandCount: row.brand_count || 0 }));
    res.json({ users, total: users.length });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: update user (plan, name, email, role)
router.put('/admin/users/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { plan, name, email, role } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (plan !== undefined) {
      if (!['free', 'pro', 'agency'].includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
      updates.push(`plan = $${idx++}`);
      values.push(plan);
    }
    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(name.trim());
    }
    if (email !== undefined) {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return res.status(400).json({ error: 'Invalid email' });
      // Check uniqueness
      const dup = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [trimmed, req.params.id]);
      if (dup.rows.length) return res.status(400).json({ error: 'Email already in use' });
      updates.push(`email = $${idx++}`);
      values.push(trimmed);
    }
    if (role !== undefined) {
      if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      // Prevent removing own admin role
      if (req.params.id === req.user.id && role !== 'admin') return res.status(400).json({ error: 'Cannot remove your own admin role' });
      updates.push(`role = $${idx++}`);
      values.push(role === 'user' ? null : role);
    }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    const result = await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    // Get brand count
    const bc = await pool.query('SELECT COUNT(*)::int AS cnt FROM brands WHERE user_id = $1', [req.params.id]);
    res.json({ user: { ...safeUser(result.rows[0]), brandCount: bc.rows[0]?.cnt || 0 } });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: update user plan (legacy endpoint)
router.put('/admin/users/:id/plan', auth, requireAdmin, async (req, res) => {
  try {
    if (!['free', 'pro', 'agency'].includes(req.body.plan)) return res.status(400).json({ error: 'Invalid plan' });
    const result = await pool.query('UPDATE users SET plan = $1 WHERE id = $2 RETURNING *', [req.body.plan, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: safeUser(result.rows[0]) });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Check if any admin exists
router.get('/admin/check-admin', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
    res.json({ hasAdmin: result.rows.length > 0 });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Make current user admin (if no admin exists yet)
router.post('/admin/make-first-admin', auth, async (req, res) => {
  try {
    const adminCheck = await pool.query('SELECT id FROM users WHERE role = $1', ['admin']);
    if (adminCheck.rows.length) return res.status(400).json({ error: 'Admin already exists' });
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', req.user.id]);
    res.json({ success: true, email: req.user.email });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Available models per platform
router.get('/models', auth, (req, res) => {
  res.json({ models: PLATFORM_MODELS });
});

// Get/Update user settings (model preferences)
router.get('/settings', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT settings FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ settings: result.rows[0].settings || {} });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/settings', auth, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'Invalid settings' });
    // Validate model selections
    const modelPrefs = settings.models || {};
    for (const [platform, modelId] of Object.entries(modelPrefs)) {
      const platformModels = PLATFORM_MODELS[platform];
      if (!platformModels) continue;
      const valid = platformModels.some(m => m.id === modelId);
      if (!valid) {
        return res.status(400).json({ error: `Invalid model "${modelId}" for ${platform}` });
      }
    }
    const result = await pool.query(
      'UPDATE users SET settings = settings || $1::jsonb WHERE id = $2 RETURNING *',
      [JSON.stringify(settings), req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ settings: result.rows[0].settings || {}, message: 'Settings saved' });
  } catch(e) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Query suggestions
const QUERY_TEMPLATES = {
  'HVAC':        ['best {industry} company in {city}','top rated AC repair in {city}','who is the best heating and cooling company in {city}','best {industry} near me','emergency AC repair {city}','most reliable HVAC company {city}','best furnace repair in {city}','top {industry} contractors in {city}'],
  'Plumbing':    ['best plumber in {city}','top rated plumbing company {city}','emergency plumber near {city}','who is the best plumbing contractor in {city}','best drain cleaning service {city}','most reliable plumber {city}','best water heater repair {city}'],
  'Roofing':     ['best roofing company in {city}','top rated roofers {city}','who is the best roofing contractor in {city}','best roof repair in {city}','most reliable roofing company {city}','best metal roof installers {city}'],
  'Landscaping': ['best landscaping company in {city}','top rated lawn care in {city}','best landscape design {city}','most reliable landscaper {city}','best tree service in {city}','best lawn maintenance company {city}'],
  'Dental':      ['best dentist in {city}','top rated dental clinic {city}','best cosmetic dentist {city}','best family dentist in {city}','who is the best dentist near {city}','best dental implants {city}'],
  'Legal':       ['best lawyer in {city}','top rated attorney {city}','best personal injury lawyer {city}','best family lawyer in {city}','who is the best law firm in {city}','best criminal defense attorney {city}'],
  'Restaurant':  ['best restaurants in {city}','top rated places to eat {city}','best food in {city}','where to eat in {city}','best new restaurants {city}','best brunch in {city}'],
  'Real Estate': ['best real estate agent in {city}','top realtors in {city}','best property management company {city}','who is the best realtor in {city}','best real estate company {city}'],
  'Auto Repair': ['best auto mechanic in {city}','top rated auto repair shop {city}','best car repair in {city}','most reliable mechanic {city}','best transmission repair {city}'],
  'Cleaning':    ['best cleaning service in {city}','top rated house cleaning {city}','best commercial cleaning company {city}','most reliable cleaning service {city}','best maid service {city}'],
  '_default':    ['best {industry} in {city}','top rated {industry} company {city}','who is the best {industry} provider in {city}','best {industry} near me','most recommended {industry} in {city}','top {industry} companies','best {industry} service {city}','leading {industry} providers in {city}']
};

router.get('/query-suggestions', auth, (req, res) => {
  const industry = (req.query.industry || '').trim();
  const city = (req.query.city || '').trim();
  if (!industry && !city) return res.json({ suggestions: [] });

  const industryLower = industry.toLowerCase();
  let templateKey = '_default';
  for (const key of Object.keys(QUERY_TEMPLATES)) {
    if (key === '_default') continue;
    if (industryLower.includes(key.toLowerCase()) || key.toLowerCase().includes(industryLower)) {
      templateKey = key;
      break;
    }
  }

  const templates = QUERY_TEMPLATES[templateKey];
  const suggestions = templates.map(t =>
    t.replace(/\{industry\}/g, industry || 'service').replace(/\{city\}/g, city || 'my area')
  );
  res.json({ suggestions });
});

// Health check (no sensitive data exposed)
router.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', time: new Date().toISOString() });
  } catch(e) {
    res.status(503).json({ status: 'error', time: new Date().toISOString() });
  }
});

module.exports = router;
