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
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_user_id_fkey'
          ) THEN
            ALTER TABLE user_sessions
              ADD CONSTRAINT user_sessions_user_id_fkey
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

