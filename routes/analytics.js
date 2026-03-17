/**
 * Analytics & advanced feature routes
 * Covers: Epics 1.3-1.5, 2.1-2.4, 3.4, 4.3-4.4, 5.2, 6.1-6.3, 7.1-7.2, 8.1-8.3
 */
const express = require('express');
const router = express.Router();

const { pool, refreshPromptRunStats } = require('../config/db');
const { auth } = require('../middleware/auth');
const { uid, getBrand } = require('../lib/helpers');
const { wilsonInterval, descriptiveStats, trendAnalysis, detectDiagnosticEvents } = require('../lib/statistics');
const { generateRecommendations, getPlaybook, getAllPlaybooks } = require('../lib/recommendations');
const { getPlanLimits, getUserPlan, PLAN_LIMITS } = require('../lib/plans');

// ═══════════════════════════════════════════════════════════
// Epic 1.3: Methodology & Platform Meta
// ═══════════════════════════════════════════════════════════

// Platform configuration with collection methods
const PLATFORM_CONFIG = {
  ChatGPT:    { collection_method: 'api', endpoint: 'api.openai.com', rate_limits: '10k RPM', search_capable: true },
  Perplexity: { collection_method: 'api', endpoint: 'api.perplexity.ai', rate_limits: '1k RPM', search_capable: true },
  Claude:     { collection_method: 'api', endpoint: 'api.anthropic.com', rate_limits: '4k RPM', search_capable: true },
  Gemini:     { collection_method: 'api', endpoint: 'generativelanguage.googleapis.com', rate_limits: '15 RPM (free)', search_capable: false },
  Grok:       { collection_method: 'api', endpoint: 'api.x.ai', rate_limits: '60 RPM', search_capable: true },
  'Google AIO': { collection_method: 'api', endpoint: 'generativelanguage.googleapis.com', rate_limits: '15 RPM', search_capable: true },
  DeepSeek:   { collection_method: 'api', endpoint: 'api.deepseek.com', rate_limits: '60 RPM', search_capable: false },
};

// GET /api/meta/platforms — platform health & methodology (Epic 1.4)
router.get('/meta/platforms', auth, async (req, res) => {
  try {
    // Get recent success/failure rates from api_logs
    const stats = await pool.query(`
      SELECT platform,
        COUNT(*)::int AS total_calls,
        COUNT(*) FILTER (WHERE status = 'ok')::int AS successes,
        COUNT(*) FILTER (WHERE status = 'error')::int AS failures,
        AVG(response_ms)::int AS avg_latency,
        MAX(created_at) AS last_call
      FROM api_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY platform
    `);

    const platforms = {};
    for (const [name, config] of Object.entries(PLATFORM_CONFIG)) {
      const stat = stats.rows.find(s => s.platform === name) || {};
      const failureRate = stat.total_calls > 0 ? stat.failures / stat.total_calls : 0;
      platforms[name] = {
        ...config,
        status: failureRate > 0.5 ? 'red' : failureRate > 0.2 ? 'amber' : 'green',
        total_calls_24h: stat.total_calls || 0,
        success_rate: stat.total_calls > 0 ? Math.round((stat.successes / stat.total_calls) * 100) : null,
        avg_latency_ms: stat.avg_latency || null,
        last_successful_call: stat.last_call || null
      };
    }

    res.json({ platforms });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load platform data' });
  }
});

// GET /api/meta/methodology — how Trackly measures (Epic 1.3)
router.get('/meta/methodology', (req, res) => {
  res.json({
    what_we_measure: 'Trackly tracks how your brand appears across 7 AI platforms by submitting configurable search prompts and analyzing the responses.',
    how_often: 'Runs can be triggered manually or scheduled (hourly to daily depending on your plan).',
    how_we_sample: 'Each prompt is sent to each configured AI platform. Response randomness is inherent to LLMs, so we calculate confidence intervals using the Wilson score method.',
    metrics: {
      share_of_voice: 'Percentage of AI responses that mention your brand out of total queries sent.',
      mention_rate: 'How often your brand appears in response to a specific prompt, with confidence intervals.',
      sentiment: 'Classified as positive, neutral, or negative based on context surrounding your brand mention.',
      list_position: 'When AI lists multiple options (e.g., "top 5 tools"), we detect your brand\'s numerical position.',
      competitor_co_occurrence: 'Which competitors appear alongside your brand, and how frequently.'
    },
    confidence_intervals: 'We use Wilson score intervals (95% confidence) to show the range of likely mention rates, accounting for the randomness in AI responses.',
    platforms_supported: Object.keys(PLATFORM_CONFIG).length,
    data_retention: '90 days for individual run data, aggregated statistics retained indefinitely.'
  });
});

// ═══════════════════════════════════════════════════════════
// Epic 1.5: Raw response inspection
// ═══════════════════════════════════════════════════════════

// GET /api/brands/:id/prompt-runs — list individual runs for a prompt (Epic 1.5)
router.get('/brands/:id/prompt-runs', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const { prompt, platform, limit = 20, offset = 0 } = req.query;
    let query = 'SELECT id, prompt, platform, model, mentioned, sentiment, recommended, list_position, latency_ms, success, error_message, batch_id, created_at FROM prompt_runs WHERE brand_id = $1';
    const params = [req.params.id];
    let idx = 2;

    if (prompt) { query += ` AND prompt = $${idx++}`; params.push(prompt); }
    if (platform) { query += ` AND platform = $${idx++}`; params.push(platform); }

    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(Math.min(parseInt(limit) || 20, 100));
    params.push(parseInt(offset) || 0);

    const result = await pool.query(query, params);
    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM prompt_runs WHERE brand_id = $1',
      [req.params.id]
    );

    res.json({ runs: result.rows, total: countResult.rows[0].total });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load prompt runs' });
  }
});

// GET /api/brands/:id/prompt-runs/:runId — single run with full response (Epic 1.5)
router.get('/brands/:id/prompt-runs/:runId', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const result = await pool.query(
      'SELECT * FROM prompt_runs WHERE id = $1 AND brand_id = $2',
      [req.params.runId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Run not found' });

    res.json({ run: result.rows[0] });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load run details' });
  }
});

// ═══════════════════════════════════════════════════════════
// Epic 2.1: Prompt metadata (intent, funnel, tags)
// ═══════════════════════════════════════════════════════════

// GET /api/brands/:id/prompt-metadata — list all prompt metadata
router.get('/brands/:id/prompt-metadata', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const result = await pool.query(
      'SELECT * FROM prompt_metadata WHERE brand_id = $1 ORDER BY prompt',
      [req.params.id]
    );
    res.json({ metadata: result.rows });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load prompt metadata' });
  }
});

