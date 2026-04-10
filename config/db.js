/**
 * Database configuration and initialization
 */
const { Pool } = require('pg');
const { createLogger } = require('../lib/logger');
const { RETENTION } = require('./constants');
const log = createLogger('DB');

// Railway (and many PaaS providers) use self-signed certs for managed PostgreSQL.
// rejectUnauthorized defaults to false unless explicitly set to 'true'.
const sslConfig = process.env.DATABASE_URL
  ? { rejectUnauthorized: process.env.NODE_ENV === 'production'
      ? process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'  // default true in prod
      : process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'   // default false in dev
    }
  : false;
if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL && process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
  console.warn('[WARN] DB_SSL_REJECT_UNAUTHORIZED is explicitly set to "false" in production. TLS certificate validation is disabled.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  // Scale pool for concurrent users — default pg Pool is 10 which can bottleneck
  // at 100+ concurrent requests (runs, rechecks, cron jobs all need connections).
  max: parseInt(process.env.PG_POOL_MAX, 10) || 50,
  // Return idle connections after 30s (default 10s) to reduce churn
  idleTimeoutMillis: 30000,
  // Don't wait more than 10s for a connection from the pool
  connectionTimeoutMillis: 10000
});

async function initDB() {
  const client = await safeConnect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE,
        name TEXT,
        password_hash TEXT NOT NULL,
        plan TEXT DEFAULT 'free',
        role TEXT,
        api_keys JSONB DEFAULT '{}',
        settings JSONB DEFAULT '{}',
        email_verified BOOLEAN DEFAULT FALSE,
        verify_token TEXT,
        verify_token_expires TIMESTAMPTZ,
        refresh_token TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS brands (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        details JSONB DEFAULT '{}',
        ip TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS archived_runs (
        id TEXT PRIMARY KEY,
        brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        run_date DATE NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_brands_user_id ON brands(user_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
      CREATE INDEX IF NOT EXISTS idx_brands_created_at ON brands(created_at);
      CREATE INDEX IF NOT EXISTS idx_brands_updated_at ON brands(updated_at);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        read BOOLEAN DEFAULT FALSE,
        data JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT DEFAULT 'viewer',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(owner_id, member_id)
      );
      CREATE INDEX IF NOT EXISTS idx_archived_runs_brand_id ON archived_runs(brand_id);
      CREATE INDEX IF NOT EXISTS idx_archived_runs_date ON archived_runs(run_date);
      CREATE TABLE IF NOT EXISTS api_logs (
        id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        brand_id TEXT,
        platform TEXT NOT NULL,
        query TEXT,
        status TEXT NOT NULL DEFAULT 'ok',
        error TEXT,
        key_hint TEXT,
        model TEXT,
        response_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
      CREATE INDEX IF NOT EXISTS idx_team_members_owner ON team_members(owner_id);
      CREATE INDEX IF NOT EXISTS idx_team_members_member ON team_members(member_id);
      CREATE INDEX IF NOT EXISTS idx_team_members_member_owner ON team_members(member_id, owner_id);
      CREATE INDEX IF NOT EXISTS idx_api_logs_user_id ON api_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_api_logs_brand_id ON api_logs(brand_id);
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS webhook_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        processed_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed_at);
      CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
      CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token) WHERE refresh_token IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_brands_user_created ON brands(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_brands_data_schedule ON brands((data->>'schedule')) WHERE data->>'schedule' IS NOT NULL;

      -- Epic 1.1: Individual prompt run tracking for sampling & methodology
      CREATE TABLE IF NOT EXISTS prompt_runs (
        id TEXT PRIMARY KEY,
        brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        platform TEXT NOT NULL,
        model TEXT,
        run_index INTEGER DEFAULT 0,
        response_raw TEXT,
        response_parsed JSONB DEFAULT '{}',
        mentioned BOOLEAN DEFAULT FALSE,
        sentiment TEXT DEFAULT 'neutral',
        recommended BOOLEAN DEFAULT FALSE,
        list_position INTEGER,
        citations JSONB DEFAULT '[]',
        competitor_mentions JSONB DEFAULT '[]',
        latency_ms INTEGER,
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        meta JSONB DEFAULT '{}',
        batch_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_prompt_runs_brand_id ON prompt_runs(brand_id);
      CREATE INDEX IF NOT EXISTS idx_prompt_runs_platform ON prompt_runs(platform);
      CREATE INDEX IF NOT EXISTS idx_prompt_runs_created_at ON prompt_runs(created_at);
      CREATE INDEX IF NOT EXISTS idx_prompt_runs_batch_id ON prompt_runs(batch_id);
      CREATE INDEX IF NOT EXISTS idx_prompt_runs_brand_prompt ON prompt_runs(brand_id, prompt);
      -- Composite index for refreshPromptRunStats query (brand_id + success + created_at + GROUP BY columns)
      CREATE INDEX IF NOT EXISTS idx_prompt_runs_stats_refresh ON prompt_runs(brand_id, success, created_at) INCLUDE (prompt, platform, mentioned, sentiment, list_position);

      -- Epic 1.1: Aggregated stats per prompt/platform
      CREATE TABLE IF NOT EXISTS prompt_run_stats (
        id SERIAL PRIMARY KEY,
        brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        platform TEXT NOT NULL,
        total_runs INTEGER DEFAULT 0,
        mention_count INTEGER DEFAULT 0,
        mention_rate NUMERIC(5,4) DEFAULT 0,
        mention_rate_low NUMERIC(5,4) DEFAULT 0,
        mention_rate_high NUMERIC(5,4) DEFAULT 0,
        avg_rank NUMERIC(5,2),
        avg_sentiment_score NUMERIC(5,2) DEFAULT 0,
        sentiment_distribution JSONB DEFAULT '{"positive":0,"neutral":0,"negative":0}',
        last_run_at TIMESTAMPTZ,
        window_start TIMESTAMPTZ,
        window_end TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(brand_id, prompt, platform)
      );
      CREATE INDEX IF NOT EXISTS idx_prompt_run_stats_brand ON prompt_run_stats(brand_id);

      -- Epic 2.1: Prompt metadata (intent, funnel, tags)
      CREATE TABLE IF NOT EXISTS prompt_metadata (
        id SERIAL PRIMARY KEY,
        brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        intent TEXT DEFAULT 'awareness',
        funnel_stage TEXT DEFAULT 'tofu',
        tags JSONB DEFAULT '[]',
        language TEXT DEFAULT 'en',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(brand_id, prompt)
      );
      CREATE INDEX IF NOT EXISTS idx_prompt_metadata_brand ON prompt_metadata(brand_id);

      -- Epic 2.3: Competitor co-occurrence tracking
      CREATE TABLE IF NOT EXISTS competitor_cooccurrence (
        id SERIAL PRIMARY KEY,
        brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        platform TEXT NOT NULL,
        competitor_name TEXT NOT NULL,
        appearance_count INTEGER DEFAULT 0,
        avg_position NUMERIC(5,2),
        last_seen_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(brand_id, prompt, platform, competitor_name)
      );
      CREATE INDEX IF NOT EXISTS idx_competitor_cooccurrence_brand ON competitor_cooccurrence(brand_id);

      -- Epic 3.1: Citation tracking from AI responses
      CREATE TABLE IF NOT EXISTS citations (
        id SERIAL PRIMARY KEY,
        prompt_run_id TEXT REFERENCES prompt_runs(id) ON DELETE CASCADE,
        brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        domain TEXT,
        domain_type TEXT DEFAULT 'unknown',
        domain_authority_score NUMERIC(5,2) DEFAULT 0,
        position INTEGER,
        anchor_text TEXT,
        is_brand BOOLEAN DEFAULT FALSE,
        is_competitor BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_citations_brand ON citations(brand_id);
      CREATE INDEX IF NOT EXISTS idx_citations_domain ON citations(domain);
      CREATE INDEX IF NOT EXISTS idx_citations_prompt_run ON citations(prompt_run_id);

      -- Epic 3.2: Recommendations engine
      CREATE TABLE IF NOT EXISTS recommendations (
        id TEXT PRIMARY KEY,
        brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        prompt TEXT,
        type TEXT NOT NULL,
        severity TEXT DEFAULT 'medium',
        title TEXT NOT NULL,
        description TEXT,
        payload JSONB DEFAULT '{}',
        playbook_id TEXT,
        status TEXT DEFAULT 'open',
        assigned_to TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_recommendations_brand ON recommendations(brand_id);
      CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status);

      -- Epic 6.2: Alert rules
      CREATE TABLE IF NOT EXISTS alert_rules (
        id TEXT PRIMARY KEY,
        brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        condition_type TEXT NOT NULL,
        condition_params JSONB DEFAULT '{}',
        action_type TEXT DEFAULT 'email',
        action_params JSONB DEFAULT '{}',
        enabled BOOLEAN DEFAULT TRUE,
        cooldown_hours INT DEFAULT 24,
        last_triggered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_alert_rules_brand ON alert_rules(brand_id);
      CREATE INDEX IF NOT EXISTS idx_alert_rules_user ON alert_rules(user_id);

      -- Epic 6.3: Comments on prompts/recommendations
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id);

      -- Epic 8.1: Canonical fact store for hallucination detection
      CREATE TABLE IF NOT EXISTS brand_facts (
        id SERIAL PRIMARY KEY,
        brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        fact_key TEXT NOT NULL,
        fact_value TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(brand_id, fact_key)
      );
      CREATE INDEX IF NOT EXISTS idx_brand_facts_brand ON brand_facts(brand_id);

      CREATE TABLE IF NOT EXISTS accuracy_issues (
        id SERIAL PRIMARY KEY,
        brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        model TEXT,
        fact_key TEXT NOT NULL,
        expected TEXT,
        found TEXT,
        severity TEXT DEFAULT 'medium',
        category TEXT DEFAULT 'general',
        explanation TEXT,
        run_id TEXT,
        source_url TEXT,
        query TEXT,
        date TIMESTAMPTZ,
        fixed BOOLEAN DEFAULT FALSE,
        fixed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_accuracy_issues_brand ON accuracy_issues(brand_id);

      -- Persistent response cache (survives restarts, shared across instances)
      CREATE TABLE IF NOT EXISTS response_cache (
        cache_key TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        model TEXT NOT NULL,
        query TEXT NOT NULL,
        brand_id TEXT,
        city TEXT,
        response JSONB NOT NULL,
        is_search BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_response_cache_expires ON response_cache(expires_at);
      CREATE INDEX IF NOT EXISTS idx_response_cache_platform ON response_cache(platform);
      -- Index for cross-brand cache lookups (same query, no brand_id filter)
      CREATE INDEX IF NOT EXISTS idx_response_cache_global ON response_cache(platform, model, query) WHERE brand_id IS NULL;

      -- AI Overview tracking (DataForSEO SERP data)
      CREATE TABLE IF NOT EXISTS ai_overview_results (
        id SERIAL PRIMARY KEY,
        brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        query TEXT NOT NULL,
        has_ai_overview BOOLEAN DEFAULT FALSE,
        brand_mentioned BOOLEAN DEFAULT FALSE,
        content TEXT,
        citations JSONB DEFAULT '[]',
        competitor_mentions JSONB DEFAULT '[]',
        serp_features JSONB DEFAULT '[]',
        position INTEGER,
        location_code INTEGER,
        language_code TEXT DEFAULT 'en',
        error TEXT,
        checked_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(brand_id, query)
      );
      CREATE INDEX IF NOT EXISTS idx_ai_overview_brand ON ai_overview_results(brand_id);
      CREATE INDEX IF NOT EXISTS idx_ai_overview_checked ON ai_overview_results(checked_at);

      -- Daily cost budget tracking per user
      CREATE TABLE IF NOT EXISTS daily_cost_tracker (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cost_date DATE NOT NULL DEFAULT CURRENT_DATE,
        total_cost NUMERIC(16,8) DEFAULT 0,
        query_count INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, cost_date)
      );
      CREATE INDEX IF NOT EXISTS idx_daily_cost_user ON daily_cost_tracker(user_id, cost_date);
    `);
    // Migrations for existing DBs
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
      ALTER TABLE api_logs ADD COLUMN IF NOT EXISTS tokens_in INTEGER DEFAULT 0;
      ALTER TABLE api_logs ADD COLUMN IF NOT EXISTS tokens_out INTEGER DEFAULT 0;
      ALTER TABLE api_logs ADD COLUMN IF NOT EXISTS cost NUMERIC(12,8) DEFAULT 0;
      ALTER TABLE api_logs ADD COLUMN IF NOT EXISTS run_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_expires TIMESTAMPTZ;
      ALTER TABLE daily_cost_tracker ALTER COLUMN total_cost TYPE NUMERIC(16,8);
    `);
    // Add unique index on username (only for non-null values)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;`);
    // Add index for api_logs.run_id lookups (cost tracking queries)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_api_logs_run_id ON api_logs(run_id) WHERE run_id IS NOT NULL;`);
    // Site-wide configuration (admin model selections, feature flags, etc.)
    await client.query(`
      CREATE TABLE IF NOT EXISTS site_config (
        key TEXT PRIMARY KEY,
        value JSONB DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Auto-promote designated admin email if no admin exists yet
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
    if (adminEmail) {
      const existingAdmin = await client.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
      if (existingAdmin.rows.length === 0) {
        const promoted = await client.query(
          `UPDATE users SET role = 'admin', plan = 'owner' WHERE email = $1 AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin') RETURNING id`,
          [adminEmail]
        );
        if (promoted.rows.length > 0) {
          log.info(`Auto-promoted ${adminEmail} to admin`);
        }
      }
    }
    log.info('PostgreSQL tables ready');
  } finally {
    client.release();
  }
}

async function auditLog(userId, action, targetType, targetId, details, ip) {
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, action, targetType || null, targetId || null, JSON.stringify(details || {}), ip || null]
    );
  } catch(e) {
    log.error('Audit log failed', { error: e.message });
  }
}

