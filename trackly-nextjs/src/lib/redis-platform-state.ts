/**
 * Redis-backed per-platform state for the AI rate limiter (issue #407).
 *
 * Replaces the in-process Maps in `ai-platforms.ts` with shared primitives
 * so concurrency caps, sliding-window RPM, and the platform-wide rate-limit
 * circuit breaker are honoured across every pod that participates.
 *
 * Public surface (used by `ai-platforms.ts` when `AI_DISTRIBUTED_LIMITER=true`):
 *   - acquireSlot(platform, signal, opts)  -> { release, leaseId }
 *   - releaseSlot(platform, leaseId)
 *   - recordRateLimit(platform)            // feeds the platform circuit breaker
 *   - isRateLimited(platform)              // breaker open?
 *
 * Atomicity:
 *   The concurrency-and-RPM check is a single Lua script (`ACQUIRE_LUA`).
 *   Two separate `INCR` + `ZADD` calls would race across pods and let the
 *   process count drift above `maxConcurrent`. The script trims expired
 *   leases first, so a crashed pod that left an entry behind no longer
 *   permanently leaks a slot - the lease's expiry score is the recovery
 *   signal.
 *
 * Abort-awareness:
 *   When the gate is closed, callers poll on a backoff (NOT a Redis BLPOP)
 *   so the per-task AbortSignal can interrupt cleanly. Same waiter
 *   semantics PR #406 just landed for the in-process path.
 *
 * Fail-open:
 *   When `getLimiterRedis()` returns null (no REDIS_URL or init failed),
 *   `acquireSlot` resolves with a no-op release and `isRateLimited`
 *   returns false. Operators opting into fail-closed via
 *   `AI_REDIS_REQUIRED=true` get an error thrown instead.
 */
import crypto from 'crypto';
import { getLimiterRedis, isRedisRequired, type RedisLikeClient } from './redis';

// Match the in-process platform-CB knobs in ai-platforms.ts so behaviour
// stays identical when callers swap between paths.
const PLATFORM_CB_THRESHOLD = Number(process.env.AI_PLATFORM_CB_THRESHOLD) || 8;
const PLATFORM_CB_WINDOW_MS = Number(process.env.AI_PLATFORM_CB_WINDOW_MS) || 60_000;
const PLATFORM_CB_COOLDOWN_MS = Number(process.env.AI_PLATFORM_CB_COOLDOWN_MS) || 5 * 60_000;

// Lease TTL = max-task-budget + 30s headroom so a pod crash can't leak a
// slot for longer than one task budget.
const DEFAULT_LEASE_TTL_MS = Number(process.env.AI_LIMITER_LEASE_TTL_MS) || 210_000;

// Concurrency-blocked poll cadence. RPM-blocked waits use the wait hint
// returned by the Lua script (capped) so we don't busy-loop while still
// honouring the sliding window.
const CONCURRENCY_POLL_MIN_MS = 50;
const CONCURRENCY_POLL_MAX_MS = 500;
const RPM_POLL_MAX_MS = 2_000;

export interface AcquireOptions {
  maxConcurrent: number;
  rpm: number;
  windowMs: number;
  leaseTtlMs?: number;
}

export interface AcquireResult {
  release: () => Promise<void>;
  leaseId: string;
}

class AbortError extends Error {
  isTransient = false;
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}

class RedisRequiredError extends Error {
  isTransient = true;
  constructor(message: string) {
    super(message);
    this.name = 'RedisRequiredError';
  }
}

function leasesKey(platform: string): string {
  return `ai-limiter:leases:${platform}`;
}
function rpmKey(platform: string): string {
  return `ai-limiter:rpm:${platform}`;
}
function breakerFailuresKey(platform: string): string {
  return `ai-limiter:breaker:failures:${platform}`;
}
function breakerOpenKey(platform: string): string {
  return `ai-limiter:breaker:open:${platform}`;
}
function coalesceKey(platform: string, hash: string): string {
  return `ai-limiter:coalesce:${platform}:${hash}`;
}

const COALESCE_PENDING_MARKER = '__pending__';
const COALESCE_DEFAULT_TTL_MS = 60_000;
const COALESCE_DEFAULT_POLL_MS = 100;
const COALESCE_DEFAULT_BUDGET_MS = 30_000;

