/**
 * Trackly - AI Visibility Tracker SaaS Server
 * Stack: Node.js + Express + PostgreSQL + JWT auth
 * Storage: PostgreSQL (persistent across deployments)
 */

require('dotenv').config();
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const cron     = require('node-cron');
const fs       = require('fs');
const path     = require('path');
const https    = require('https');
const http     = require('http');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;

// JWT Secret — MUST be set in environment variables for persistent auth across deploys
const JWT_SECRET = process.env.JWT_SECRET || 'trackly-dev-secret-change-me';
if (!process.env.JWT_SECRET) console.warn('[WARN] JWT_SECRET not set in environment! Tokens will not survive redeploy.');

// ─── POSTGRESQL DATABASE ──────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        password_hash TEXT NOT NULL,
        plan TEXT DEFAULT 'free',
        role TEXT,
        api_keys JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS brands (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_brands_user_id ON brands(user_id);
    `);
    console.log('[DB] PostgreSQL tables ready');
  } finally {
    client.release();
  }
}
initDB().catch(e => {
  console.error('[DB] Failed to initialize PostgreSQL:', e.message);
  process.exit(1);
});

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// JWT Auth middleware
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── AUTH ROUTES ─────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length) return res.status(400).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const id = uid();
    const userName = name || email.split('@')[0];
    await pool.query(
      'INSERT INTO users (id, email, name, password_hash, plan) VALUES ($1, $2, $3, $4, $5)',
      [id, email.toLowerCase(), userName, hash, 'free']
    );

    const token = jwt.sign({ id, email: email.toLowerCase() }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id, email: email.toLowerCase(), name: userName, plan: 'free', createdAt: new Date().toISOString(), hasKeys: [] } });
  } catch(e) {
    console.error('[Register]', e.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: safeUser(user) });
  } catch(e) {
    console.error('[Login]', e.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: safeUser(user) });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

function safeUser(u) {
  return { id: u.id, email: u.email, name: u.name, plan: u.plan, createdAt: u.created_at,
           hasKeys: Object.keys(u.api_keys||{}).filter(k => u.api_keys[k]) };
}

// ─── API KEYS (from server environment variables — SaaS mode) ────
// Keys are configured by the platform admin via .env / environment variables
// Users don't need to provide their own keys
function getServerKeys() {
  return {
    openai:     process.env.OPENAI_API_KEY     || '',
    perplexity: process.env.PERPLEXITY_API_KEY || '',
    gemini:     process.env.GEMINI_API_KEY     || '',
    claude:     process.env.CLAUDE_API_KEY     || '',
    grok:       process.env.GROK_API_KEY       || ''
  };
}

app.get('/api/keys/status', auth, (req, res) => {
  const keys = getServerKeys();
  res.json({
    openai:     !!keys.openai,
    perplexity: !!keys.perplexity,
    gemini:     !!keys.gemini,
    claude:     !!keys.claude,
    grok:       !!keys.grok
  });
});

// ─── BRAND HELPERS ────────────────────────────────────────────────
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

// ─── BRAND ROUTES ─────────────────────────────────────────────────
app.get('/api/brands', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM brands WHERE user_id = $1 ORDER BY created_at', [req.user.id]);
    const brands = result.rows.map(row => ({ id: row.id, userId: row.user_id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at }));
    res.json({ brands });
  } catch(e) {
    console.error('[Brands GET]', e.message);
    res.status(500).json({ error: 'Failed to load brands' });
  }
});

app.post('/api/brands', auth, async (req, res) => {
  try {
    const { name, industry, website, city, goal } = req.body;
    if (!name) return res.status(400).json({ error: 'Brand name required' });

    // Plan limits
    const countResult = await pool.query('SELECT COUNT(*) FROM brands WHERE user_id = $1', [req.user.id]);
    const userResult = await pool.query('SELECT plan FROM users WHERE id = $1', [req.user.id]);
    const plan = userResult.rows[0]?.plan || 'free';
    const limits = { free: 1, pro: 5, agency: 20 };
    const limit = limits[plan];
    if (parseInt(countResult.rows[0].count) >= limit) {
      return res.status(403).json({ error: `Your ${plan} plan allows up to ${limit} brand(s). Upgrade to add more.` });
    }

    const id = uid();
    const data = {
      name, industry: industry||'', website: website||'', city: city||'',
      goal: goal || 70,
      competitors: [],
      queries: city
        ? [
          `What is the best ${industry||'service'} company in ${city}?`,
          `Who are the top ${industry||'service'} providers in ${city}?`,
          `Best ${industry||'service'} recommendations in ${city}`
        ]
        : [
          `What is the best ${industry||'service'} company?`,
          `Who are the top ${industry||'service'} providers?`,
          `Best ${industry||'service'} recommendations`
        ],
      runs: [],
      mentions: [],
      queryStats: {},
      sovHistory: [],
      citations: {},
      notes: {},
      schedule: null
    };
    await pool.query(
      'INSERT INTO brands (id, user_id, data) VALUES ($1, $2, $3)',
      [id, req.user.id, JSON.stringify(data)]
    );
    const brand = { id, userId: req.user.id, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    res.json({ brand });
  } catch(e) {
    console.error('[Brand POST]', e.message);
    res.status(500).json({ error: 'Failed to create brand' });
  }
});

app.get('/api/brands/:id', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    res.json({ brand });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/brands/:id', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    // Merge updates (protect id and userId)
    const updated = { ...brand, ...req.body, id: brand.id, userId: req.user.id, updatedAt: new Date().toISOString() };
    await saveBrand(updated);
    res.json({ brand: updated });
  } catch(e) {
    console.error('[Brand PUT]', e.message);
    res.status(500).json({ error: 'Failed to update brand' });
  }
});

app.delete('/api/brands/:id', auth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM brands WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Brand not found' });
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Failed to delete brand' });
  }
});

// ─── RUN QUERIES (server-side AI calls) ───────────────────────────
app.post('/api/brands/:id/run', auth, async (req, res) => {
  const brand = await getBrand(req.params.id, req.user.id);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  // Use server-side API keys (SaaS mode — admin configures keys via env vars)
  const keys = getServerKeys();

  const PLATFORM_KEY_MAP = {
    'ChatGPT': 'openai', 'Perplexity': 'perplexity', 'Claude': 'claude',
    'Gemini': 'gemini', 'Grok': 'grok', 'Google AIO': 'gemini'
  };
  const queries = brand.queries || [];
  if (!queries.length) return res.status(400).json({ error: 'No queries configured' });

  // Only query platforms with valid API keys — no fake/simulated data
  const availablePlatforms = Object.entries(PLATFORM_KEY_MAP)
    .filter(([, keyName]) => keys[keyName])
    .map(([plat]) => plat);

  if (!availablePlatforms.length) {
    return res.status(400).json({ error: 'No AI platforms configured. Please contact support.' });
  }

  // Filter by user-selected platforms — from request body or brand settings
  const requestedPlatforms = req.body.platforms || brand.platforms;
  const activePlatforms = (requestedPlatforms && Array.isArray(requestedPlatforms) && requestedPlatforms.length)
    ? availablePlatforms.filter(p => requestedPlatforms.includes(p))
    : availablePlatforms;

  if (!activePlatforms.length) {
    return res.status(400).json({ error: 'No valid platforms selected.' });
  }

  const newMentions = [];
  const allResults = [];
  const platSOV = {};
  let totalQ = 0, totalM = 0;

  for (const plat of activePlatforms) {
    let pm = 0;
    for (const q of queries) {
      try {
        const result = await queryAI(q, plat, brand, keys);
        if (!result) continue; // No API key — skip

        const { text, simulated, citations: extraCites, model: modelUsed } = result;
        const parsed = parseResponse(text, brand, q);
        parsed.simulated = false; // Always real — no more simulated
        if (extraCites && extraCites.length) parsed.cites = [...extraCites, ...parsed.cites].slice(0,10);
        totalQ++;

        // Store every result for proof section — full unmodified response
        allResults.push({
          platform: plat, query: q,
          context: text.substring(0, 300), raw: text,
          simulated: false, mentioned: parsed.mentioned,
          sentiment: parsed.sentiment, recommended: parsed.recommended,
          citations: parsed.cites, model: modelUsed || plat,
          locationRelevant: parsed.locationRelevant,
          matchedLocation: parsed.matchedLocation || ''
        });

        if (parsed.mentioned) {
          pm++; totalM++;
          newMentions.push({
            id: uid(), platform: plat, query: q,
            context: text.substring(0, 300), raw: text,
            sentiment: parsed.sentiment, recommended: parsed.recommended,
            citations: parsed.cites, simulated: false,
            model: modelUsed || plat,
            locationRelevant: parsed.locationRelevant,
            matchedLocation: parsed.matchedLocation || '',
            time: new Date().toISOString()
          });
        }
      } catch(e) {
        console.error(`[${plat}] API error for query "${q}":`, e.message);
        // Store error result so user knows what happened — don't fake it
        allResults.push({
          platform: plat, query: q,
          context: `[API Error] ${e.message}`, raw: `[API Error] ${e.message}`,
          simulated: false, mentioned: false,
          sentiment: 'neutral', recommended: false,
          citations: [], error: true, errorMessage: e.message
        });
        totalQ++;
      }
    }
    platSOV[plat] = queries.length > 0 ? Math.round((pm / queries.length) * 100) : 0;
  }

  const sov = totalQ > 0 ? Math.round((totalM / totalQ) * 100) : 0;
  const today = new Date().toISOString().split('T')[0];

  // Save run snapshot — keep ALL runs (don't overwrite same-day runs)
  if (!brand.runs) brand.runs = [];
  brand.runs.push({ id: uid(), date: today, time: new Date().toISOString(), mentions: newMentions, allResults, sov, platforms: platSOV, totalQ, totalM, queries: [...queries], activePlatforms: [...activePlatforms] });
  if (brand.runs.length > 50) brand.runs = brand.runs.slice(-50);

  // Rebuild queryStats
  const qsNew = {};
  queries.forEach(q => { qsNew[q] = { runs: 0, mentions: 0 }; });
  brand.runs.forEach(run => {
    queries.forEach(q => {
      if (!qsNew[q]) qsNew[q] = { runs: 0, mentions: 0 };
      qsNew[q].runs++;
      if ((run.mentions||[]).some(m => m.query === q)) qsNew[q].mentions++;
    });
  });
  brand.queryStats = qsNew;

  // Rebuild citations
  const citMap = {};
  brand.runs.forEach(r => {
    (r.mentions||[]).forEach(m => {
      (m.citations||[]).forEach(url => {
        if (!citMap[url]) citMap[url] = { url, count: 0 };
        citMap[url].count++;
      });
    });
  });
  brand.citations = citMap;

  // Update all-time mentions (deduplicated)
  if (!brand.mentions) brand.mentions = [];
  const keys2 = new Set(brand.mentions.map(m => m.platform+'|'+m.query+'|'+m.time.split('T')[0]));
  const deduped = newMentions.filter(m => !keys2.has(m.platform+'|'+m.query+'|'+m.time.split('T')[0]));
  brand.mentions = [...deduped, ...brand.mentions].slice(0, 500);

  // SOV history — keep latest entry per day for trend tracking
  if (!brand.sovHistory) brand.sovHistory = [];
  brand.sovHistory = brand.sovHistory.filter(h => h.date !== today);
  brand.sovHistory.push({ date: today, overall: sov, platforms: platSOV });
  if (brand.sovHistory.length > 90) brand.sovHistory = brand.sovHistory.slice(-90);

  brand.updatedAt = new Date().toISOString();
  await saveBrand(brand);

  const errorCount = allResults.filter(r => r.error).length;
  res.json({ brand, result: { totalQ, totalM, sov, newMentions: newMentions.length, activePlatforms: activePlatforms.length, skippedPlatforms: 6 - activePlatforms.length, errorCount } });
});

// ─── AI QUERY FUNCTIONS (server-side) ─────────────────────────────
async function queryAI(query, platform, brand, keys) {
  // Send ONLY the raw query — no brand name, city, or industry injection
  const rawQuery = query;

  // ── Only query platforms that have valid API keys — no simulation fallback ──
  if (platform === 'ChatGPT' && keys.openai)
    return await callOpenAI(rawQuery, keys.openai, 'gpt-4o');

  if (platform === 'Perplexity' && keys.perplexity)
    return await callPerplexity(rawQuery, keys.perplexity);

  if (platform === 'Gemini' && keys.gemini)
    return await callGemini(rawQuery, keys.gemini);

  if (platform === 'Grok' && keys.grok)
    return await callGrok(rawQuery, keys.grok);

  if (platform === 'Claude' && keys.claude)
    return await callClaude(rawQuery, keys.claude);

  if (platform === 'Google AIO' && keys.gemini)
    return await callGeminiWithSearch(rawQuery, keys.gemini);

  // No API key for this platform — skip it (don't simulate)
  return null;
}

// buildPrompt removed — we now send only the raw query with no brand injection.
// The whole point of an AI rank tracker is to see if the AI naturally knows your brand.

async function fetchJSON(url, options) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const body = options.body;
    const reqOptions = {
      method: options.method || 'POST',
      headers: options.headers || {},
      timeout: 45000, // 45 second connection timeout
    };
    if (body) reqOptions.headers['Content-Length'] = Buffer.byteLength(body);

    const req = lib.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Invalid JSON response from ' + new URL(url).hostname + ': ' + data.substring(0, 200))); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout after 45s to ' + new URL(url).hostname)); });
    req.on('error', reject);
    // Overall response timeout — 60 seconds max
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Response timeout after 60s to ' + new URL(url).hostname)); });
    if (body) req.write(body);
    req.end();
  });
}

// System prompt — encourages AI to give specific named recommendations
// Does NOT inject brand name — we want to see if AI naturally knows the brand
const SYSTEM_PROMPT = 'You are a helpful recommendation assistant. When asked about businesses, services, or products, always provide specific company names, brands, or providers. Never say you cannot provide recommendations. Give concrete, named suggestions based on your knowledge. If asked about a specific location, name real businesses in that area.';

async function callOpenAI(query, apiKey, model) {
  const useModel = model || 'gpt-4o';
  const body = JSON.stringify({
    model: useModel, max_tokens: 4000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query }
    ]
  });
  const d = await fetchJSON('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return { text: d.choices?.[0]?.message?.content || '', simulated: false, citations: [], model: d.model || useModel };
}

async function callPerplexity(query, apiKey) {
  const body = JSON.stringify({
    model: 'sonar-pro',
    max_tokens: 4000,
    return_citations: true,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query }
    ]
  });
  const d = await fetchJSON('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body
  });
  if (d.error) throw new Error(JSON.stringify(d.error));
  return {
    text: d.choices?.[0]?.message?.content || '',
    simulated: false,
    citations: (d.citations || []).slice(0, 10),
    model: d.model || 'sonar-pro'
  };
}

async function callGemini(query, apiKey) {
  const geminiModel = 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=` + apiKey;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: query }] }],
    generationConfig: { maxOutputTokens: 4000 }
  });
  const d = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return { text: d.candidates?.[0]?.content?.parts?.[0]?.text || '', simulated: false, citations: [], model: geminiModel };
}

