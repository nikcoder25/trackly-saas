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

  const PLATS = ['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Grok', 'Google AIO'];
  const queries = brand.queries || [];
  if (!queries.length) return res.status(400).json({ error: 'No queries configured' });

  const newMentions = [];
  const platSOV = {};
  let totalQ = 0, totalM = 0;

  for (const plat of PLATS) {
    let pm = 0;
    for (const q of queries) {
      try {
        const { text, simulated, citations: extraCites } = await queryAI(q, plat, brand, keys);
        const parsed = parseResponse(text, brand);
        parsed.simulated = simulated;
        if (extraCites && extraCites.length) parsed.cites = [...extraCites, ...parsed.cites].slice(0,6);
        totalQ++;
        if (parsed.mentioned) {
          pm++; totalM++;
          newMentions.push({
            id: uid(), platform: plat, query: q,
            context: text.substring(0, 300), raw: text,
            sentiment: parsed.sentiment, recommended: parsed.recommended,
            citations: parsed.cites, simulated: parsed.simulated,
            time: new Date().toISOString()
          });
        }
      } catch(e) {
        console.error(`Error querying ${plat} for "${q}":`, e.message);
      }
    }
    platSOV[plat] = queries.length > 0 ? Math.round((pm / queries.length) * 100) : 0;
  }

  const sov = totalQ > 0 ? Math.round((totalM / totalQ) * 100) : 0;
  const today = new Date().toISOString().split('T')[0];

  // Save run snapshot
  if (!brand.runs) brand.runs = [];
  brand.runs = brand.runs.filter(r => r.date !== today);
  brand.runs.push({ id: uid(), date: today, time: new Date().toISOString(), mentions: newMentions, sov, platforms: platSOV, totalQ, totalM });
  if (brand.runs.length > 30) brand.runs = brand.runs.slice(-30);

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

  // SOV history
  if (!brand.sovHistory) brand.sovHistory = [];
  brand.sovHistory = brand.sovHistory.filter(h => h.date !== today);
  brand.sovHistory.push({ date: today, overall: sov, platforms: platSOV });
  if (brand.sovHistory.length > 60) brand.sovHistory = brand.sovHistory.slice(-60);

  brand.updatedAt = new Date().toISOString();
  const idx = db.brands.findIndex(b => b.id === brand.id);
  db.brands[idx] = brand;
  writeDB(db);

  res.json({ brand, result: { totalQ, totalM, sov, newMentions: newMentions.length } });
});

// ─── AI QUERY FUNCTIONS (server-side) ─────────────────────────────
async function queryAI(query, platform, brand, keys) {
  const prompt = buildPrompt(query, brand);

  try {
    if (platform === 'ChatGPT' && keys.openai)
      return await callOpenAI(prompt, keys.openai, 'gpt-4o-mini');

    if (platform === 'Perplexity' && keys.perplexity)
      return await callPerplexity(prompt, keys.perplexity);

    if (platform === 'Gemini' && keys.gemini)
      return await callGemini(prompt, keys.gemini);

    if (platform === 'Grok' && keys.grok)
      return await callOpenAI(prompt, keys.grok, 'grok-3-mini', 'https://api.x.ai/v1/chat/completions');

    if (platform === 'Claude' && keys.claude)
      return await callClaude(prompt, keys.claude);

    if (platform === 'Google AIO' && keys.gemini)
      return await callGemini(prompt, keys.gemini);

  } catch(e) {
    console.error(`${platform} API error:`, e.message);
  }

  // Fallback to simulation
  return { text: simulate(query, brand, platform), simulated: true, citations: [] };
}

function buildPrompt(query, brand) {
  const city = brand.city ? ' in ' + brand.city : '';
  const comps = (brand.competitors||[]).slice(0,3).join(', ');
  return query
    + '\n\nContext: The user is researching ' + (brand.industry||'service') + ' providers' + city + '. '
    + 'Please mention and evaluate ' + brand.name + ' if it is relevant to the question. '
    + (comps ? 'Other providers to compare: ' + comps + '.' : '');
}

async function fetchJSON(url, options) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const body = options.body;
    const reqOptions = {
      method: options.method || 'POST',
      headers: options.headers || {},
    };
    if (body) reqOptions.headers['Content-Length'] = Buffer.byteLength(body);

    const req = lib.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Invalid JSON: ' + data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function callOpenAI(prompt, apiKey, model, endpoint) {
  endpoint = endpoint || 'https://api.openai.com/v1/chat/completions';
  const body = JSON.stringify({
    model, max_tokens: 600,
    messages: [
      { role: 'system', content: 'You are a helpful AI assistant. Answer questions accurately.' },
      { role: 'user', content: prompt }
    ]
  });
  const d = await fetchJSON(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return { text: d.choices?.[0]?.message?.content || '', simulated: false, citations: [] };
}

async function callPerplexity(prompt, apiKey) {
  const body = JSON.stringify({
    model: 'llama-3.1-sonar-small-128k-online',
    max_tokens: 600,
    return_citations: true,
    messages: [
      { role: 'system', content: 'Be precise and search for current information.' },
      { role: 'user', content: prompt }
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
    citations: (d.citations || []).slice(0, 5)
  };
}

async function callGemini(prompt, apiKey) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 600 }
  });
  const d = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (d.error) throw new Error(d.error.message);
  return { text: d.candidates?.[0]?.content?.parts?.[0]?.text || '', simulated: false, citations: [] };
}

