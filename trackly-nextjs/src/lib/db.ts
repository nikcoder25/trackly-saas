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
    max: parseInt(process.env.PG_POOL_MAX || '15', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
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

/**
 * Notification helper - creates in-app notifications.
 * Returns true if created successfully, false otherwise.
 * Never throws.
 */
export async function notify(
  userId: string,
  type: string,
  title: string,
  message?: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, data) VALUES ($1, $2, $3, $4, $5)',
      [userId, type, title, message || '', JSON.stringify(data || {})]
    );
    return true;
  } catch (e) {
    console.error('[Notify] FAILED to create notification:', {
      type,
      userId,
      error: (e as Error).message,
    });
    return false;
  }
}
