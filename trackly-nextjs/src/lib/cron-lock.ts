import crypto from 'crypto';
import { pool } from './db';

/**
 * Shared cron-lock helper. Replaces the inline copy that lived in
 * /api/cron/route.ts so every scheduled endpoint can opt into the same
 * dedupe without reimplementing the SQL. Table-based (not pg advisory)
 * because advisory locks are session-scoped and we use a connection
 * pool - a lock acquired on one connection cannot be released on
 * another.
 */

const g = globalThis as unknown as { _cronLocksReady?: boolean };

async function ensureTable() {
  if (g._cronLocksReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cron_locks (
      name TEXT PRIMARY KEY,
      locked_at TIMESTAMPTZ,
      instance_id TEXT
    )
  `);
  g._cronLocksReady = true;
}

export interface AcquiredLock {
  instanceId: string;
  release: () => Promise<void>;
}

/**
 * Try to acquire the named cron lock. Returns null if another instance
 * holds a fresh lock (acquired less than `staleAfterMinutes` ago). The
 * stale threshold doubles as a safety valve: a crashed holder stops
 * blocking new runs after the window elapses.
 */
export async function acquireCronLock(
  name: string,
  staleAfterMinutes = 10
): Promise<AcquiredLock | null> {
  await ensureTable();
  const minutes = Math.max(1, Math.min(1440, Math.floor(staleAfterMinutes)));
  const instanceId = crypto.randomUUID();
  const res = await pool.query(
    `INSERT INTO cron_locks (name, locked_at, instance_id)
     VALUES ($1, NOW(), $2)
     ON CONFLICT (name) DO UPDATE
     SET locked_at = NOW(), instance_id = $2
     WHERE cron_locks.locked_at IS NULL
        OR cron_locks.locked_at < NOW() - INTERVAL '${minutes} minutes'
     RETURNING name`,
    [name, instanceId]
  );
  if (res.rows.length === 0) return null;
  return {
    instanceId,
    release: async () => {
      await pool.query(
        `UPDATE cron_locks SET locked_at = NULL WHERE name = $1 AND instance_id = $2`,
        [name, instanceId]
      ).catch(() => { /* best-effort */ });
    },
  };
}