// PUT /api/brands/:id/prompt-metadata — upsert prompt metadata
router.put('/brands/:id/prompt-metadata', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const { prompt, intent, funnel_stage, tags, language } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt text is required' });

    const validIntents = ['awareness', 'comparison', 'commercial', 'navigational'];
    const validFunnels = ['tofu', 'mofu', 'bofu'];
    if (intent && !validIntents.includes(intent)) return res.status(400).json({ error: 'Invalid intent' });
    if (funnel_stage && !validFunnels.includes(funnel_stage)) return res.status(400).json({ error: 'Invalid funnel stage' });

    const result = await pool.query(`
      INSERT INTO prompt_metadata (brand_id, prompt, intent, funnel_stage, tags, language)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (brand_id, prompt)
      DO UPDATE SET intent = $3, funnel_stage = $4, tags = $5, language = $6, updated_at = NOW()
      RETURNING *
    `, [req.params.id, prompt, intent || 'awareness', funnel_stage || 'tofu',
        JSON.stringify(tags || []), language || 'en']);

    res.json({ metadata: result.rows[0] });
  } catch(e) {
    res.status(500).json({ error: 'Failed to save prompt metadata' });
  }
});

// ═══════════════════════════════════════════════════════════
// Epic 2.2: Prompt-level metrics API
// ═══════════════════════════════════════════════════════════

// GET /api/brands/:id/prompt-visibility — SOV per prompt per platform with CIs
router.get('/brands/:id/prompt-visibility', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    // Refresh stats first
    await refreshPromptRunStats(req.params.id);

    const stats = await pool.query(
      'SELECT * FROM prompt_run_stats WHERE brand_id = $1 ORDER BY prompt, platform',
      [req.params.id]
    );

    // Enrich with Wilson confidence intervals
    const enriched = stats.rows.map(s => {
      const ci = wilsonInterval(s.mention_count, s.total_runs);
      return {
        ...s,
        mention_rate_ci: ci,
        rank_stats: s.avg_rank ? { avg: parseFloat(s.avg_rank) } : null
      };
    });

    // Group by prompt
    const byPrompt = {};
    for (const s of enriched) {
      if (!byPrompt[s.prompt]) byPrompt[s.prompt] = { prompt: s.prompt, platforms: {} };
      byPrompt[s.prompt].platforms[s.platform] = s;
    }

    res.json({ visibility: Object.values(byPrompt) });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load visibility data' });
  }
});

// GET /api/brands/:id/prompt-history — time series for a specific prompt
router.get('/brands/:id/prompt-history', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const { prompt, platform, days = 30 } = req.query;
    if (!prompt) return res.status(400).json({ error: 'Prompt parameter is required' });

    let query = `
      SELECT
        DATE(created_at) AS date,
        platform,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE mentioned = TRUE)::int AS mentions,
        AVG(list_position) FILTER (WHERE list_position IS NOT NULL) AS avg_rank,
        AVG(CASE sentiment WHEN 'positive' THEN 1 WHEN 'negative' THEN -1 ELSE 0 END) AS sentiment_score
      FROM prompt_runs
      WHERE brand_id = $1 AND prompt = $2 AND success = TRUE
        AND created_at > NOW() - ($3 || ' days')::INTERVAL
    `;
    const params = [req.params.id, prompt, Math.min(parseInt(days) || 30, 90)];

    if (platform) {
      query += ' AND platform = $4';
      params.push(platform);
    }

    query += ' GROUP BY DATE(created_at), platform ORDER BY date';

    const result = await pool.query(query, params);

    // Build time series
    const series = result.rows.map(r => ({
      date: r.date,
      platform: r.platform,
      mentionRate: r.total > 0 ? Math.round((r.mentions / r.total) * 100) : 0,
      avgRank: r.avg_rank ? parseFloat(r.avg_rank) : null,
      sentimentScore: r.sentiment_score ? parseFloat(r.sentiment_score) : 0,
      total: r.total,
      mentions: r.mentions
    }));

    // Calculate trend
    const mentionSeries = series.map(s => ({ date: s.date, value: s.mentionRate }));
    const trend = trendAnalysis(mentionSeries);

    res.json({ history: series, trend });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load prompt history' });
  }
});

// ═══════════════════════════════════════════════════════════
// Epic 2.3: Competitor co-occurrence
// ═══════════════════════════════════════════════════════════

// GET /api/brands/:id/competitor-analysis — co-occurrence data
router.get('/brands/:id/competitor-analysis', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    // Aggregate from prompt_runs
    const result = await pool.query(`
      SELECT
        platform,
        jsonb_array_elements_text(competitor_mentions) AS competitor,
        COUNT(*)::int AS appearances,
        COUNT(*) FILTER (WHERE mentioned = TRUE)::int AS co_mentioned_with_brand
      FROM prompt_runs
      WHERE brand_id = $1 AND success = TRUE AND competitor_mentions != '[]'::jsonb
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY platform, competitor
      ORDER BY appearances DESC
    `, [req.params.id]);

    // Overall competitor frequency with sentiment context
    const overall = await pool.query(`
      SELECT
        jsonb_array_elements_text(competitor_mentions) AS competitor,
        COUNT(*)::int AS total_appearances,
        COUNT(DISTINCT prompt)::int AS prompt_count,
        COUNT(DISTINCT platform)::int AS platform_count,
        COUNT(*) FILTER (WHERE mentioned = TRUE)::int AS brand_also_mentioned,
        COUNT(*) FILTER (WHERE sentiment = 'positive')::int AS positive_context,
        COUNT(*) FILTER (WHERE sentiment = 'negative')::int AS negative_context,
        COUNT(*) FILTER (WHERE sentiment = 'neutral')::int AS neutral_context,
        AVG(list_position) FILTER (WHERE list_position IS NOT NULL) AS avg_position
      FROM prompt_runs
      WHERE brand_id = $1 AND success = TRUE AND competitor_mentions != '[]'::jsonb
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY competitor
      ORDER BY total_appearances DESC
      LIMIT 20
    `, [req.params.id]);

    // Competitor co-occurrence pairs (which competitors appear together)
    const pairsResult = await pool.query(`
      WITH comp_per_run AS (
        SELECT id, jsonb_array_elements_text(competitor_mentions) AS comp
        FROM prompt_runs
        WHERE brand_id = $1 AND success = TRUE AND competitor_mentions != '[]'::jsonb
          AND created_at > NOW() - INTERVAL '30 days'
      )
      SELECT a.comp AS comp1, b.comp AS comp2, COUNT(*)::int AS co_count
      FROM comp_per_run a
      JOIN comp_per_run b ON a.id = b.id AND a.comp < b.comp
      GROUP BY a.comp, b.comp
      ORDER BY co_count DESC
      LIMIT 15
    `, [req.params.id]);

    res.json({
      byPlatform: result.rows,
      topCompetitors: overall.rows.map(r => ({
        ...r,
        avg_position: r.avg_position ? parseFloat(r.avg_position) : null,
        sentimentBreakdown: { positive: r.positive_context, neutral: r.neutral_context, negative: r.negative_context }
      })),
      coOccurrencePairs: pairsResult.rows
    });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load competitor analysis' });
  }
});