async function callGeminiWithSearch(query, apiKey) {
  const geminiModel = 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=` + apiKey;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: query }] }],
    tools: [{ google_search: {} }],             // Enable grounding for AIO-like results
    generationConfig: { maxOutputTokens: 4000 }
  });
  const d = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));

  // Extract grounding citations from Google Search results
  const citations = [];
  try {
    const groundingMeta = d.candidates?.[0]?.groundingMetadata;
    if (groundingMeta) {
      const chunks = groundingMeta.groundingChunks || [];
      chunks.forEach(chunk => {
        if (chunk.web && chunk.web.uri) citations.push(chunk.web.uri);
      });
      const supports = groundingMeta.groundingSupports || [];
      supports.forEach(s => {
        (s.groundingChunkIndices || []).forEach(idx => {
          if (chunks[idx]?.web?.uri && !citations.includes(chunks[idx].web.uri)) {
            citations.push(chunks[idx].web.uri);
          }
        });
      });
    }
  } catch(e) { /* ignore citation extraction errors */ }

  return { text: d.candidates?.[0]?.content?.parts?.[0]?.text || '', simulated: false, citations: citations.slice(0, 10), model: geminiModel + ' (with Search)' };
}

async function callGrok(query, apiKey) {
  const grokModel = 'grok-3-mini';
  const body = JSON.stringify({
    model: grokModel,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query }
    ]
  });
  const d = await fetchJSON('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  if (!d.choices || !d.choices[0]) throw new Error('Grok API returned empty response');
  return { text: d.choices[0].message.content || '', simulated: false, citations: [], model: d.model || grokModel };
}

async function callClaude(query, apiKey) {
  const claudeModel = 'claude-sonnet-4-20250514';
  const body = JSON.stringify({
    model: claudeModel,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: query }]
  });
  const d = await fetchJSON('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return { text: d.content?.[0]?.text || '', simulated: false, citations: [], model: d.model || claudeModel };
}

// ─── RESPONSE PARSING (post-response analysis — no brand injection) ───────
function parseResponse(text, brand, query) {
  if (!text || !brand.name) return { mentioned: false, recommended: false, sentiment: 'neutral', cites: [], simulated: false };

  const lower = text.toLowerCase();
  const brandLower = brand.name.toLowerCase().trim();

  // Brand mention detection — multi-strategy approach for accurate tracking
  let mentioned = false;
  let matchPosition = -1;

  // Strategy 1: Exact match (case-insensitive)
  const exactIdx = lower.indexOf(brandLower);
  if (exactIdx !== -1) {
    mentioned = true;
    matchPosition = exactIdx;
  }

  // Strategy 2: Match without punctuation (McDonald's → McDonalds, O'Brien → OBrien)
  if (!mentioned) {
    const brandNoPunc = brandLower.replace(/[''`\-.,&!]/g, '');
    const textNoPunc = lower.replace(/[''`\-.,&!]/g, '');
    const noPuncIdx = textNoPunc.indexOf(brandNoPunc);
    if (noPuncIdx !== -1 && brandNoPunc.length >= 3) {
      mentioned = true;
      matchPosition = noPuncIdx;
    }
  }

  // Strategy 3: Match with common separators collapsed (Cool Air Pro → CoolAirPro, Cool-Air-Pro)
  if (!mentioned) {
    const brandNoSpace = brandLower.replace(/[\s\-_]+/g, '');
    const textNoSpace = lower.replace(/[\s\-_]+/g, '');
    if (brandNoSpace.length >= 4 && textNoSpace.includes(brandNoSpace)) {
      mentioned = true;
      matchPosition = lower.indexOf(brandLower.split(/\s+/)[0]); // approx position
    }
  }

  // Strategy 4: Word-boundary fuzzy match — all significant words appear NEAR each other
  // Only for multi-word brand names, requires words to appear within 100 chars of each other
  if (!mentioned) {
    const words = brandLower.split(/\s+/).filter(w => w.length > 2);
    if (words.length >= 2) {
      // Find positions of each word using word boundaries to avoid false positives
      const wordPositions = words.map(w => {
        const rx = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        const m = rx.exec(lower);
        return m ? m.index : -1;
      });

      // All words must be found AND within 150 chars of each other (proximity check)
      if (wordPositions.every(p => p !== -1)) {
        const minPos = Math.min(...wordPositions);
        const maxPos = Math.max(...wordPositions);
        if (maxPos - minPos <= 150) {
          mentioned = true;
          matchPosition = minPos;
        }
      }
    }
  }

  // Strategy 5: Check brand website domain in response (e.g., "coolairpro.com")
  if (!mentioned && brand.website) {
    const domain = brand.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    if (domain && domain.length > 3 && lower.includes(domain)) {
      mentioned = true;
      matchPosition = lower.indexOf(domain);
    }
  }

  // Strategy 6: Check ALL aliases — user-defined alternate names, abbreviations, domain variations
  if (!mentioned && brand.aliases && brand.aliases.length) {
    for (const alias of brand.aliases) {
      const aliasLower = alias.toLowerCase().trim();
      if (aliasLower.length < 2) continue;
      const aliasIdx = lower.indexOf(aliasLower);
      if (aliasIdx !== -1) {
        mentioned = true;
        matchPosition = aliasIdx;
        break;
      }
      // Also try without punctuation
      const aliasNoPunc = aliasLower.replace(/[''`\-.,&!]/g, '');
      const textNoPunc = lower.replace(/[''`\-.,&!]/g, '');
      if (aliasNoPunc.length >= 3 && textNoPunc.includes(aliasNoPunc)) {
        mentioned = true;
        matchPosition = textNoPunc.indexOf(aliasNoPunc);
        break;
      }
    }
  }

  // ─── Location-aware detection ───
  // If brand is mentioned AND query has no location, verify the response
  // mentions the brand's city or nearby areas (to avoid false positives for generic queries)
  let locationRelevant = true; // default: relevant
  let matchedLocation = '';

  if (mentioned && brand.city && query) {
    const queryLower = (query || '').toLowerCase();
    const cityLower = brand.city.toLowerCase().trim();
    const allLocations = [cityLower];

    // Add nearby areas
    if (brand.nearbyAreas && brand.nearbyAreas.length) {
      brand.nearbyAreas.forEach(a => allLocations.push(a.toLowerCase().trim()));
    }

    // Check if query already contains a location — if yes, don't add extra location check
    const queryHasLocation = allLocations.some(loc => queryLower.includes(loc)) ||
      /\b(in|near|around|at)\s+[A-Z]/i.test(query);

    if (!queryHasLocation) {
      // Query has no location — check if AI response mentions brand near any of our locations
      const locationFound = allLocations.some(loc => {
        if (loc.length >= 3 && lower.includes(loc)) {
          matchedLocation = loc;
          return true;
        }
        return false;
      });
      // If we have locations but response doesn't mention any, still count the mention
      // but flag it as not location-verified
      locationRelevant = locationFound;
    }
  }

  // Recommendation detection — only if brand was mentioned, with word boundaries
  const recommended = mentioned && /\b(recommend|best|top\s+pick|top\s+choice|leading|solid choice|preferred|go.?with|first choice|suggest|worth considering|strong contender|stands out|highly recommend|top.?rated)\b/i.test(text);

  // Sentiment analysis — focused on context around brand mention
  let sentiment = 'neutral';
  if (mentioned && matchPosition >= 0) {
    const start = Math.max(0, matchPosition - 200);
    const end = Math.min(lower.length, matchPosition + brandLower.length + 300);
    const context = lower.substring(start, end);

    const pw = ['recommend','excellent','top pick','best','leading','reputable','trusted','high quality',
      'professional','reliable','great','highly rated','well-known','popular','outstanding',
      'praised','good reviews','well-regarded','strong reputation','solid','preferred','consistent',
      'top rated','award','certified','experienced','five star','5 star','4.5','4.8','4.9'];
    const nw = ['avoid','complaint','poor','bad','worst','unreliable','scam','overpriced',
      'unprofessional','negative reviews','problems','issues','lawsuit','shut down','closed',
      'out of business','fraudulent','deceptive','disappointing','terrible'];
    let p = 0, n = 0;
    pw.forEach(w => { if (context.includes(w)) p++; });
    nw.forEach(w => { if (context.includes(w)) n++; });
    sentiment = p > n ? 'positive' : n > p ? 'negative' : 'neutral';
  }

  // Extract URLs/citations from response
  const cites = [];
  const urlRx = /https?:\/\/[^\s"')>\]]+/g;
  const matches = text.match(urlRx) || [];
  [...new Set(matches)].slice(0, 6).forEach(u => cites.push(u));

  return { mentioned, recommended, sentiment, cites, simulated: false, locationRelevant, matchedLocation };
}

// simulate() has been intentionally removed — no more fake/simulated responses.
// Only real API responses are used. Platforms without API keys are skipped.

// ─── ADMIN: USER MANAGEMENT (for you, the owner) ──────────────────
app.get('/api/admin/users', auth, async (req, res) => {
  try {
    const adminCheck = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (!adminCheck.rows[0] || adminCheck.rows[0].role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const result = await pool.query('SELECT * FROM users ORDER BY created_at');
    res.json({ users: result.rows.map(safeUser), total: result.rows.length });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/users/:id/plan', auth, async (req, res) => {
  try {
    const adminCheck = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (!adminCheck.rows[0] || adminCheck.rows[0].role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const result = await pool.query('UPDATE users SET plan = $1 WHERE id = $2 RETURNING *', [req.body.plan, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: safeUser(result.rows[0]) });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Make first registered user an admin
app.post('/api/admin/make-first-admin', async (req, res) => {
  try {
    const users = await pool.query('SELECT id, email, role FROM users ORDER BY created_at LIMIT 1');
    if (!users.rows.length) return res.status(404).json({ error: 'No users yet' });
    const adminCheck = await pool.query('SELECT id FROM users WHERE role = $1', ['admin']);
    if (adminCheck.rows.length) return res.status(400).json({ error: 'Admin already exists' });
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', users.rows[0].id]);
    res.json({ success: true, email: users.rows[0].email });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const users = await pool.query('SELECT COUNT(*) FROM users');
    const brands = await pool.query('SELECT COUNT(*) FROM brands');
    res.json({ status: 'ok', users: parseInt(users.rows[0].count), brands: parseInt(brands.rows[0].count), time: new Date().toISOString() });
  } catch(e) {
    res.json({ status: 'error', error: e.message, time: new Date().toISOString() });
  }
});

// ─── SCHEDULED RUNS ───────────────────────────────────────────────
cron.schedule('0 * * * *', async () => {
  // Run every hour - check which brands have scheduled runs due
  try {
    const result = await pool.query('SELECT b.*, u.api_keys FROM brands b JOIN users u ON b.user_id = u.id');
    const now = Date.now();
    for (const row of result.rows) {
      const brand = { id: row.id, userId: row.user_id, ...row.data };
      if (!brand.schedule) continue;
      const lastRun = brand.runs?.length ? new Date(brand.runs[brand.runs.length-1].time).getTime() : 0;
      const intervalMs = brand.schedule * 1000;
      if (now - lastRun >= intervalMs) {
        console.log(`[Cron] Running scheduled queries for brand: ${brand.name}`);
        try {
          await runBrandQueries(brand);
        } catch(e) {
          console.error(`[Cron] Error for ${brand.name}:`, e.message);
        }
      }
    }
  } catch(e) {
    console.error('[Cron] Error:', e.message);
  }
});

async function runBrandQueries(brand) {
  const keys = getServerKeys();
  const PLATFORM_KEY_MAP = {
    'ChatGPT': 'openai', 'Perplexity': 'perplexity', 'Claude': 'claude',
    'Gemini': 'gemini', 'Grok': 'grok', 'Google AIO': 'gemini'
  };
  const queries = brand.queries || [];
  const activePlatforms = Object.entries(PLATFORM_KEY_MAP)
    .filter(([, keyName]) => keys[keyName])
    .map(([plat]) => plat);
  if (!activePlatforms.length || !queries.length) return;

  const newMentions = [];
  const allResults = [];
  const platSOV = {};
  let totalQ = 0, totalM = 0;

  for (const plat of activePlatforms) {
    let pm = 0;
    for (const q of queries) {
      try {
        const result = await queryAI(q, plat, brand, keys);
        if (!result) continue;
        const { text, citations } = result;
        const parsed = parseResponse(text, brand, q);
        totalQ++;
        allResults.push({
          platform: plat, query: q,
          context: text.substring(0, 300), raw: text,
          simulated: false, mentioned: parsed.mentioned,
          sentiment: parsed.sentiment, recommended: parsed.recommended,
          citations: citations || parsed.cites
        });
        if (parsed.mentioned) {
          pm++; totalM++;
          newMentions.push({ id: uid(), platform: plat, query: q, context: text.substring(0,300), raw: text, sentiment: parsed.sentiment, recommended: parsed.recommended, citations: citations||parsed.cites, simulated: false, time: new Date().toISOString() });
        }
      } catch(e) {
        console.error(`[Cron][${plat}] API error for "${q}":`, e.message);
        totalQ++;
      }
    }
    platSOV[plat] = queries.length ? Math.round((pm/queries.length)*100) : 0;
  }

  const sov = totalQ ? Math.round((totalM/totalQ)*100) : 0;
  const today = new Date().toISOString().split('T')[0];
  if (!brand.runs) brand.runs = [];
  brand.runs.push({ id: uid(), date: today, time: new Date().toISOString(), mentions: newMentions, allResults, sov, platforms: platSOV, totalQ, totalM, queries: [...queries], activePlatforms: [...activePlatforms] });
  if (brand.runs.length > 50) brand.runs = brand.runs.slice(-50);

  if (!brand.mentions) brand.mentions = [];
  const existKeys = new Set(brand.mentions.map(m => m.platform+'|'+m.query+'|'+m.time.split('T')[0]));
  brand.mentions = [...newMentions.filter(m => !existKeys.has(m.platform+'|'+m.query+'|'+m.time.split('T')[0])), ...brand.mentions].slice(0,500);
  if (!brand.sovHistory) brand.sovHistory = [];
  brand.sovHistory = brand.sovHistory.filter(h => h.date !== today);
  brand.sovHistory.push({ date: today, overall: sov, platforms: platSOV });

  await saveBrand(brand);
}

// ─── SEO LANDING PAGES ──────────────────────────────────────────
function seoPage({ title, description, keywords, h1, subtitle, content, canonical }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="keywords" content="${keywords}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://trackly.so${canonical}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://trackly.so${canonical}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:site_name" content="Trackly">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="theme-color" content="#00ff88">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
:root{--bg:#0a0a0a;--bg2:#111;--bg3:#1a1a1a;--border:#2a2a2a;--text:#e8e8e8;--muted:#666;--green:#00ff88;--red:#ff4455;--blue:#3b82f6;--font:'Syne',sans-serif;--mono:'Space Mono',monospace;}
body{font-family:var(--font);background:var(--bg);color:var(--text);min-height:100vh;}
a{color:var(--green);text-decoration:none;}a:hover{text-decoration:underline;}
.seo-nav{display:flex;align-items:center;padding:16px 40px;border-bottom:1px solid var(--border);background:rgba(10,10,10,.95);position:sticky;top:0;z-index:50;backdrop-filter:blur(12px);}
.seo-nav-logo{font-size:22px;font-weight:800;letter-spacing:-1px;color:var(--text);text-decoration:none;}.seo-nav-logo span{color:var(--green);}
.seo-nav-links{display:flex;gap:24px;margin-left:40px;}.seo-nav-links a{color:var(--muted);font-size:13px;font-weight:600;}
.seo-nav-right{margin-left:auto;}.seo-btn{padding:8px 20px;font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer;border:none;background:var(--green);color:#000;text-decoration:none;display:inline-block;}
.seo-hero{text-align:center;padding:80px 20px 60px;max-width:800px;margin:0 auto;}
.seo-hero h1{font-size:clamp(28px,5vw,48px);font-weight:800;letter-spacing:-2px;line-height:1.15;margin-bottom:20px;}
.seo-hero h1 span{color:var(--green);}
.seo-hero p{color:var(--muted);font-size:16px;line-height:1.7;margin-bottom:32px;}
.seo-content{max-width:800px;margin:0 auto;padding:0 20px 60px;}
.seo-content h2{font-size:24px;font-weight:700;margin:40px 0 16px;letter-spacing:-0.5px;}
.seo-content h3{font-size:18px;font-weight:700;margin:28px 0 12px;}
.seo-content p{color:var(--muted);font-size:14px;line-height:1.8;margin-bottom:16px;}
.seo-content ul{list-style:none;margin-bottom:20px;}.seo-content ul li{font-size:14px;color:var(--muted);padding:6px 0;border-bottom:1px solid var(--border);}
.seo-content ul li::before{content:'\\2713 ';color:var(--green);}
.seo-content .highlight{background:var(--bg2);border:1px solid var(--border);padding:20px;margin:20px 0;}
.seo-cta{text-align:center;padding:60px 20px;border-top:1px solid var(--border);}
.seo-cta h2{font-size:28px;font-weight:800;margin-bottom:12px;}
.seo-cta p{color:var(--muted);font-size:14px;margin-bottom:24px;}
.seo-footer{border-top:1px solid var(--border);padding:24px 40px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;}
.seo-footer-text{font-size:12px;color:var(--muted);}
.seo-footer-links{display:flex;gap:16px;flex-wrap:wrap;}.seo-footer-links a{color:var(--muted);font-size:12px;}
@media(max-width:768px){.seo-nav{padding:12px 16px;}.seo-nav-links{display:none;}.seo-footer{flex-direction:column;text-align:center;}}
</style>
</head>
<body>
<header>
<nav class="seo-nav" aria-label="Main navigation">
  <a href="/" class="seo-nav-logo">Track<span>ly</span></a>
  <div class="seo-nav-links">
    <a href="/#features">Features</a>
    <a href="/#pricing">Pricing</a>
    <a href="/#faq">FAQ</a>
    <a href="/chatgpt-brand-tracking">ChatGPT</a>
    <a href="/perplexity-brand-tracking">Perplexity</a>
    <a href="/gemini-brand-tracking">Gemini</a>
  </div>
  <div class="seo-nav-right"><a class="seo-btn" href="/">Start Tracking Free</a></div>
</nav>
</header>
<main>
<section class="seo-hero" aria-label="Hero">
  <h1>${h1}</h1>
  <p>${subtitle}</p>
  <a class="seo-btn" href="/" style="padding:14px 36px;font-size:15px;">Start Tracking Free</a>
</section>
<article class="seo-content">
${content}
</article>
<section class="seo-cta" aria-label="Call to action">
  <h2>Ready to track your AI visibility?</h2>
  <p>Monitor your brand across ChatGPT, Perplexity, Claude, Gemini, Grok & Google AIO.</p>
  <a class="seo-btn" href="/" style="padding:14px 36px;font-size:15px;">Get Started Free</a>
  <p style="font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:12px;">No credit card required.</p>
</section>
</main>
<footer class="seo-footer">
  <div class="seo-footer-text">&copy; 2026 Trackly — AI Visibility Tracker</div>
  <div class="seo-footer-links">
    <a href="/">Home</a>
    <a href="/#features">Features</a>
    <a href="/#pricing">Pricing</a>
    <a href="/chatgpt-brand-tracking">ChatGPT Tracking</a>
    <a href="/perplexity-brand-tracking">Perplexity Tracking</a>
    <a href="/gemini-brand-tracking">Gemini Tracking</a>
    <a href="/geo-optimization">GEO Guide</a>
  </div>
</footer>
</body></html>`;
}

// Platform-specific landing pages
app.get('/chatgpt-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'ChatGPT Brand Tracking — Monitor Your Brand Mentions in ChatGPT | Trackly',
    description: 'Track how ChatGPT mentions your brand. See real OpenAI API responses, measure share of voice, and get proof of your brand visibility in ChatGPT answers.',
    keywords: 'ChatGPT brand tracking, ChatGPT brand monitoring, track brand in ChatGPT, ChatGPT mentions, ChatGPT SEO, ChatGPT visibility',
    h1: 'Track Your Brand in <span>ChatGPT</span>',
    subtitle: 'See exactly how ChatGPT answers questions about your industry and whether it recommends your brand. Real API responses, real proof.',
    canonical: '/chatgpt-brand-tracking',
    content: `
<h2>Why Track Your Brand in ChatGPT?</h2>
<p>ChatGPT has over 200 million weekly active users. When someone asks "What's the best [your industry] company?", does ChatGPT mention your brand? If not, you're missing out on one of the most influential recommendation engines in the world.</p>
<p>Trackly queries ChatGPT using the official OpenAI API with your custom keywords and captures the complete, unmodified response. You see exactly what ChatGPT says — no screenshots, no guessing.</p>

<h2>How ChatGPT Brand Tracking Works</h2>
<div class="highlight">
<h3>1. Add Your Keywords</h3>
<p>Enter the questions your customers ask — e.g., "Best HVAC company in Austin TX", "Top rated plumber near me", "Which CRM is best for small business?"</p>
<h3>2. Run Tracking</h3>
<p>Trackly sends your queries to ChatGPT (GPT-4o-mini) via the official OpenAI API and captures the full response.</p>
<h3>3. See Results</h3>
<p>Each response is analyzed for brand mentions, sentiment, and recommendations. Results are stored as verifiable proof you can share with clients.</p>
</div>

<h2>What You Get</h2>
<ul>
<li>Complete ChatGPT responses saved as evidence</li>
<li>Brand mention detection with highlight</li>
<li>Sentiment analysis (positive, negative, neutral)</li>
<li>Recommendation detection</li>
<li>Share of Voice percentage</li>
<li>CSV export for client reporting</li>
<li>Historical tracking across multiple runs</li>
</ul>

<h2>ChatGPT vs Google: Why It Matters</h2>
<p>Traditional SEO focuses on Google rankings. But increasingly, users ask ChatGPT for recommendations instead of searching Google. This is called <strong>Generative Engine Optimization (GEO)</strong> — and it requires a completely different tracking approach.</p>
<p>Unlike Google where you can see your position in search results, ChatGPT has no "ranking page." The only way to know if ChatGPT recommends you is to ask it — and that's exactly what Trackly does.</p>

<h2>Who Needs ChatGPT Tracking?</h2>
<p><strong>Local businesses</strong> — HVAC, plumbers, dentists, lawyers, restaurants. When locals ask ChatGPT for recommendations, are you there?</p>
<p><strong>SEO agencies</strong> — Offer AI visibility tracking as a service. Show clients real proof of their ChatGPT presence.</p>
<p><strong>SaaS companies</strong> — Monitor if ChatGPT recommends your product when users ask for solutions in your category.</p>
`
  }));
});

