/**
 * Database configuration - connects to the SAME PostgreSQL database
 * as the existing Express app. Ensures required columns exist on startup.
 */
import { Pool } from 'pg';

function loadDatabaseCa(): string | undefined {
  const raw = process.env.DATABASE_CA_CERT?.trim();
  if (!raw) return undefined;
  // Accept raw PEM or base64-encoded PEM (platform env UIs often mangle newlines).
  return raw.includes('BEGIN CERTIFICATE')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8');
}

// DigitalOcean's managed PostgreSQL signs its server cert with a private CA
// that Node's default trust store doesn't know about. Supplying the CA here
// lets the pg client verify the connection without the global
// NODE_TLS_REJECT_UNAUTHORIZED=0 workaround.
const ca = loadDatabaseCa();

// Strip `sslmode` from DATABASE_URL before handing it to pg. pg-connection-string
// translates `sslmode=require` (and friends) into its own ssl object that
// REPLACES the explicit `ssl` option below, which would discard our CA. By
// removing the query param we let our `sslConfig` win.
const sanitizedDatabaseUrl = process.env.DATABASE_URL
  ? process.env.DATABASE_URL
      .replace(/([?&])sslmode=[^&]*(&|$)/g, (_m, pre, post) => (post === '&' ? pre : ''))
      .replace(/\?$/, '')
  : undefined;

const sslConfig = process.env.DATABASE_URL
  ? {
      ...(ca ? { ca } : {}),
      rejectUnauthorized:
        process.env.NODE_ENV === 'production'
          ? process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
          : process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true',
    }
  : false;

// Use global to prevent multiple pool instances in development (Next.js hot reload)
const globalForDb = globalThis as unknown as { pool: Pool | undefined; dbMigrated: boolean | undefined };

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: sanitizedDatabaseUrl,
    ssl: sslConfig,
    max: parseInt(process.env.PG_POOL_MAX || '50', 10),
    min: parseInt(process.env.PG_POOL_MIN || '5', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000, // Kill queries that run longer than 30s
    application_name: 'trackly-nextjs',
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
}

/**
 * Ensure required columns exist in the users table.
 * The Express app's config/db.js creates these via ALTER TABLE migrations,
 * but when the Next.js app is deployed independently (or first), these
 * columns may not exist yet. Runs once per process lifetime.
 */
let migratePromise: Promise<void> | null = null;