// GET /api/brands/:id/diagnostics — diagnostic events (Epic 2.3)
router.get('/brands/:id/diagnostics', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    // Current period (last 7 days) vs baseline (8-30 days ago)
    const current = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE mentioned)::int AS mentions,
        AVG(list_position) FILTER (WHERE list_position IS NOT NULL) AS avg_rank,
        AVG(CASE sentiment WHEN 'positive' THEN 1 WHEN 'negative' THEN -1 ELSE 0 END) AS sentiment_score
      FROM prompt_runs
      WHERE brand_id = $1 AND success = TRUE AND created_at > NOW() - INTERVAL '7 days'
    `, [req.params.id]);

    const baseline = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE mentioned)::int AS mentions,
        AVG(list_position) FILTER (WHERE list_position IS NOT NULL) AS avg_rank,
        AVG(CASE sentiment WHEN 'positive' THEN 1 WHEN 'negative' THEN -1 ELSE 0 END) AS sentiment_score
      FROM prompt_runs
      WHERE brand_id = $1 AND success = TRUE
        AND created_at BETWEEN NOW() - INTERVAL '30 days' AND NOW() - INTERVAL '7 days'
    `, [req.params.id]);

    // Detect new competitors
    const currentComps = await pool.query(`
      SELECT DISTINCT jsonb_array_elements_text(competitor_mentions) AS comp
      FROM prompt_runs WHERE brand_id = $1 AND success = TRUE AND created_at > NOW() - INTERVAL '7 days'
    `, [req.params.id]);
    const baselineComps = await pool.query(`
      SELECT DISTINCT jsonb_array_elements_text(competitor_mentions) AS comp
      FROM prompt_runs WHERE brand_id = $1 AND success = TRUE
        AND created_at BETWEEN NOW() - INTERVAL '30 days' AND NOW() - INTERVAL '7 days'
    `, [req.params.id]);

    const currentCompSet = new Set(currentComps.rows.map(r => r.comp));
    const baselineCompSet = new Set(baselineComps.rows.map(r => r.comp));
    const newCompetitors = [...currentCompSet].filter(c => !baselineCompSet.has(c));

    const c = current.rows[0] || { total: 0, mentions: 0, avg_rank: null, sentiment_score: null };
    const b = baseline.rows[0] || { total: 0, mentions: 0, avg_rank: null, sentiment_score: null };
    const events = detectDiagnosticEvents(
      {
        mentionRate: c.total > 0 ? c.mentions / c.total : 0,
        avgRank: c.avg_rank ? parseFloat(c.avg_rank) : null,
        sentimentScore: c.sentiment_score ? parseFloat(c.sentiment_score) : 0,
        newCompetitors
      },
      {
        mentionRate: b.total > 0 ? b.mentions / b.total : 0,
        avgRank: b.avg_rank ? parseFloat(b.avg_rank) : null,
        sentimentScore: b.sentiment_score ? parseFloat(b.sentiment_score) : 0
      }
    );

    res.json({
      events,
      current: {
        total: c.total,
        mentions: c.mentions,
        mentionRate: c.total > 0 ? Math.round((c.mentions / c.total) * 100) : 0,
        avgRank: c.avg_rank ? parseFloat(c.avg_rank) : null,
        sentimentScore: c.sentiment_score ? parseFloat(c.sentiment_score) : 0
      },
      baseline: {
        total: b.total,
        mentions: b.mentions,
        mentionRate: b.total > 0 ? Math.round((b.mentions / b.total) * 100) : 0,
        avgRank: b.avg_rank ? parseFloat(b.avg_rank) : null,
        sentimentScore: b.sentiment_score ? parseFloat(b.sentiment_score) : 0
      },
      newCompetitors
    });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load diagnostics' });
  }
});

// ═══════════════════════════════════════════════════════════
// Epic 3.4: Recommendations & Action Center
// ═══════════════════════════════════════════════════════════

// GET /api/brands/:id/recommendations
router.get('/brands/:id/recommendations', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const { status, severity } = req.query;
    let query = 'SELECT * FROM recommendations WHERE brand_id = $1';
    const params = [req.params.id];
    let idx = 2;

    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (severity) { query += ` AND severity = $${idx++}`; params.push(severity); }

    query += ' ORDER BY CASE severity WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END, created_at DESC';

    const result = await pool.query(query, params);
    res.json({ recommendations: result.rows });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load recommendations' });
  }
});