app.get('/perplexity-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'Perplexity Brand Tracking — Monitor Brand Mentions in Perplexity AI | Trackly',
    description: 'Track how Perplexity AI mentions and cites your brand. See real search-grounded responses with citations, measure visibility, and export proof.',
    keywords: 'Perplexity brand tracking, Perplexity brand monitoring, track brand in Perplexity, Perplexity AI mentions, Perplexity SEO, Perplexity visibility',
    h1: 'Track Your Brand in <span>Perplexity AI</span>',
    subtitle: 'Perplexity is the fastest-growing AI search engine. See if it mentions and cites your brand with real, search-grounded responses.',
    canonical: '/perplexity-brand-tracking',
    content: `
<h2>Why Perplexity Matters for Your Brand</h2>
<p>Perplexity AI is an AI-powered search engine that provides cited, real-time answers. Unlike ChatGPT which relies on training data, Perplexity actively searches the web — making it a direct competitor to Google for informational queries.</p>
<p>When Perplexity answers "What's the best [product] in [category]?", it pulls from live web data and provides citations. If your brand appears in these answers with a citation to your website, that's high-value visibility.</p>

<h2>How Perplexity Tracking Works</h2>
<div class="highlight">
<p>Trackly uses the Perplexity Sonar Pro API with search grounding enabled. This means the responses you see in Trackly match what users see on perplexity.ai — real-time, web-grounded answers with citations.</p>
</div>

<h2>What Makes Perplexity Different</h2>
<ul>
<li>Search-grounded responses with real-time web data</li>
<li>Citations and source URLs in every answer</li>
<li>Growing market share as a Google alternative</li>
<li>Higher commercial intent than ChatGPT queries</li>
<li>Trackly captures all citations from Perplexity responses</li>
</ul>

<h2>Optimize for Perplexity</h2>
<p>Perplexity pulls from web content, reviews, and authoritative sources. To improve your Perplexity visibility:</p>
<ul>
<li>Build authoritative content that Perplexity can cite</li>
<li>Get mentioned on review sites and industry directories</li>
<li>Ensure your website is crawlable by AI bots</li>
<li>Track your mentions regularly with Trackly to measure progress</li>
</ul>
`
  }));
});

