/**
 * Brand CRUD and query execution routes
 */
const express = require('express');
const router  = express.Router();

const { pool } = require('../config/db');
const { auth } = require('../middleware/auth');
const { uid, getBrand, saveBrand, getServerKeys } = require('../lib/helpers');
const { getPlanLimits, getUserPlan } = require('../lib/plans');
const { queryAI, fetchJSON, resetBatchCount } = require('../lib/ai-platforms');
const { parseResponse, detectCompetitors } = require('../lib/parser');

const PLATFORM_KEY_MAP = {
  'ChatGPT': 'openai', 'Perplexity': 'perplexity', 'Claude': 'claude',
  'Gemini': 'gemini', 'Grok': 'grok', 'Google AIO': 'gemini',
  'DeepSeek': 'deepseek', 'Mistral': 'mistral'
};

// List brands
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM brands WHERE user_id = $1 ORDER BY created_at', [req.user.id]);
    const brands = result.rows.map(row => ({ id: row.id, userId: row.user_id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at }));
    res.json({ brands });
  } catch(e) {
    console.error('[Brands GET]', e.message);
    res.status(500).json({ error: 'Failed to load brands' });
  }
});

// Create brand
router.post('/', auth, async (req, res) => {
  try {
    const { name, industry, website, city, goal } = req.body;
    if (!name) return res.status(400).json({ error: 'Brand name required' });
    // Input length validation
    if (typeof name !== 'string' || name.length > 100) return res.status(400).json({ error: 'Brand name must be 100 characters or less' });
    if (industry && (typeof industry !== 'string' || industry.length > 100)) return res.status(400).json({ error: 'Industry must be 100 characters or less' });
    if (website && (typeof website !== 'string' || website.length > 500)) return res.status(400).json({ error: 'Website URL too long' });
    if (city && (typeof city !== 'string' || city.length > 100)) return res.status(400).json({ error: 'City must be 100 characters or less' });

    const countResult = await pool.query('SELECT COUNT(*) FROM brands WHERE user_id = $1', [req.user.id]);
    const plan = await getUserPlan(req.user.id);
    const limits = getPlanLimits(plan);
    if (parseInt(countResult.rows[0].count) >= limits.brands) {
      return res.status(403).json({ error: `Your ${plan} plan allows up to ${limits.brands} brand(s). Upgrade to add more.`, planLimit: true, limit: 'brands', current: parseInt(countResult.rows[0].count), max: limits.brands });
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
      runs: [], mentions: [], queryStats: {}, sovHistory: [],
      citations: {}, notes: {}, schedule: null
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

// Get single brand
router.get('/:id', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    res.json({ brand });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update brand
router.put('/:id', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const plan = await getUserPlan(req.user.id);
    const limits = getPlanLimits(plan);

    const allowedFields = ['name', 'industry', 'website', 'description', 'queries', 'platforms', 'competitors', 'aliases', 'locations', 'schedule', 'city', 'goal', 'nearbyAreas', 'webhookUrl'];
    const safeBody = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) safeBody[key] = req.body[key];
    }

    // Input length validation for string fields
    const strLimits = { name: 100, industry: 100, website: 500, description: 1000, city: 100, webhookUrl: 500 };
    for (const [field, maxLen] of Object.entries(strLimits)) {
      if (safeBody[field] && (typeof safeBody[field] !== 'string' || safeBody[field].length > maxLen)) {
        return res.status(400).json({ error: `${field} must be ${maxLen} characters or less` });
      }
    }
    // Validate array fields have string items with reasonable lengths
    const arrLimits = { queries: 300, competitors: 100, aliases: 100, locations: 100, nearbyAreas: 100 };
    for (const [field, maxItemLen] of Object.entries(arrLimits)) {
      if (safeBody[field] && Array.isArray(safeBody[field])) {
        if (safeBody[field].some(item => typeof item !== 'string' || item.length > maxItemLen)) {
          return res.status(400).json({ error: `Each ${field} item must be a string of ${maxItemLen} characters or less` });
        }
      }
    }

    if (safeBody.queries && safeBody.queries.length > limits.queries) {
      return res.status(403).json({ error: `Your ${plan} plan allows up to ${limits.queries} queries. Upgrade for more.`, planLimit: true, limit: 'queries', max: limits.queries });
    }
    if (safeBody.competitors && safeBody.competitors.length > limits.competitors) {
      return res.status(403).json({ error: limits.competitors === 0 ? `Competitor tracking is available on Pro and Agency plans.` : `Your ${plan} plan allows up to ${limits.competitors} competitors. Upgrade for more.`, planLimit: true, limit: 'competitors', max: limits.competitors });
    }
    if (safeBody.schedule && !limits.scheduledRuns) {
      return res.status(403).json({ error: `Scheduled runs are available on Pro and Agency plans. Upgrade to enable.`, planLimit: true, limit: 'scheduledRuns' });
    }
    if (safeBody.webhookUrl && safeBody.webhookUrl.trim() && !isWebhookUrlSafe(safeBody.webhookUrl.trim())) {
      return res.status(400).json({ error: 'Webhook URL must be HTTPS and cannot target local/private addresses.' });
    }

    const updated = { ...brand, ...safeBody, id: brand.id, userId: req.user.id, updatedAt: new Date().toISOString() };
    await saveBrand(updated);
    res.json({ brand: updated });
  } catch(e) {
    console.error('[Brand PUT]', e.message);
    res.status(500).json({ error: 'Failed to update brand' });
  }
});

// Delete brand
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM brands WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Brand not found' });
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Failed to delete brand' });
  }
});

