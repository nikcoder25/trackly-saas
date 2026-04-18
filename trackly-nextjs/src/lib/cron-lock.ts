import crypto from 'crypto';
import IORedis, { type Redis as IORedisClient } from 'ioredis';
import { pool } from './db';
import { logger } from './logger';

/**
 * Shared cron-lock helper. Every scheduled endpoint should call
 * `acquireCronLock(name, staleAfterMinutes)` to dedupe concurrent triggers.
 *
 * Backends:
 *   1. Redis (preferred) - `SET cron:lock:<name> <token> PX <ttl> NX`, released
 *      atomically via a Lua compare-and-delete so a stale holder cannot delete
 *      a newer owner's lock. This is what fixes the production 409/429
 *      pile-up: overlapping cron invocations (GH Actions schedule +
 *      workflow_dispatch + the in-process instrumentation trigger) all race
 *      on the same Redis key, so only one wins per tick.
 *   2. Postgres table (fallback) - used when REDIS_URL is unset, Redis is
 *      unreachable, or `CRON_LOCK_ENABLED=false`. Table-based (not pg
 *      advisory) because advisory locks are session-scoped and we use a
 *      connection pool - a lock acquired on one connection cannot be
 *      released on another.
 *
 * Env vars:
 *   REDIS_URL             - enables the Redis backend (already set for BullMQ)
 *   CRON_LOCK_ENABLED     - set to "false" to force Postgres fallback
 *                           (rollback path; no code change needed)
 *   CRON_LOCK_TTL_MS      - global override for Redis key TTL. When unset,
 *                           each callsite's `staleAfterMinutes` is used.
 */

// --- Redis client (lazy, singleton) ---

// Process-lifetime markers used to downgrade boot-race log noise. With
// `lazyConnect: false` + `enableOfflineQueue: false`, the very first
// acquire call after process start can race the TCP handshake and see
// "Stream isn't writeable" before the client reaches the `ready` state.
const MODULE_START_MS = Date.now();
const BOOT_WINDOW_MS = 30_000;
const READY_WAIT_TIMEOUT_MS = 2_000;

let _redisClient: IORedisClient | null = null;
let _redisClientInitFailed = false;

function getRedisClient(): IORedisClient | null {
  if (_redisClient) return _redisClient;
  if (_redisClientInitFailed) return null;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const client = new IORedis(url, {
      // Keep the lock path snappy: one retry and fail fast so a Redis outage
      // doesn't turn into a 500. The Postgres fallback will take over.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    client.on('error', (err: Error) => {
      // Prevent unhandled 'error' from crashing the process; logging is
      // intentionally low-volume so a persistent outage doesn't spam logs.
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[cron-lock] Redis client error:', err.message);
      }
    });
    _redisClient = client;
    return client;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[cron-lock] Redis init failed:', (err as Error).message);
    }
    _redisClientInitFailed = true;
    return null;
  }
}

/**
 * Test-only hook. Lets unit tests inject a fake ioredis-compatible client
 * (implementing `set` and `eval`) without actually connecting to Redis.
 * Passing `null` restores the real lazy initializer.
 */
export function _setRedisClientForTests(client: IORedisClient | null): void {
  _redisClient = client;
  _redisClientInitFailed = false;
}

// --- Compare-and-delete Lua script ---
//
// Guarantees we only release a lock we still own. Without this, a slow run
// that exceeded its TTL would delete the NEXT owner's lock on release, which
// would silently reintroduce the concurrency problem we are trying to fix.
const RELEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

// --- Postgres fallback table ---

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

// --- Public types ---

export interface AcquiredLock {
  instanceId: string;
  release: () => Promise<void>;
}

// --- Helpers ---

function computeTtlMs(staleAfterMinutes: number): number {
  const envOverride = parseInt(process.env.CRON_LOCK_TTL_MS || '', 10);
  if (Number.isFinite(envOverride) && envOverride > 0) return envOverride;
  const minutes = Math.max(1, Math.min(1440, Math.floor(staleAfterMinutes)));
  return minutes * 60_000;
}

function isRedisBackendEnabled(): boolean {
  return process.env.CRON_LOCK_ENABLED !== 'false';
}