app.get('/gemini-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'Google Gemini & AI Overview Brand Tracking — Monitor AI Visibility | Trackly',
    description: 'Track how Google Gemini and Google AI Overview mention your brand. Monitor your visibility in Google\'s AI-powered search with real API responses.',
    keywords: 'Gemini brand tracking, Google AI Overview tracking, Google AIO monitoring, Gemini brand monitoring, Google AI visibility, AIO brand tracking',
    h1: 'Track Your Brand in <span>Google Gemini & AI Overview</span>',
    subtitle: 'Google AI Overview appears above traditional search results. Gemini is Google\'s AI assistant. Track your brand visibility in both.',
    canonical: '/gemini-brand-tracking',
    content: `
<h2>Google AI is Changing Search</h2>
<p>Google AI Overview (AIO) now appears at the top of search results for millions of queries, pushing traditional organic results below the fold. If your brand isn't mentioned in the AI Overview, your organic rankings matter less than ever.</p>
<p>Trackly tracks both <strong>Google Gemini</strong> (the standalone AI assistant) and <strong>Google AI Overview</strong> (the AI-powered search feature) using Google's official API with search grounding enabled.</p>

<h2>Why Google AIO Tracking is Critical</h2>
<ul>
<li>AI Overview appears above all organic results on Google</li>
<li>Users increasingly rely on AI summaries instead of clicking links</li>
<li>Your SEO rankings don't guarantee AI Overview mentions</li>
<li>Gemini with Google Search grounding provides cited answers</li>
<li>Trackly extracts grounding citations from Gemini responses</li>
</ul>

<h2>What Trackly Tracks</h2>
<div class="highlight">
<h3>Google Gemini</h3>
<p>Queries the Gemini 2.0 Flash model for AI assistant-style responses. Tracks if your brand appears when users ask Gemini for recommendations.</p>
<h3>Google AI Overview (AIO)</h3>
<p>Queries Gemini with Google Search grounding enabled — replicating the AI Overview experience. Captures grounding citations and source URLs.</p>
</div>

<h2>Optimize for Google AI</h2>
<p>Google's AI pulls from its search index, Knowledge Graph, and web data. To improve your AI Overview visibility:</p>
<ul>
<li>Maintain strong traditional SEO fundamentals</li>
<li>Get featured in Google's Knowledge Graph</li>
<li>Build authority through reviews, citations, and backlinks</li>
<li>Create comprehensive, well-structured content</li>
<li>Track your AI visibility with Trackly to measure what works</li>
</ul>
`
  }));
});

