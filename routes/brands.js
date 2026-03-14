/**
 * Brand CRUD and query execution routes
 */
const express = require('express');
const router  = express.Router();

const { pool, auditLog, logApiCall, refreshPromptRunStats } = require('../config/db');
const { auth } = require('../middleware/auth');
const { uid, getBrand, saveBrand, getServerKeys } = require('../lib/helpers');
const { getPlanLimits, getUserPlan } = require('../lib/plans');
const { queryAI, fetchJSON, resetBatchCount } = require('../lib/ai-platforms');
const { parseResponse, detectCompetitors, buildBrandMatcher } = require('../lib/parser');
const { evaluateAlerts } = require('../lib/alerts');

const PLATFORM_KEY_MAP = {
  'ChatGPT': 'openai', 'Perplexity': 'perplexity', 'Claude': 'claude',
  'Gemini': 'gemini', 'Grok': 'grok', 'Google AIO': 'gemini',
  'DeepSeek': 'deepseek', 'Mistral': 'mistral'
};

// ─── BACKGROUND RUN TRACKING ────────────────────────────────────
// Tracks in-progress and recently completed runs so execution survives
// client disconnects (tab close) and frontend can poll for status.
const activeRuns = new Map(); // runId → { status, received, totalExpected, results, ... }

// Per-brand lock to prevent concurrent runs corrupting the same brand's data
const brandRunLocks = new Set(); // brandId → active if set

// Clean up completed runs after 10 minutes to avoid memory leaks
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, run] of activeRuns) {
    if (run.completedAt && run.completedAt < cutoff) {
      activeRuns.delete(id);
      brandRunLocks.delete(run.brandId);
    }
  }
  // Safety: clear stale brand locks (in case a run crashed without releasing)
  for (const brandId of brandRunLocks) {
    const hasActive = [...activeRuns.values()].some(r => r.brandId === brandId && r.status === 'running');
    if (!hasActive) brandRunLocks.delete(brandId);
  }
}, 60 * 1000);

// Cheapest platforms first — used to prioritize when plan limits truncate the list
// Based on default model cost per query (input+output)
const PLATFORM_COST_ORDER = [
  'Gemini',      // gemini-2.0-flash: $0.10/$0.40
  'Google AIO',  // gemini-2.0-flash + search: $0.10/$0.40
  'DeepSeek',    // deepseek-chat: $0.27/$1.10
  'Grok',        // grok-3-mini: $0.30/$0.50
  'Perplexity',  // sonar: $1.00/$1.00
  'Claude',      // claude-haiku: $0.80/$4.00
  'Mistral',     // mistral-large: $2.00/$6.00
  'ChatGPT'      // gpt-5-search: $2.50/$10.00
];