function logSkip(name: string, backend: 'redis' | 'postgres'): void {
  // Structured skip-reason line. Logged once per contended acquire so the
  // 409/429 pile-up is visible in Sentry Logs (and the App Platform
  // buffer) without needing DB access.
  if (process.env.NODE_ENV === 'test') return;
  logger.info('cron.skip', { name, reason: 'locked', backend });
}

// --- Redis-backed lock ---

type RedisAcquireResult =
  | { status: 'acquired'; lock: AcquiredLock }
  | { status: 'contended' }
  | { status: 'unavailable' };

export async function acquireRedisLock(
  name: string,
  ttlMs: number
): Promise<RedisAcquireResult> {
  const client = getRedisClient();
  if (!client) return { status: 'unavailable' };
  // Boot-race guard: if the client hasn't finished its TCP handshake
  // yet, wait briefly for `ready` before issuing SET. Preserves the
  // fail-fast behavior for real outages - we don't flip
  // `enableOfflineQueue`, so if the client is stuck reconnecting past
  // the 2s window the SET still throws and Postgres takes over.
  if (client.status !== 'ready') {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        client.off('ready', onReady);
        resolve();
      }, READY_WAIT_TIMEOUT_MS);
      const onReady = () => { clearTimeout(timer); resolve(); };
      client.once('ready', onReady);
    });
  }
  const key = `cron:lock:${name}`;
  const instanceId = crypto.randomUUID();
  let setResult: string | null;
  try {
    // ioredis typings for variadic SET options are awkward; the runtime
    // signature is SET key value PX <ms> NX.
    setResult = (await (client as unknown as {
      set: (key: string, value: string, px: 'PX', ttl: number, nx: 'NX') => Promise<string | null>;
    }).set(key, instanceId, 'PX', ttlMs, 'NX')) ?? null;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      const msg = (err as Error).message || '';
      const uptimeMs = Date.now() - MODULE_START_MS;
      const bootRace = uptimeMs < BOOT_WINDOW_MS &&
        (msg.includes("Stream isn't writeable") || msg.includes('ECONNRESET') || msg.includes('Connection is closed'));
      if (bootRace) {
        logger.warn('cron-lock.boot_race_set_failed', { key, uptime_ms: uptimeMs, error: msg });
      } else {
        logger.error('cron-lock.redis_set_failed', { key, uptime_ms: uptimeMs, error: msg });
      }
    }
    return { status: 'unavailable' };
  }
  if (setResult !== 'OK') return { status: 'contended' };
  return {
    status: 'acquired',
    lock: {
      instanceId,
      release: async () => {
        try {
          await client.eval(RELEASE_LUA, 1, key, instanceId);
        } catch (err) {
          if (process.env.NODE_ENV !== 'test') {
            console.warn(
              `[cron-lock] Redis release failed for ${key}:`,
              (err as Error).message
            );
          }
        }
      },
    },
  };
}

// --- Postgres-backed lock (original behavior) ---

export async function acquirePostgresLock(
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

// --- Unified entrypoint ---

/**
 * Try to acquire the named cron lock. Returns null if another instance holds
 * a fresh lock. Prefers Redis (SET NX PX) when available; falls back to a
 * Postgres table when Redis is unreachable or disabled.
 *
 * `staleAfterMinutes` doubles as a safety valve: a crashed holder stops
 * blocking new runs after the window elapses (Redis TTL for the Redis path,
 * table column comparison for the Postgres path).
 */
export async function acquireCronLock(
  name: string,
  staleAfterMinutes = 10
): Promise<AcquiredLock | null> {
  if (isRedisBackendEnabled()) {
    const ttlMs = computeTtlMs(staleAfterMinutes);
    const redis = await acquireRedisLock(name, ttlMs);
    if (redis.status === 'acquired') return redis.lock;
    if (redis.status === 'contended') {
      logSkip(name, 'redis');
      return null;
    }
    // unavailable → fall through to Postgres so a Redis outage never 500s
    // the cron route.
  }
  const pg = await acquirePostgresLock(name, staleAfterMinutes);
  if (!pg) logSkip(name, 'postgres');
  return pg;
}