app.get('/claude-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'Claude Brand Tracking — Monitor Brand Mentions in Claude AI | Trackly',
    description: 'Track how Anthropic\'s Claude AI mentions your brand. See real API responses, sentiment analysis, and proof of visibility.',
    keywords: 'Claude brand tracking, Claude AI monitoring, Anthropic Claude tracking, Claude brand visibility, Claude AI mentions',
    h1: 'Track Your Brand in <span>Claude AI</span>',
    subtitle: 'Claude by Anthropic is used by millions for research and recommendations. See if it mentions your brand.',
    canonical: '/claude-brand-tracking',
    content: `
<h2>Why Track Your Brand in Claude?</h2>
<p>Claude by Anthropic is one of the most trusted AI assistants, known for thoughtful, nuanced responses. Businesses, researchers, and consumers use Claude daily for recommendations and research. Trackly monitors your brand's presence in Claude's responses using the official Anthropic API.</p>

<h2>What You Get</h2>
<ul>
<li>Real Claude API responses (Claude Sonnet model)</li>
<li>Brand mention detection across all name variations</li>
<li>Sentiment and recommendation analysis</li>
<li>Full response saved as verifiable proof</li>
<li>Historical tracking and SOV measurement</li>
</ul>
`
  }));
});

app.get('/grok-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'Grok Brand Tracking — Monitor Brand Mentions in Grok (xAI) | Trackly',
    description: 'Track how xAI\'s Grok mentions your brand. Monitor your visibility on X/Twitter\'s AI assistant with real API responses.',
    keywords: 'Grok brand tracking, Grok AI monitoring, xAI Grok tracking, Grok brand visibility, X AI tracking',
    h1: 'Track Your Brand in <span>Grok (xAI)</span>',
    subtitle: 'Grok powers AI on X (Twitter) and is used by millions. Track if it recommends your brand.',
    canonical: '/grok-brand-tracking',
    content: `
<h2>Why Track Grok?</h2>
<p>Grok by xAI is integrated into X (Twitter) and has access to real-time social data. When users ask Grok for recommendations, it draws from both its training data and live social signals. Trackly monitors your brand's visibility in Grok responses using the official xAI API.</p>

<h2>What You Get</h2>
<ul>
<li>Real Grok API responses (Grok-3-mini model)</li>
<li>Brand mention and recommendation detection</li>
<li>Sentiment analysis of how Grok describes your brand</li>
<li>Evidence export for client reporting</li>
</ul>
`
  }));
});