// POST /api/brands/:id/recommendations/generate — trigger generation
router.post('/brands/:id/recommendations/generate', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    // Gather analytics data for the recommendation engine
    const stats = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE mentioned)::int AS mentions,
        AVG(CASE sentiment WHEN 'positive' THEN 1 WHEN 'negative' THEN -1 ELSE 0 END) AS sentiment_score
      FROM prompt_runs
      WHERE brand_id = $1 AND success = TRUE AND created_at > NOW() - INTERVAL '30 days'
    `, [req.params.id]);

    const s = stats.rows[0] || { total: 0, mentions: 0, sentiment_score: null };
    const mentionRate = s.total > 0 ? s.mentions / s.total : 0;

    // Get sentiment distribution
    const sentDist = await pool.query(`
      SELECT sentiment, COUNT(*)::int AS count
      FROM prompt_runs
      WHERE brand_id = $1 AND success = TRUE AND mentioned = TRUE AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY sentiment
    `, [req.params.id]);
    const sentimentDistribution = { positive: 0, neutral: 0, negative: 0 };
    sentDist.rows.forEach(r => { sentimentDistribution[r.sentiment] = r.count; });

    // Get top competitors
    const compResult = await pool.query(`
      SELECT
        jsonb_array_elements_text(competitor_mentions) AS name,
        COUNT(*)::int AS appearances
      FROM prompt_runs
      WHERE brand_id = $1 AND success = TRUE AND competitor_mentions != '[]'::jsonb
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY name ORDER BY appearances DESC LIMIT 5
    `, [req.params.id]);
    const topCompetitors = compResult.rows.map(r => ({
      name: r.name,
      mentionRate: s.total > 0 ? r.appearances / s.total : 0
    }));

    // SOV trend
    const sovHistory = (brand.sovHistory || []).map(h => ({ date: h.date, value: h.overall }));
    const trend = trendAnalysis(sovHistory);

    // Platform-level breakdown for per-platform gap detection
    const platStats = await pool.query(`
      SELECT platform,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE mentioned)::int AS mentions
      FROM prompt_runs
      WHERE brand_id = $1 AND success = TRUE AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY platform
    `, [req.params.id]);
    const platformBreakdown = {};
    platStats.rows.forEach(r => {
      platformBreakdown[r.platform] = { total: r.total, mentions: r.mentions, mentionRate: r.total > 0 ? r.mentions / r.total : 0 };
    });

    // Query-level breakdown for blind spot detection
    const queryStats = await pool.query(`
      SELECT prompt,
        COUNT(*)::int AS runs,
        COUNT(*) FILTER (WHERE mentioned)::int AS mentions
      FROM prompt_runs
      WHERE brand_id = $1 AND success = TRUE AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY prompt
    `, [req.params.id]);
    const queryBreakdown = {};
    queryStats.rows.forEach(r => { queryBreakdown[r.prompt] = { runs: r.runs, mentions: r.mentions }; });

    // Average rank position
    const rankResult = await pool.query(`
      SELECT AVG(list_position)::float AS avg_rank
      FROM prompt_runs
      WHERE brand_id = $1 AND success = TRUE AND mentioned = TRUE AND list_position IS NOT NULL
        AND created_at > NOW() - INTERVAL '30 days'
    `, [req.params.id]);

    const analytics = {
      overallMentionRate: mentionRate,
      sentimentDistribution,
      topCompetitors,
      trend,
      platformBreakdown,
      queryBreakdown,
      avgRank: rankResult.rows[0]?.avg_rank || null,
      mentionedWithoutCitation: await (async () => {
        try {
          const citResult = await pool.query(`
            SELECT COUNT(DISTINCT pr.id)::int AS cnt
            FROM prompt_runs pr
            LEFT JOIN citations c ON c.prompt_run_id = pr.id
            WHERE pr.brand_id = $1 AND pr.mentioned = TRUE AND pr.success = TRUE
              AND pr.created_at > NOW() - INTERVAL '30 days'
              AND c.id IS NULL
          `, [req.params.id]);
          return citResult.rows[0]?.cnt || 0;
        } catch(_) { return 0; }
      })()
    };

    const newRecs = await generateRecommendations(req.params.id, analytics);
    res.json({ generated: newRecs.length, recommendations: newRecs });
  } catch(e) {
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// PUT /api/recommendations/:id — update recommendation status
router.put('/recommendations/:id', auth, async (req, res) => {
  try {
    const { status, assigned_to } = req.body;
    const validStatuses = ['open', 'in_progress', 'done', 'ignored'];
    if (status && !validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    // Validate status transitions
    if (status) {
      const current = await pool.query(
        `SELECT r.status FROM recommendations r
         JOIN brands b ON r.brand_id = b.id
         WHERE r.id = $1 AND b.user_id = $2`,
        [req.params.id, req.user.id]
      );
      if (current.rows.length) {
        const validTransitions = {
          open: ['in_progress', 'done', 'ignored'],
          in_progress: ['done', 'open', 'ignored'],
          done: ['open'],         // can reopen
          ignored: ['open']       // can reopen
        };
        const allowed = validTransitions[current.rows[0].status] || [];
        if (!allowed.includes(status)) {
          return res.status(400).json({ error: `Cannot transition from "${current.rows[0].status}" to "${status}"` });
        }
      }
    }

    const updates = [];
    const values = [];
    let idx = 1;
    if (status) { updates.push(`status = $${idx++}`); values.push(status); }
    if (assigned_to !== undefined) { updates.push(`assigned_to = $${idx++}`); values.push(assigned_to); }
    if (!updates.length) return res.status(400).json({ error: 'No updates provided' });

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE recommendations SET ${updates.join(', ')} WHERE id = $${idx}
       AND brand_id IN (SELECT id FROM brands WHERE user_id = $${idx + 1})
       RETURNING *`,
      [...values, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Recommendation not found' });
    res.json({ recommendation: result.rows[0] });
  } catch(e) {
    res.status(500).json({ error: 'Failed to update recommendation' });
  }
});

// GET /api/playbooks — list all playbooks
router.get('/playbooks', auth, (req, res) => {
  res.json({ playbooks: getAllPlaybooks() });
});

// GET /api/playbooks/:id — single playbook
router.get('/playbooks/:id', auth, (req, res) => {
  const playbook = getPlaybook(req.params.id);
  if (!playbook) return res.status(404).json({ error: 'Playbook not found' });
  res.json({ playbook });
});

// ═══════════════════════════════════════════════════════════
// Epic 4.3-4.4: Enhanced exports & Public API
// ═══════════════════════════════════════════════════════════

