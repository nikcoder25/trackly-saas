/**
 * Database configuration and initialization
 */
const { Pool } = require('pg');
const { createLogger } = require('../lib/logger');
const log = createLogger('DB');

// Railway (and many PaaS providers) use self-signed certs for managed PostgreSQL.
// rejectUnauthorized defaults to false unless explicitly set to 'true'.
const sslConfig = process.env.DATABASE_URL
  ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' }
  : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  // Scale pool for concurrent users — default pg Pool is 10 which can bottleneck
  // at 100+ concurrent requests (runs, rechecks, cron jobs all need connections).
  max: parseInt(process.env.PG_POOL_MAX, 10) || 25,
  // Return idle connections after 30s (default 10s) to reduce churn
  idleTimeoutMillis: 30000,
  // Don't wait more than 10s for a connection from the pool
  connectionTimeoutMillis: 10000
});

async function initDB() {
  const client = await pool.connect();
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
    `);
    // Add unique index on username (only for non-null values)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;`);
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
    await pool.query("DELETE FROM api_logs WHERE created_at < NOW() - INTERVAL '7 days'");
  } catch(e) {
    log.error('API log cleanup failed', { error: e.message });
  }
}

// Cleanup old read notifications (keep last 30 days)
async function cleanupNotifications() {
  try {
    await pool.query("DELETE FROM notifications WHERE read = TRUE AND created_at < NOW() - INTERVAL '30 days'");
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
    await pool.query("DELETE FROM webhook_events WHERE processed_at < NOW() - INTERVAL '30 days'");
  } catch(e) {
    log.error('Webhook event cleanup failed', { error: e.message });
  }
}

// Cleanup old prompt_runs (keep last 90 days)
async function cleanupPromptRuns() {
  try {
    await pool.query("DELETE FROM prompt_runs WHERE created_at < NOW() - INTERVAL '90 days'");
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

module.exports = { pool, initDB, auditLog, notify, logApiCall, cleanupApiLogs, cleanupNotifications, cleanupResetTokens, cleanupWebhookEvents, cleanupPromptRuns, refreshPromptRunStats };