// GEO/AEO educational page
app.get('/geo-optimization', (req, res) => {
  res.send(seoPage({
    title: 'Generative Engine Optimization (GEO) Guide — How to Get Your Brand Mentioned by AI | Trackly',
    description: 'Learn about Generative Engine Optimization (GEO) and Answer Engine Optimization (AEO). Understand how to optimize your brand for AI search engines like ChatGPT, Perplexity, and Google AI Overview.',
    keywords: 'generative engine optimization, GEO, answer engine optimization, AEO, AI SEO, LLM optimization, LLMO, AI search optimization, how to rank in ChatGPT, how to appear in AI answers',
    h1: 'Generative Engine Optimization <span>(GEO)</span> Guide',
    subtitle: 'The complete guide to making your brand visible in AI-generated answers. Also known as Answer Engine Optimization (AEO) or LLM Optimization (LLMO).',
    canonical: '/geo-optimization',
    content: `
<h2>What is Generative Engine Optimization (GEO)?</h2>
<p>Generative Engine Optimization (GEO) is the practice of optimizing your brand's online presence to appear more frequently and positively in AI-generated answers. While traditional SEO focuses on ranking in Google search results, GEO focuses on being mentioned and recommended by AI assistants like ChatGPT, Perplexity, Claude, Gemini, and Google AI Overview.</p>

<h2>GEO vs Traditional SEO</h2>
<div class="highlight">
<p><strong>Traditional SEO:</strong> Optimize for Google's algorithm to rank higher in search results. Users click links to visit your site.</p>
<p><strong>GEO / AEO:</strong> Optimize for AI models to mention and recommend your brand in generated answers. Users get recommendations directly from AI — no click needed.</p>
</div>

<h2>Why GEO Matters in 2026</h2>
<ul>
<li>40%+ of informational queries now involve AI-generated answers</li>
<li>Google AI Overview appears above organic results, reducing click-through rates</li>
<li>ChatGPT, Perplexity, and Claude are replacing Google for recommendation queries</li>
<li>Brands that don't appear in AI answers lose visibility to competitors who do</li>
</ul>

<h2>How AI Models Choose Which Brands to Recommend</h2>
<p>AI models like ChatGPT and Gemini are trained on web data. They learn about brands from:</p>
<ul>
<li>Review sites (Google Reviews, Yelp, G2, Trustpilot)</li>
<li>Industry publications and blog posts</li>
<li>Social media mentions and discussions</li>
<li>Your website content and authority</li>
<li>News articles and press coverage</li>
<li>Directory listings and citations</li>
</ul>

<h2>GEO Strategy: How to Improve AI Visibility</h2>
<h3>1. Build Authoritative Content</h3>
<p>Create comprehensive, expert-level content that AI models can reference. Use structured data, clear headings, and factual information.</p>

<h3>2. Get Reviews and Mentions</h3>
<p>AI models weigh reviews heavily. Encourage satisfied customers to leave reviews on Google, Yelp, industry-specific review sites, and social media.</p>

<h3>3. Earn Backlinks and Citations</h3>
<p>AI models learn brand authority partly from how often and where your brand is mentioned online. Quality backlinks and citations from authoritative sources improve AI visibility.</p>

<h3>4. Track and Measure</h3>
<p>Use Trackly to monitor your AI visibility across all major platforms. Track which queries mention your brand, measure share of voice, and see how your GEO efforts improve results over time.</p>

<h3>5. Monitor Competitors</h3>
<p>See which competitors AI recommends for your target keywords. Understand what they're doing differently and adapt your strategy.</p>

<h2>Tools for GEO Optimization</h2>
<p>Trackly is purpose-built for GEO tracking. It queries 6 AI platforms with your custom keywords and shows you exactly what each AI says about your brand. Features include:</p>
<ul>
<li>Real API responses from ChatGPT, Perplexity, Claude, Gemini, Grok & Google AIO</li>
<li>Brand mention detection with alias support</li>
<li>Share of Voice measurement</li>
<li>Sentiment and recommendation analysis</li>
<li>Evidence export for client reporting</li>
<li>Location-aware tracking</li>
</ul>
`
  }));
});

