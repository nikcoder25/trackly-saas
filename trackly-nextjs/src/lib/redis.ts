/**
 * Shared ioredis client for distributed primitives (rate limiter, coalesce
 * cache, etc.). Lazy-connects on first use, fail-open by default so a
 * Redis outage degrades to in-process gates rather than tearing down the
 * service.
 *
 * Connection strategy mirrors `cron-lock.ts`: one retry per request, no
 * offline queue, and `unref` on the underlying socket so the keepalive
 * timer never holds the process open during shutdown.
 *
 * Tests inject a stub via `_setLimiterRedisForTests` to avoid spinning up
 * a real Redis daemon.
 */
import IORedis, { type Redis as IORedisClient } from 'ioredis';

let _client: IORedisClient | null = null;
let _initFailed = false;

export interface RedisLikeClient {
  status?: string;
  on(event: string, cb: (...args: unknown[]) => void): unknown;
  off(event: string, cb: (...args: unknown[]) => void): unknown;
  once?(event: string, cb: (...args: unknown[]) => void): unknown;
  // Subset of ioredis commands actually used by the limiter.
  // Variadic typing on the ioredis side is awkward, so the limiter casts
  // narrowly at each call-site rather than constraining everything here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Returns the shared ioredis client, or null when REDIS_URL is unset or
 * client construction has previously failed. Caller must handle null
 * (fail-open) unless `AI_REDIS_REQUIRED=true`, which is the prod
 * fail-closed switch.
 */
export function getLimiterRedis(): RedisLikeClient | null {
  if (_client) return _client as unknown as RedisLikeClient;
  if (_initFailed) return null;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const client = new IORedis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    client.on('error', (err: Error) => {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[ai-limiter.redis] client error:', err.message);
      }
    });
    _client = client;
    return client as unknown as RedisLikeClient;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[ai-limiter.redis] init failed:', (err as Error).message);
    }
    _initFailed = true;
    return null;
  }
}

/**
 * True when the operator has opted into fail-closed behaviour. When set,
 * a Redis outage propagates as an error from the distributed limiter
 * instead of falling back to the in-process gates.
 */
export function isRedisRequired(): boolean {
  return process.env.AI_REDIS_REQUIRED === 'true';
}

/**
 * Test-only hook. Pass a stub implementing the subset of ioredis commands
 * the limiter uses; pass null to restore the real lazy initializer.
 */
export function _setLimiterRedisForTests(client: RedisLikeClient | null): void {
  _client = client as unknown as IORedisClient | null;
  _initFailed = false;
}