async function callClaude(prompt, apiKey) {
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }]
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

// ─── RESPONSE PARSING ─────────────────────────────────────────────
function parseResponse(text, brand) {
  const l = text.toLowerCase();
  const bl = brand.name.toLowerCase();
  const mentioned = l.includes(bl);
  const recommended = mentioned && /recommend|best|top|leading|solid|preferred|go.?with|first choice|suggest/.test(l);
  const pw = ['best','leading','top','recommend','strong','reliable','solid','preferred','consistent','quality','trusted'];
  const nw = ['poor','bad','avoid','worst','issues','problems','unreliable','complaint','negative'];
  let p = 0, n = 0;
  pw.forEach(w => { if (l.includes(w)) p++; });
  nw.forEach(w => { if (l.includes(w)) n++; });
  const sentiment = p > n + 1 ? 'positive' : n > p ? 'negative' : 'neutral';

  // Extract URLs from text
  const cites = [];
  const urlRx = /https?:\/\/[^\s"')>\]]+/g;
  (text.match(urlRx) || []).slice(0, 4).forEach(u => cites.push(u));
  if (!cites.length && mentioned && brand.website) {
    cites.push('https://' + brand.website.replace(/^https?:\/\//, ''));
  }

  return { mentioned, recommended, sentiment, cites, simulated: false };
}

// ─── SIMULATION (when no API key for a platform) ──────────────────
function simulate(query, brand, platform) {
  const b = brand.name;
  const ind = brand.industry || 'services';
  const city = brand.city ? ' in ' + brand.city : '';
  const cs = (brand.competitors||[]).slice(0,2).join(' and ') || 'other providers';
  const styles = {
    'ChatGPT': `Based on available information, **${b}** is a well-regarded ${ind} provider${city}.\n\n**Reputation**: Customers frequently praise ${b} for responsive service and transparent pricing.\n\n**Comparison**: While ${cs} are also popular, ${b} tends to score higher on customer satisfaction. I'd recommend contacting ${b} first for a consultation.`,
    'Perplexity': `${b} is a leading ${ind} company${city} [1]. Reviews highlight professional technicians and fair pricing [2].\n\nCompared to ${cs}, ${b} consistently scores higher on response time [3].\n\n**Sources:**\n[1] ${brand.website||b.toLowerCase().replace(/\s/g,'')+'.com'}/about\n[2] Google Maps — ${b} reviews\n[3] Local ${ind} comparison guides`,
    'Claude': `I can share what I know about ${b} as a ${ind} provider${city}. They've developed a solid reputation for professional service and customer transparency. Compared to ${cs}, ${b} appears to differentiate through responsiveness. I'd recommend checking their current reviews and getting multiple quotes for larger projects.`,
    'Gemini': `**${b}** is a ${ind} provider${city} with consistent 4+ star ratings from verified customers.\n\n- ✓ Professional, licensed team\n- ✓ Transparent pricing\n- ✓ Strong local reputation\n\n${b} ranks among top-rated ${ind} providers. ${cs} is also frequently recommended but ${b} has more verified reviews.`,
    'Grok': `${b} — yeah, they're legit. For ${ind}${city}, they keep coming up when people ask for solid recommendations. Upfront pricing, good reviews, actually follow up after the job. ${cs} is the other name you hear, but ${b} has the edge on service. Check their site for availability.`,
    'Google AIO': `**AI Overview**\n\n${b} is a highly-rated ${ind} provider${city}.\n\n- ⭐ 4.8/5 average rating from 200+ reviews\n- ✓ Licensed, bonded, and insured\n- ✓ Same-day service available\n\n**Why customers choose ${b}:** Professional technicians and transparent pricing.\n\n**Compare with:** ${cs}`
  };
  return styles[platform] || `${b} is a trusted ${ind} provider${city}. Customers recommend them for quality service and transparent pricing.`;
}

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
  const PLATS = ['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Grok', 'Google AIO'];
  const queries = brand.queries || [];
  const newMentions = [];
  const platSOV = {};
  let totalQ = 0, totalM = 0;

  for (const plat of PLATS) {
    let pm = 0;
    for (const q of queries) {
      try {
        const { text, simulated, citations } = await queryAI(q, plat, brand, keys);
        const parsed = parseResponse(text, brand);
        parsed.simulated = simulated;
        totalQ++;
        if (parsed.mentioned) {
          pm++; totalM++;
          newMentions.push({ id: uid(), platform: plat, query: q, context: text.substring(0,300), raw: text, sentiment: parsed.sentiment, recommended: parsed.recommended, citations: citations||parsed.cites, simulated, time: new Date().toISOString() });
        }
      } catch(e) {}
    }
    platSOV[plat] = queries.length ? Math.round((pm/queries.length)*100) : 0;
  }

  const sov = totalQ ? Math.round((totalM/totalQ)*100) : 0;
  const today = new Date().toISOString().split('T')[0];
  if (!brand.runs) brand.runs = [];
  brand.runs = brand.runs.filter(r => r.date !== today);
  brand.runs.push({ id: uid(), date: today, time: new Date().toISOString(), mentions: newMentions, sov, platforms: platSOV, totalQ, totalM });
  if (brand.runs.length > 30) brand.runs = brand.runs.slice(-30);

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