// Comparison pages
app.get('/vs/semrush', (req, res) => {
  res.send(seoPage({
    title: 'Trackly vs Semrush — AI Visibility Tracking Comparison | Trackly',
    description: 'Compare Trackly with Semrush for AI visibility tracking. Trackly is purpose-built for GEO with 6 AI platforms, while Semrush focuses on traditional SEO.',
    keywords: 'Trackly vs Semrush, Semrush alternative, AI visibility tool comparison, Semrush AI tracking, GEO tool comparison',
    h1: 'Trackly vs <span>Semrush</span>',
    subtitle: 'How Trackly compares to Semrush for AI visibility and Generative Engine Optimization tracking.',
    canonical: '/vs/semrush',
    content: `
<h2>Semrush: Traditional SEO Powerhouse</h2>
<p>Semrush is a comprehensive SEO platform with keyword tracking, backlink analysis, and site auditing. They've recently added AI visibility features, but it's an add-on to their core SEO platform — not the primary focus.</p>

<h2>Trackly: Purpose-Built for AI Visibility</h2>
<p>Trackly is built from the ground up for one thing: tracking your brand's visibility in AI-generated answers. Every feature is designed around GEO optimization and AI mention tracking.</p>

<h2>Feature Comparison</h2>
<div class="highlight">
<p><strong>AI Platforms Tracked:</strong> Trackly covers 6 AI platforms (ChatGPT, Perplexity, Claude, Gemini, Grok, Google AIO). Semrush covers fewer AI platforms.</p>
<p><strong>Real API Responses:</strong> Trackly uses real API calls and saves complete responses as proof. Full response text, model name, and timestamp included.</p>
<p><strong>Pricing:</strong> Trackly starts free. Semrush starts at $129.95/mo for their base SEO plan, with AI features in higher tiers.</p>
<p><strong>GEO Focus:</strong> Trackly is 100% focused on AI visibility. Semrush has AI visibility as one feature among hundreds.</p>
</div>

<h2>When to Use Semrush</h2>
<p>If you need a comprehensive SEO suite with keyword research, rank tracking, backlink analysis, and site auditing. Semrush is excellent for traditional SEO.</p>

<h2>When to Use Trackly</h2>
<p>If you need dedicated AI visibility tracking with real proof, share of voice measurement, and GEO optimization data. Trackly is focused, affordable, and purpose-built for the AI era.</p>

<h2>Use Both Together</h2>
<p>Many users combine Semrush for traditional SEO with Trackly for AI visibility. They complement each other — Semrush handles Google rankings, Trackly handles AI mentions.</p>
`
  }));
});