async function notify(userId, type, title, message, data) {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, data) VALUES ($1, $2, $3, $4, $5)',
      [userId, type, title, message || '', JSON.stringify(data || {})]
    );
  } catch(e) {
    log.error('Notification failed', { error: e.message });
  }
}

async function logApiCall(entry) {
  try {
    await pool.query(
      `INSERT INTO api_logs (user_id, brand_id, platform, query, status, error, key_hint, model, response_ms, tokens_in, tokens_out, cost, run_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        entry.userId || null, entry.brandId || null, entry.platform,
        entry.query || null, entry.status || 'ok', entry.error || null,
        entry.keyHint || null, entry.model || null, entry.responseMs || null,
        entry.tokensIn || 0, entry.tokensOut || 0, entry.cost || null,
        entry.runId || null
      ]
    );
  } catch(e) {
    log.error('API log insert failed', { error: e.message });
  }
}

// Cleanup old api_logs (keep last 7 days) — call periodically
async function cleanupApiLogs() {
  try {
    await pool.query(`DELETE FROM api_logs WHERE created_at < NOW() - INTERVAL '1 day' * $1`, [RETENTION.apiLogsDays]);
  } catch(e) {
    log.error('API log cleanup failed', { error: e.message });
  }
}

// Cleanup old read notifications (keep last 30 days)
async function cleanupNotifications() {
  try {
    await pool.query(`DELETE FROM notifications WHERE read = TRUE AND created_at < NOW() - INTERVAL '1 day' * $1`, [RETENTION.notificationsDays]);
  } catch(e) {
    log.error('Notification cleanup failed', { error: e.message });
  }
}

// Cleanup expired password reset tokens
async function cleanupResetTokens() {
  try {
    await pool.query("DELETE FROM password_reset_tokens WHERE expires_at < NOW()");
  } catch(e) {
    log.error('Reset token cleanup failed', { error: e.message });
  }
}

// Cleanup old webhook events (keep 30 days for dedup window)
async function cleanupWebhookEvents() {
  try {
    await pool.query(`DELETE FROM webhook_events WHERE processed_at < NOW() - INTERVAL '1 day' * $1`, [RETENTION.webhookEventsDays]);
  } catch(e) {
    log.error('Webhook event cleanup failed', { error: e.message });
  }
}

// Cleanup old prompt_runs (keep last 90 days)
async function cleanupPromptRuns() {
  try {
    await pool.query(`DELETE FROM prompt_runs WHERE created_at < NOW() - INTERVAL '1 day' * $1`, [RETENTION.promptRunsDays]);
  } catch(e) {
    log.error('Prompt runs cleanup failed', { error: e.message });
  }
}

// Refresh prompt_run_stats from prompt_runs data (last 30 days window)
async function refreshPromptRunStats(brandId) {
  try {
    await pool.query(`
      INSERT INTO prompt_run_stats (brand_id, prompt, platform, total_runs, mention_count, mention_rate,
        avg_rank, avg_sentiment_score, sentiment_distribution, last_run_at, window_start, window_end, updated_at)
      SELECT
        brand_id, prompt, platform,
        COUNT(*)::int AS total_runs,
        COUNT(*) FILTER (WHERE mentioned = TRUE)::int AS mention_count,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE mentioned = TRUE)::numeric / COUNT(*)::numeric, 4)
          ELSE 0 END AS mention_rate,
        AVG(list_position) FILTER (WHERE list_position IS NOT NULL) AS avg_rank,
        ROUND(AVG(CASE sentiment WHEN 'positive' THEN 1 WHEN 'negative' THEN -1 ELSE 0 END)::numeric, 2) AS avg_sentiment_score,
        jsonb_build_object(
          'positive', COUNT(*) FILTER (WHERE sentiment = 'positive'),
          'neutral', COUNT(*) FILTER (WHERE sentiment = 'neutral'),
          'negative', COUNT(*) FILTER (WHERE sentiment = 'negative')
        ) AS sentiment_distribution,
        MAX(created_at) AS last_run_at,
        MIN(created_at) AS window_start,
        MAX(created_at) AS window_end,
        NOW() AS updated_at
      FROM prompt_runs
      WHERE brand_id = $1 AND success = TRUE AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY brand_id, prompt, platform
      ON CONFLICT (brand_id, prompt, platform)
      DO UPDATE SET
        total_runs = EXCLUDED.total_runs,
        mention_count = EXCLUDED.mention_count,
        mention_rate = EXCLUDED.mention_rate,
        avg_rank = EXCLUDED.avg_rank,
        avg_sentiment_score = EXCLUDED.avg_sentiment_score,
        sentiment_distribution = EXCLUDED.sentiment_distribution,
        last_run_at = EXCLUDED.last_run_at,
        window_start = EXCLUDED.window_start,
        window_end = EXCLUDED.window_end,
        updated_at = NOW()
    `, [brandId]);
  } catch(e) {
    log.error('Prompt run stats refresh failed', { error: e.message, brandId });
  }
}

// ── Persistent response cache (DB-backed) ───────────────────────
async function getDbCachedResponse(cacheKey) {
  try {
    const result = await pool.query(
      'SELECT response FROM response_cache WHERE cache_key = $1 AND expires_at > NOW()',
      [cacheKey]
    );
    return result.rows[0]?.response || null;
  } catch(e) {
    log.error('DB cache read failed', { error: e.message });
    return null;
  }
}

async function setDbCachedResponse(cacheKey, platform, model, query, brandId, city, response, isSearch, ttlMs) {
  try {
    const expiresAt = new Date(Date.now() + ttlMs);
    await pool.query(
      `INSERT INTO response_cache (cache_key, platform, model, query, brand_id, city, response, is_search, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (cache_key) DO UPDATE SET response = $7, expires_at = $9, created_at = NOW()`,
      [cacheKey, platform, model, query, brandId || null, city || null, JSON.stringify(response), isSearch, expiresAt]
    );
  } catch(e) {
    log.error('DB cache write failed', { error: e.message });
  }
}

// Cleanup expired cache entries
async function cleanupResponseCache() {
  try {
    const result = await pool.query("DELETE FROM response_cache WHERE expires_at < NOW()");
    if (result.rowCount > 0) log.info(`Cleaned up ${result.rowCount} expired cache entries`);
  } catch(e) {
    log.error('Response cache cleanup failed', { error: e.message });
  }
}

// ── Daily cost budget tracking ──────────────────────────────────
async function getDailyCost(userId) {
  try {
    const result = await pool.query(
      'SELECT total_cost, query_count FROM daily_cost_tracker WHERE user_id = $1 AND cost_date = CURRENT_DATE',
      [userId]
    );
    return result.rows[0] || { total_cost: 0, query_count: 0 };
  } catch(e) {
    log.error('Daily cost read failed', { error: e.message });
    return { total_cost: 0, query_count: 0 };
  }
}

async function incrementDailyCost(userId, cost, queryCount) {
  try {
    await pool.query(
      `INSERT INTO daily_cost_tracker (user_id, cost_date, total_cost, query_count)
       VALUES ($1, CURRENT_DATE, $2, $3)
       ON CONFLICT (user_id, cost_date) DO UPDATE SET
         total_cost = daily_cost_tracker.total_cost + $2,
         query_count = daily_cost_tracker.query_count + $3,
         updated_at = NOW()`,
      [userId, cost || 0, queryCount || 1]
    );
  } catch(e) {
    log.error('Daily cost increment failed', { error: e.message });
  }
}

// Cleanup old daily cost records (keep 90 days for analytics)
async function cleanupDailyCosts() {
  try {
    await pool.query(`DELETE FROM daily_cost_tracker WHERE cost_date < CURRENT_DATE - INTERVAL '1 day' * $1`, [RETENTION.dailyCostsDays]);
  } catch(e) {
    log.error('Daily cost cleanup failed', { error: e.message });
  }
}

// Cleanup unverified accounts older than 48 hours (spam signups)
async function cleanupUnverifiedAccounts() {
  try {
    // Only delete free accounts that never verified email and have no brands
    const result = await pool.query(`
      DELETE FROM users
      WHERE email_verified = FALSE
        AND plan = 'free'
        AND created_at < NOW() - INTERVAL '48 hours'
        AND id NOT IN (SELECT DISTINCT user_id FROM brands)
    `);
    if (result.rowCount > 0) log.info(`Cleaned up ${result.rowCount} unverified spam accounts`);
  } catch(e) {
    log.error('Unverified account cleanup failed', { error: e.message });
  }
}

// ── Safe pool client wrapper (prevents double-release) ─────────
// Returns a proxied client whose .release() is a no-op after the first call.
// Use this instead of pool.connect() everywhere to eliminate the
// "Release called on client which has already been released" warning.
async function safeConnect() {
  const client = await pool.connect();
  let released = false;
  const originalRelease = client.release.bind(client);
  client.release = (err) => {
    if (released) {
      log.warn('safeConnect: suppressed double-release');
      return;
    }
    released = true;
    return originalRelease(err);
  };
  return client;
}

module.exports = { pool, safeConnect, initDB, auditLog, notify, logApiCall, cleanupApiLogs, cleanupNotifications, cleanupResetTokens, cleanupWebhookEvents, cleanupPromptRuns, refreshPromptRunStats, getDbCachedResponse, setDbCachedResponse, cleanupResponseCache, getDailyCost, incrementDailyCost, cleanupDailyCosts, cleanupUnverifiedAccounts };