// Run queries
router.post('/:id/run', auth, async (req, res) => {
  // Allow up to 5 minutes for large query runs across multiple platforms
  req.setTimeout(300000);
  try {
  const brand = await getBrand(req.params.id, req.user.id);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });

  const plan = await getUserPlan(req.user.id);
  const limits = getPlanLimits(plan);

  const queryCount = (brand.queries || []).length;
  if (queryCount > limits.queries) {
    return res.status(403).json({ error: `Your ${plan} plan allows up to ${limits.queries} queries per brand. You have ${queryCount}. Remove some queries or upgrade.`, planLimit: true, limit: 'queries' });
  }

  const today = new Date().toISOString().split('T')[0];
  const todayRuns = (brand.runs || []).filter(r => (r.date || '').startsWith(today)).length;
  if (todayRuns >= limits.runsPerDay) {
    return res.status(403).json({ error: `Your ${plan} plan allows ${limits.runsPerDay} runs per day. Upgrade for more.`, planLimit: true, limit: 'runsPerDay' });
  }

  const keys = getServerKeys();
  // Load user settings (model preferences + enabled platforms)
  const userRow = await pool.query('SELECT settings FROM users WHERE id = $1', [req.user.id]);
  const userSettings = userRow.rows[0]?.settings || {};
  const modelPrefs = userSettings.models || {};
  const enabledPlatforms = userSettings.enabledPlatforms || {};
  const queries = brand.queries || [];
  if (!queries.length) return res.status(400).json({ error: 'No queries configured' });

  let availablePlatforms = Object.entries(PLATFORM_KEY_MAP)
    .filter(([, keyName]) => keys[keyName] && keys[keyName].length > 0)
    .map(([plat]) => plat)
    .filter(plat => enabledPlatforms[plat] !== false); // respect user toggle

  if (availablePlatforms.length > limits.platforms) {
    availablePlatforms = availablePlatforms.slice(0, limits.platforms);
  }

  if (!availablePlatforms.length) {
    return res.status(400).json({ error: 'No AI platforms enabled. Enable platforms in Account settings.' });
  }

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

  // Run all platforms in parallel, and within each platform run queries
  // in parallel batches (batch size = number of API keys for that platform)
  async function runPlatform(plat) {
    let pm = 0;
    const keyName = PLATFORM_KEY_MAP[plat];
    const keyCount = (keys[keyName] || []).length || 1;
    const concurrency = Math.min(keyCount, queries.length);
    resetBatchCount(plat);

    // Process queries in parallel batches
    for (let i = 0; i < queries.length; i += concurrency) {
      const batch = queries.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async (q) => {
          const result = await queryAI(q, plat, brand, keys, modelPrefs);
          return { q, result };
        })
      );

      for (let bi = 0; bi < batchResults.length; bi++) {
        const settled = batchResults[bi];
        const q = batch[bi];
        if (settled.status === 'fulfilled') {
          const { result } = settled.value;
          if (!result) { totalQ++; continue; }
          const { text, citations: extraCites, model: modelUsed } = result;
          const parsed = parseResponse(text, brand, q);
          parsed.simulated = false;
          if (extraCites && extraCites.length) parsed.cites = [...extraCites, ...parsed.cites].slice(0,10);
          totalQ++;
          const compMentions = detectCompetitors(text, brand.competitors || []);
          allResults.push({
            platform: plat, query: q,
            context: text.substring(0, 300), raw: text,
            simulated: false, mentioned: parsed.mentioned,
            sentiment: parsed.sentiment, recommended: parsed.recommended,
            citations: parsed.cites, model: modelUsed || plat,
            locationRelevant: parsed.locationRelevant,
            matchedLocation: parsed.matchedLocation || '',
            competitorMentions: compMentions
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
        } else {
          const errMsg = settled.reason?.message || 'Unknown error';
          console.error(`[${plat}] API error for query "${q}":`, errMsg);
          allResults.push({
            platform: plat, query: q,
            context: `[API Error] ${errMsg}`, raw: `[API Error] ${errMsg}`,
            simulated: false, mentioned: false,
            sentiment: 'neutral', recommended: false,
            citations: [], error: true, errorMessage: errMsg
          });
          totalQ++;
        }
      }
    }
    platSOV[plat] = queries.length > 0 ? Math.round((pm / queries.length) * 100) : 0;
  }

  // Run all platforms simultaneously
  console.log(`[Run] Starting ${queries.length} queries on ${activePlatforms.length} platforms: ${activePlatforms.join(', ')}`);
  await Promise.all(activePlatforms.map(plat => runPlatform(plat)));
  console.log(`[Run] Complete: ${totalQ} queries, ${totalM} mentions, ${allResults.filter(r=>r.error).length} errors`);

  const sov = totalQ > 0 ? Math.round((totalM / totalQ) * 100) : 0;

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

  // Update all-time mentions
  if (!brand.mentions) brand.mentions = [];
  const keys2 = new Set(brand.mentions.map(m => m.platform+'|'+m.query+'|'+m.time.split('T')[0]));
  const deduped = newMentions.filter(m => !keys2.has(m.platform+'|'+m.query+'|'+m.time.split('T')[0]));
  brand.mentions = [...deduped, ...brand.mentions].slice(0, 500);

  // SOV history
  if (!brand.sovHistory) brand.sovHistory = [];
  brand.sovHistory = brand.sovHistory.filter(h => h.date !== today);
  brand.sovHistory.push({ date: today, overall: sov, platforms: platSOV });
  if (brand.sovHistory.length > 90) brand.sovHistory = brand.sovHistory.slice(-90);

  brand.updatedAt = new Date().toISOString();
  await saveBrand(brand);

  // Send webhook alert if configured and SOV changed
  const previousSOV = brand.sovHistory.length > 1 ? brand.sovHistory[brand.sovHistory.length - 2].overall : 0;
  if (brand.webhookUrl && sov !== previousSOV) {
    sendWebhookAlert(brand, brand.runs[brand.runs.length - 1], previousSOV).catch(() => {});
  }

  const errorCount = allResults.filter(r => r.error).length;
  const totalPlatformCount = Object.keys(PLATFORM_KEY_MAP).length;
  res.json({ brand, result: { totalQ, totalM, sov, newMentions: newMentions.length, activePlatforms: activePlatforms.length, skippedPlatforms: totalPlatformCount - activePlatforms.length, errorCount } });
  } catch(e) {
    console.error('[Run]', e.message);
    res.status(500).json({ error: 'Failed to run queries' });
  }
});