function runMigrations(): Promise<void> {
  if (globalForDb.dbMigrated) return Promise.resolve();
  if (migratePromise) return migratePromise;

  migratePromise = (async () => {
    try {
      await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_expires TIMESTAMPTZ;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_hashed BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email_normalized TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ip TEXT;
        CREATE INDEX IF NOT EXISTS users_email_normalized_idx ON users(email_normalized);
        CREATE INDEX IF NOT EXISTS users_signup_ip_idx ON users(signup_ip);
        CREATE TABLE IF NOT EXISTS trial_usage (
          user_id TEXT NOT NULL,
          usage_date DATE NOT NULL,
          prompts_used INT NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, usage_date)
        );
        CREATE TABLE IF NOT EXISTS trial_global_usage (
          usage_date DATE PRIMARY KEY,
          prompts_used INT NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS user_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          refresh_token_hash TEXT NOT NULL UNIQUE,
          user_agent TEXT,
          ip TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions(user_id);
        CREATE INDEX IF NOT EXISTS user_sessions_last_used_idx ON user_sessions(last_used_at);
        CREATE TABLE IF NOT EXISTS usage_counters (
          user_id TEXT PRIMARY KEY,
          period_month DATE NOT NULL,
          monthly_used INT NOT NULL DEFAULT 0,
          daily_date DATE NOT NULL,
          manual_daily_used INT NOT NULL DEFAULT 0,
          last_low_balance_notify_at TIMESTAMPTZ,
          last_reset_notify_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS prompt_cooldowns (
          user_id TEXT NOT NULL,
          prompt_hash TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (user_id, prompt_hash)
        );
        CREATE INDEX IF NOT EXISTS prompt_cooldowns_expires_idx
          ON prompt_cooldowns(expires_at);
        CREATE TABLE IF NOT EXISTS email_outbox (
          id UUID PRIMARY KEY,
          to_email TEXT NOT NULL,
          subject TEXT NOT NULL,
          body_html TEXT NOT NULL,
          body_text TEXT,
          reply_to TEXT,
          template_key TEXT NOT NULL,
          payload_json JSONB NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INT NOT NULL DEFAULT 0,
          max_attempts INT NOT NULL DEFAULT 5,
          next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_error TEXT,
          idempotency_key TEXT UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          sent_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS email_outbox_pickup_idx
          ON email_outbox (status, next_attempt_at)
          WHERE status IN ('pending', 'failed');
        CREATE TABLE IF NOT EXISTS billing_events (
          id UUID PRIMARY KEY,
          user_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          from_plan TEXT,
          to_plan TEXT,
          subscription_id TEXT,
          dodo_event_id TEXT,
          source TEXT NOT NULL,
          details JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS billing_events_user_created_idx
          ON billing_events (user_id, created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS billing_events_dodo_event_id_uniq
          ON billing_events (dodo_event_id)
          WHERE dodo_event_id IS NOT NULL;
        -- Shared AI response cache. Cross-tenant by design: same prompt +
        -- platform + model + searchEnabled key produces the same answer for
        -- every customer asking on the same day. CREATE/ALTER are
        -- non-destructive so they're safe to run on a deploy where the
        -- table already exists with a different shape.
        --
        -- This block mirrors the prod schema introspected via PR #514
        -- (10 columns, all referenced by setCached as of PR #515) so a
        -- fresh-bootstrap DB matches prod exactly: types, nullability,
        -- and defaults. On the live prod table the CREATE TABLE is a
        -- no-op; the ALTERs below converge any pre-PR-#515 environment.
        CREATE TABLE IF NOT EXISTS response_cache (
          cache_key TEXT PRIMARY KEY,
          platform TEXT NOT NULL,
          model TEXT NOT NULL,
          query TEXT NOT NULL,
          brand_id TEXT,
          city TEXT,
          response JSONB NOT NULL,
          is_search BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        );
        -- Forward-compat ALTERs for environments that already had the
        -- table with the original 6-column shape (pre-PR #515). All
        -- additive and idempotent - re-running the bootstrap on a
        -- partially-migrated DB converges on the prod column set
        -- without dropping data.
        --
        -- Asymmetry: prod's query column is NOT NULL, but
        -- ADD COLUMN ... NOT NULL on a populated table fails
        -- (Postgres rejects the constraint when existing rows would
        -- violate it). We add query as nullable here so the ALTER
        -- stays idempotent on dev DBs that pre-date PR #515. Fresh
        -- bootstraps still get NOT NULL via the CREATE TABLE above;
        -- prod already has it (verified via PR #514 introspection).
        -- Retrofit NOT NULL on legacy dev DBs manually after
        -- backfilling if you need it.
        ALTER TABLE response_cache ADD COLUMN IF NOT EXISTS query TEXT;
        ALTER TABLE response_cache ADD COLUMN IF NOT EXISTS brand_id TEXT;
        ALTER TABLE response_cache ADD COLUMN IF NOT EXISTS city TEXT;
        ALTER TABLE response_cache ADD COLUMN IF NOT EXISTS is_search BOOLEAN DEFAULT false;
        CREATE INDEX IF NOT EXISTS idx_response_cache_expires
          ON response_cache (expires_at);
        ALTER TABLE prompt_runs
          ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN DEFAULT false;
        -- Citation Decoder (Phase 1): one row per cited URL per prompt per
        -- engine. Normalized out of prompt_runs.citations (JSONB array) so
        -- the pattern engine can group/aggregate by url, domain, platform
        -- and date without unpacking JSON on every read. position is the
        -- 1-based order of the URL within the response's citation list.
        CREATE TABLE IF NOT EXISTS citations (
          id TEXT PRIMARY KEY,
          prompt_run_id TEXT NOT NULL,
          brand_id TEXT NOT NULL,
          prompt TEXT NOT NULL,
          platform TEXT NOT NULL,
          url TEXT NOT NULL,
          domain TEXT,
          position INT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS citations_run_url_uniq
          ON citations (prompt_run_id, url);
        CREATE INDEX IF NOT EXISTS citations_brand_created_idx
          ON citations (brand_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS citations_domain_idx
          ON citations (domain);
        -- Crawl queue + raw HTML store for cited pages. One row per unique
        -- URL across all tenants (the page content is the same no matter
        -- who saw it cited). The nightly /api/cron/crawl-citations job
        -- drains status IN ('pending','error') rows; the Phase 2 feature
        -- extractor reads the stored html.
        CREATE TABLE IF NOT EXISTS cited_pages (
          url TEXT PRIMARY KEY,
          domain TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          http_status INT,
          content_type TEXT,
          html TEXT,
          error TEXT,
          attempts INT NOT NULL DEFAULT 0,
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_fetched_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS cited_pages_pickup_idx
          ON cited_pages (status, attempts, first_seen_at)
          WHERE status IN ('pending', 'error');
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_user_id_fkey'
          ) THEN
            ALTER TABLE user_sessions
              ADD CONSTRAINT user_sessions_user_id_fkey
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'billing_events_user_id_fkey'
          ) THEN
            ALTER TABLE billing_events
              ADD CONSTRAINT billing_events_user_id_fkey
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
          END IF;
        END $$;
      `);

      // Backfill existing single-column refresh tokens into user_sessions so
      // currently-logged-in users don't all get kicked out on deploy. Runs
      // once per token; subsequent process starts are no-ops.
      await pool.query(`
        INSERT INTO user_sessions (id, user_id, refresh_token_hash)
        SELECT md5(random()::text || clock_timestamp()::text || u.id), u.id, u.refresh_token
        FROM users u
        WHERE u.refresh_token IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM user_sessions s WHERE s.refresh_token_hash = u.refresh_token
          );
      `);

      // One-time invalidation of any plaintext verify_tokens left over
      // from before tokens were stored as sha256 hashes. Affected users
      // (unverified accounts) need to click "resend verification" to
      // get a fresh hashed token. Idempotent: rows already migrated
      // have verify_token_hashed = TRUE and are skipped.
      await pool.query(`
        UPDATE users
           SET verify_token = NULL, verify_token_expires = NULL
         WHERE verify_token IS NOT NULL AND verify_token_hashed = FALSE
      `);

      // Migrate plaintext TOTP secrets to encrypted-at-rest. Identify
      // plaintext by base32 shape: current stored values are raw base32
      // (A-Z2-7, no colons); encrypted values from encryptValue have the
      // shape "hex:hex:hex" (three colon-separated hex segments). Runs
      // once per process; the regex filter returns zero rows on
      // subsequent calls.
      try {
        const { encryptValue } = await import('./helpers');
        const res = await pool.query(`
          SELECT id, settings FROM users
          WHERE settings ? 'totp_secret'
            AND settings->>'totp_secret' !~ '^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$'
        `);
        for (const row of res.rows as Array<{ id: string; settings: Record<string, unknown> }>) {
          const plaintext = row.settings.totp_secret as string;
          const encrypted = encryptValue(plaintext);
          if (!encrypted) continue;
          await pool.query(
            `UPDATE users SET settings = settings || jsonb_build_object('totp_secret', $1::text) WHERE id = $2`,
            [encrypted, row.id]
          );
        }
      } catch (e) {
        console.error('[DB] TOTP encryption migration failed:', (e as Error).message);
      }

      // One-time backfill of the citations table from historical
      // prompt_runs.citations arrays (last 90 days), so the Citation
      // Decoder has data on day one instead of starting cold. Guarded by
      // an emptiness check - both INSERTs are ON CONFLICT DO NOTHING and
      // therefore idempotent, but the guard keeps subsequent process
      // starts from re-scanning prompt_runs. Best-effort: the pool's 30s
      // statement_timeout bounds the scan, and a timeout here only means
      // the table fills from new runs going forward.
      try {
        const existing = await pool.query('SELECT 1 FROM citations LIMIT 1');
        if (existing.rows.length === 0) {
          await pool.query(`
            INSERT INTO citations (id, prompt_run_id, brand_id, prompt, platform, url, domain, position, created_at)
            SELECT md5(pr.id || '|' || c.url), pr.id, pr.brand_id, pr.prompt, pr.platform,
                   left(c.url, 2048),
                   lower(substring(c.url from '^https?://(?:www\\.)?([^/:?#]+)')),
                   c.ord, pr.created_at
              FROM prompt_runs pr,
                   LATERAL jsonb_array_elements_text(pr.citations) WITH ORDINALITY AS c(url, ord)
             WHERE pr.citations IS NOT NULL
               AND jsonb_typeof(pr.citations) = 'array'
               AND pr.created_at > NOW() - INTERVAL '90 days'
               AND c.url ~ '^https?://'
            ON CONFLICT DO NOTHING
          `);
          // Seed the crawl queue with recently-cited URLs only - pages
          // cited months ago may have changed too much to explain today's
          // citation behaviour.
          await pool.query(`
            INSERT INTO cited_pages (url, domain)
            SELECT DISTINCT url, domain FROM citations
             WHERE created_at > NOW() - INTERVAL '30 days'
            ON CONFLICT (url) DO NOTHING
          `);
        }
      } catch (e) {
        console.error('[DB] citations backfill failed:', (e as Error).message);
      }
      globalForDb.dbMigrated = true;
    } catch (e) {
      // Log but don't crash - columns may already exist, or table may not
      // exist yet (Express app creates it). Reset so next call retries.
      console.error('[DB] Migration check failed:', (e as Error).message);
      migratePromise = null;
    }
  })();

  return migratePromise;
}

export { runMigrations as ensureColumns };

/**
 * Safe pool client wrapper - prevents double-release.
 * Returns a client whose .release() is a no-op after the first call.
 * Use this instead of pool.connect() to eliminate the
 * "Release called on client which has already been released" warning.
 */
export async function safeConnect() {
  const client = await pool.connect();
  let released = false;
  const originalRelease = client.release.bind(client);
  client.release = ((err?: Error | boolean) => {
    if (released) {
      console.warn('[DB] safeConnect: suppressed double-release');
      return;
    }
    released = true;
    return originalRelease(err);
  }) as typeof client.release;
  return client;
}

/**
 * Audit log helper - logs security-relevant events.
 * Returns true if logged successfully, false if logging failed.
 * Never throws - callers should not fail due to audit log issues.
 */
export async function auditLog(
  userId: string,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, unknown>,
  ip?: string
): Promise<boolean> {
  try {
    // For system-level actions, verify the user_id exists to avoid FK violations
    // on orphaned records. Use a NULL user_id for system actions if user is gone.
    let effectiveUserId: string | null = userId;
    if (userId === 'system' || userId === '') {
      effectiveUserId = null;
    }
    await pool.query(
      'INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip) VALUES ($1, $2, $3, $4, $5, $6)',
      [effectiveUserId, action, targetType || null, targetId || null, JSON.stringify(details || {}), ip || null]
    );
    return true;
  } catch (e) {
    const msg = (e as Error).message;
    // FK violation on user_id means the user was deleted - not actionable, log quietly
    if (msg.includes('foreign key constraint')) {
      console.warn('[AuditLog] Skipped audit log (user no longer exists):', { action, userId });
    } else {
      console.error('[AuditLog] Failed to write audit log:', { action, error: msg });
    }
    return false;
  }
}

