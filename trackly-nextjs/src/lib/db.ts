/**
 * Database configuration - connects to the SAME PostgreSQL database
 * as the existing Express app. No schema changes needed.
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
const globalForDb = globalThis as unknown as { pool: Pool | undefined };

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig,
    max: parseInt(process.env.PG_POOL_MAX || '50', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
}

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
    console.error('[AuditLog] FAILED to write audit log:', {
      action,
      userId,
      error: (e as Error).message,
    });
    return false;
  }
}