/**
 * True when the AI_DISTRIBUTED_LIMITER feature flag is on AND a Redis
 * client is available. Used by `ai-platforms.ts` to decide between the
 * Redis primitives and the in-process Maps. When `AI_REDIS_REQUIRED=true`
 * but no client is available, returns `false` here so the caller's
 * dispatch can throw a clearer error from the primitive itself.
 */
export function distributedLimiterEnabled(): boolean {
  if (process.env.AI_DISTRIBUTED_LIMITER !== 'true') return false;
  return getLimiterRedis() !== null;
}

// Atomic concurrency + RPM check.
//   KEYS[1] = leases zset (member=leaseId, score=expiryMs)
//   KEYS[2] = rpm zset    (member="<leaseId>:<now>", score=now)
//   ARGV[1] = maxConcurrent
//   ARGV[2] = rpmLimit
//   ARGV[3] = windowMs
//   ARGV[4] = nowMs
//   ARGV[5] = leaseId
//   ARGV[6] = leaseExpiryMs
// Returns: { acquired (1/0), reason ('ok'|'concurrency'|'rpm'), waitMs }
const ACQUIRE_LUA = `
local now = tonumber(ARGV[4])
local windowMs = tonumber(ARGV[3])
local maxConc = tonumber(ARGV[1])
local rpmLimit = tonumber(ARGV[2])

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
local inflight = tonumber(redis.call('ZCARD', KEYS[1]))
if inflight >= maxConc then
  return {0, 'concurrency', 0}
end

local cutoff = now - windowMs
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)
local rpmCount = tonumber(redis.call('ZCARD', KEYS[2]))
if rpmCount >= rpmLimit then
  local oldest = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
  local oldestTs = now
  if oldest[2] then oldestTs = tonumber(oldest[2]) end
  local waitMs = windowMs - (now - oldestTs) + 25
  if waitMs < 50 then waitMs = 50 end
  return {0, 'rpm', waitMs}
end

redis.call('ZADD', KEYS[1], tonumber(ARGV[6]), ARGV[5])
redis.call('ZADD', KEYS[2], now, ARGV[5] .. ':' .. now)
local maxExpiry = tonumber(ARGV[6])
local pttl = redis.call('PTTL', KEYS[1])
if pttl == -1 or pttl < (maxExpiry - now + 60000) then
  redis.call('PEXPIRE', KEYS[1], maxExpiry - now + 60000)
end
redis.call('PEXPIRE', KEYS[2], windowMs * 2)
return {1, 'ok', 0}
`;

// Sliding-window check + open-breaker write.
//   KEYS[1] = failures zset
//   KEYS[2] = open key (string with cooldown TTL)
//   ARGV[1] = nowMs
//   ARGV[2] = windowMs
//   ARGV[3] = threshold
//   ARGV[4] = cooldownMs
//   ARGV[5] = unique failure id (so two concurrent records both count)
// Returns: { failures, opened (1/0) }
const RECORD_RATELIMIT_LUA = `
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local threshold = tonumber(ARGV[3])
local cooldownMs = tonumber(ARGV[4])
local cutoff = now - windowMs
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
redis.call('ZADD', KEYS[1], now, ARGV[5])
redis.call('PEXPIRE', KEYS[1], windowMs * 2)
local failures = tonumber(redis.call('ZCARD', KEYS[1]))
local alreadyOpen = redis.call('EXISTS', KEYS[2])
local opened = 0
if failures >= threshold and alreadyOpen == 0 then
  redis.call('SET', KEYS[2], '1', 'PX', cooldownMs)
  opened = 1
end
return {failures, opened}
`;

function abortError(signal: AbortSignal | undefined, fallback: string): AbortError {
  const reason = signal?.reason as unknown;
  if (reason instanceof Error && reason.message) return new AbortError(reason.message);
  if (typeof reason === 'string' && reason.length > 0) return new AbortError(reason);
  return new AbortError(fallback);
}

function abortAwareSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise(r => setTimeout(r, ms));
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal, 'aborted during limiter wait'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(abortError(signal, 'aborted during limiter wait'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function clientUnavailable(action: string): never | null {
  if (isRedisRequired()) {
    throw new RedisRequiredError(`Redis required for ${action} but unavailable`);
  }
  return null;
}

interface LuaResult {
  acquired: number;
  reason: string;
  waitMs: number;
}

function parseAcquireResult(raw: unknown): LuaResult {
  // ioredis returns Lua arrays as JS arrays; the stub mirrors this.
  if (!Array.isArray(raw)) {
    return { acquired: 0, reason: 'concurrency', waitMs: CONCURRENCY_POLL_MIN_MS };
  }
  const [acquired, reason, waitMs] = raw as [unknown, unknown, unknown];
  return {
    acquired: Number(acquired) || 0,
    reason: typeof reason === 'string' ? reason : String(reason ?? ''),
    waitMs: Number(waitMs) || 0,
  };
}

/**
 * Acquire one platform slot. Returns the leaseId so the caller can
 * release it deterministically (and so a sweeper can reconcile leases
 * against the inflight ZCARD if we ever add one).
 *
 * Fail-open: when no Redis client is available and `AI_REDIS_REQUIRED`
 * is not set, returns a no-op release. The in-process gate in
 * `ai-platforms.ts` is responsible for actually limiting in that case.
 */
export async function acquireSlot(
  platform: string,
  signal: AbortSignal | undefined,
  opts: AcquireOptions,
): Promise<AcquireResult> {
  const client = getLimiterRedis();
  if (!client) {
    clientUnavailable('acquireSlot');
    return { release: async () => {}, leaseId: '' };
  }
  const leaseId = crypto.randomUUID();
  const ttl = opts.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
  const lk = leasesKey(platform);
  const rk = rpmKey(platform);

  for (;;) {
    if (signal?.aborted) {
      throw abortError(signal, `acquireSlot aborted for ${platform}`);
    }
    const now = Date.now();
    const expiry = now + ttl;
    let raw: unknown;
    try {
      raw = await (client as RedisLikeClient).eval(
        ACQUIRE_LUA,
        2,
        lk,
        rk,
        String(opts.maxConcurrent),
        String(opts.rpm),
        String(opts.windowMs),
        String(now),
        leaseId,
        String(expiry),
      );
    } catch (err) {
      if (isRedisRequired()) {
        throw new RedisRequiredError(
          `acquireSlot redis EVAL failed: ${(err as Error).message}`,
        );
      }
      // Fail-open: degrade to a no-op slot so the caller's in-process
      // gate (or absence thereof) decides what happens next.
      return { release: async () => {}, leaseId: '' };
    }
    const result = parseAcquireResult(raw);
    if (result.acquired === 1) {
      return {
        leaseId,
        release: () => releaseSlot(platform, leaseId),
      };
    }
    const waitMs = result.reason === 'rpm'
      ? Math.min(Math.max(result.waitMs, CONCURRENCY_POLL_MIN_MS), RPM_POLL_MAX_MS)
      : Math.min(
          CONCURRENCY_POLL_MAX_MS,
          Math.max(
            CONCURRENCY_POLL_MIN_MS,
            CONCURRENCY_POLL_MIN_MS + Math.floor(Math.random() * CONCURRENCY_POLL_MAX_MS),
          ),
        );
    await abortAwareSleep(waitMs, signal);
  }
}

/**
 * Release the slot identified by `leaseId`. ZREM is a no-op if the lease
 * has already expired (crash recovery path), which keeps the count
 * correct without extra error handling.
 */
export async function releaseSlot(platform: string, leaseId: string): Promise<void> {
  if (!leaseId) return;
  const client = getLimiterRedis();
  if (!client) return;
  try {
    await (client as RedisLikeClient).zrem(leasesKey(platform), leaseId);
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[ai-limiter] releaseSlot failed:', (err as Error).message);
    }
  }
}

/**
 * Record a 429/529 against a platform. When the failure count crosses
 * `PLATFORM_CB_THRESHOLD` inside `PLATFORM_CB_WINDOW_MS`, the breaker
 * opens for `PLATFORM_CB_COOLDOWN_MS` and `isRateLimited` returns true
 * for every pod sharing the Redis instance.
 *
 * Returns `true` when this call is the one that flipped the breaker
 * open, matching the in-process `recordPlatformRateLimit` contract.
 */
export async function recordRateLimit(platform: string): Promise<boolean> {
  const client = getLimiterRedis();
  if (!client) {
    clientUnavailable('recordRateLimit');
    return false;
  }
  const failureId = `${Date.now()}:${crypto.randomBytes(4).toString('hex')}`;
  try {
    const raw = await (client as RedisLikeClient).eval(
      RECORD_RATELIMIT_LUA,
      2,
      breakerFailuresKey(platform),
      breakerOpenKey(platform),
      String(Date.now()),
      String(PLATFORM_CB_WINDOW_MS),
      String(PLATFORM_CB_THRESHOLD),
      String(PLATFORM_CB_COOLDOWN_MS),
      failureId,
    );
    if (Array.isArray(raw)) {
      const opened = Number((raw as unknown[])[1]) === 1;
      if (opened && process.env.NODE_ENV !== 'test') {
        console.warn(
          `[ai-limiter] ${platform} rate-limit circuit OPEN for ` +
          `${Math.round(PLATFORM_CB_COOLDOWN_MS / 1000)}s ` +
          `after ${PLATFORM_CB_THRESHOLD} 429s in ` +
          `${Math.round(PLATFORM_CB_WINDOW_MS / 1000)}s`,
        );
      }
      return opened;
    }
    return false;
  } catch (err) {
    if (isRedisRequired()) {
      throw new RedisRequiredError(
        `recordRateLimit redis EVAL failed: ${(err as Error).message}`,
      );
    }
    return false;
  }
}

/**
 * Operator escape hatch: DEL both breaker keys for a platform so the
 * gate re-opens immediately. Returns the count of keys actually deleted
 * (0 = breaker wasn't set, 1 or 2 = open and/or failures cleared).
 *
 * Behaviour mirrors the rest of the file:
 *   - Returns `{ available: false }` when no Redis client is available
 *     (and `AI_REDIS_REQUIRED` is unset). The route handler still does
 *     the in-process reset, which is the meaningful action for this pod.
 *   - Throws `RedisRequiredError` on Redis failure when fail-closed is on.
 *
 * Intentionally narrow surface: only the two breaker keys, never the
 * leases zset / rpm zset / coalesce cache. Resetting those would
 * destabilise in-flight requests across all pods.
 */
export async function clearBreaker(
  platform: string,
): Promise<{ available: boolean; deleted: number }> {
  const client = getLimiterRedis();
  if (!client) {
    clientUnavailable('clearBreaker');
    return { available: false, deleted: 0 };
  }
  try {
    // ioredis `del` accepts variadic key args and returns the integer
    // count of keys actually removed. Both keys may be absent (breaker
    // wasn't open) - that's a valid 0-result, not an error.
    const deleted = await (client as RedisLikeClient).del(
      breakerOpenKey(platform),
      breakerFailuresKey(platform),
    );
    return { available: true, deleted: Number(deleted) || 0 };
  } catch (err) {
    if (isRedisRequired()) {
      throw new RedisRequiredError(
        `clearBreaker redis DEL failed: ${(err as Error).message}`,
      );
    }
    throw err;
  }
}

/**
 * True when the platform-wide rate-limit circuit is open. The breaker key
 * carries its own TTL, so we just probe `EXISTS`.
 */
export async function isRateLimited(platform: string): Promise<boolean> {
  const client = getLimiterRedis();
  if (!client) {
    clientUnavailable('isRateLimited');
    return false;
  }
  try {
    const exists = await (client as RedisLikeClient).exists(breakerOpenKey(platform));
    return Number(exists) === 1;
  } catch (err) {
    if (isRedisRequired()) {
      throw new RedisRequiredError(
        `isRateLimited redis EXISTS failed: ${(err as Error).message}`,
      );
    }
    return false;
  }
}

export interface CoalesceOptions {
  signal?: AbortSignal;
  ttlMs?: number;
  budgetMs?: number;
  pollMs?: number;
}

function hashCoalesceKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * In-flight coalesce cache shared across pods. Two callers asking for the
 * same `(platform, query, model, ...)` tuple see one outbound call: the
 * SET-NX winner runs `fn`, every loser polls the same key and returns the
 * winner's result.
 *
 * Key layout: `coalesce:{platform}:{sha256(rawKey)}`. SET NX with a 60s
 * TTL stores a placeholder; the winner overwrites with the JSON-serialised
 * result on success or DELs the key on error so losers fall back to a
 * direct call instead of polling forever.
 *
 * Fail-open: when no Redis client is available (and `AI_REDIS_REQUIRED`
 * is not set) we just run `fn` directly. The in-process coalesce path in
 * `ai-platforms.ts` handles same-pod dedup.
 */
export async function coalesceCall<T>(
  platform: string,
  rawKey: string,
  fn: () => Promise<T>,
  opts: CoalesceOptions = {},
): Promise<T> {
  const client = getLimiterRedis();
  if (!client) {
    if (isRedisRequired()) {
      throw new RedisRequiredError('coalesceCall: Redis required but unavailable');
    }
    return fn();
  }
  const key = coalesceKey(platform, hashCoalesceKey(rawKey));
  const ttlMs = opts.ttlMs ?? COALESCE_DEFAULT_TTL_MS;
  const budgetMs = opts.budgetMs ?? COALESCE_DEFAULT_BUDGET_MS;
  const pollMs = opts.pollMs ?? COALESCE_DEFAULT_POLL_MS;
  const signal = opts.signal;

  let setResult: string | null;
  try {
    setResult = (await (client as RedisLikeClient).set(
      key,
      COALESCE_PENDING_MARKER,
      'PX',
      ttlMs,
      'NX',
    )) ?? null;
  } catch (err) {
    if (isRedisRequired()) {
      throw new RedisRequiredError(
        `coalesceCall SET NX failed: ${(err as Error).message}`,
      );
    }
    return fn();
  }

  if (setResult === 'OK') {
    // Winner. Run fn, write the JSON result so losers can pick it up,
    // or DEL the key on error so they fall through to a direct call.
    try {
      const value = await fn();
      try {
        const serialised = JSON.stringify({ ok: true, value });
        await (client as RedisLikeClient).set(key, serialised, 'PX', ttlMs);
      } catch (err) {
        // Best-effort cache write. Non-serialisable values (Date, BigInt)
        // are degenerate inputs - log once and let the loser run fn() too
        // rather than serve a corrupt cache entry.
        if (process.env.NODE_ENV !== 'test') {
          console.warn('[ai-limiter] coalesce cache write failed:', (err as Error).message);
        }
        try { await (client as RedisLikeClient).del(key); } catch { /* best-effort */ }
      }
      return value;
    } catch (err) {
      try { await (client as RedisLikeClient).del(key); } catch { /* best-effort */ }
      throw err;
    }
  }

  // Loser. Poll for the winner's result.
  const startedAt = Date.now();
  for (;;) {
    if (signal?.aborted) {
      throw abortError(signal, 'coalesceCall aborted while polling');
    }
    let raw: string | null;
    try {
      raw = (await (client as RedisLikeClient).get(key)) ?? null;
    } catch {
      // Treat as cache miss - fall through to direct fn().
      break;
    }
    if (raw === null) {
      // Winner errored and DELed the key. Fall back to running fn locally.
      break;
    }
    if (raw !== COALESCE_PENDING_MARKER) {
      try {
        const parsed = JSON.parse(raw) as { ok?: boolean; value?: T };
        if (parsed && parsed.ok === true) return parsed.value as T;
      } catch {
        // Garbled value - fall through to direct fn().
      }
      break;
    }
    if (Date.now() - startedAt >= budgetMs) break;
    await abortAwareSleep(pollMs, signal);
  }
  return fn();
}

/**
 * Test-only helper. Exposes the script + key prefixes so unit tests can
 * exercise the same code paths the production callers see without
 * reaching back into private symbols.
 */
export const __test__ = {
  ACQUIRE_LUA,
  RECORD_RATELIMIT_LUA,
  leasesKey,
  rpmKey,
  breakerFailuresKey,
  breakerOpenKey,
  coalesceKey,
  hashCoalesceKey,
  COALESCE_PENDING_MARKER,
  PLATFORM_CB_THRESHOLD,
  PLATFORM_CB_WINDOW_MS,
  PLATFORM_CB_COOLDOWN_MS,
};