// Validate webhook URL is safe (prevent SSRF)
function isWebhookUrlSafe(urlStr) {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    // Reject localhost, private IPs, and metadata endpoints
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
    if (hostname === '0.0.0.0') return false;
    if (hostname === '169.254.169.254') return false; // cloud metadata
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname)) return false;
    if (/^(::ffff:)?(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname)) return false; // IPv6-mapped
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;
    return true;
  } catch { return false; }
}

// Webhook alert helper
async function sendWebhookAlert(brand, run, previousSOV) {
  if (!brand.webhookUrl) return;
  const url = brand.webhookUrl.trim();
  if (!isWebhookUrlSafe(url)) { console.warn(`[Webhook] Blocked unsafe URL: ${url}`); return; }

  const sov = run.sov;
  const change = sov - previousSOV;
  const direction = change > 0 ? 'increased' : change < 0 ? 'decreased' : 'unchanged';

  const payload = {
    event: 'sov_change',
    brand: brand.name,
    sov, previousSOV, change, direction,
    mentions: (run.mentions || []).length,
    totalQueries: run.totalQ,
    platforms: run.platforms,
    timestamp: new Date().toISOString(),
    summary: `${brand.name} SOV ${direction}: ${previousSOV}% → ${sov}% (${change > 0 ? '+' : ''}${change}%)`
  };

  try {
    await fetchJSON(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log(`[Webhook] Alert sent for ${brand.name} to ${url}`);
  } catch(e) {
    console.error(`[Webhook] Failed for ${brand.name}:`, e.message);
  }
}

// Scheduled run helper (exported for cron)
async function runBrandQueries(brand) {
  const keys = getServerKeys();
  const queries = brand.queries || [];

  // Enforce plan limits for scheduled runs
  const plan = await getUserPlan(brand.userId);
  const limits = getPlanLimits(plan);
  if (!limits.scheduledRuns) return; // plan doesn't allow scheduled runs

  const today = new Date().toISOString().split('T')[0];
  const todayRuns = (brand.runs || []).filter(r => (r.date || '').startsWith(today)).length;
  if (todayRuns >= limits.runsPerDay) return; // daily run limit reached

  // Load user settings for scheduled runs
  const userRow = await pool.query('SELECT settings FROM users WHERE id = $1', [brand.userId]);
  const userSettings = userRow.rows[0]?.settings || {};
  const modelPrefs = userSettings.models || {};
  const enabledPlatforms = userSettings.enabledPlatforms || {};
  let activePlatforms = Object.entries(PLATFORM_KEY_MAP)
    .filter(([, keyName]) => keys[keyName] && keys[keyName].length > 0)
    .map(([plat]) => plat)
    .filter(plat => enabledPlatforms[plat] !== false); // respect user toggle
  if (activePlatforms.length > limits.platforms) activePlatforms = activePlatforms.slice(0, limits.platforms);
  if (!activePlatforms.length || !queries.length) return;

  const newMentions = [];
  const allResults = [];
  const platSOV = {};
  let totalQ = 0, totalM = 0;

  // Run all platforms in parallel with batched queries per platform
  async function runCronPlatform(plat) {
    let pm = 0;
    const keyName = PLATFORM_KEY_MAP[plat];
    const keyCount = (keys[keyName] || []).length || 1;
    const concurrency = Math.min(keyCount, queries.length);
    resetBatchCount(plat);

    for (let i = 0; i < queries.length; i += concurrency) {
      const batch = queries.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async (q) => {
          const result = await queryAI(q, plat, brand, keys, modelPrefs);
          return { q, result };
        })
      );
      for (let bi = 0; bi < batchResults.length; bi++) {
        const settled = batchResults[bi];
        const q = batch[bi];
        if (settled.status === 'fulfilled') {
          const { result } = settled.value;
          if (!result) { totalQ++; continue; }
          const { text, citations: extraCites, model: modelUsed } = result;
          const parsed = parseResponse(text, brand, q);
          if (extraCites && extraCites.length) parsed.cites = [...extraCites, ...parsed.cites].slice(0, 10);
          totalQ++;
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
        } else {
          const errMsg = settled.reason?.message || 'Unknown error';
          console.error(`[Cron][${plat}] API error for "${q}":`, errMsg);
          allResults.push({
            platform: plat, query: q,
            context: `[API Error] ${errMsg}`, raw: `[API Error] ${errMsg}`,
            simulated: false, mentioned: false,
            sentiment: 'neutral', recommended: false,
            citations: [], error: true, errorMessage: errMsg
          });
          totalQ++;
        }
      }
    }
    platSOV[plat] = queries.length ? Math.round((pm/queries.length)*100) : 0;
  }

  await Promise.all(activePlatforms.map(plat => runCronPlatform(plat)));

  const sov = totalQ ? Math.round((totalM/totalQ)*100) : 0;
  if (!brand.runs) brand.runs = [];
  brand.runs.push({ id: uid(), date: today, time: new Date().toISOString(), mentions: newMentions, allResults, sov, platforms: platSOV, totalQ, totalM, queries: [...queries], activePlatforms: [...activePlatforms] });
  if (brand.runs.length > 50) brand.runs = brand.runs.slice(-50);

  if (!brand.mentions) brand.mentions = [];
  const existKeys = new Set(brand.mentions.map(m => m.platform+'|'+m.query+'|'+m.time.split('T')[0]));
  brand.mentions = [...newMentions.filter(m => !existKeys.has(m.platform+'|'+m.query+'|'+m.time.split('T')[0])), ...brand.mentions].slice(0,500);

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

  if (!brand.sovHistory) brand.sovHistory = [];
  brand.sovHistory = brand.sovHistory.filter(h => h.date !== today);
  brand.sovHistory.push({ date: today, overall: sov, platforms: platSOV });
  if (brand.sovHistory.length > 90) brand.sovHistory = brand.sovHistory.slice(-90);

  brand.updatedAt = new Date().toISOString();
  await saveBrand(brand);
}

module.exports = router;
module.exports.runBrandQueries = runBrandQueries;