// List brands (includes team-shared brands)
router.get('/', auth, async (req, res) => {
  try {
    // Own brands
    const result = await pool.query('SELECT * FROM brands WHERE user_id = $1 ORDER BY created_at', [req.user.id]);
    const brands = result.rows.map(row => ({ id: row.id, userId: row.user_id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at }));
    // Team-shared brands (where user is a member)
    const teamResult = await pool.query(
      `SELECT b.*, tm.role AS team_role, u.name AS owner_name, u.email AS owner_email
       FROM brands b
       JOIN team_members tm ON b.user_id = tm.owner_id
       JOIN users u ON u.id = tm.owner_id
       WHERE tm.member_id = $1
       ORDER BY b.created_at`,
      [req.user.id]
    );
    const sharedBrands = teamResult.rows.map(row => ({
      id: row.id, userId: row.user_id, ...row.data,
      createdAt: row.created_at, updatedAt: row.updated_at,
      shared: true, teamRole: row.team_role,
      ownerName: row.owner_name, ownerEmail: row.owner_email
    }));
    res.json({ brands, sharedBrands });
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

// Get single brand (includes team access)
router.get('/:id', auth, async (req, res) => {
  try {
    let brand = await getBrand(req.params.id, req.user.id);
    // If not own brand, check team membership
    if (!brand) {
      const teamCheck = await pool.query(
        `SELECT b.*, tm.role AS team_role FROM brands b
         JOIN team_members tm ON b.user_id = tm.owner_id
         WHERE b.id = $1 AND tm.member_id = $2`,
        [req.params.id, req.user.id]
      );
      if (teamCheck.rows.length) {
        const row = teamCheck.rows[0];
        brand = { id: row.id, userId: row.user_id, ...row.data, createdAt: row.created_at, updatedAt: row.updated_at, shared: true, teamRole: row.team_role };
      }
    }
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

    // Server-side deduplication (case-insensitive)
    if (safeBody.queries && Array.isArray(safeBody.queries)) {
      const seen = new Set();
      safeBody.queries = safeBody.queries.filter(q => {
        const lower = q.toLowerCase().trim();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
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

// Run queries — execution is decoupled from the HTTP response so that
// closing the browser tab does NOT stop the run.  The server fires off
// the work in the background and the frontend can reconnect via the
// GET /:id/run-status/:runId polling endpoint.
router.post('/:id/run', auth, async (req, res) => {
  req.setTimeout(300000);
  const streaming = req.query.stream === '1';

  // ── Validation (synchronous with request) ──────────────────────
  let brand, plan, limits, keys, queries, activePlatforms, totalExpected, runId;
  let userSettings, modelPrefs;
  try {
    brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return streaming ? sseError(res, 'Brand not found') : res.status(404).json({ error: 'Brand not found' });

    plan = await getUserPlan(req.user.id);
    limits = getPlanLimits(plan);

    const queryCount = (brand.queries || []).length;
    if (queryCount > limits.queries) {
      const errMsg = `Your ${plan} plan allows up to ${limits.queries} queries per brand. You have ${queryCount}. Remove some queries or upgrade.`;
      if (streaming) return sseError(res, errMsg);
      return res.status(403).json({ error: errMsg, planLimit: true, limit: 'queries' });
    }

    // Atomic run limit check — use transaction + SELECT FOR UPDATE to prevent TOCTOU race
    const today = new Date().toISOString().split('T')[0];
    const limitClient = await pool.connect();
    try {
      await limitClient.query('BEGIN');
      const freshBrand = await limitClient.query('SELECT data FROM brands WHERE id = $1 FOR UPDATE', [brand.id]);
      const freshRuns = freshBrand.rows[0]?.data?.runs || [];
      const todayRuns = freshRuns.filter(r => (r.date || '').startsWith(today)).length;
      await limitClient.query('COMMIT');
      if (todayRuns >= limits.runsPerDay) {
        const errMsg = `Your ${plan} plan allows ${limits.runsPerDay} runs per day. Upgrade for more.`;
        if (streaming) return sseError(res, errMsg);
        return res.status(403).json({ error: errMsg, planLimit: true, limit: 'runsPerDay' });
      }
      // Soft overage warning — approaching limit
      const runUsagePct = limits.runsPerDay > 0 ? todayRuns / limits.runsPerDay : 0;
      const _overageWarnings = [];
      if (runUsagePct >= 0.8 && todayRuns < limits.runsPerDay) {
        _overageWarnings.push(`You've used ${todayRuns}/${limits.runsPerDay} daily runs (${Math.round(runUsagePct*100)}%). Consider upgrading for more capacity.`);
      }
      const queryUsagePct = limits.queries > 0 ? (brand.queries||[]).length / limits.queries : 0;
      if (queryUsagePct >= 0.8) {
        _overageWarnings.push(`You're using ${(brand.queries||[]).length}/${limits.queries} queries (${Math.round(queryUsagePct*100)}%). Upgrade for more query slots.`);
      }
      req._overageWarnings = _overageWarnings;
    } catch(txErr) {
      await limitClient.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      limitClient.release();
    }

    keys = getServerKeys();
    const userRow = await pool.query('SELECT settings FROM users WHERE id = $1', [req.user.id]);
    userSettings = userRow.rows[0]?.settings || {};
    modelPrefs = userSettings.models || {};
    const enabledPlatforms = userSettings.enabledPlatforms || {};
    queries = brand.queries || [];
    if (!queries.length) return res.status(400).json({ error: 'No queries configured' });

    let availablePlatforms = Object.entries(PLATFORM_KEY_MAP)
      .filter(([, keyName]) => keys[keyName] && keys[keyName].length > 0)
      .map(([plat]) => plat)
      .filter(plat => enabledPlatforms[plat] !== false);

    availablePlatforms.sort((a, b) => (PLATFORM_COST_ORDER.indexOf(a) === -1 ? 99 : PLATFORM_COST_ORDER.indexOf(a)) - (PLATFORM_COST_ORDER.indexOf(b) === -1 ? 99 : PLATFORM_COST_ORDER.indexOf(b)));
    if (availablePlatforms.length > limits.platforms) availablePlatforms = availablePlatforms.slice(0, limits.platforms);

    if (!availablePlatforms.length) {
      return res.status(400).json({ error: 'No AI platforms enabled. Enable platforms in Account settings.' });
    }

    const requestedPlatforms = req.body.platforms || brand.platforms;
    activePlatforms = (requestedPlatforms && Array.isArray(requestedPlatforms) && requestedPlatforms.length)
      ? availablePlatforms.filter(p => requestedPlatforms.includes(p))
      : availablePlatforms;

    if (!activePlatforms.length) {
      if (streaming) return sseError(res, 'No valid platforms selected.');
      return res.status(400).json({ error: 'No valid platforms selected.' });
    }

    totalExpected = queries.length * activePlatforms.length;
    runId = uid();

    // Prevent concurrent runs on the same brand
    if (brandRunLocks.has(brand.id)) {
      const errMsg = 'A run is already in progress for this brand. Please wait for it to finish.';
      if (streaming) return sseError(res, errMsg);
      return res.status(409).json({ error: errMsg });
    }
    brandRunLocks.add(brand.id);
  } catch(e) {
    console.error('[Run] Validation error:', e.message);
    if (streaming) return sseError(res, 'Failed to start run: ' + e.message);
    return res.status(500).json({ error: 'Failed to start run: ' + e.message });
  }

  // ── Register background run ────────────────────────────────────
  const runState = {
    status: 'running',
    brandId: brand.id,
    userId: req.user.id,
    runId,
    totalExpected,
    received: 0,
    foundCount: 0,
    errorCount: 0,
    platforms: activePlatforms,
    queries: [...queries],
    results: [],       // streamed result snapshots (without raw)
    finalData: null,
    error: null,
    startedAt: Date.now(),
    completedAt: null
  };
  activeRuns.set(runId, runState);

  // ── SSE setup (streams while client is connected) ──────────────
  let clientConnected = true;
  if (streaming) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    // When the client disconnects, stop writing but do NOT stop execution
    req.on('close', () => { clientConnected = false; });
  }
  function sendEvent(type, data) {
    if (!streaming || !clientConnected) return;
    try { res.write('data: ' + JSON.stringify({ type, ...data }) + '\n\n'); } catch(_) { clientConnected = false; }
  }

  // Send start event immediately (includes runId so frontend can poll)
  sendEvent('start', { runId, totalExpected, platforms: activePlatforms, queries: brand.queries || [] });

  // ── Background execution (runs independently of response) ──────
  const logCtx = { userId: req.user.id, brandId: brand.id, runId, logFn: logApiCall };
  const allResults = [];
  const newMentions = [];
  const platSOV = {};
  let totalQ = 0, totalM = 0;

  // Pre-compile brand regex patterns once — reused for all 80+ parse calls
  const matcher = buildBrandMatcher(brand);

  // Track consecutive failures per platform for early-abort
  const platFailCount = {};
  const FAIL_THRESHOLD = 3; // Skip remaining queries after 3 consecutive failures

  // Build flat list of all (platform, query) pairs for true parallel dispatch
  const tasks = [];
  for (const plat of activePlatforms) {
    resetBatchCount(plat);
    platFailCount[plat] = 0;
    for (const q of queries) {
      tasks.push({ plat, q });
    }
  }

  // Fire-and-forget: execution continues even if response ends
  const executionPromise = (async () => {
    try {
      console.log(`[Run] Starting ${queries.length} queries on ${activePlatforms.length} platforms (${tasks.length} total calls): ${activePlatforms.join(', ')} (runId: ${runId})`);

      // Fire all tasks in parallel — rateLimitWait() serializes per-key automatically
      const settled = await Promise.allSettled(
        tasks.map(async ({ plat, q }) => {
          // Early-abort: skip if this platform has failed too many times
          if (platFailCount[plat] >= FAIL_THRESHOLD) {
            throw new Error(`Skipped — ${plat} had ${FAIL_THRESHOLD} consecutive failures`);
          }
          const result = await queryAI(q, plat, brand, keys, modelPrefs, logCtx);
          // Reset fail count on success
          platFailCount[plat] = 0;
          return { plat, q, result };
        })
      );

      // Process all results
      const platMentionCount = {};
      for (let i = 0; i < settled.length; i++) {
        const { plat, q } = tasks[i];
        const s = settled[i];

        if (s.status === 'fulfilled') {
          try {
            const { result } = s.value;
            if (!result) { totalQ++; runState.received++; continue; }
            const { text, citations: extraCites, model: modelUsed } = result;
            if (!text || typeof text !== 'string') { totalQ++; runState.received++; continue; }
            const parsed = parseResponse(text, brand, q, matcher);
            parsed.simulated = false;
            if (extraCites && extraCites.length) parsed.cites = [...extraCites, ...parsed.cites].slice(0, 10);
            totalQ++;
            const compMentions = detectCompetitors(text, brand.competitors || [], matcher);
            const resultObj = {
              platform: plat, query: q,
              context: text.substring(0, 300), raw: text,
              simulated: false, mentioned: parsed.mentioned,
              sentiment: parsed.sentiment, recommended: parsed.recommended,
              citations: parsed.cites, model: modelUsed || plat,
              locationRelevant: parsed.locationRelevant,
              matchedLocation: parsed.matchedLocation || '',
              competitorMentions: compMentions,
              listPosition: parsed.listPosition || null
            };
            allResults.push(resultObj);
            // Update run state for polling
            runState.received++;
            if (parsed.mentioned) { runState.foundCount++; }
            runState.results.push({ ...resultObj, raw: undefined, context: text.substring(0, 300) });
            sendEvent('result', { result: { ...resultObj, raw: undefined, context: text.substring(0, 300) }, totalQ, totalM: totalM + (parsed.mentioned ? 1 : 0) });
            if (parsed.mentioned) {
              totalM++;
              if (!platMentionCount[plat]) platMentionCount[plat] = 0;
              platMentionCount[plat]++;
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
          } catch(parseErr) {
            console.error(`[${plat}] Result processing error for query "${q}":`, parseErr.message);
            allResults.push({ platform: plat, query: q, context: '[Processing Error]', raw: '', simulated: false, mentioned: false, sentiment: 'neutral', recommended: false, citations: [], error: true, errorMessage: parseErr.message });
            totalQ++;
            runState.received++;
            runState.errorCount++;
          }
        } else {
          const errMsg = s.reason?.message || 'Unknown error';
          // Increment consecutive failure count for early-abort
          platFailCount[plat] = (platFailCount[plat] || 0) + 1;
          if (platFailCount[plat] <= FAIL_THRESHOLD) {
            console.error(`[${plat}] API error for query "${q}":`, errMsg);
          }
          const errObj = {
            platform: plat, query: q,
            context: `[API Error] ${errMsg}`, raw: `[API Error] ${errMsg}`,
            simulated: false, mentioned: false,
            sentiment: 'neutral', recommended: false,
            citations: [], error: true, errorMessage: errMsg
          };
          allResults.push(errObj);
          totalQ++;
          runState.received++;
          runState.errorCount++;
          runState.results.push({ ...errObj, raw: undefined });
          sendEvent('result', { result: { ...errObj, raw: undefined }, totalQ, totalM });
        }
      }
      // Calculate per-platform SOV
      for (const plat of activePlatforms) {
        platSOV[plat] = queries.length > 0 ? Math.round(((platMentionCount[plat] || 0) / queries.length) * 100) : 0;
      }
      const durationMs = Date.now() - runState.startedAt;
      console.log(`[Run] Complete: ${totalQ} queries, ${totalM} mentions, ${allResults.filter(r=>r.error).length} errors, ${Math.round(durationMs/1000)}s (runId: ${runId})`);

      const today = new Date().toISOString().split('T')[0];
      const sov = totalQ > 0 ? Math.round((totalM / totalQ) * 100) : 0;

      // Re-fetch brand to avoid stale data
      const freshBrand = await getBrand(brand.id, req.user.id);
      const saveBrandObj = freshBrand || brand;

      if (!saveBrandObj.runs) saveBrandObj.runs = [];
      saveBrandObj.runs.push({ id: runId, date: today, time: new Date().toISOString(), durationMs, mentions: newMentions, allResults, sov, platforms: platSOV, totalQ, totalM, queries: [...queries], activePlatforms: [...activePlatforms] });

      // Archive old runs
      if (saveBrandObj.runs.length > 30) {
        const toArchive = saveBrandObj.runs.slice(0, saveBrandObj.runs.length - 30);
        for (const run of toArchive) {
          try {
            await pool.query(
              'INSERT INTO archived_runs (id, brand_id, run_date, data) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
              [run.id, saveBrandObj.id, run.date || run.time?.split('T')[0] || today, JSON.stringify(run)]
            );
          } catch(e) { /* ignore archive errors */ }
        }
        saveBrandObj.runs = saveBrandObj.runs.slice(-30);
      }

      // Rebuild queryStats — single pass over runs (O(runs × mentions) instead of O(runs × queries))
      const qsNew = {};
      queries.forEach(q => { qsNew[q] = { runs: 0, mentions: 0 }; });
      const citMap = {};
      saveBrandObj.runs.forEach(run => {
        // Count runs per query — use a Set of mentioned queries for O(1) lookup
        const mentionedQueries = new Set((run.mentions||[]).map(m => m.query));
        for (const q of queries) {
          if (!qsNew[q]) qsNew[q] = { runs: 0, mentions: 0 };
          qsNew[q].runs++;
          if (mentionedQueries.has(q)) qsNew[q].mentions++;
        }
        // Build citations map in same pass
        (run.mentions||[]).forEach(m => {
          (m.citations||[]).forEach(url => {
            if (!citMap[url]) citMap[url] = { url, count: 0 };
            citMap[url].count++;
          });
        });
      });
      saveBrandObj.queryStats = qsNew;
      saveBrandObj.citations = citMap;

      // Update all-time mentions
      if (!saveBrandObj.mentions) saveBrandObj.mentions = [];
      const keys2 = new Set(saveBrandObj.mentions.map(m => m.platform+'|'+m.query+'|'+m.time.split('T')[0]));
      const deduped = newMentions.filter(m => !keys2.has(m.platform+'|'+m.query+'|'+m.time.split('T')[0]));
      saveBrandObj.mentions = [...deduped, ...saveBrandObj.mentions].slice(0, 500);

      // SOV history
      if (!saveBrandObj.sovHistory) saveBrandObj.sovHistory = [];
      saveBrandObj.sovHistory = saveBrandObj.sovHistory.filter(h => h.date !== today);
      saveBrandObj.sovHistory.push({ date: today, overall: sov, platforms: platSOV });
      if (saveBrandObj.sovHistory.length > 90) saveBrandObj.sovHistory = saveBrandObj.sovHistory.slice(-90);

      saveBrandObj.updatedAt = new Date().toISOString();
      await saveBrand(saveBrandObj);

      // Persist individual prompt runs to prompt_runs table (Epic 1.1)
      const batchId = runId;
      for (const r of allResults) {
        try {
          await pool.query(
            `INSERT INTO prompt_runs (id, brand_id, prompt, platform, model, run_index, response_raw, response_parsed,
             mentioned, sentiment, recommended, list_position, citations, competitor_mentions, latency_ms, success,
             error_message, meta, batch_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
            [uid(), brand.id, r.query, r.platform, r.model || null, 0, r.raw || null,
             JSON.stringify({ context: r.context, locationRelevant: r.locationRelevant, matchedLocation: r.matchedLocation }),
             r.mentioned || false, r.sentiment || 'neutral', r.recommended || false,
             r.listPosition || null, JSON.stringify(r.citations || []),
             JSON.stringify(r.competitorMentions || []), null, !r.error,
             r.errorMessage || null, JSON.stringify({}), batchId]
          );
        } catch(prErr) { /* ignore individual insert errors */ }
      }

      // Persist citations with domain authority scores
      for (const r of allResults) {
        if (!r.citations || !r.citations.length || r.error) continue;
        for (let ci = 0; ci < r.citations.length; ci++) {
          try {
            const citUrl = r.citations[ci];
            const parsedUrl = new URL(citUrl);
            const domain = parsedUrl.hostname.replace(/^www\./, '');
            const daScore = scoreDomainAuthority(domain);
            const domainType = classifyDomain(domain);
            const isBrand = brand.website ? domain.includes(new URL(brand.website.startsWith('http') ? brand.website : 'https://' + brand.website).hostname.replace(/^www\./, '')) : false;
            await pool.query(
              `INSERT INTO citations (prompt_run_id, brand_id, url, domain, domain_type, domain_authority_score, position, is_brand)
               VALUES (NULL, $1, $2, $3, $4, $5, $6, $7)`,
              [brand.id, citUrl, domain, domainType, daScore, ci + 1, isBrand]
            );
          } catch(_) { /* skip invalid URLs or insert errors */ }
        }
      }

      // Refresh prompt_run_stats materialized data (Epic 1.1)
      refreshPromptRunStats(brand.id).catch(() => {});

      // Evaluate alert rules (Epic 6.2)
      const previousSOVForAlerts = saveBrandObj.sovHistory.length > 1 ? saveBrandObj.sovHistory[saveBrandObj.sovHistory.length - 2].overall : 0;
      evaluateAlerts(brand.id, {
        sov,
        previousSov: previousSOVForAlerts,
        allResults,
        platforms: platSOV
      }).catch(() => {});

      // Webhook alert
      const previousSOV = saveBrandObj.sovHistory.length > 1 ? saveBrandObj.sovHistory[saveBrandObj.sovHistory.length - 2].overall : 0;
      if (saveBrandObj.webhookUrl && sov !== previousSOV) {
        sendWebhookAlert(saveBrandObj, saveBrandObj.runs[saveBrandObj.runs.length - 1], previousSOV).catch(() => {});
      }

      const errorResults = allResults.filter(r => r.error);
      const errorCount = errorResults.length;
      const totalPlatformCount = Object.keys(PLATFORM_KEY_MAP).length;
      const platformErrors = {};
      errorResults.forEach(r => {
        if (!platformErrors[r.platform]) platformErrors[r.platform] = [];
        platformErrors[r.platform].push(r.errorMessage || 'Unknown error');
      });

      const finalResult = { totalQ, totalM, sov, newMentions: newMentions.length, activePlatforms: activePlatforms.length, skippedPlatforms: totalPlatformCount - activePlatforms.length, errorCount, platformErrors };

      // Update run state for polling
      runState.status = 'done';
      runState.finalData = { brand: saveBrandObj, result: finalResult };
      runState.completedAt = Date.now();
      brandRunLocks.delete(brand.id);

      // Stream final event if client is still connected
      sendEvent('done', { brand: saveBrandObj, result: finalResult, warnings: req._overageWarnings || [] });
      if (streaming && clientConnected) { try { res.end(); } catch(_) {} }

    } catch(e) {
      brandRunLocks.delete(brand.id);
      console.error('[Run]', e.message, e.stack);
      // Emergency save
      try {
        const eBrand = await getBrand(brand.id, req.user.id);
        if (eBrand) {
          if (!eBrand.runs) eBrand.runs = [];
          const emergSov = totalQ > 0 ? Math.round((totalM / totalQ) * 100) : 0;
          eBrand.runs.push({
            id: runId,
            date: new Date().toISOString().split('T')[0],
            time: new Date().toISOString(),
            allResults: allResults || [],
            sov: emergSov,
            totalQ, totalM,
            queries: brand.queries || [],
            activePlatforms: [],
            emergencySave: true,
            crashError: e.message
          });
          eBrand.updatedAt = new Date().toISOString();
          await saveBrand(eBrand);
          console.log(`[Run] Emergency save: ${(allResults || []).length} results preserved, crash: ${e.message}`);
        }
      } catch(saveErr) {
        console.error('[Run] Emergency save also failed:', saveErr.message);
      }

      runState.status = 'error';
      runState.error = e.message;
      runState.completedAt = Date.now();

      sendEvent('error', { error: 'Failed to run queries: ' + e.message, savedResults: (allResults || []).length });
      if (streaming && clientConnected) { try { res.end(); } catch(_) {} }
    }
  })().catch(e => {
    // Safety net: prevent unhandled rejection from crashing the process
    brandRunLocks.delete(brand.id);
    console.error('[Run] Unhandled execution error:', e.message);
    runState.status = 'error';
    runState.error = e.message;
    runState.completedAt = Date.now();
  });

  // If NOT streaming, wait for completion and return JSON
  if (!streaming) {
    await executionPromise;
    if (runState.status === 'done') {
      res.json(runState.finalData);
    } else {
      res.status(500).json({ error: runState.error || 'Run failed', savedResults: (allResults || []).length });
    }
  }
  // If streaming, response is already being written by sendEvent / res.end above
  // The executionPromise continues in the background even if the client disconnects
});

// SSE error helper
function sseError(res, msg) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.write('data: ' + JSON.stringify({ type: 'error', error: msg }) + '\n\n');
  return res.end();
}

// ─── RUN STATUS (polling endpoint for background runs) ──────────
router.get('/:id/run-status/:runId', auth, async (req, res) => {
  const runState = activeRuns.get(req.params.runId);
  if (!runState) {
    // Run not in memory — check if it completed and was saved to DB
    const brand = await getBrand(req.params.id, req.user.id);
    if (brand) {
      const run = (brand.runs || []).find(r => r.id === req.params.runId);
      if (run) {
        return res.json({
          status: 'done',
          received: run.totalQ || 0,
          totalExpected: run.totalQ || 0,
          foundCount: run.totalM || 0,
          errorCount: (run.allResults || []).filter(r => r.error).length,
          finalData: { brand, result: { totalQ: run.totalQ, totalM: run.totalM, sov: run.sov, newMentions: (run.mentions || []).length, errorCount: (run.allResults || []).filter(r => r.error).length } }
        });
      }
    }
    return res.status(404).json({ error: 'Run not found' });
  }
  // Verify ownership
  if (runState.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  const resp = {
    status: runState.status,
    runId: runState.runId,
    received: runState.received,
    totalExpected: runState.totalExpected,
    foundCount: runState.foundCount,
    errorCount: runState.errorCount,
    platforms: runState.platforms,
    results: runState.results,
    startedAt: runState.startedAt
  };
  if (runState.status === 'done') {
    resp.finalData = runState.finalData;
  } else if (runState.status === 'error') {
    resp.error = runState.error;
  }
  res.json(resp);
});

// ─── RETRY SINGLE QUERY ──────────────────────────────────────────
// Re-run one query on one platform and replace the error result in an existing run
router.post('/:id/retry-query', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const { runId, platform, query } = req.body;
    if (!runId || !platform || !query) return res.status(400).json({ error: 'Missing runId, platform, or query' });

    const run = (brand.runs || []).find(r => r.id === runId);
    if (!run || !run.allResults) return res.status(404).json({ error: 'Run not found' });

    // Find the result to retry (must be an error)
    const idx = run.allResults.findIndex(r => r.platform === platform && r.query === query && r.error);
    if (idx === -1) return res.status(400).json({ error: 'No error result found for this query/platform' });

    const keys = getServerKeys();
    const keyName = PLATFORM_KEY_MAP[platform];
    if (!keyName || !keys[keyName] || !keys[keyName].length) {
      return res.status(400).json({ error: `No API key available for ${platform}` });
    }

    const userRow = await pool.query('SELECT settings FROM users WHERE id = $1', [req.user.id]);
    const userSettings = userRow.rows[0]?.settings || {};
    const modelPrefs = userSettings.models || {};
    const logCtx = { userId: req.user.id, brandId: brand.id, runId, logFn: logApiCall };

    const result = await queryAI(query, platform, brand, keys, modelPrefs, logCtx);
    if (!result) return res.status(500).json({ error: 'No response from AI platform' });

    const matcher = buildBrandMatcher(brand);
    const { text, citations: extraCites, model: modelUsed } = result;
    const parsed = parseResponse(text, brand, query, matcher);
    parsed.simulated = false;
    if (extraCites && extraCites.length) parsed.cites = [...extraCites, ...parsed.cites].slice(0, 10);
    const compMentions = detectCompetitors(text, brand.competitors || [], matcher);

    const newResult = {
      platform, query,
      context: text.substring(0, 300), raw: text,
      simulated: false, mentioned: parsed.mentioned,
      sentiment: parsed.sentiment, recommended: parsed.recommended,
      citations: parsed.cites, model: modelUsed || platform,
      locationRelevant: parsed.locationRelevant,
      matchedLocation: parsed.matchedLocation || '',
      competitorMentions: compMentions,
      listPosition: parsed.listPosition || null
    };

    // Replace the error result in the run
    run.allResults[idx] = newResult;

    // If now mentioned, add to mentions list
    if (parsed.mentioned) {
      if (!run.mentions) run.mentions = [];
      run.mentions.push({
        id: uid(), platform, query,
        context: text.substring(0, 300), raw: text,
        sentiment: parsed.sentiment, recommended: parsed.recommended,
        citations: parsed.cites, simulated: false,
        model: modelUsed || platform,
        locationRelevant: parsed.locationRelevant,
        matchedLocation: parsed.matchedLocation || '',
        time: new Date().toISOString()
      });
    }

    // Recalculate run SOV
    const okResults = run.allResults.filter(r => !r.error);
    const mentionedResults = run.allResults.filter(r => r.mentioned);
    run.totalM = mentionedResults.length;
    run.sov = okResults.length > 0 ? Math.round((mentionedResults.length / okResults.length) * 100) : 0;

    await saveBrand(brand);
    console.log(`[Retry] ${platform} query "${query}" → ${parsed.mentioned ? 'MENTIONED' : 'not mentioned'}`);
    res.json({ success: true, result: { ...newResult, raw: undefined }, brand });
  } catch (e) {
    console.error('[Retry] Error:', e.message);
    res.status(500).json({ error: 'Retry failed: ' + e.message });
  }
});

// ─── RECHECK SINGLE QUERY (any result, not just errors) ─────────
// Re-run one query on one platform and replace the existing result
router.post('/:id/recheck-query', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const { runId, platform, query } = req.body;
    if (!runId || !platform || !query) return res.status(400).json({ error: 'Missing runId, platform, or query' });

    const run = (brand.runs || []).find(r => r.id === runId);
    if (!run || !run.allResults) return res.status(404).json({ error: 'Run not found' });

    // Find the result to recheck (any result, not just errors)
    const idx = run.allResults.findIndex(r => r.platform === platform && r.query === query);
    if (idx === -1) return res.status(400).json({ error: 'No result found for this query/platform combination' });

    const keys = getServerKeys();
    const keyName = PLATFORM_KEY_MAP[platform];
    if (!keyName || !keys[keyName] || !keys[keyName].length) {
      return res.status(400).json({ error: `No API key available for ${platform}` });
    }

    const userRow = await pool.query('SELECT settings FROM users WHERE id = $1', [req.user.id]);
    const userSettings = userRow.rows[0]?.settings || {};
    const modelPrefs = userSettings.models || {};
    const logCtx = { userId: req.user.id, brandId: brand.id, runId, logFn: logApiCall };

    const result = await queryAI(query, platform, brand, keys, modelPrefs, logCtx);
    if (!result) return res.status(500).json({ error: 'No response from AI platform' });

    const matcher = buildBrandMatcher(brand);
    const { text, citations: extraCites, model: modelUsed } = result;
    const parsed = parseResponse(text, brand, query, matcher);
    parsed.simulated = false;
    if (extraCites && extraCites.length) parsed.cites = [...extraCites, ...parsed.cites].slice(0, 10);
    const compMentions = detectCompetitors(text, brand.competitors || [], matcher);

    const oldResult = run.allResults[idx];
    const newResult = {
      platform, query,
      context: text.substring(0, 300), raw: text,
      simulated: false, mentioned: parsed.mentioned,
      sentiment: parsed.sentiment, recommended: parsed.recommended,
      citations: parsed.cites, model: modelUsed || platform,
      locationRelevant: parsed.locationRelevant,
      matchedLocation: parsed.matchedLocation || '',
      competitorMentions: compMentions,
      listPosition: parsed.listPosition || null,
      recheckedAt: new Date().toISOString(),
      previousMentioned: oldResult.mentioned || false
    };

    // Replace the result in the run
    run.allResults[idx] = newResult;

    // Update mentions list: remove old mention for this query/platform if it existed
    if (run.mentions) {
      run.mentions = run.mentions.filter(m => !(m.platform === platform && m.query === query));
    }

    // If now mentioned, add to mentions list
    if (parsed.mentioned) {
      if (!run.mentions) run.mentions = [];
      run.mentions.push({
        id: uid(), platform, query,
        context: text.substring(0, 300), raw: text,
        sentiment: parsed.sentiment, recommended: parsed.recommended,
        citations: parsed.cites, simulated: false,
        model: modelUsed || platform,
        locationRelevant: parsed.locationRelevant,
        matchedLocation: parsed.matchedLocation || '',
        time: new Date().toISOString()
      });
    }

    // Recalculate run SOV
    const okResults = run.allResults.filter(r => !r.error);
    const mentionedResults = run.allResults.filter(r => r.mentioned);
    run.totalM = mentionedResults.length;
    run.sov = okResults.length > 0 ? Math.round((mentionedResults.length / okResults.length) * 100) : 0;

    // Recalculate platform SOV
    if (run.platforms) {
      const queries = brand.queries || [];
      const platMentions = {};
      run.allResults.forEach(r => {
        if (!platMentions[r.platform]) platMentions[r.platform] = { m: 0, t: 0 };
        platMentions[r.platform].t++;
        if (r.mentioned) platMentions[r.platform].m++;
      });
      Object.entries(platMentions).forEach(([p, c]) => {
        run.platforms[p] = c.t > 0 ? Math.round((c.m / c.t) * 100) : 0;
      });
    }

    // Update all-time mentions
    if (brand.mentions) {
      const today = new Date().toISOString().split('T')[0];
      brand.mentions = brand.mentions.filter(m => !(m.platform === platform && m.query === query && (m.time || '').startsWith(today)));
      if (parsed.mentioned) {
        brand.mentions.unshift({
          id: uid(), platform, query,
          context: text.substring(0, 300), raw: text,
          sentiment: parsed.sentiment, recommended: parsed.recommended,
          citations: parsed.cites, simulated: false,
          model: modelUsed || platform,
          locationRelevant: parsed.locationRelevant,
          matchedLocation: parsed.matchedLocation || '',
          time: new Date().toISOString()
        });
        brand.mentions = brand.mentions.slice(0, 500);
      }
    }

    // Rebuild queryStats — single pass
    const allQueries = brand.queries || [];
    const qsNew = {};
    allQueries.forEach(q => { qsNew[q] = { runs: 0, mentions: 0 }; });
    (brand.runs || []).forEach(r => {
      const mentionedQueries = new Set((r.mentions || []).map(m => m.query));
      for (const q of allQueries) {
        if (!qsNew[q]) qsNew[q] = { runs: 0, mentions: 0 };
        qsNew[q].runs++;
        if (mentionedQueries.has(q)) qsNew[q].mentions++;
      }
    });
    brand.queryStats = qsNew;

    brand.updatedAt = new Date().toISOString();
    await saveBrand(brand);

    const statusChange = oldResult.mentioned !== parsed.mentioned
      ? (parsed.mentioned ? 'now_mentioned' : 'no_longer_mentioned')
      : 'unchanged';

    console.log(`[Recheck] ${platform} query "${query}" → ${parsed.mentioned ? 'MENTIONED' : 'not mentioned'} (was: ${oldResult.mentioned ? 'mentioned' : 'not mentioned'})`);
    res.json({
      success: true,
      result: { ...newResult, raw: undefined },
      statusChange,
      brand
    });
  } catch (e) {
    console.error('[Recheck] Error:', e.message);
    res.status(500).json({ error: 'Recheck failed: ' + e.message });
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

  const MAX_RETRIES = 3;
  const bodyStr = JSON.stringify(payload);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr
      });
      console.log(`[Webhook] Alert sent for ${brand.name} to ${url}${attempt > 0 ? ` (attempt ${attempt + 1})` : ''}`);
      return;
    } catch(e) {
      if (attempt < MAX_RETRIES) {
        const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`[Webhook] Attempt ${attempt + 1} failed for ${brand.name}: ${e.message}, retrying in ${delayMs}ms`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        console.error(`[Webhook] All ${MAX_RETRIES + 1} attempts failed for ${brand.name}:`, e.message);
      }
    }
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
  // Sort by cost (cheapest first) so plan limits pick the most cost-effective platforms
  activePlatforms.sort((a, b) => (PLATFORM_COST_ORDER.indexOf(a) === -1 ? 99 : PLATFORM_COST_ORDER.indexOf(a)) - (PLATFORM_COST_ORDER.indexOf(b) === -1 ? 99 : PLATFORM_COST_ORDER.indexOf(b)));
  if (activePlatforms.length > limits.platforms) activePlatforms = activePlatforms.slice(0, limits.platforms);
  if (!activePlatforms.length || !queries.length) return;

  const cronStartTime = Date.now();
  const newMentions = [];
  const allResults = [];
  const platSOV = {};
  let totalQ = 0, totalM = 0;
  const logCtx = { userId: brand.userId, brandId: brand.id, logFn: logApiCall };

  // Pre-compile brand matcher once for all parse calls
  const matcher = buildBrandMatcher(brand);
  const platFailCount = {};
  const FAIL_THRESHOLD = 3;

  // Build flat task list and fire all in parallel
  const tasks = [];
  for (const plat of activePlatforms) {
    resetBatchCount(plat);
    platFailCount[plat] = 0;
    for (const q of queries) tasks.push({ plat, q });
  }

  const settled = await Promise.allSettled(
    tasks.map(async ({ plat, q }) => {
      if (platFailCount[plat] >= FAIL_THRESHOLD) throw new Error(`Skipped — ${plat} down`);
      const result = await queryAI(q, plat, brand, keys, modelPrefs, logCtx);
      platFailCount[plat] = 0;
      return { plat, q, result };
    })
  );

  const platMentionCount = {};
  for (let i = 0; i < settled.length; i++) {
    const { plat, q } = tasks[i];
    const s = settled[i];
    if (s.status === 'fulfilled') {
      try {
        const { result } = s.value;
        if (!result) { totalQ++; continue; }
        const { text, citations: extraCites, model: modelUsed } = result;
        if (!text || typeof text !== 'string') { totalQ++; continue; }
        const parsed = parseResponse(text, brand, q, matcher);
        if (extraCites && extraCites.length) parsed.cites = [...extraCites, ...parsed.cites].slice(0, 10);
        totalQ++;
        allResults.push({
          platform: plat, query: q,
          context: text.substring(0, 300), raw: text,
          simulated: false, mentioned: parsed.mentioned,
          sentiment: parsed.sentiment, recommended: parsed.recommended,
          citations: parsed.cites, model: modelUsed || plat,
          locationRelevant: parsed.locationRelevant,
          matchedLocation: parsed.matchedLocation || '',
          listPosition: parsed.listPosition || null
        });
        if (parsed.mentioned) {
          totalM++;
          if (!platMentionCount[plat]) platMentionCount[plat] = 0;
          platMentionCount[plat]++;
          newMentions.push({
            id: uid(), platform: plat, query: q,
            context: text.substring(0, 300), raw: text,
            sentiment: parsed.sentiment, recommended: parsed.recommended,
            citations: parsed.cites, simulated: false,
            model: modelUsed || plat,
            locationRelevant: parsed.locationRelevant,
            matchedLocation: parsed.matchedLocation || '',
            listPosition: parsed.listPosition || null,
            time: new Date().toISOString()
          });
        }
      } catch(parseErr) {
        console.error(`[Cron][${plat}] Result processing error for "${q}":`, parseErr.message);
        allResults.push({ platform: plat, query: q, context: '[Processing Error]', raw: '', mentioned: false, sentiment: 'neutral', recommended: false, citations: [], error: true, errorMessage: parseErr.message });
        totalQ++;
      }
    } else {
      platFailCount[plat] = (platFailCount[plat] || 0) + 1;
      const errMsg = s.reason?.message || 'Unknown error';
      if (platFailCount[plat] <= FAIL_THRESHOLD) console.error(`[Cron][${plat}] API error for "${q}":`, errMsg);
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
  for (const plat of activePlatforms) {
    platSOV[plat] = queries.length ? Math.round(((platMentionCount[plat] || 0) / queries.length) * 100) : 0;
  }

  const sov = totalQ ? Math.round((totalM/totalQ)*100) : 0;
  if (!brand.runs) brand.runs = [];
  brand.runs.push({ id: uid(), date: today, time: new Date().toISOString(), durationMs: Date.now() - cronStartTime, mentions: newMentions, allResults, sov, platforms: platSOV, totalQ, totalM, queries: [...queries], activePlatforms: [...activePlatforms] });

  // Archive old runs
  if (brand.runs.length > 30) {
    const toArchive = brand.runs.slice(0, brand.runs.length - 30);
    for (const run of toArchive) {
      try {
        await pool.query(
          'INSERT INTO archived_runs (id, brand_id, run_date, data) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
          [run.id, brand.id, run.date || today, JSON.stringify(run)]
        );
      } catch(e) { /* ignore */ }
    }
    brand.runs = brand.runs.slice(-30);
  }

  if (!brand.mentions) brand.mentions = [];
  const existKeys = new Set(brand.mentions.map(m => m.platform+'|'+m.query+'|'+m.time.split('T')[0]));
  brand.mentions = [...newMentions.filter(m => !existKeys.has(m.platform+'|'+m.query+'|'+m.time.split('T')[0])), ...brand.mentions].slice(0,500);

  const qsNew = {};
  queries.forEach(q => { qsNew[q] = { runs: 0, mentions: 0 }; });
  const citMap = {};
  brand.runs.forEach(run => {
    const mentionedQueries = new Set((run.mentions||[]).map(m => m.query));
    for (const q of queries) {
      if (!qsNew[q]) qsNew[q] = { runs: 0, mentions: 0 };
      qsNew[q].runs++;
      if (mentionedQueries.has(q)) qsNew[q].mentions++;
    }
    (run.mentions||[]).forEach(m => {
      (m.citations||[]).forEach(url => {
        if (!citMap[url]) citMap[url] = { url, count: 0 };
        citMap[url].count++;
      });
    });
  });
  brand.queryStats = qsNew;
  brand.citations = citMap;

  if (!brand.sovHistory) brand.sovHistory = [];
  brand.sovHistory = brand.sovHistory.filter(h => h.date !== today);
  brand.sovHistory.push({ date: today, overall: sov, platforms: platSOV });
  if (brand.sovHistory.length > 90) brand.sovHistory = brand.sovHistory.slice(-90);

  // Persist individual prompt runs (Epic 1.1)
  const cronBatchId = brand.runs[brand.runs.length - 1]?.id || uid();
  for (const r of allResults) {
    try {
      await pool.query(
        `INSERT INTO prompt_runs (id, brand_id, prompt, platform, model, run_index, response_raw, response_parsed,
         mentioned, sentiment, recommended, list_position, citations, competitor_mentions, latency_ms, success,
         error_message, meta, batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [uid(), brand.id, r.query, r.platform, r.model || null, 0, r.raw || null,
         JSON.stringify({ context: r.context, locationRelevant: r.locationRelevant, matchedLocation: r.matchedLocation }),
         r.mentioned || false, r.sentiment || 'neutral', r.recommended || false,
         r.listPosition || null, JSON.stringify(r.citations || []),
         JSON.stringify(r.competitorMentions || []), null, !r.error,
         r.errorMessage || null, JSON.stringify({}), cronBatchId]
      );
    } catch(prErr) { /* ignore */ }
  }

  // Refresh stats + evaluate alerts
  refreshPromptRunStats(brand.id).catch(() => {});
  evaluateAlerts(brand.id, { sov, previousSov: brand.sovHistory?.length > 1 ? brand.sovHistory[brand.sovHistory.length - 2]?.overall : 0, allResults, platforms: platSOV }).catch(() => {});

  brand.updatedAt = new Date().toISOString();
  await saveBrand(brand);
}

// ── Citation domain scoring helpers ──────────────────────
function scoreDomainAuthority(domain) {
  const tier1 = ['wikipedia.org', 'nytimes.com', 'bbc.com', 'reuters.com', 'forbes.com', 'bloomberg.com', 'washingtonpost.com', 'theguardian.com', 'cnn.com', 'github.com'];
  const tier2 = ['techcrunch.com', 'wired.com', 'theverge.com', 'arstechnica.com', 'g2.com', 'trustpilot.com', 'yelp.com', 'capterra.com', 'reddit.com', 'youtube.com', 'linkedin.com', 'medium.com', 'tripadvisor.com', 'bbb.org'];
  const tier3 = ['twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'glassdoor.com', 'crunchbase.com', 'producthunt.com', 'quora.com'];
  if (tier1.some(s => domain.includes(s))) return 90;
  if (tier2.some(s => domain.includes(s))) return 70;
  if (tier3.some(s => domain.includes(s))) return 50;
  if (domain.endsWith('.gov')) return 85;
  if (domain.endsWith('.edu')) return 80;
  if (domain.endsWith('.org')) return 45;
  return 30;
}

function classifyDomain(domain) {
  const reviewSites = ['g2.com', 'capterra.com', 'trustpilot.com', 'yelp.com', 'tripadvisor.com', 'bbb.org', 'glassdoor.com'];
  const newsSites = ['nytimes.com', 'reuters.com', 'bbc.com', 'forbes.com', 'bloomberg.com', 'techcrunch.com', 'theverge.com', 'wired.com'];
  const socialSites = ['reddit.com', 'twitter.com', 'x.com', 'linkedin.com', 'facebook.com', 'youtube.com'];
  if (reviewSites.some(s => domain.includes(s))) return 'review_site';
  if (newsSites.some(s => domain.includes(s))) return 'news';
  if (socialSites.some(s => domain.includes(s))) return 'social';
  if (domain.includes('wikipedia.org')) return 'encyclopedia';
  if (domain.endsWith('.gov')) return 'government';
  if (domain.endsWith('.edu')) return 'academic';
  return 'other';
}

module.exports = router;
module.exports.runBrandQueries = runBrandQueries;
