/**
 * Admin routes — user management, plan changes
 */
const express = require('express');
const router  = express.Router();

const { pool, auditLog, notify } = require('../config/db');
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

// Self-service plan change (downgrade to free only; upgrades require DodoPayments)
router.post('/upgrade', auth, async (req, res) => {
  const { plan } = req.body;
  // SECURITY: Never allow self-service upgrade to 'owner' — only admin-assigned
  if (!['free', 'pro', 'agency'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  try {
    const currentUser = await pool.query('SELECT plan, role FROM users WHERE id = $1', [req.user.id]);
    if (!currentUser.rows.length) return res.status(404).json({ error: 'User not found' });
    const currentPlan = currentUser.rows[0].plan || 'free';
    const tiers = { free: 0, pro: 1, agency: 2, owner: 3 };
    // Block any upgrade attempt — upgrades must go through DodoPayments checkout
    if ((tiers[plan] || 0) > (tiers[currentPlan] || 0)) {
      return res.status(403).json({ error: 'Payment required for plan upgrades. Use the upgrade button to proceed with payment.' });
    }
    const result = await pool.query(
      'UPDATE users SET plan = $1 WHERE id = $2 RETURNING *',
      [plan, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    auditLog(req.user.id, 'plan_change', 'user', req.user.id, { from: currentPlan, to: plan }, req.ip);
    res.json({ user: safeUser(result.rows[0]), message: `Plan updated to ${plan}` });
  } catch(e) {
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

// Stripe webhook stub — handle payment confirmation
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  // TODO: Verify Stripe signature with STRIPE_WEBHOOK_SECRET
  // const sig = req.headers['stripe-signature'];
  // const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  console.log('[Stripe] Webhook received (stub)');
  res.json({ received: true });
});

// Admin middleware
async function requireAdmin(req, res, next) {
  try {
    const adminCheck = await pool.query('SELECT role, plan FROM users WHERE id = $1', [req.user.id]);
    if (!adminCheck.rows[0] || adminCheck.rows[0].role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    // Auto-upgrade admins to owner plan if they aren't already
    if (adminCheck.rows[0].plan !== 'owner') {
      await pool.query('UPDATE users SET plan = $1 WHERE id = $2', ['owner', req.user.id]);
    }
    next();
  } catch(e) {
    console.error('[requireAdmin]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
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
      if (!['free', 'pro', 'agency', 'owner'].includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
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
    auditLog(req.user.id, 'admin_update_user', 'user', req.params.id, { changes: req.body }, req.ip);
    res.json({ user: { ...safeUser(result.rows[0]), brandCount: bc.rows[0]?.cnt || 0 } });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: update user plan (legacy endpoint)
router.put('/admin/users/:id/plan', auth, requireAdmin, async (req, res) => {
  try {
    if (!['free', 'pro', 'agency', 'owner'].includes(req.body.plan)) return res.status(400).json({ error: 'Invalid plan' });
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
    await pool.query('UPDATE users SET role = $1, plan = $2 WHERE id = $3', ['admin', 'owner', req.user.id]);
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

// Auto-fetch nearby areas for a city using AI
router.post('/nearby-areas', auth, async (req, res) => {
  const { city } = req.body;
  if (!city || !city.trim()) return res.status(400).json({ error: 'City is required' });

  const keys = getServerKeys();
  // Pick an available platform (prefer cheaper/faster ones)
  const platformOrder = ['deepseek', 'gemini', 'openai', 'mistral', 'claude', 'perplexity', 'grok'];
  const platformMap = { deepseek: 'DeepSeek', gemini: 'Gemini', openai: 'ChatGPT', mistral: 'Mistral', claude: 'Claude', perplexity: 'Perplexity', grok: 'Grok' };
  let platform = null;
  let apiKey = null;
  for (const p of platformOrder) {
    if (keys[p] && keys[p].length > 0) {
      platform = platformMap[p];
      apiKey = keys[p][0];
      break;
    }
  }
  if (!platform) return res.status(400).json({ error: 'No AI platform API keys configured.' });

  const prompt = `List exactly 10-15 nearby cities, towns, suburbs, and service areas within a 30-mile radius of "${city.trim()}". Return ONLY a JSON array of strings, nothing else. Example format: ["City 1", "City 2", "City 3"]. Include the county/region name and state abbreviation. Do not include the original city itself.`;

  try {
    const { queryAI } = require('../lib/ai-platforms');
    const result = await queryAI(prompt, platform, {}, keys, {});
    if (!result || !result.text) return res.status(500).json({ error: 'AI returned empty response' });

    // Parse the JSON array from the response
    const text = result.text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.status(500).json({ error: 'Could not parse nearby areas from AI response' });

    const areas = JSON.parse(jsonMatch[0])
      .filter(a => typeof a === 'string' && a.trim().length > 0)
      .map(a => a.trim())
      .slice(0, 15);

    if (!areas.length) return res.status(500).json({ error: 'No nearby areas found' });
    res.json({ areas, city: city.trim(), platform });
  } catch(e) {
    console.error('[Nearby Areas]', e.message);
    // SECURITY: Don't expose internal error details to clients
    res.status(500).json({ error: 'Failed to fetch nearby areas. Please try again.' });
  }
});

// Admin: view audit logs
router.get('/admin/audit-logs', auth, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const result = await pool.query(
      `SELECT a.*, u.email AS user_email FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const countResult = await pool.query('SELECT COUNT(*)::int AS total FROM audit_logs');
    res.json({ logs: result.rows, total: countResult.rows[0].total });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

// Data export — full brand data as JSON
router.get('/export/brand/:id', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM brands WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Brand not found' });
    const row = result.rows[0];
    const brandData = { id: row.id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at };
    // Include archived runs
    const archived = await pool.query('SELECT data FROM archived_runs WHERE brand_id = $1 ORDER BY run_date', [req.params.id]);
    brandData.archivedRuns = archived.rows.map(r => r.data);
    res.setHeader('Content-Disposition', `attachment; filename="trackly-${brandData.name || 'brand'}-export.json"`);
    res.json(brandData);
  } catch(e) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// Data export — all brands as JSON
router.get('/export/all', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM brands WHERE user_id = $1 ORDER BY created_at', [req.user.id]);
    const brands = result.rows.map(row => ({ id: row.id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at }));
    const userResult = await pool.query('SELECT email, name, plan, created_at FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0] || {};
    res.setHeader('Content-Disposition', 'attachment; filename="trackly-full-export.json"');
    res.json({ exportDate: new Date().toISOString(), user: { email: user.email, name: user.name, plan: user.plan, createdAt: user.created_at }, brands });
  } catch(e) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// Data export — brand as CSV
router.get('/export/brand/:id/csv', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM brands WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Brand not found' });
    const data = result.rows[0].data;
    const runs = data.runs || [];
    const csvField = (val) => '"' + String(val || '').replace(/"/g, '""').replace(/\n/g, ' ') + '"';
    let rows = ['Date,Platform,Query,Mentioned,Sentiment,Recommended,Model,SOV,Response'];
    runs.forEach(run => {
      (run.allResults || run.mentions || []).forEach(r => {
        rows.push([run.date || '', r.platform || '', r.query || '', r.mentioned ? 'Yes' : 'No', r.sentiment || '', r.recommended ? 'Yes' : 'No', r.model || '', run.sov || 0, r.raw || r.context || ''].map(csvField).join(','));
      });
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="trackly-${data.name || 'brand'}-data.csv"`);
    res.send(rows.join('\n'));
  } catch(e) {
    res.status(500).json({ error: 'CSV export failed' });
  }
});

// ─── Notifications ────────────────────────────────────
router.get('/notifications', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    const unreadCount = await pool.query(
      'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read = FALSE',
      [req.user.id]
    );
    res.json({ notifications: result.rows, unread: unreadCount.rows[0].count });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.post('/notifications/read', auth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (ids && Array.isArray(ids)) {
      await pool.query('UPDATE notifications SET read = TRUE WHERE user_id = $1 AND id = ANY($2::int[])', [req.user.id, ids]);
    } else {
      await pool.query('UPDATE notifications SET read = TRUE WHERE user_id = $1', [req.user.id]);
    }
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// ─── Team / Workspace ─────────────────────────────────
router.get('/team', auth, async (req, res) => {
  try {
    const members = await pool.query(
      `SELECT tm.id, tm.role, tm.created_at, u.id AS user_id, u.email, u.name
       FROM team_members tm JOIN users u ON tm.member_id = u.id
       WHERE tm.owner_id = $1 ORDER BY tm.created_at`,
      [req.user.id]
    );
    res.json({ members: members.rows });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load team' });
  }
});

router.post('/team/invite', auth, async (req, res) => {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const plan = await require('../lib/plans').getUserPlan(req.user.id);
  if (plan !== 'agency' && plan !== 'owner') {
    return res.status(403).json({ error: 'Team members are available on Agency and Owner plans.' });
  }
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (!userResult.rows.length) return res.status(404).json({ error: 'User not found. They must register first.' });
    const memberId = userResult.rows[0].id;
    if (memberId === req.user.id) return res.status(400).json({ error: 'Cannot add yourself as a team member' });
    await pool.query(
      'INSERT INTO team_members (owner_id, member_id, role) VALUES ($1, $2, $3) ON CONFLICT (owner_id, member_id) DO UPDATE SET role = $3',
      [req.user.id, memberId, role || 'viewer']
    );
    await notify(memberId, 'team_invite', 'Team Invitation', `You have been added to a team by ${req.user.email}`, { ownerId: req.user.id });
    auditLog(req.user.id, 'team_invite', 'user', memberId, { email, role: role || 'viewer' }, req.ip);
    res.json({ success: true, message: 'Team member added' });
  } catch(e) {
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

router.delete('/team/:memberId', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM team_members WHERE owner_id = $1 AND member_id = $2', [req.user.id, req.params.memberId]);
    auditLog(req.user.id, 'team_remove', 'user', req.params.memberId, {}, req.ip);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// ─── API Documentation ───────────────────────────────
router.get('/docs', (req, res) => {
  res.json({
    name: 'Trackly API',
    version: '1.0',
    baseUrl: '/api',
    authentication: 'Bearer token in Authorization header. Obtain via POST /api/auth/login.',
    endpoints: [
      { method: 'POST', path: '/api/auth/register', description: 'Register a new account', body: { email: 'string', password: 'string', name: 'string?' } },
      { method: 'POST', path: '/api/auth/login', description: 'Log in and get tokens', body: { email: 'string', password: 'string' } },
      { method: 'POST', path: '/api/auth/refresh', description: 'Refresh access token', body: { refreshToken: 'string' } },
      { method: 'GET', path: '/api/auth/me', description: 'Get current user info', auth: true },
      { method: 'POST', path: '/api/auth/change-password', description: 'Change password', auth: true, body: { currentPassword: 'string', newPassword: 'string' } },
      { method: 'POST', path: '/api/auth/forgot-password', description: 'Request password reset', body: { email: 'string' } },
      { method: 'POST', path: '/api/auth/reset-password', description: 'Reset password with token', body: { token: 'string', newPassword: 'string' } },
      { method: 'GET', path: '/api/auth/verify-email', description: 'Verify email with token', query: { token: 'string' } },
      { method: 'GET', path: '/api/brands', description: 'List all brands', auth: true },
      { method: 'POST', path: '/api/brands', description: 'Create a brand', auth: true, body: { name: 'string', industry: 'string?', website: 'string?', city: 'string?' } },
      { method: 'GET', path: '/api/brands/:id', description: 'Get a brand', auth: true },
      { method: 'PUT', path: '/api/brands/:id', description: 'Update a brand', auth: true },
      { method: 'DELETE', path: '/api/brands/:id', description: 'Delete a brand', auth: true },
      { method: 'POST', path: '/api/brands/:id/run', description: 'Run AI queries for a brand', auth: true },
      { method: 'GET', path: '/api/keys/status', description: 'Get API key status', auth: true },
      { method: 'GET', path: '/api/plans', description: 'Get plan information', auth: true },
      { method: 'POST', path: '/api/upgrade', description: 'Change plan (downgrade or request upgrade)', auth: true, body: { plan: 'free|pro|agency' } },
      { method: 'GET', path: '/api/models', description: 'Get available AI models', auth: true },
      { method: 'GET', path: '/api/settings', description: 'Get user settings', auth: true },
      { method: 'PUT', path: '/api/settings', description: 'Update user settings', auth: true },
      { method: 'GET', path: '/api/notifications', description: 'Get notifications', auth: true },
      { method: 'POST', path: '/api/notifications/read', description: 'Mark notifications as read', auth: true },
      { method: 'GET', path: '/api/team', description: 'List team members', auth: true },
      { method: 'POST', path: '/api/team/invite', description: 'Invite team member (Agency+)', auth: true, body: { email: 'string', role: 'viewer|editor?' } },
      { method: 'GET', path: '/api/export/all', description: 'Export all brands as JSON', auth: true },
      { method: 'GET', path: '/api/export/brand/:id', description: 'Export brand as JSON', auth: true },
      { method: 'GET', path: '/api/export/brand/:id/csv', description: 'Export brand as CSV', auth: true },
      { method: 'GET', path: '/api/health', description: 'Health check' },
      { method: 'GET', path: '/api/docs', description: 'This API documentation' }
    ]
  });
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
