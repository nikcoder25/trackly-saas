/**
 * Trackly - AI Visibility Tracker SaaS Server
 * Stack: Node.js + Express + JSON file DB + JWT auth
 * Storage: data/db.json (swap for PostgreSQL in production)
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

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'trackly-super-secret-jwt-key-change-in-production';
const DB_PATH    = path.join(__dirname, 'data', 'db.json');

// ─── ENSURE DATA DIR ─────────────────────────────────────────────
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// ─── JSON FILE DATABASE ───────────────────────────────────────────
// Simple JSON file DB. For production swap with PostgreSQL/MySQL.
function readDB() {
  if (!fs.existsSync(DB_PATH)) return { users: [], brands: [] };
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch(e) { return { users: [], brands: [] }; }
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}
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

  const db = readDB();
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: uid(),
    email: email.toLowerCase(),
    name: name || email.split('@')[0],
    passwordHash: hash,
    plan: 'free',  // free | pro | agency
    apiKeys: {},   // stored server-side, never sent to client
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  writeDB(db);

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: safeUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(400).json({ error: 'Invalid email or password' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: safeUser(user) });
});

app.get('/api/auth/me', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: safeUser(user) });
});

function safeUser(u) {
  return { id: u.id, email: u.email, name: u.name, plan: u.plan, createdAt: u.createdAt,
           hasKeys: Object.keys(u.apiKeys||{}).filter(k => u.apiKeys[k]) };
}

// ─── API KEYS (server-side only, never returned to client) ────────
app.put('/api/keys', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { openai, perplexity, gemini, claude, grok } = req.body;
  if (!user.apiKeys) user.apiKeys = {};
  // Only update keys that are provided and not masked
  if (openai   && !openai.includes('•'))   user.apiKeys.openai      = openai;
  if (perplexity && !perplexity.includes('•')) user.apiKeys.perplexity = perplexity;
  if (gemini   && !gemini.includes('•'))   user.apiKeys.gemini      = gemini;
  if (claude   && !claude.includes('•'))   user.apiKeys.claude      = claude;
  if (grok     && !grok.includes('•'))     user.apiKeys.grok        = grok;

  writeDB(db);
  res.json({ success: true, hasKeys: Object.keys(user.apiKeys).filter(k => user.apiKeys[k]) });
});

app.get('/api/keys/status', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Return which platforms have keys (not the keys themselves)
  const keys = user.apiKeys || {};
  res.json({
    openai:     !!keys.openai,
    perplexity: !!keys.perplexity,
    gemini:     !!keys.gemini,
    claude:     !!keys.claude,
    grok:       !!keys.grok
  });
});

// ─── BRAND ROUTES ─────────────────────────────────────────────────
app.get('/api/brands', auth, (req, res) => {
  const db = readDB();
  const brands = db.brands.filter(b => b.userId === req.user.id);
  res.json({ brands });
});

app.post('/api/brands', auth, (req, res) => {
  const db = readDB();
  const { name, industry, website, city, goal } = req.body;
  if (!name) return res.status(400).json({ error: 'Brand name required' });

  // Plan limits
  const userBrands = db.brands.filter(b => b.userId === req.user.id);
  const user = db.users.find(u => u.id === req.user.id);
  const limits = { free: 1, pro: 5, agency: 20 };
  const limit = limits[user?.plan || 'free'];
  if (userBrands.length >= limit) {
    return res.status(403).json({ error: `Your ${user?.plan||'free'} plan allows up to ${limit} brand(s). Upgrade to add more.` });
  }

  const brand = {
    id: uid(),
    userId: req.user.id,
    name, industry: industry||'', website: website||'', city: city||'',
    goal: goal || 70,
    competitors: [],
    queries: [
      `What is the best ${industry||'service'} company?`,
      `Who are the top ${industry||'service'} providers near me?`,
      `Best ${industry||'service'} recommendations`
    ],
    runs: [],
    mentions: [],
    queryStats: {},
    sovHistory: [],
    citations: {},
    notes: {},
    schedule: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.brands.push(brand);
  writeDB(db);
  res.json({ brand });
});

app.get('/api/brands/:id', auth, (req, res) => {
  const db = readDB();
  const brand = db.brands.find(b => b.id === req.params.id && b.userId === req.user.id);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  res.json({ brand });
});

app.put('/api/brands/:id', auth, (req, res) => {
  const db = readDB();
  const idx = db.brands.findIndex(b => b.id === req.params.id && b.userId === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Brand not found' });

  // Merge updates (protect id and userId)
  const updated = { ...db.brands[idx], ...req.body, id: db.brands[idx].id, userId: req.user.id, updatedAt: new Date().toISOString() };
  db.brands[idx] = updated;
  writeDB(db);
  res.json({ brand: updated });
});

app.delete('/api/brands/:id', auth, (req, res) => {
  const db = readDB();
  const idx = db.brands.findIndex(b => b.id === req.params.id && b.userId === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Brand not found' });
  db.brands.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// ─── RUN QUERIES (server-side AI calls) ───────────────────────────
app.post('/api/brands/:id/run', auth, async (req, res) => {
  const db = readDB();
  const brand = db.brands.find(b => b.id === req.params.id && b.userId === req.user.id);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  const user = db.users.find(u => u.id === req.user.id);
  const keys = user?.apiKeys || {};

  const PLATFORM_KEY_MAP = {
    'ChatGPT': 'openai', 'Perplexity': 'perplexity', 'Claude': 'claude',
    'Gemini': 'gemini', 'Grok': 'grok', 'Google AIO': 'gemini'
  };
  const queries = brand.queries || [];
  if (!queries.length) return res.status(400).json({ error: 'No queries configured' });

  // Only query platforms with valid API keys — no fake/simulated data
  const activePlatforms = Object.entries(PLATFORM_KEY_MAP)
    .filter(([, keyName]) => keys[keyName])
    .map(([plat]) => plat);

  if (!activePlatforms.length) {
    return res.status(400).json({ error: 'No API keys configured. Add at least one API key to run queries.' });
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

        const { text, simulated, citations: extraCites } = result;
        const parsed = parseResponse(text, brand);
        parsed.simulated = false; // Always real — no more simulated
        if (extraCites && extraCites.length) parsed.cites = [...extraCites, ...parsed.cites].slice(0,6);
        totalQ++;

        // Store every result for proof section
        allResults.push({
          platform: plat, query: q,
          context: text.substring(0, 300), raw: text,
          simulated: false, mentioned: parsed.mentioned,
          sentiment: parsed.sentiment, recommended: parsed.recommended,
          citations: parsed.cites
        });

        if (parsed.mentioned) {
          pm++; totalM++;
          newMentions.push({
            id: uid(), platform: plat, query: q,
            context: text.substring(0, 300), raw: text,
            sentiment: parsed.sentiment, recommended: parsed.recommended,
            citations: parsed.cites, simulated: false,
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
  brand.runs.push({ id: uid(), date: today, time: new Date().toISOString(), mentions: newMentions, allResults, sov, platforms: platSOV, totalQ, totalM });
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
  const idx = db.brands.findIndex(b => b.id === brand.id);
  db.brands[idx] = brand;
  writeDB(db);

  res.json({ brand, result: { totalQ, totalM, sov, newMentions: newMentions.length, activePlatforms: activePlatforms.length, skippedPlatforms: 6 - activePlatforms.length } });
});

// ─── AI QUERY FUNCTIONS (server-side) ─────────────────────────────
async function queryAI(query, platform, brand, keys) {
  // Send ONLY the raw query — no brand name, city, or industry injection
  const rawQuery = query;

  // ── Only query platforms that have valid API keys — no simulation fallback ──
  if (platform === 'ChatGPT' && keys.openai)
    return await callOpenAI(rawQuery, keys.openai, 'gpt-4o-mini');

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

async function callOpenAI(query, apiKey, model) {
  const body = JSON.stringify({
    model, max_tokens: 1500,
    messages: [{ role: 'user', content: query }]  // RAW query only — no brand injection
  });
  const d = await fetchJSON('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return { text: d.choices?.[0]?.message?.content || '', simulated: false, citations: [] };
}

async function callPerplexity(query, apiKey) {
  const body = JSON.stringify({
    model: 'sonar',
    max_tokens: 1500,
    return_citations: true,
    messages: [{ role: 'user', content: query }]  // RAW query only
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
    citations: (d.citations || []).slice(0, 5)
  };
}

async function callGemini(query, apiKey) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: query }] }],  // RAW query only
    generationConfig: { maxOutputTokens: 1500 }
  });
  const d = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return { text: d.candidates?.[0]?.content?.parts?.[0]?.text || '', simulated: false, citations: [] };
}

async function callGeminiWithSearch(query, apiKey) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: query }] }],  // RAW query only
    tools: [{ google_search: {} }],             // Enable grounding for AIO-like results
    generationConfig: { maxOutputTokens: 1500 }
  });
  const d = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return { text: d.candidates?.[0]?.content?.parts?.[0]?.text || '', simulated: false, citations: [] };
}

async function callGrok(query, apiKey) {
  const body = JSON.stringify({
    model: 'grok-3-mini',
    max_tokens: 1500,
    messages: [{ role: 'user', content: query }]  // RAW query only
  });
  const d = await fetchJSON('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  if (!d.choices || !d.choices[0]) throw new Error('Grok API returned empty response');
  return { text: d.choices[0].message.content || '', simulated: false, citations: [] };
}

async function callClaude(query, apiKey) {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{ role: 'user', content: query }]  // RAW query only
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
  return { text: d.content?.[0]?.text || '', simulated: false, citations: [] };
}

// ─── RESPONSE PARSING (post-response analysis — no brand injection) ───────
function parseResponse(text, brand) {
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

  return { mentioned, recommended, sentiment, cites, simulated: false };
}

// simulate() has been intentionally removed — no more fake/simulated responses.
// Only real API responses are used. Platforms without API keys are skipped.

// ─── ADMIN: USER MANAGEMENT (for you, the owner) ──────────────────
app.get('/api/admin/users', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  res.json({ users: db.users.map(safeUser), total: db.users.length });
});

app.put('/api/admin/users/:id/plan', auth, (req, res) => {
  const db = readDB();
  const admin = db.users.find(u => u.id === req.user.id);
  if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const target = db.users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  target.plan = req.body.plan;
  writeDB(db);
  res.json({ user: safeUser(target) });
});

// Make first registered user an admin
app.post('/api/admin/make-first-admin', (req, res) => {
  const db = readDB();
  if (db.users.length === 0) return res.status(404).json({ error: 'No users yet' });
  if (db.users.some(u => u.role === 'admin')) return res.status(400).json({ error: 'Admin already exists' });
  db.users[0].role = 'admin';
  writeDB(db);
  res.json({ success: true, email: db.users[0].email });
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const db = readDB();
  res.json({ status: 'ok', users: db.users.length, brands: db.brands.length, time: new Date().toISOString() });
});

// ─── SCHEDULED RUNS ───────────────────────────────────────────────
cron.schedule('0 * * * *', async () => {
  // Run every hour - check which brands have scheduled runs due
  const db = readDB();
  const now = Date.now();
  for (const brand of db.brands) {
    if (!brand.schedule) continue;
    const lastRun = brand.runs?.length ? new Date(brand.runs[brand.runs.length-1].time).getTime() : 0;
    const intervalMs = brand.schedule * 1000;
    if (now - lastRun >= intervalMs) {
      const user = db.users.find(u => u.id === brand.userId);
      if (user) {
        console.log(`[Cron] Running scheduled queries for brand: ${brand.name}`);
        try {
          await runBrandQueries(brand, user.apiKeys || {}, db);
        } catch(e) {
          console.error(`[Cron] Error for ${brand.name}:`, e.message);
        }
      }
    }
  }
});

async function runBrandQueries(brand, keys, db) {
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
        const parsed = parseResponse(text, brand);
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
  brand.runs.push({ id: uid(), date: today, time: new Date().toISOString(), mentions: newMentions, allResults, sov, platforms: platSOV, totalQ, totalM });
  if (brand.runs.length > 50) brand.runs = brand.runs.slice(-50);

  if (!brand.mentions) brand.mentions = [];
  const existKeys = new Set(brand.mentions.map(m => m.platform+'|'+m.query+'|'+m.time.split('T')[0]));
  brand.mentions = [...newMentions.filter(m => !existKeys.has(m.platform+'|'+m.query+'|'+m.time.split('T')[0])), ...brand.mentions].slice(0,500);
  if (!brand.sovHistory) brand.sovHistory = [];
  brand.sovHistory = brand.sovHistory.filter(h => h.date !== today);
  brand.sovHistory.push({ date: today, overall: sov, platforms: platSOV });

  const idx = db.brands.findIndex(b => b.id === brand.id);
  if (idx >= 0) db.brands[idx] = brand;
  writeDB(db);
}

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
  ║  Data stored in: data/db.json            ║
  ║  Set JWT_SECRET in .env for production   ║
  ╚══════════════════════════════════════════╝
  `);
});