app.get('/vs/ahrefs', (req, res) => {
  res.send(seoPage({
    title: 'Trackly vs Ahrefs Brand Radar — AI Visibility Tracking Comparison | Trackly',
    description: 'Compare Trackly with Ahrefs Brand Radar for AI visibility tracking. See how real-time API tracking compares to static dataset analysis.',
    keywords: 'Trackly vs Ahrefs, Ahrefs Brand Radar alternative, AI visibility tool comparison, Ahrefs AI tracking',
    h1: 'Trackly vs <span>Ahrefs Brand Radar</span>',
    subtitle: 'How Trackly\'s real-time AI tracking compares to Ahrefs Brand Radar\'s static dataset approach.',
    canonical: '/vs/ahrefs',
    content: `
<h2>Ahrefs Brand Radar</h2>
<p>Ahrefs Brand Radar analyzes a static dataset of 250M+ prompts to show how often brands appear in AI-generated responses. It updates monthly and provides broad visibility trends.</p>

<h2>Trackly: Real-Time, Custom Queries</h2>
<p>Trackly queries AI platforms in real-time with your custom keywords. You choose the exact queries, run them on-demand, and get complete API responses as proof.</p>

<h2>Key Differences</h2>
<div class="highlight">
<p><strong>Custom vs Pre-set Queries:</strong> Trackly lets you track your own keywords. Ahrefs uses a pre-built dataset.</p>
<p><strong>Real-time vs Monthly:</strong> Trackly runs queries on-demand with real API calls. Ahrefs updates monthly from historical data.</p>
<p><strong>Full Response as Proof:</strong> Trackly saves the complete AI response. Ahrefs shows aggregated statistics.</p>
<p><strong>6 AI Platforms:</strong> Trackly tracks ChatGPT, Perplexity, Claude, Gemini, Grok & Google AIO.</p>
</div>

<h2>When to Use Each</h2>
<p><strong>Ahrefs Brand Radar</strong> is great for broad market intelligence and seeing macro trends in AI visibility across large datasets.</p>
<p><strong>Trackly</strong> is better for targeted tracking with your specific keywords, getting real proof of AI responses, and measuring your GEO efforts with custom queries.</p>
`
  }));
});

// ─── CATCH-ALL: serve app for SPA routing ────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  Trackly SaaS Server Running             ║
  ║  http://localhost:${PORT}                  ║
  ║                                          ║
  ║  Database: PostgreSQL                    ║
  ║  JWT_SECRET: ${process.env.JWT_SECRET ? 'SET ✓' : 'NOT SET ✗'}                     ║
  ╚══════════════════════════════════════════╝
  `);
});