// GET /api/export/prompts — export prompt-level data
router.get('/export/prompts', auth, async (req, res) => {
  try {
    const { brandId, format = 'json' } = req.query;
    let query = 'SELECT * FROM prompt_run_stats WHERE brand_id IN (SELECT id FROM brands WHERE user_id = $1)';
    const params = [req.user.id];
    if (brandId) {
      query += ' AND brand_id = $2';
      params.push(brandId);
    }
    query += ' ORDER BY brand_id, prompt, platform';
    const result = await pool.query(query, params);

    if (format === 'csv') {
      const csvField = (val) => {
        let s = String(val || '').replace(/"/g, '""').replace(/\n/g, ' ');
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s + '"';
      };
      const rows = ['Brand ID,Prompt,Platform,Total Runs,Mentions,Mention Rate,Avg Rank,Last Run'];
      result.rows.forEach(r => {
        rows.push([r.brand_id, r.prompt, r.platform, r.total_runs, r.mention_count,
          r.mention_rate, r.avg_rank || '', r.last_run_at || ''].map(csvField).join(','));
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="trackly-prompt-stats.csv"');
      return res.send(rows.join('\n'));
    }

    res.json({ stats: result.rows });
  } catch(e) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/export/visibility — export visibility data
router.get('/export/visibility', auth, async (req, res) => {
  try {
    const { brandId, format = 'json' } = req.query;
    let query = `
      SELECT pr.brand_id, pr.prompt, pr.platform, pr.mentioned, pr.sentiment,
             pr.list_position, pr.created_at
      FROM prompt_runs pr
      WHERE pr.brand_id IN (SELECT id FROM brands WHERE user_id = $1)
        AND pr.success = TRUE
    `;
    const params = [req.user.id];
    if (brandId) {
      query += ' AND pr.brand_id = $2';
      params.push(brandId);
    }
    query += ' ORDER BY pr.created_at DESC LIMIT 10000';
    const result = await pool.query(query, params);

    if (format === 'csv') {
      const csvField = (val) => {
        let s = String(val || '').replace(/"/g, '""').replace(/\n/g, ' ');
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s + '"';
      };
      const rows = ['Brand ID,Prompt,Platform,Mentioned,Sentiment,Position,Date'];
      result.rows.forEach(r => {
        rows.push([r.brand_id, r.prompt, r.platform, r.mentioned ? 'Yes' : 'No',
          r.sentiment, r.list_position || '', r.created_at].map(csvField).join(','));
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="trackly-visibility.csv"');
      return res.send(rows.join('\n'));
    }

    res.json({ data: result.rows });
  } catch(e) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/export/recommendations — export recommendations
router.get('/export/recommendations', auth, async (req, res) => {
  try {
    const { brandId, format = 'json' } = req.query;
    let query = `SELECT r.* FROM recommendations r JOIN brands b ON r.brand_id = b.id WHERE b.user_id = $1`;
    const params = [req.user.id];
    if (brandId) {
      query += ' AND r.brand_id = $2';
      params.push(brandId);
    }
    query += ' ORDER BY r.created_at DESC';
    const result = await pool.query(query, params);

    if (format === 'csv') {
      const csvField = (val) => {
        let s = String(val || '').replace(/"/g, '""').replace(/\n/g, ' ');
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s + '"';
      };
      const rows = ['Title,Type,Severity,Status,Description,Playbook,Created'];
      result.rows.forEach(r => {
        rows.push([r.title, r.type, r.severity, r.status, r.description || '',
          r.playbook_id || '', r.created_at].map(csvField).join(','));
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="trackly-recommendations.csv"');
      return res.send(rows.join('\n'));
    }

    res.json({ recommendations: result.rows });
  } catch(e) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// ═══════════════════════════════════════════════════════════
// Epic 4.4: Webhook subscriptions
// ═══════════════════════════════════════════════════════════

// GET /api/brands/:id/webhooks — list webhook subscriptions
router.get('/brands/:id/webhooks', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    // Webhook URL is stored in brand data for now
    res.json({ webhookUrl: brand.webhookUrl || null });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load webhooks' });
  }
});

// ═══════════════════════════════════════════════════════════
// Epic 6.2: Alert rules management
// ═══════════════════════════════════════════════════════════

// GET /api/brands/:id/alerts — list alert rules
router.get('/brands/:id/alerts', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const result = await pool.query(
      'SELECT * FROM alert_rules WHERE brand_id = $1 AND user_id = $2 ORDER BY created_at DESC',
      [req.params.id, req.user.id]
    );
    res.json({ alerts: result.rows });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load alerts' });
  }
});

// POST /api/brands/:id/alerts — create alert rule
router.post('/brands/:id/alerts', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const { name, condition_type, condition_params, action_type, action_params, cooldown_hours } = req.body;
    if (!name || !condition_type) return res.status(400).json({ error: 'Name and condition type are required' });

    const validConditions = ['visibility_drop', 'brand_disappeared', 'negative_sentiment', 'new_competitor', 'sov_below'];
    if (!validConditions.includes(condition_type)) return res.status(400).json({ error: 'Invalid condition type' });

    const validActions = ['email', 'in_app', 'webhook'];
    if (action_type && !validActions.includes(action_type)) return res.status(400).json({ error: 'Invalid action type' });

    const cooldown = Math.max(1, Math.min(168, parseInt(cooldown_hours) || 24)); // 1h to 7d
    const id = uid();
    await pool.query(
      `INSERT INTO alert_rules (id, brand_id, user_id, name, condition_type, condition_params, action_type, action_params, cooldown_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, req.params.id, req.user.id, name, condition_type,
       JSON.stringify(condition_params || {}), action_type || 'in_app', JSON.stringify(action_params || {}), cooldown]
    );

    const result = await pool.query('SELECT * FROM alert_rules WHERE id = $1', [id]);
    res.json({ alert: result.rows[0] });
  } catch(e) {
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// PUT /api/alerts/:id — update alert rule
router.put('/alerts/:id', auth, async (req, res) => {
  try {
    const { name, condition_params, action_type, action_params, enabled, cooldown_hours } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (name) { updates.push(`name = $${idx++}`); values.push(name); }
    if (condition_params) { updates.push(`condition_params = $${idx++}`); values.push(JSON.stringify(condition_params)); }
    if (action_type) { updates.push(`action_type = $${idx++}`); values.push(action_type); }
    if (action_params) { updates.push(`action_params = $${idx++}`); values.push(JSON.stringify(action_params)); }
    if (enabled !== undefined) { updates.push(`enabled = $${idx++}`); values.push(enabled); }
    if (cooldown_hours !== undefined) { updates.push(`cooldown_hours = $${idx++}`); values.push(Math.max(1, Math.min(168, parseInt(cooldown_hours) || 24))); }

    if (!updates.length) return res.status(400).json({ error: 'No updates provided' });

    values.push(req.params.id, req.user.id);
    const result = await pool.query(
      `UPDATE alert_rules SET ${updates.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Alert not found' });
    res.json({ alert: result.rows[0] });
  } catch(e) {
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

// DELETE /api/alerts/:id — delete alert rule
router.delete('/alerts/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM alert_rules WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Alert not found' });
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

// ═══════════════════════════════════════════════════════════
// Epic 6.3: Comments
// ═══════════════════════════════════════════════════════════

// GET /api/comments — list comments for a target
router.get('/comments', auth, async (req, res) => {
  try {
    const { target_type, target_id } = req.query;
    if (!target_type || !target_id) return res.status(400).json({ error: 'target_type and target_id required' });

    const result = await pool.query(`
      SELECT c.*, u.name AS user_name, u.email AS user_email
      FROM comments c JOIN users u ON c.user_id = u.id
      WHERE c.target_type = $1 AND c.target_id = $2
      ORDER BY c.created_at ASC
    `, [target_type, target_id]);

    res.json({ comments: result.rows });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load comments' });
  }
});

// POST /api/comments — add comment
router.post('/comments', auth, async (req, res) => {
  try {
    const { target_type, target_id, content } = req.body;
    if (!target_type || !target_id || !content) return res.status(400).json({ error: 'target_type, target_id, and content required' });
    if (content.length > 2000) return res.status(400).json({ error: 'Comment too long (max 2000 chars)' });

    const validTypes = ['prompt', 'recommendation', 'brand'];
    if (!validTypes.includes(target_type)) return res.status(400).json({ error: 'Invalid target type' });

    const result = await pool.query(
      'INSERT INTO comments (user_id, target_type, target_id, content) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, target_type, target_id, content]
    );
    res.json({ comment: result.rows[0] });
  } catch(e) {
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// DELETE /api/comments/:id — delete own comment
router.delete('/comments/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM comments WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Comment not found' });
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// ═══════════════════════════════════════════════════════════
// Epic 7.1: Tier logic & billing info
// ═══════════════════════════════════════════════════════════

// GET /api/billing — billing page data
router.get('/billing', auth, async (req, res) => {
  try {
    const user = await pool.query('SELECT plan, settings, created_at FROM users WHERE id = $1', [req.user.id]);
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' });

    const plan = user.rows[0].plan || 'free';
    const limits = getPlanLimits(plan);

    // Current usage
    const brandCount = await pool.query('SELECT COUNT(*)::int AS count FROM brands WHERE user_id = $1', [req.user.id]);
    const today = new Date().toISOString().split('T')[0];

    // Count today's runs across all brands
    const todayRuns = await pool.query(`
      SELECT COUNT(*)::int AS count FROM (
        SELECT DISTINCT batch_id FROM prompt_runs
        WHERE brand_id IN (SELECT id FROM brands WHERE user_id = $1)
          AND DATE(created_at) = $2
      ) AS batches
    `, [req.user.id, today]);

    // Total queries across all brands
    const totalQueries = await pool.query(`
      SELECT SUM(jsonb_array_length(COALESCE(data->'queries', '[]'::jsonb)))::int AS total
      FROM brands WHERE user_id = $1
    `, [req.user.id]);

    const usage = {
      brands: { used: brandCount.rows[0].count, limit: limits.brands },
      prompts: { used: totalQueries.rows[0].total || 0, limit: limits.prompts },
      platforms: { used: limits.platforms, limit: 8 }
    };

    // Check approaching limits
    const warnings = [];
    if (usage.brands.used >= usage.brands.limit * 0.8) {
      warnings.push({ type: 'brands', message: `Using ${usage.brands.used}/${usage.brands.limit} brands` });
    }

    res.json({
      plan,
      limits,
      usage,
      warnings,
      allPlans: PLAN_LIMITS,
      memberSince: user.rows[0].created_at
    });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load billing info' });
  }
});

// ═══════════════════════════════════════════════════════════
// Epic 8.1: Hallucination / accuracy monitor
// ═══════════════════════════════════════════════════════════

// GET /api/brands/:id/facts — canonical facts
router.get('/brands/:id/facts', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const result = await pool.query(
      'SELECT * FROM brand_facts WHERE brand_id = $1 ORDER BY category, fact_key',
      [req.params.id]
    );
    res.json({ facts: result.rows });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load facts' });
  }
});

// PUT /api/brands/:id/facts — upsert canonical facts
router.put('/brands/:id/facts', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const { facts } = req.body;
    if (!facts || !Array.isArray(facts)) return res.status(400).json({ error: 'Facts array required' });

    for (const fact of facts) {
      if (!fact.fact_key || !fact.fact_value) continue;
      if (fact.fact_key.length > 200 || fact.fact_value.length > 2000) continue;
      await pool.query(`
        INSERT INTO brand_facts (brand_id, fact_key, fact_value, category)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (brand_id, fact_key)
        DO UPDATE SET fact_value = $3, category = $4, updated_at = NOW()
      `, [req.params.id, fact.fact_key, fact.fact_value, fact.category || 'general']);
    }

    const result = await pool.query(
      'SELECT * FROM brand_facts WHERE brand_id = $1 ORDER BY category, fact_key',
      [req.params.id]
    );
    res.json({ facts: result.rows });
  } catch(e) {
    res.status(500).json({ error: 'Failed to save facts' });
  }
});

// DELETE /api/brands/:id/facts/:factId — delete a fact
router.delete('/brands/:id/facts/:factId', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    await pool.query('DELETE FROM brand_facts WHERE id = $1 AND brand_id = $2', [req.params.factId, req.params.id]);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Failed to delete fact' });
  }
});

// GET /api/brands/:id/accuracy — check AI responses against canonical facts
router.get('/brands/:id/accuracy', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    // Get canonical facts
    const factsResult = await pool.query(
      'SELECT fact_key, fact_value FROM brand_facts WHERE brand_id = $1',
      [req.params.id]
    );
    const facts = factsResult.rows;
    if (!facts.length) return res.json({ mismatches: [], message: 'No canonical facts configured. Add facts to enable accuracy monitoring.' });

    // Get recent responses that mention the brand
    const runs = await pool.query(`
      SELECT id, prompt, platform, model, response_raw, created_at
      FROM prompt_runs
      WHERE brand_id = $1 AND mentioned = TRUE AND success = TRUE AND response_raw IS NOT NULL
      ORDER BY created_at DESC LIMIT 50
    `, [req.params.id]);

    const mismatches = [];
    for (const run of runs.rows) {
      if (!run.response_raw) continue;
      const lower = run.response_raw.toLowerCase();

      for (const fact of facts) {
        if (!fact.fact_key || !fact.fact_value) continue;
        const factLower = fact.fact_value.toLowerCase();
        // Simple check: if the fact key is mentioned but the fact value is not present
        const keyInResponse = lower.includes(fact.fact_key.toLowerCase());
        const valueInResponse = lower.includes(factLower);

        if (keyInResponse && !valueInResponse) {
          mismatches.push({
            prompt_run_id: run.id,
            prompt: run.prompt,
            platform: run.platform,
            model: run.model,
            fact_key: fact.fact_key,
            expected_value: fact.fact_value,
            snippet: run.response_raw.substring(0, 300),
            date: run.created_at
          });
        }
      }
    }

    res.json({ mismatches, totalChecked: runs.rows.length, factCount: facts.length });
  } catch(e) {
    res.status(500).json({ error: 'Failed to check accuracy' });
  }
});

// ═══════════════════════════════════════════════════════════
// Epic 8.2: Citation authority
// ═══════════════════════════════════════════════════════════

// GET /api/brands/:id/citation-analysis — citation domain analysis
router.get('/brands/:id/citation-analysis', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    // Aggregate citations from prompt_runs
    const result = await pool.query(`
      SELECT
        jsonb_array_elements_text(citations) AS url,
        COUNT(*)::int AS frequency
      FROM prompt_runs
      WHERE brand_id = $1 AND success = TRUE AND citations != '[]'::jsonb
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY url
      ORDER BY frequency DESC
      LIMIT 50
    `, [req.params.id]);

    // Extract domains and categorize
    const domainStats = {};
    for (const row of result.rows) {
      try {
        const url = new URL(row.url);
        const domain = url.hostname.replace(/^www\./, '');
        if (!domainStats[domain]) {
          domainStats[domain] = {
            domain,
            type: categorizeDomain(domain),
            totalCitations: 0,
            urls: []
          };
        }
        domainStats[domain].totalCitations += row.frequency;
        domainStats[domain].urls.push({ url: row.url, count: row.frequency });
      } catch(_) { /* invalid URL */ }
    }

    const domains = Object.values(domainStats).sort((a, b) => b.totalCitations - a.totalCitations);
    res.json({ domains, totalCitations: result.rows.reduce((s, r) => s + r.frequency, 0) });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load citation analysis' });
  }
});

function categorizeDomain(domain) {
  const reviewSites = ['g2.com', 'capterra.com', 'trustpilot.com', 'yelp.com', 'tripadvisor.com', 'bbb.org', 'glassdoor.com'];
  const newsSites = ['nytimes.com', 'reuters.com', 'bbc.com', 'forbes.com', 'bloomberg.com', 'techcrunch.com', 'theverge.com', 'wired.com'];
  const socialSites = ['reddit.com', 'twitter.com', 'x.com', 'linkedin.com', 'facebook.com', 'youtube.com'];
  const wikiSites = ['wikipedia.org', 'wikimedia.org'];

  if (reviewSites.some(s => domain.includes(s))) return 'review_site';
  if (newsSites.some(s => domain.includes(s))) return 'news';
  if (socialSites.some(s => domain.includes(s))) return 'social';
  if (wikiSites.some(s => domain.includes(s))) return 'encyclopedia';
  if (domain.endsWith('.gov')) return 'government';
  if (domain.endsWith('.edu')) return 'academic';
  return 'other';
}

/**
 * Estimate domain authority score (0-100) based on domain type and known sites.
 * This is a heuristic approximation — not real DA from Moz/Ahrefs.
 */
function estimateDomainAuthority(domain) {
  // Tier 1: Very high authority (80-95)
  const tier1 = ['wikipedia.org', 'nytimes.com', 'bbc.com', 'reuters.com', 'forbes.com', 'bloomberg.com', 'washingtonpost.com', 'theguardian.com', 'cnn.com', 'github.com'];
  // Tier 2: High authority (60-80)
  const tier2 = ['techcrunch.com', 'wired.com', 'theverge.com', 'arstechnica.com', 'g2.com', 'trustpilot.com', 'yelp.com', 'capterra.com', 'reddit.com', 'youtube.com', 'linkedin.com', 'medium.com', 'tripadvisor.com', 'bbb.org'];
  // Tier 3: Moderate authority (40-60)
  const tier3 = ['twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'glassdoor.com', 'crunchbase.com', 'producthunt.com', 'quora.com'];

  if (tier1.some(s => domain.includes(s))) return 90;
  if (tier2.some(s => domain.includes(s))) return 70;
  if (tier3.some(s => domain.includes(s))) return 50;
  if (domain.endsWith('.gov')) return 85;
  if (domain.endsWith('.edu')) return 80;
  if (domain.endsWith('.org')) return 45;
  return 30; // Unknown domains get baseline score
}

// ═══════════════════════════════════════════════════════════
// Epic 8.3: Copilot — natural language queries on Trackly data
// ═══════════════════════════════════════════════════════════

// POST /api/brands/:id/copilot — ask questions about brand data
router.post('/brands/:id/copilot', auth, async (req, res) => {
  try {
    const brand = await getBrand(req.params.id, req.user.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const { question } = req.body;
    if (!question || question.length > 500) return res.status(400).json({ error: 'Question required (max 500 chars)' });

    // Build context from brand data
    const runs = brand.runs || [];
    const lastRun = runs.length ? runs[runs.length - 1] : null;
    const sovHistory = brand.sovHistory || [];

    // Get recent diagnostics
    const diagResult = await pool.query(`
      SELECT sentiment, mentioned, platform,
        COUNT(*)::int AS count
      FROM prompt_runs
      WHERE brand_id = $1 AND success = TRUE AND created_at > NOW() - INTERVAL '7 days'
      GROUP BY sentiment, mentioned, platform
    `, [req.params.id]);

    const context = {
      brandName: brand.name,
      industry: brand.industry,
      currentSov: lastRun ? lastRun.sov : 0,
      totalRuns: runs.length,
      platforms: lastRun ? Object.keys(lastRun.platforms || {}) : [],
      sovTrend: sovHistory.length >= 2
        ? sovHistory[sovHistory.length - 1].overall - sovHistory[sovHistory.length - 2].overall
        : 0,
      competitors: brand.competitors || [],
      queries: brand.queries || [],
      recentData: diagResult.rows
    };

    // Try AI-powered answer first, fall back to rules-based
    let answer;
    let aiPowered = false;
    try {
      const { getServerKeys } = require('../lib/helpers');
      const keys = getServerKeys();
      const platformOrder = ['deepseek', 'gemini', 'openai', 'claude', 'perplexity'];
      const platformMap = { deepseek: 'DeepSeek', gemini: 'Gemini', openai: 'ChatGPT', claude: 'Claude', perplexity: 'Perplexity' };
      let aiPlatform = null;
      for (const p of platformOrder) {
        if (keys[p] && keys[p].length > 0) { aiPlatform = platformMap[p]; break; }
      }
      if (aiPlatform) {
        const { queryAI } = require('../lib/ai-platforms');
        const copilotPrompt = buildCopilotPrompt(question, context);
        const result = await queryAI(copilotPrompt, aiPlatform, {}, keys, {});
        if (result && result.text && result.text.trim().length > 10) {
          answer = result.text.trim();
          aiPowered = true;
        }
      }
    } catch(aiErr) {
      // AI call failed — fall back to rules-based
    }
    if (!answer) {
      answer = generateCopilotAnswer(question, context);
    }

    res.json({ answer, aiPowered, context: { sov: context.currentSov, trend: context.sovTrend } });
  } catch(e) {
    res.status(500).json({ error: 'Failed to process question' });
  }
});

function buildCopilotPrompt(question, ctx) {
  // Build a compact data summary for the LLM
  const sentimentSummary = {};
  const platformSummary = {};
  ctx.recentData.forEach(r => {
    if (r.mentioned) sentimentSummary[r.sentiment] = (sentimentSummary[r.sentiment] || 0) + r.count;
    if (!platformSummary[r.platform]) platformSummary[r.platform] = { total: 0, mentioned: 0 };
    platformSummary[r.platform].total += r.count;
    if (r.mentioned) platformSummary[r.platform].mentioned += r.count;
  });

  const platBreakdown = Object.entries(platformSummary)
    .map(([p, d]) => `${p}: ${d.mentioned}/${d.total} mentions (${d.total > 0 ? Math.round(d.mentioned/d.total*100) : 0}%)`)
    .join(', ');

  return `You are Trackly Copilot, an AI assistant for the Trackly AI Visibility platform. Answer the user's question about their brand data concisely and helpfully.

Brand: ${ctx.brandName}
Industry: ${ctx.industry || 'Not specified'}
Current Share of Voice (SOV): ${ctx.currentSov}%
SOV Trend: ${ctx.sovTrend > 0 ? '+' : ''}${ctx.sovTrend}%
Total Runs: ${ctx.totalRuns}
Tracked Platforms: ${ctx.platforms.join(', ') || 'None yet'}
Competitors: ${ctx.competitors.length > 0 ? ctx.competitors.join(', ') : 'None configured'}
Queries Tracked: ${ctx.queries.length} (${ctx.queries.slice(0, 5).join('; ')}${ctx.queries.length > 5 ? '...' : ''})
Platform Breakdown (last 7 days): ${platBreakdown || 'No data'}
Sentiment (last 7 days): ${Object.entries(sentimentSummary).map(([k,v]) => `${k}: ${v}`).join(', ') || 'No data'}

User question: ${question}

Keep your answer under 200 words. Be specific with numbers from the data. If you don't have enough data to answer, say so and suggest what the user should do (e.g., run more queries, add competitors).`;
}

function generateCopilotAnswer(question, ctx) {
  const q = question.toLowerCase();

  if (q.includes('sov') || q.includes('share of voice') || q.includes('visibility')) {
    const trend = ctx.sovTrend > 0 ? `up ${ctx.sovTrend}%` : ctx.sovTrend < 0 ? `down ${Math.abs(ctx.sovTrend)}%` : 'stable';
    let advice = '';
    if (ctx.currentSov < 10) advice = ' This is quite low — focus on establishing brand presence through authoritative content and reviews.';
    else if (ctx.currentSov < 30) advice = ' There\'s room to grow. Check the Recommendations tab for specific improvements.';
    else if (ctx.currentSov >= 60) advice = ' This is a strong position. Focus on maintaining and defending against competitors.';
    return `${ctx.brandName}'s current share of voice is ${ctx.currentSov}%, trending ${trend} compared to the previous measurement. This is based on ${ctx.totalRuns} total runs across ${ctx.platforms.length} platforms.${advice}`;
  }

  if (q.includes('competitor') || q.includes('competition')) {
    if (ctx.competitors.length === 0) return 'No competitors are currently configured for tracking. Add competitors in Brand Setup to see how you compare.';
    const compData = {};
    ctx.recentData.forEach(r => { if (r.mentioned) compData[r.platform] = (compData[r.platform] || 0) + r.count; });
    return `You're tracking ${ctx.competitors.length} competitors: ${ctx.competitors.join(', ')}. Your brand appears in ${Object.keys(compData).length} platforms in the last 7 days. Visit the Competitors tab for detailed co-occurrence and per-platform breakdown.`;
  }

  if (q.includes('platform') || q.includes('chatgpt') || q.includes('perplexity') || q.includes('claude') || q.includes('gemini') || q.includes('grok')) {
    const platData = {};
    ctx.recentData.forEach(r => {
      if (!platData[r.platform]) platData[r.platform] = { total: 0, mentioned: 0 };
      platData[r.platform].total += r.count;
      if (r.mentioned) platData[r.platform].mentioned += r.count;
    });
    const summary = Object.entries(platData).map(([p, d]) => {
      const rate = d.total > 0 ? Math.round(d.mentioned / d.total * 100) : 0;
      return `${p}: ${rate}% mention rate (${d.mentioned}/${d.total})`;
    }).join(', ');
    return summary
      ? `Platform breakdown (last 7 days): ${summary}. Visit Platform Status for API health details.`
      : `${ctx.brandName} is tracked across ${ctx.platforms.length} platforms: ${ctx.platforms.join(', ')}. Run queries to see per-platform data.`;
  }

  if (q.includes('improve') || q.includes('recommendation') || q.includes('suggest') || q.includes('how to') || q.includes('increase') || q.includes('boost')) {
    const tips = [];
    if (ctx.currentSov < 20) tips.push('Strengthen your website with clear, factual brand descriptions');
    if (ctx.currentSov < 40) tips.push('Build reviews on authoritative platforms (G2, Trustpilot, etc.)');
    if (ctx.competitors.length > 0) tips.push('Create comparison content vs ' + ctx.competitors.slice(0, 2).join(' and '));
    tips.push('Ensure consistent NAP (Name, Address, Phone) across the web');
    if (ctx.queries.length < 5) tips.push('Add more tracking queries to discover visibility gaps');
    tips.push('Check the Recommendations tab for AI-generated, data-driven action items');
    return `Here are suggestions to improve ${ctx.brandName}'s visibility (current SOV: ${ctx.currentSov}%):\n\n` +
      tips.map((t, i) => `${i + 1}. ${t}`).join('\n');
  }

  if (q.includes('sentiment')) {
    const sentData = {};
    ctx.recentData.forEach(r => {
      if (r.mentioned) sentData[r.sentiment] = (sentData[r.sentiment] || 0) + r.count;
    });
    const total = Object.values(sentData).reduce((s, v) => s + v, 0);
    if (total === 0) return 'No recent sentiment data available. Run more queries to build sentiment history.';
    const parts = Object.entries(sentData).map(([k, v]) => `${k}: ${v} (${Math.round(v/total*100)}%)`);
    const negPct = sentData.negative ? Math.round(sentData.negative / total * 100) : 0;
    let advice = '';
    if (negPct > 30) advice = '\n\n⚠ High negative sentiment detected. Review the specific responses in Prompt Details to understand the concerns.';
    return `Recent sentiment for ${ctx.brandName} (last 7 days, ${total} mentions): ${parts.join(', ')}.${advice}`;
  }

  if (q.includes('query') || q.includes('prompt') || q.includes('keyword')) {
    return `${ctx.brandName} is tracking ${ctx.queries.length} queries: "${ctx.queries.slice(0, 5).join('", "')}${ctx.queries.length > 5 ? '"...' : '"'}. Visit Prompt Details for per-query visibility, sentiment, and trend data.`;
  }

  if (q.includes('trend') || q.includes('history') || q.includes('change') || q.includes('over time')) {
    const trend = ctx.sovTrend > 0 ? `increasing (+${ctx.sovTrend}%)` : ctx.sovTrend < 0 ? `decreasing (${ctx.sovTrend}%)` : 'stable';
    return `${ctx.brandName}'s SOV trend is ${trend}. You have ${ctx.totalRuns} historical runs. Visit SOV Trends for detailed charts, or Prompt Details for per-query time series.`;
  }

  if (q.includes('alert') || q.includes('notify') || q.includes('notification')) {
    return 'Configure alerts in the Alerts tab. You can set up notifications for: visibility drops, SOV falling below a threshold, brand disappearing from responses, negative sentiment spikes, and new competitor detections. Alerts can trigger in-app notifications, emails, or webhooks.';
  }

  if (q.includes('export') || q.includes('report') || q.includes('download')) {
    return 'You can export data in several ways: 1) Overview → Export CSV for mentions, 2) Prompt Details → Export CSV for prompt-level stats, 3) Recommendations → Export CSV, 4) Account → Export All (JSON). All exports are available from their respective view headers.';
  }

  return `Based on your data: ${ctx.brandName} has a ${ctx.currentSov}% share of voice across ${ctx.platforms.length} AI platforms with ${ctx.totalRuns} total runs. Ask me about:\n• SOV / visibility metrics\n• Competitor analysis\n• Platform breakdown\n• Sentiment analysis\n• How to improve\n• Trends over time\n• Alerts & notifications\n• Exporting data`;
}

// ═══════════════════════════════════════════════════════════
// Epic 5.2: Dashboard view presets
// ═══════════════════════════════════════════════════════════

// GET /api/dashboard-presets — available presets
router.get('/dashboard-presets', auth, (req, res) => {
  res.json({
    presets: {
      founder: {
        label: 'Founder View',
        description: 'High-level SOV metrics + top recommendations',
        widgets: ['sov_overview', 'trend_chart', 'top_recommendations', 'competitor_summary']
      },
      seo_manager: {
        label: 'SEO Manager View',
        description: 'Detailed prompt analytics, citations, and diagnostics',
        widgets: ['sov_overview', 'prompt_visibility', 'citation_analysis', 'diagnostics', 'competitor_detail', 'sentiment_chart']
      },
      agency_manager: {
        label: 'Agency View',
        description: 'Multi-brand overview with reporting',
        widgets: ['multi_brand_sov', 'brand_comparison', 'recommendations_summary', 'report_schedule']
      }
    }
  });
});

module.exports = router;
