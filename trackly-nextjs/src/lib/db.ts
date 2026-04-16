/**
 * Database configuration - connects to the SAME PostgreSQL database
 * as the existing Express app. Ensures required columns exist on startup.
 */
import { Pool } from 'pg';

const sslConfig = process.env.DATABASE_URL
  ? {
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
    connectionString: process.env.DATABASE_URL,
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
        ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
      `);
      globalForDb.dbMigrated = true;
    } catch (e) {
      // Log but don't crash — columns may already exist, or table may not
      // exist yet (Express app creates it). Reset so next call retries.
      console.error('[DB] Migration check failed:', (e as Error).message);
      migratePromise = null;
    }
  })();

  return migratePromise;
}

export { runMigrations as ensureColumns };

/**
 * Safe pool client wrapper — prevents double-release.
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
    await pool.query(
      'INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, action, targetType || null, targetId || null, JSON.stringify(details || {}), ip || null]
    );
    return true;
  } catch (e) {
    console.error('[AuditLog] Failed to write audit log:', {
      action,
      error: (e as Error).message,
    });
    return false;
  }
}

