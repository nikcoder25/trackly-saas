/**
 * AI platform API integrations - Next.js port.
 *
 * Hardened against 429s, provider overload, and partial outages:
 *   - Per-key cooldown with exponential growth (avoids hammering throttled keys)
 *   - Per-platform concurrency semaphore + sliding-window RPM limiter
 *   - Wall-clock deep-retry budget (withDeepRetry) - keeps trying transient errors
 *   - In-flight coalescing (dedup identical concurrent queries)
 *   - Deferred background retry queue (warms cache for next run after budget exhaust)
 *   - Gemini fallback chain: pro → flash → flash-lite
 *   - Retry-After header honouring, 529 (Anthropic) treated as rate-limit
 *   - Tagged errors (isRateLimit/isTransient/budgetExhausted) for caller routing
 */
import { pool } from './db';
import {
  acquireSlot as redisAcquireSlot,
  recordRateLimit as redisRecordRateLimit,
  isRateLimited as redisIsRateLimited,
  coalesceCall as redisCoalesceCall,
  distributedLimiterEnabled,
} from './redis-platform-state';
import { PROVIDER_SPECS } from './provider-specs';
import { logger } from './logger';
import { recordAiCall, classifyOutcome, type Outcome } from './metrics';
import {
  acquirePlatformSlotFair,
  type FairnessError,
} from './fairness-scheduler';
import {
  enforceCostCap,
  recordCostEvent,
  recordCall,
  CHATGPT_WEB_SEARCH_CALL_USD,
  estimateCostUsd,
  CostCapExceededError,
} from './cost-tracker';
import {
  buildCacheKey,
  getCached,
  setCached,
  getCacheTtl,
} from './response-cache';

const SYSTEM_PROMPT = 'Recommendation assistant. Name specific businesses/brands with full names. List 5-10 with brief descriptions. Max 200 words.';
const MAX_OUTPUT_TOKENS = 300;

// ── Error typing ────────────────────────────────────────────────
export interface AiError extends Error {
  isRateLimit?: boolean;
  isTransient?: boolean;
  budgetExhausted?: boolean;
  // ChatGPT-specific: server told us to wait longer than our per-call sleep
  // cap. Caller (queryAI ChatGPT branch) should park the query in the
  // in-process deferred retry queue with this delay instead of burning
  // another retry attempt locally.
  needsDeferral?: boolean;
  deferralMs?: number;
}
function tagError(msg: string, flags: Partial<AiError> = {}): AiError {
  const e = new Error(msg) as AiError;
  Object.assign(e, flags);
  return e;
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> => {
  if (!signal) return new Promise(r => setTimeout(r, ms));
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(tagError('Aborted', { isTransient: false }));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(tagError('Aborted', { isTransient: false }));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
};

// ── Shared narrow types for provider calls ──────────────────────
// The fields AI code actually reads off a brand record.  Keeps the
// call signature strict without dragging the full Brand entity in.
export interface BrandContext {
  id?: string;
  name?: string;
  city?: string | null;
  industry?: string | null;
  [key: string]: unknown;
}

// Raw JSON body returned by upstream AI provider APIs. Shape varies per
// provider, so callers still do property lookups, but the top-level
// object-ness is at least preserved instead of a bare `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AiResponseData = Record<string, any>;

// ── Circuit breaker for bad API keys (auth failures) ────────────
const apiKeyFailures = new Map<string, { count: number; lastFailure: number }>();
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_WINDOW_MS = 5 * 60 * 1000;

export function circuitBreakerCheck(apiKey: string): boolean {
  const entry = apiKeyFailures.get(apiKey);
  if (!entry) return false;
  if (Date.now() - entry.lastFailure > CIRCUIT_BREAKER_WINDOW_MS) {
    apiKeyFailures.delete(apiKey);
    return false;
  }
  return entry.count >= CIRCUIT_BREAKER_THRESHOLD;
}

export function recordApiKeyFailure(apiKey: string): void {
  const entry = apiKeyFailures.get(apiKey);
  if (entry && Date.now() - entry.lastFailure <= CIRCUIT_BREAKER_WINDOW_MS) {
    entry.count++;
    entry.lastFailure = Date.now();
  } else {
    apiKeyFailures.set(apiKey, { count: 1, lastFailure: Date.now() });
  }
}

export function resetApiKeyFailures(apiKey: string): void {
  apiKeyFailures.delete(apiKey);
}

// ── Platform-wide rate-limit circuit breaker ────────────────────
// When a provider is account-level rate-limited (quota saturated, not a
// transient per-request throttle), every brand hitting it burns the same
// dead-end sleep budget. Track 429s across ALL callers in this process;
// once the count crosses a threshold inside a short window, OPEN the
// breaker for PLATFORM_CB_COOLDOWN_MS so subsequent callers fail fast
// with a tagged "platform rate-limit circuit open" error and the per-
// platform consecutive-failure counter in the run route short-circuits
// the rest of the run instead of waiting for each query to time out.
const PLATFORM_CB_THRESHOLD =
  Number(process.env.AI_PLATFORM_CB_THRESHOLD) || 12;
const PLATFORM_CB_WINDOW_MS =
  Number(process.env.AI_PLATFORM_CB_WINDOW_MS) || 60000;
const PLATFORM_CB_COOLDOWN_MS =
  Number(process.env.AI_PLATFORM_CB_COOLDOWN_MS) || 60 * 1000;

interface PlatformBreakerState {
  failures: number[];
  openedUntil: number;
}
const _platformBreaker = new Map<string, PlatformBreakerState>();

export function platformBreakerOpen(platform: string): boolean {
  const s = _platformBreaker.get(platform);
  if (!s) return false;
  if (s.openedUntil > Date.now()) return true;
  if (s.openedUntil > 0 && s.openedUntil <= Date.now()) {
    // Breaker tripped and cooled. Reset state so the next bad response
    // starts a fresh window.
    _platformBreaker.delete(platform);
  }
  return false;
}

export function platformBreakerRemainingMs(platform: string): number {
  const s = _platformBreaker.get(platform);
  if (!s || s.openedUntil <= 0) return 0;
  return Math.max(0, s.openedUntil - Date.now());
}

export function recordPlatformRateLimit(platform: string): boolean {
  const now = Date.now();
  const existing = _platformBreaker.get(platform) || { failures: [], openedUntil: 0 };
  existing.failures = existing.failures.filter(t => now - t < PLATFORM_CB_WINDOW_MS);
  existing.failures.push(now);
  let opened = false;
  if (existing.failures.length >= PLATFORM_CB_THRESHOLD && existing.openedUntil <= now) {
    existing.openedUntil = now + PLATFORM_CB_COOLDOWN_MS;
    opened = true;
    logger.warn(`[${platform}] rate-limit circuit OPEN`, {
      platform,
      outcome: 'circuit_open' satisfies Outcome,
      cooldownMs: PLATFORM_CB_COOLDOWN_MS,
      windowMs: PLATFORM_CB_WINDOW_MS,
      failuresInWindow: existing.failures.length,
      errorClass: 'PlatformBreakerOpened',
    });
  }
  _platformBreaker.set(platform, existing);
  return opened;
}

export function resetPlatformBreaker(platform: string): void {
  _platformBreaker.delete(platform);
}

// ── Per-key rate-limit cooldowns ────────────────────────────────
// When a key gets 429'd, park it for a cool-down proportional to consecutive
// 429 count. pickBestKey skips keys that are in cooldown.
interface CooldownEntry { until: number; consecutive: number; }
const _keyCooldown = new Map<string, CooldownEntry>();

export function markKeyRateLimited(apiKey: string, hintMs?: number): number {
  const now = Date.now();
  const prev = _keyCooldown.get(apiKey);
  const consecutive = prev && prev.until > now - 30000 ? prev.consecutive + 1 : 1;
  const scaled = Math.min(15000 * Math.pow(2, consecutive - 1), 240000);
  const cool = Math.max(scaled, Math.min(hintMs || 0, 240000));
  _keyCooldown.set(apiKey, { until: now + cool, consecutive });
  return cool;
}

export function keyCooldownRemaining(apiKey: string): number {
  const entry = _keyCooldown.get(apiKey);
  if (!entry) return 0;
  const remaining = entry.until - Date.now();
  if (remaining <= 0) { _keyCooldown.delete(apiKey); return 0; }
  return remaining;
}

export function clearKeyCooldown(apiKey: string): void {
  _keyCooldown.delete(apiKey);
}

// ── Global per-platform rate limiter ────────────────────────────
// Concurrency semaphore + sliding-window RPM. Enforced across all brands /
// queries in this worker process. Values leave headroom under published
// provider limits so retries and multi-brand bursts don't trip 429s.
export interface PlatformLimit { maxConcurrent: number; rpm: number; windowMs: number; }
// ChatGPT default lowered from 4 → 2 because the default model
// `gpt-4o-mini-search-preview` runs on OpenAI's Search-Preview rate-limit
// pool, which is far more restrictive than the standard chat model pool.
// 2 concurrent + 1500ms per-key minDelay keeps us inside that pool at
// steady state. `AI_CHATGPT_MAX_CONCURRENT` takes precedence over the
// legacy `AI_LIMITS_CHATGPT_CONCURRENCY` name; both are read for back-
// compat with existing production env.
export const PLATFORM_LIMITS: Record<string, PlatformLimit> = {
  ChatGPT:    { maxConcurrent: Number(process.env.AI_CHATGPT_MAX_CONCURRENT) || Number(process.env.AI_LIMITS_CHATGPT_CONCURRENCY) || 1, rpm: Number(process.env.AI_LIMITS_CHATGPT_RPM) || 60, windowMs: 60000 },
  Claude:     { maxConcurrent: Number(process.env.AI_LIMITS_CLAUDE_CONCURRENCY)     || 3, rpm: Number(process.env.AI_LIMITS_CLAUDE_RPM)     || 80,  windowMs: 60000 },
  Gemini:     { maxConcurrent: Number(process.env.AI_LIMITS_GEMINI_CONCURRENCY)     || 6, rpm: Number(process.env.AI_LIMITS_GEMINI_RPM)     || 400, windowMs: 60000 },
  Grok:       { maxConcurrent: Number(process.env.AI_LIMITS_GROK_CONCURRENCY)       || 3, rpm: Number(process.env.AI_LIMITS_GROK_RPM)       || 100, windowMs: 60000 },
  Perplexity: { maxConcurrent: Number(process.env.AI_LIMITS_PERPLEXITY_CONCURRENCY) || 3, rpm: Number(process.env.AI_LIMITS_PERPLEXITY_RPM) || 80,  windowMs: 60000 },
};

// RPM sliding window stays per-platform global (independent of which
// tenant is calling). The concurrency cap + waiter queue, however, are
// now owned by the fairness scheduler so one big tenant can't starve
// the rest. See `fairness-scheduler.ts`.
interface RpmState { timestamps: number[]; }
const _rpmState: Record<string, RpmState> = {};
function _getRpmState(platform: string): RpmState {
  let s = _rpmState[platform];
  if (!s) { s = { timestamps: [] }; _rpmState[platform] = s; }
  return s;
}

// Optional per-call fairness inputs. Callers that don't supply
// `tenantId` get bucketed into a default tenant - which preserves
// the pre-fairness FIFO behaviour for code paths that haven't been
// updated yet (admin-triggered ad-hoc tasks, tests).
export interface AcquirePlatformSlotOptions {
  tenantId?: string;
  weight?: number;
  maxQueueDepth?: number;
}

// Acquire a slot respecting both concurrency and sliding-window RPM.
// The concurrency slot is claimed BEFORE the RPM sleep so parallel callers
// cannot bypass the concurrency cap while waiting on the RPM window.
//
// The optional `signal` makes the waiter queue abort-aware. Without it,
// a stuck slot deadlocks every subsequent acquire indefinitely (the
// caller's outer task budget cannot reach inside the waiter promise).
// Pass the per-task AbortSignal so a 180s task budget firing actually
// frees the queue, not just the in-flight fetch.
//
// Fairness (issue #410): if `opts.tenantId` is supplied, the scheduler
// keeps a separate waiter queue per tenant and dequeues across tenants
// in weighted round-robin order, so one big tenant submitting 30 tasks
// can't starve a small tenant submitting 1.
export async function acquirePlatformSlot(
  platform: string,
  signal?: AbortSignal,
  opts?: AcquirePlatformSlotOptions,
): Promise<() => void> {
  const limits = PLATFORM_LIMITS[platform];
  if (!limits) return () => {};

  // Per-tenant fairness scheduler (issue #410). Enforces the per-pod
  // concurrency cap AND the round-robin order across tenants so one
  // big tenant submitting N tasks can't starve a small tenant. Throws
  // a tagged FairnessError when (a) the per-tenant queue depth cap is
  // exceeded (caller should map to HTTP 429), or (b) the supplied
  // AbortSignal fires while we're queued.
  let release: () => void;
  try {
    release = await acquirePlatformSlotFair({
      platform,
      tenantId: opts?.tenantId,
      weight: opts?.weight,
      maxQueueDepth: opts?.maxQueueDepth,
      maxConcurrent: limits.maxConcurrent,
      signal,
    });
  } catch (e) {
    const fe = e as FairnessError;
    // Re-tag as an AiError so existing isTransientError /
    // processError logic in the run route doesn't have to know about
    // FairnessError. Queue overflow is rate-limit-shaped from the
    // caller's perspective.
    if (fe.isQueueOverflow) {
      throw tagError(fe.message, {
        isRateLimit: true,
        isTransient: false,
        budgetExhausted: true,
      });
    }
    if (signal?.aborted) {
      throw tagError(
        _abortReasonMessage(signal, fe.message),
        { isTransient: false },
      );
    }
    throw tagError(fe.message, { isTransient: false });
  }

  // Distributed cluster-wide gate (issue #407). When AI_DISTRIBUTED_LIMITER
  // is on and Redis is reachable, this is a strict outer bound on top of
  // the per-pod fairness cap above: every pod's fairness scheduler hands
  // out up to `maxConcurrent` slots locally, but the Redis Lua primitive
  // limits cluster-wide concurrency + RPM to the same number. Cluster-wide
  // 429s observed by sibling pods are also surfaced here via the breaker
  // check in queryAI. Aborts and `AI_REDIS_REQUIRED=true` propagate;
  // transient Redis errors degrade to fairness-only (we already hold the
  // local fair slot, so the caller proceeds; we just lose cross-pod
  // coordination, which is the pre-#407 baseline).
  if (distributedLimiterEnabled()) {
    try {
      const acquired = await redisAcquireSlot(platform, signal, {
        maxConcurrent: limits.maxConcurrent,
        rpm: limits.rpm,
        windowMs: limits.windowMs,
      });
      let released = false;
      const fairnessRelease = release;
      return () => {
        if (released) return;
        released = true;
        void acquired.release();
        fairnessRelease();
      };
    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError') {
        release();
        throw err;
      }
      if (process.env.AI_REDIS_REQUIRED === 'true') {
        release();
        throw err;
      }
      // Otherwise fall through to the in-process RPM window below.
    }
  }

  // In-process sliding-window RPM. Used both when the distributed
  // limiter is disabled AND as the degraded path when Redis is
  // unreachable but not required.
  const rpm = _getRpmState(platform);
  try {
    for (;;) {
      if (signal?.aborted) {
        release();
        throw tagError(
          _abortReasonMessage(signal, `acquirePlatformSlot aborted for ${platform}`),
          { isTransient: false },
        );
      }
      const now = Date.now();
      rpm.timestamps = rpm.timestamps.filter(t => now - t < limits.windowMs);
      if (rpm.timestamps.length < limits.rpm) break;
      const oldest = rpm.timestamps[0];
      const waitMs = Math.max(50, limits.windowMs - (now - oldest) + 25);
      await sleep(waitMs, signal);
    }
    rpm.timestamps.push(Date.now());
  } catch (e) {
    release();
    throw e;
  }
  return release;
}

// ── Key selection ───────────────────────────────────────────────
// Skip circuit-broken keys, prefer keys NOT in cooldown, then pick the
// one with the earliest cooldown expiry. Falls back to any non-null key
// so the call still goes through after a brief extra wait.
export function pickBestKey(keysArray: string[]): string | null {
  if (!keysArray || !keysArray.length) return null;
  const healthy: string[] = [];
  const cooling: Array<{ k: string; rem: number }> = [];
  for (const k of keysArray) {
    if (circuitBreakerCheck(k)) continue;
    const rem = keyCooldownRemaining(k);
    if (rem === 0) healthy.push(k);
    else cooling.push({ k, rem });
  }
  if (healthy.length) return healthy[Math.floor(Math.random() * healthy.length)];
  if (cooling.length) {
    cooling.sort((a, b) => a.rem - b.rem);
    return cooling[0].k;
  }
  return keysArray[Math.floor(Math.random() * keysArray.length)];
}

// ── Transient error detection ───────────────────────────────────
export function isTransientError(e: unknown): boolean {
  if (!e) return false;
  const err = e as AiError;
  if (err.isRateLimit || err.isTransient) return true;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('rate limit')
      || msg.includes('429')
      || msg.includes('too many requests')
      || msg.includes('overloaded')
      || msg.includes('high demand')
      || msg.includes('try again later')
      || msg.includes('resource exhausted')
      || msg.includes('unavailable')
      || msg.includes('timeout')
      || msg.includes('econnreset')
      || msg.includes('socket hang up');
}

// ── Deep-retry wall-clock budget ────────────────────────────────
// Wraps a provider call with "never-give-up" semantics for transient errors,
// backing off up to 60s between attempts until the wall-clock budget expires.
const DEEP_RETRY_BUDGET_MS = Number(process.env.AI_DEEP_RETRY_BUDGET_MS) || 75000;
// When a provider returns a rate-limit error (429/529/quota), the remote
// side is telling us to back off. In-process retries against a saturated
// account-level quota waste the per-task budget on pointless sleeps. Cap
// rate-limit deep retries to a small constant - after that, surface the
// error so the caller's per-platform consecutive-failure counter can
// short-circuit the platform for the rest of the run.
const DEEP_RETRY_RATELIMIT_MAX =
  Number(process.env.AI_DEEP_RETRY_RATELIMIT_MAX ?? 1);

export interface DeepRetryOptions {
  budgetMs?: number;
  signal?: AbortSignal;
}

export async function withDeepRetry<T>(
  platform: string,
  fn: () => Promise<T>,
  budgetMsOrOptions?: number | DeepRetryOptions,
): Promise<T> {
  const opts: DeepRetryOptions = typeof budgetMsOrOptions === 'number'
    ? { budgetMs: budgetMsOrOptions }
    : (budgetMsOrOptions || {});
  const budget = opts.budgetMs || DEEP_RETRY_BUDGET_MS;
  const signal = opts.signal;
  const start = Date.now();
  let attempt = 0;
  let rateLimitAttempts = 0;
  let lastErr: AiError | undefined;
  for (;;) {
    if (signal?.aborted) {
      throw lastErr || tagError('Aborted by caller', { isTransient: false });
    }
    try {
      return await fn();
    } catch (e) {
      lastErr = e as AiError;
      if (!isTransientError(e)) throw e;
      // If the underlying error has already been declared
      // budget-exhausted (e.g. fairness queue-overflow throws this
      // upfront because retrying instantly would just refill the
      // queue), fail fast - retrying would burn ~10s of sleep before
      // arriving at the same conclusion.
      if (lastErr.budgetExhausted) throw lastErr;
      if (signal?.aborted) throw lastErr;
      // Rate-limit-specific backoff cap. Account-level quota exhaustion on
      // Gemini was the root cause of the "Last Run frozen" incident: the
      // old unbounded deep-retry eat the entire per-task budget on 11s/17s
      // sleeps that never cleared the quota. One retry is enough to ride
      // out a legitimately-transient spike; repeated 429s mean saturation.
      if (lastErr.isRateLimit) {
        rateLimitAttempts++;
        if (rateLimitAttempts > DEEP_RETRY_RATELIMIT_MAX) {
          lastErr.budgetExhausted = true;
          throw lastErr;
        }
      }
      const elapsed = Date.now() - start;
      const remaining = budget - elapsed;
      if (remaining <= 1500) {
        if (lastErr) lastErr.budgetExhausted = true;
        throw lastErr;
      }
      const base = Math.min(60000, 10000 * Math.pow(1.5, attempt));
      const jitter = Math.floor(Math.random() * 3000);
      const delay = Math.min(base + jitter, Math.max(1000, remaining - 500));
      logger.warn(`[${platform}] transient deep-retry`, {
        platform,
        attempt: attempt + 1,
        elapsedMs: elapsed,
        budgetMs: budget,
        sleepMs: delay,
        errorClass: lastErr.name || 'AiError',
        errorMessage: (lastErr.message || '').slice(0, 240),
        isRateLimit: !!lastErr.isRateLimit,
      });
      // Pass the caller signal so an outer abort (per-task timeout in the
      // run route) interrupts the sleep - otherwise a 10-17s sleep would
      // outlive the 60s per-platform deadline and burn budget for nothing.
      await sleep(delay, signal);
      attempt++;
    }
  }
}

// ── Shared response cache wrapper ───────────────────────────────
// Wraps any provider-call function (typically a withDeepRetry-wrapped
// singleAttempt or a raw queryAI call) with a Postgres-backed read-through
// cache. On hit, the provider is never invoked. On miss, the inner function
// runs and the successful result is persisted; errors are NEVER cached and
// cache-layer failures NEVER break the caller (they log and fall through).
//
// The wrapper is intentionally agnostic to whether `fn` itself retries —
// that's the caller's responsibility (the run route wraps singleAttempt in
// withDeepRetry; the BullMQ worker calls queryAI directly without retry).
export interface CacheAndRetryParams {
  prompt: string;
  platform: string;
  model: string;
  searchEnabled: boolean;
  /** When true, skip the read but still write the resulting response. */
  fresh?: boolean;
  /**
   * Brand context — recorded on the row for ops/debug only. Cross-tenant
   * dedup is keyed on the SHA-256 cache_key alone, so once a row exists
   * it serves every tenant whose prompt normalizes to the same value
   * regardless of the brandId/city stamped on it.
   */
  brandId?: string | null;
  city?: string | null;
}

export interface CacheAndRetryResult<T> {
  data: T;
  fromCache: boolean;
  /** Provider-reported model on miss; cached row's model on hit. */
  model: string;
}

export async function withCacheAndRetry<T extends { model?: string }>(
  params: CacheAndRetryParams,
  fn: () => Promise<T>,
): Promise<CacheAndRetryResult<T>> {
  const cacheKey = buildCacheKey({
    prompt: params.prompt,
    platform: params.platform,
    model: params.model,
    searchEnabled: params.searchEnabled,
    city: params.city ?? null,
  });
  if (!params.fresh) {
    const hit = await getCached<T>(cacheKey);
    if (hit) {
      return { data: hit.response, fromCache: true, model: hit.model };
    }
  }
  // Cache miss (or ?fresh=1): call the provider. Errors propagate
  // unchanged so withDeepRetry / processError stay in charge of the
  // failure taxonomy. We deliberately wait for fn() to fully resolve
  // before writing — for streaming callers, the caller is expected to
  // assemble the full response inside `fn` first.
  const data = await fn();
  // Best-effort write: failures here must not break the caller.
  await setCached(cacheKey, data, {
    query: params.prompt,
    platform: params.platform,
    model: data.model || params.model,
    ttlSeconds: getCacheTtl(params.searchEnabled),
    brandId: params.brandId ?? null,
    city: params.city ?? null,
    isSearch: params.searchEnabled,
  });
  return { data, fromCache: false, model: data.model || params.model };
}

// Re-export the in-process counter so /admin-backend/system can surface
// it without importing response-cache directly through ai-platforms'
// public surface.
export { __cacheStats } from './response-cache';

// ── In-flight request coalescing ────────────────────────────────
// Two callers asking for the same (platform, model, query, city) at once
// get coalesced into one outbound call. Halves load during cron batches
// where multiple brands share a city/query.
const _inFlightCalls = new Map<string, Promise<QueryResult>>();
function coalesce(
  key: string,
  fn: () => Promise<QueryResult>,
  platform?: string,
  signal?: AbortSignal,
): Promise<QueryResult> {
  // Same-pod dedup first: an identical in-flight call in this process
  // always coalesces into the same Promise, so callers in the same pod
  // never need a Redis round-trip. The Redis layer only kicks in when
  // there is no in-process winner to ride along with.
  const existing = _inFlightCalls.get(key);
  if (existing) return existing;
  const wrapped = distributedLimiterEnabled() && platform
    ? () => redisCoalesceCall(platform, key, fn, { signal })
    : fn;
  const promise = Promise.resolve().then(wrapped).finally(() => { _inFlightCalls.delete(key); });
  _inFlightCalls.set(key, promise);
  return promise;
}

// ── Per-platform, per-key minimum spacing ───────────────────────
// Upper bound on per-key request rate - complements the global semaphore.
interface RateLimit { minDelayMs: number; }
// ChatGPT default raised from 500ms → 1500ms to pace against Search-Preview
// pool (see PLATFORM_LIMITS comment). Tune via AI_CHATGPT_MIN_DELAY_MS.
const PLATFORM_RATE_LIMITS: Record<string, RateLimit> = {
  ChatGPT:    { minDelayMs: Number(process.env.AI_CHATGPT_MIN_DELAY_MS) || 6000 },
  Claude:     { minDelayMs: 300 },
  Gemini:     { minDelayMs: 300 },
  Grok:       { minDelayMs: 250 },
  Perplexity: { minDelayMs: 300 },
};
const lastRequestTimePerKey = new Map<string, number>();
const rateLimitQueues = new Map<string, Promise<void>>();
function rateLimitTrackKey(platform: string, apiKey: string): string {
  return `${platform}:${apiKey.slice(-8)}`;
}
async function rateLimitWait(platform: string, apiKey: string): Promise<void> {
  const limits = PLATFORM_RATE_LIMITS[platform];
  if (!limits) return;
  const trackKey = rateLimitTrackKey(platform, apiKey);
  const prev = rateLimitQueues.get(trackKey) ?? Promise.resolve();
  const gate = prev.then(async () => {
    const now = Date.now();
    const last = lastRequestTimePerKey.get(trackKey) || 0;
    const elapsed = now - last;
    if (elapsed < limits.minDelayMs) await sleep(limits.minDelayMs - elapsed);
    lastRequestTimePerKey.set(trackKey, Date.now());
  });
  rateLimitQueues.set(trackKey, gate.catch(() => {}));
  return gate;
}

// ── Per-key map memory sweep ────────────────────────────────────
// `apiKeyFailures`, `_keyCooldown`, `lastRequestTimePerKey` and
// `rateLimitQueues` are keyed by (a hash of) apiKey strings. Server
// keys are bounded but per-tenant user-supplied keys come and go as
// brands are created / deleted / re-keyed, so without periodic
// eviction these maps grow unbounded across the lifetime of a long-
// running pod. Sweep every KEY_MAP_SWEEP_INTERVAL_MS and drop entries
// that have not been touched in KEY_MAP_TTL_MS. Skipped under tests
// so vitest does not spawn a background timer.
const KEY_MAP_SWEEP_INTERVAL_MS = Number(process.env.AI_KEY_MAP_SWEEP_INTERVAL_MS) || 5 * 60 * 1000;
const KEY_MAP_TTL_MS = Number(process.env.AI_KEY_MAP_TTL_MS) || 60 * 60 * 1000;
function _sweepKeyMaps(): void {
  const now = Date.now();
  for (const [k, v] of apiKeyFailures) {
    if (now - v.lastFailure > KEY_MAP_TTL_MS) apiKeyFailures.delete(k);
  }
  for (const [k, v] of _keyCooldown) {
    if (v.until + KEY_MAP_TTL_MS < now) _keyCooldown.delete(k);
  }
  for (const [k, v] of lastRequestTimePerKey) {
    if (now - v > KEY_MAP_TTL_MS) {
      lastRequestTimePerKey.delete(k);
      rateLimitQueues.delete(k);
    }
  }
}
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const sweepTimer = setInterval(_sweepKeyMaps, KEY_MAP_SWEEP_INTERVAL_MS);
  // unref so the sweep timer never holds the process open during
  // shutdown / cron termination.
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
}

// ── Model catalog & pricing ─────────────────────────────────────
const API_ENDPOINTS = {
  openai: { chat: 'https://api.openai.com/v1/chat/completions' },
  perplexity: { chat: 'https://api.perplexity.ai/chat/completions' },
  gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/models/' },
  grok: { chat: 'https://api.x.ai/v1/chat/completions' },
  claude: { messages: 'https://api.anthropic.com/v1/messages' },
};

// Boot-time TLS/DNS warm-up probe per provider. Fires once on module
// load for each configured API key env var. Logs status + latency
// under a per-platform `[<platform>.boot]` prefix. Lets the operator
// distinguish DO -> provider routing/peering issues from
// account-level / quota issues, which are otherwise indistinguishable
// from a network hang inside fetchAI. Skipped during tests and when
// no key for that provider is configured.
//
// Originally OpenAI-only (PR #404); generalised after the Apr 26 Grok
// investigation, where ZERO log lines made it impossible to tell
// whether the silence was a key wiring problem (no GROK_API_KEY env
// var) or a network problem. Now every enabled provider produces a
// startup signature, so missing keys are visible as missing rows.
//
// The list of provider specs lives in `provider-specs.ts` so the
// per-tenant key validator (#409) can hit the same URL/headers without
// re-deriving them.

function _runProviderBootProbes(): void {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
  const probeTimeoutMs = Number(process.env.AI_BOOT_PROBE_TIMEOUT_MS)
    || Number(process.env.AI_CHATGPT_BOOT_PROBE_TIMEOUT_MS)
    || 5000;
  for (const spec of PROVIDER_SPECS) {
    if (process.env[spec.disableEnv] === 'false') continue;
    const keyEntries = Object.entries(process.env)
      .filter(([k, v]) => spec.envPattern.test(k) && typeof v === 'string' && v.length > 0)
      .map(([k, v]) => ({ envName: k, key: v as string }));
    const logPrefix = `[${spec.logTag}.boot]`;
    if (keyEntries.length === 0) {
      // Visible "no key" signature so an operator searching for a
      // missing platform sees something rather than nothing. This is
      // the exact gap the Grok "Inactive / No Data" symptom exposed.
      logger.warn(logPrefix, {
        event: 'no_key_configured',
        platform: spec.platform,
        envPattern: spec.envPattern.source,
      });
      continue;
    }
    for (const { envName, key } of keyEntries) {
      void (async () => {
        const startedAt = Date.now();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), probeTimeoutMs);
        try {
          const resp = await fetch(spec.buildUrl(key), {
            method: 'GET',
            headers: spec.buildHeaders(key),
            signal: ctrl.signal,
          });
          logger.warn(logPrefix, {
            event: 'probe_ok',
            platform: spec.platform,
            envName,
            keyTail: key.slice(-8),
            status: resp.status,
            latencyMs: Date.now() - startedAt,
          });
        } catch (e) {
          logger.warn(logPrefix, {
            event: 'probe_failed',
            platform: spec.platform,
            envName,
            keyTail: key.slice(-8),
            latencyMs: Date.now() - startedAt,
            aborted: ctrl.signal.aborted,
            errorClass: (e as Error).name || 'Error',
            errorMessage: (e as Error).message,
          });
        } finally {
          clearTimeout(timer);
        }
      })();
    }
  }
}
_runProviderBootProbes();

export const PLATFORM_MODELS: Record<string, Array<{ id: string; label: string; search?: boolean; default?: boolean }>> = {
  ChatGPT: [
    { id: 'gpt-5-search-api', label: 'GPT-5 Search (Latest)', search: true },
    { id: 'gpt-4o-mini-search-preview', label: 'GPT-4o Mini Search', search: true },
    { id: 'gpt-4o', label: 'GPT-4o (No search)', default: true },
  ],
  Claude: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', default: true },
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  ],
  Gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', default: true },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Fallback)' },
  ],
  Grok: [
    { id: 'grok-3-mini', label: 'Grok 3 Mini', default: true },
    { id: 'grok-4', label: 'Grok 4' },
  ],
  Perplexity: [
    { id: 'sonar', label: 'Sonar', default: true },
    { id: 'sonar-pro', label: 'Sonar Pro' },
  ],
};

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5-search-api': { input: 2.50, output: 10.00 },
  'gpt-4o-mini-search-preview': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'gemini-2.5-flash': { input: 0.10, output: 0.40 },
  'gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'gemini-2.5-flash-lite': { input: 0.075, output: 0.30 },
  'grok-3-mini': { input: 0.30, output: 0.50 },
  'grok-4': { input: 3.00, output: 15.00 },
  'sonar': { input: 1.00, output: 1.00 },
  'sonar-pro': { input: 3.00, output: 15.00 },
};

export function getDefaultModel(platform: string): string {
  const models = PLATFORM_MODELS[platform];
  if (!models) return '';
  const def = models.find(m => m.default);
  return def ? def.id : models[0].id;
}

/**
 * Count billable web_search tool invocations from an OpenAI Chat Completions
 * response. Accepts both shapes the API returns today:
 *   - usage.tool_calls as a `{ web_search: N }` map or a flat number
 *   - choices[0].message.tool_calls as an array of `{ type, function }`
 * Returns 0 when neither shape is present (non-search models, older
 * responses). Exported for unit tests.
 */
export function countWebSearchCalls(resp: unknown): number {
  if (!resp || typeof resp !== 'object') return 0;
  const r = resp as {
    usage?: { tool_calls?: unknown };
    choices?: Array<{ message?: { tool_calls?: unknown } }>;
  };
  const u = r.usage?.tool_calls;
  if (typeof u === 'number' && Number.isFinite(u)) {
    return Math.max(0, Math.floor(u));
  }
  if (u && typeof u === 'object') {
    const map = u as Record<string, unknown>;
    const n = Number(map.web_search ?? map['web_search_call'] ?? 0);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  const arr = r.choices?.[0]?.message?.tool_calls;
  if (Array.isArray(arr)) {
    return arr.filter(c => {
      const tc = c as { type?: string; function?: { name?: string } };
      return tc?.type === 'web_search'
        || tc?.type === 'web_search_call'
        || tc?.function?.name === 'web_search';
    }).length;
  }
  return 0;
}

export function estimateCost(model: string, tokensIn: number, tokensOut: number): number | null {
  const pricing = MODEL_PRICING[model] || Object.entries(MODEL_PRICING).find(([k]) => model.startsWith(k))?.[1];
  if (!pricing || (!tokensIn && !tokensOut)) return null;
  return ((tokensIn || 0) * pricing.input + (tokensOut || 0) * pricing.output) / 1_000_000;
}

// ── Retry-After header parsing ──────────────────────────────────
// Parse a single duration header value. Supports:
//   - Integer seconds ("20")
//   - HTTP-date ("Wed, 21 Oct 2026 07:28:00 GMT")
//   - OpenAI compact format ("1s", "500ms", "20m21s", "1.5s") emitted by
//     x-ratelimit-reset-requests / x-ratelimit-reset-tokens
// Returns ms, capped at 120s (anything longer goes to deferral path).
function parseDurationHeader(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Plain integer seconds
  if (/^\d+$/.test(trimmed)) {
    const secs = parseInt(trimmed, 10);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 120000);
  }
  // OpenAI compact: "1s", "500ms", "20m21s", "1.5s", "1h2m3s"
  const re = /(\d+(?:\.\d+)?)\s*(ms|s|m|h)/gi;
  let m: RegExpExecArray | null;
  let total = 0;
  let matched = false;
  while ((m = re.exec(trimmed)) !== null) {
    matched = true;
    const n = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === 'ms') total += n;
    else if (unit === 's') total += n * 1000;
    else if (unit === 'm') total += n * 60000;
    else if (unit === 'h') total += n * 3600000;
  }
  if (matched) return Math.min(total, 120000);
  // HTTP-date
  const when = Date.parse(trimmed);
  if (Number.isFinite(when)) return Math.max(0, Math.min(when - Date.now(), 120000));
  return null;
}

// Take the MAX of all present rate-limit reset signals. OpenAI sends
// `retry-after` AND `x-ratelimit-reset-requests` AND `x-ratelimit-reset-tokens`
// - the longest wait wins, otherwise we hammer the tighter bucket.
function parseRetryAfterHeader(h: Headers): number | null {
  const names = ['retry-after', 'x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens'];
  let best: number | null = null;
  for (const name of names) {
    const raw = h.get(name);
    if (!raw) continue;
    const ms = parseDurationHeader(raw);
    if (ms === null) continue;
    if (best === null || ms > best) best = ms;
  }
  return best;
}
function extractBodyRetryAfter(body: unknown): number | null {
  if (!body) return null;
  const msg = typeof body === 'string' ? body : JSON.stringify(body);
  const match = msg.match(/retry.?after[:\s]*(\d+)/i) || msg.match(/try again in (\d+)/i);
  if (match) return Math.min(parseInt(match[1], 10) * 1000, 120000);
  return null;
}

// ── Upgraded fetchAI ────────────────────────────────────────────
// Uses fetch (Next.js runtime), honours Retry-After, treats 429/529 as rate
// limits, retries 5xx as transient, and tags thrown errors for caller routing.
const AI_REQUEST_TIMEOUT_MS = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '', 10) || 150000;

// ChatGPT-only per-attempt timeout. Diagnostic finding (Apr 26 2026): the
// generic 150s per-attempt timeout was masking a TCP/TLS-level hang to
// api.openai.com - the call would sit on `await fetch` for the full
// 150s, retry once, then the 180s task budget would kill it before we
// ever observed a 429. Lower this to 30s so a hung connection retries
// quickly instead of burning the whole task budget on a single dead
// socket. With the existing ChatGPT retry config (maxRetries=6), a 30s
// per-attempt cap fits 5-6 reconnect attempts inside the 180s task
// budget, vs the 1-2 we were getting at 150s.
const AI_CHATGPT_REQUEST_TIMEOUT_MS = Number(process.env.AI_CHATGPT_REQUEST_TIMEOUT_MS) || 30000;

// Per-platform per-attempt timeouts. Each defaults to AI_REQUEST_TIMEOUT_MS
// so existing deployments behave the same; ops can tune individual
// providers without affecting the others. Naming mirrors the ChatGPT
// var so the operator playbook stays consistent.
const AI_CLAUDE_REQUEST_TIMEOUT_MS = Number(process.env.AI_CLAUDE_REQUEST_TIMEOUT_MS) || AI_REQUEST_TIMEOUT_MS;
const AI_PERPLEXITY_REQUEST_TIMEOUT_MS = Number(process.env.AI_PERPLEXITY_REQUEST_TIMEOUT_MS) || AI_REQUEST_TIMEOUT_MS;
const AI_GROK_REQUEST_TIMEOUT_MS = Number(process.env.AI_GROK_REQUEST_TIMEOUT_MS) || AI_REQUEST_TIMEOUT_MS;
const AI_GEMINI_REQUEST_TIMEOUT_MS = Number(process.env.AI_GEMINI_REQUEST_TIMEOUT_MS) || AI_REQUEST_TIMEOUT_MS;

// Per-call cap on the total time fetchAI will sleep across all retries.
// Without this, a 429 with a generous Retry-After (e.g. Gemini suggesting
// 12s on every retry) could chew through the entire per-task budget on
// sleeps alone, starving the rest of the fanout. 15s default mirrors the
// "two short backoffs" intent of MAX_RETRIES=2.
const MAX_RETRY_SLEEP_MS = Number(process.env.AI_MAX_RETRY_SLEEP_MS) || 90000;

// retryConfig is how the ChatGPT call site overrides retry behaviour WITHOUT
// touching any other platform's fetchAI call. When undefined, every default
// matches the pre-existing behaviour byte-for-byte, so Claude/Gemini/Grok/
// Perplexity keep their old retry semantics.
export interface FetchAiRetryConfig {
  maxRetries?: number;       // Overrides AI_MAX_RETRIES (default 2).
  maxSleepMs?: number;       // Overrides AI_MAX_RETRY_SLEEP_MS (default 15000).
  // When set, 429s are logged with this prefix + structured context, and
  // if the server asks us to wait longer than maxSleepMs on a 429 we throw
  // `{ isRateLimit, needsDeferral, deferralMs }` so the caller can park the
  // query in the in-process deferred queue rather than burn another attempt.
  logPrefix?: string;
  queryId?: string;          // Log correlation only.
  model?: string;            // Log correlation only.
}

// Return the AbortSignal's reason string if the caller set one (Node 17+
// supports `controller.abort(new Error('X timed out after Yms'))`),
// otherwise fall back to the supplied default. Lets fetchAI / acquire
// surface the actual platform + elapsed in error messages instead of
// burying everything as a generic "Aborted by caller".
function _abortReasonMessage(signal: AbortSignal | undefined, fallback: string): string {
  const reason = signal?.reason as unknown;
  if (reason instanceof Error && reason.message) return reason.message;
  if (typeof reason === 'string' && reason.length > 0) return reason;
  return fallback;
}

async function fetchAI(url: string, options: RequestInit, timeoutMs = AI_REQUEST_TIMEOUT_MS, apiKey?: string, platform?: string, retryConfig?: FetchAiRetryConfig): Promise<AiResponseData> {
  const MAX_RETRIES = retryConfig?.maxRetries ?? (Number(process.env.AI_MAX_RETRIES) || 5);
  const CALL_MAX_RETRY_SLEEP_MS = retryConfig?.maxSleepMs ?? MAX_RETRY_SLEEP_MS;
  const logPrefix = retryConfig?.logPrefix;
  const logModel = retryConfig?.model;
  const logQueryId = retryConfig?.queryId;
  // Caller may pass an AbortSignal in options. Combine it with our own
  // per-attempt timeout signal so EITHER expiring cancels the fetch and
  // any sleep we're inside.
  const callerSignal = options.signal as AbortSignal | undefined;
  let lastErr: AiError | undefined;
  let totalSleptMs = 0;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (callerSignal?.aborted) {
      throw lastErr || tagError(
        _abortReasonMessage(callerSignal, 'Aborted by caller before attempt'),
        { isTransient: false },
      );
    }
    // One AbortController covers BOTH fetch() AND the response-body
    // read (resp.json/text). Previously the timer was cleared as soon
    // as headers arrived, so a provider that sent 200 OK then stalled
    // the body would hang resp.json() indefinitely - this produced the
    // received=9 / received=6 deadlock observed in production because
    // every worker ended up stuck reading a body that never came.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onCallerAbort = () => controller.abort();
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    };
    // Network-level diagnostic logs for every platform. These fire on
    // the raw fetch lifecycle (start / headers / abort) and are
    // independent of the rate-limit retry-config logs below, which only
    // trigger on 429/529 responses. When a provider hangs at the
    // TCP/TLS layer no 429 ever arrives, so without these we get bare
    // 'platform timeout' errors with nothing to triage on.
    // Originally ChatGPT-only (PR #404); generalised to every platform
    // after the Apr 26 Grok investigation showed the same blind spot
    // applies to xAI / Anthropic / Perplexity / Gemini.
    const fetchLogPrefix = platform ? `[${platform.toLowerCase()}.fetch]` : '[fetch]';
    const fetchStartedAt = Date.now();
    const keyTail = apiKey ? apiKey.slice(-8) : null;
    if (platform) {
      logger.warn(`${fetchLogPrefix} start`, {
        event: 'start',
        platform,
        queryId: logQueryId,
        model: logModel,
        attempt,
        keyTail,
        ts: fetchStartedAt,
        timeoutMs,
      });
    }
    let resp: Response;
    try {
      resp = await fetch(url, { ...options, signal: controller.signal });
      if (platform) {
        logger.warn(`${fetchLogPrefix} headers`, {
          event: 'headers',
          platform,
          queryId: logQueryId,
          model: logModel,
          attempt,
          status: resp.status,
          latencyMs: Date.now() - fetchStartedAt,
        });
      }
    } catch (e) {
      cleanup();
      if (platform) {
        logger.warn(`${fetchLogPrefix} abort`, {
          event: 'abort',
          platform,
          queryId: logQueryId,
          model: logModel,
          attempt,
          latencyMs: Date.now() - fetchStartedAt,
          callerAborted: callerSignal?.aborted ?? false,
          timerAborted: controller.signal.aborted && !callerSignal?.aborted,
          errorClass: (e as Error).name || 'AbortError',
          errorMessage: (e as Error).message,
        });
      }
      if (callerSignal?.aborted) {
        throw tagError(
          _abortReasonMessage(callerSignal, 'Aborted by caller'),
          { isTransient: false },
        );
      }
      lastErr = tagError((e as Error).message || 'Network error', { isTransient: true });
      if (attempt < MAX_RETRIES) {
        const delay = 1500 * Math.pow(2, attempt) + Math.random() * 500;
        const cappedDelay = Math.min(delay, Math.max(0, CALL_MAX_RETRY_SLEEP_MS - totalSleptMs));
        if (cappedDelay <= 0) throw lastErr;
        totalSleptMs += cappedDelay;
        await sleep(cappedDelay, callerSignal);
        continue;
      }
      throw lastErr;
    }
    // NOTE: timer intentionally NOT cleared here. Body-read awaits
    // below still need the deadline. Cleared in every exit path.

    try {
      if (resp.status === 401 || resp.status === 403) {
        if (apiKey) recordApiKeyFailure(apiKey);
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error?.message || `Auth error ${resp.status}`);
      }

      if (resp.status === 429 || resp.status === 529) {
        const bodyText = await resp.text().catch(() => '');
        let body: unknown = bodyText;
        try { body = JSON.parse(bodyText); } catch { /* keep as text */ }
        // Take the MAX of every reset/retry signal the server emits -
        // OpenAI sends retry-after AND x-ratelimit-reset-requests AND
        // x-ratelimit-reset-tokens; the tightest one should win.
        const headerHint = parseRetryAfterHeader(resp.headers);
        const bodyHint = extractBodyRetryAfter(body);
        const hint = Math.max(headerHint || 0, bodyHint || 0);
        if (apiKey) markKeyRateLimited(apiKey, hint);
        // Feed the platform-wide rate-limit circuit breaker. When the
        // account quota is saturated every key cools at once, so pooling
        // across keys doesn't help - we need to stop banging on the
        // provider for a few minutes across all brands.
        if (platform) {
          recordPlatformRateLimit(platform);
          // Mirror to Redis breaker so sibling pods see the same
          // saturation signal. Fire-and-forget: a missed write degrades
          // to per-pod local-CB behaviour, which is what we had pre-#407.
          if (distributedLimiterEnabled()) {
            void redisRecordRateLimit(platform).catch(() => {});
          }
        }
        // Structured observability for ChatGPT (only emitted when caller
        // passes logPrefix - non-ChatGPT paths stay quiet as before).
        if (logPrefix) {
          logger.warn(logPrefix, {
            event: 'rate_limited',
            platform,
            outcome: 'rate_limited' satisfies Outcome,
            status: resp.status,
            attempt,
            maxRetries: MAX_RETRIES,
            retryAfterMs: hint || null,
            headerHintMs: headerHint,
            bodyHintMs: bodyHint,
            sleptSoFarMs: totalSleptMs,
            sleepCapMs: CALL_MAX_RETRY_SLEEP_MS,
            model: logModel,
            queryId: logQueryId,
          });
        }
        // If the server told us to wait longer than we can sleep on this
        // call, DON'T burn a retry - surface `needsDeferral` so the caller
        // can park the query in the in-process deferred retry queue and
        // let the current run finish. For ChatGPT this keeps the other
        // 68 queries flowing instead of hanging behind a 30s Retry-After.
        const remainingBudget = Math.max(0, CALL_MAX_RETRY_SLEEP_MS - totalSleptMs);
        if (hint > remainingBudget && hint > 0) {
          if (logPrefix) {
            logger.warn(logPrefix, {
              event: 'defer_for_reset',
              platform,
              outcome: 'rate_limited' satisfies Outcome,
              status: resp.status,
              deferralMs: hint,
              remainingBudgetMs: remainingBudget,
              model: logModel,
              queryId: logQueryId,
            });
          }
          throw tagError(
            `Rate limited (${resp.status}) - deferring ${Math.round(hint / 1000)}s for window reset`,
            { isRateLimit: true, needsDeferral: true, deferralMs: hint },
          );
        }
        if (attempt < MAX_RETRIES) {
          // Full-jitter exponential backoff (AWS pattern). When the server
          // gave us a hint, trust it (plus small jitter to decorrelate
          // parallel callers). When no hint, sleep a random value in
          // [0, min(capMs, base)] where base = 2^attempt * 1000ms.
          const base = Math.min(remainingBudget, 1000 * Math.pow(2, attempt + 1));
          const sleepMs = hint > 0
            ? Math.min(hint + Math.floor(Math.random() * 500), remainingBudget)
            : Math.max(500, Math.floor(Math.random() * Math.max(500, base)));
          if (sleepMs <= 0) {
            // No remaining budget but no deferral (hint was 0). Surface
            // retries-exhausted rather than a zero-length sleep loop.
            throw tagError(
              `Rate limited (${resp.status}) - sleep budget exhausted (${CALL_MAX_RETRY_SLEEP_MS}ms cap)`,
              { isRateLimit: true },
            );
          }
          totalSleptMs += sleepMs;
          cleanup();
          await sleep(sleepMs, callerSignal);
          continue;
        }
        if (logPrefix) {
          logger.warn(logPrefix, {
            event: 'final_failure',
            platform,
            outcome: 'rate_limited' satisfies Outcome,
            status: resp.status,
            attempts: attempt + 1,
            model: logModel,
            queryId: logQueryId,
          });
        }
        throw tagError(`Rate limited (${resp.status}) - retries exhausted`, { isRateLimit: true });
      }

      if (resp.status >= 500) {
        lastErr = tagError(`Server error ${resp.status}`, { isTransient: true });
        if (attempt < MAX_RETRIES) {
          const delay = 1500 * Math.pow(2, attempt) + Math.random() * 500;
          const cappedDelay = Math.min(delay, Math.max(0, CALL_MAX_RETRY_SLEEP_MS - totalSleptMs));
          if (cappedDelay <= 0) throw lastErr;
          totalSleptMs += cappedDelay;
          cleanup();
          await sleep(cappedDelay, callerSignal);
          continue;
        }
        throw lastErr;
      }

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error?.message || `API error ${resp.status}`);
      return data;
    } catch (e) {
      // If the per-attempt timer fired while we were reading the body,
      // surface that specifically so callers don't see a bare AbortError.
      if (!callerSignal?.aborted && controller.signal.aborted) {
        throw tagError(
          `fetchAI timeout after ${timeoutMs}ms during response read`,
          { isTransient: true },
        );
      }
      throw e;
    } finally {
      cleanup();
    }
  }
  throw lastErr || new Error('fetchAI: retries exhausted');
}

// ── Deferred retry queue ────────────────────────────────────────
// When a query exhausts its deep-retry budget, enqueue it for a later
// background retry. On success, the response cache (DB layer) is warmed
// so the next cron tick / manual re-run returns instantly.
interface DeferredItem {
  platform: string;
  query: string;
  apiKey: string;
  model?: string;
  brand?: BrandContext;
  options?: QueryOptions;
  attempts: number;
  scheduledAt: number;
}
const _deferredQueue: DeferredItem[] = [];
const DEFERRED_MAX_ATTEMPTS = 4;
const DEFERRED_BASE_DELAY_MS = 5 * 60 * 1000;
const DEFERRED_QUEUE_MAX = 500;

export function enqueueDeferredRetry(item: Omit<DeferredItem, 'scheduledAt' | 'attempts'> & { attempts?: number; delayMs?: number }): boolean {
  if (_deferredQueue.length >= DEFERRED_QUEUE_MAX) return false;
  const attempts = (item.attempts || 0) + 1;
  if (attempts > DEFERRED_MAX_ATTEMPTS) return false;
  // Caller may supply delayMs (e.g. the Retry-After hint from a ChatGPT
  // 429) to park the query just past the window reset. Clamp at 15min so
  // a malicious/garbage header can't park a query for hours.
  const delay = item.delayMs && item.delayMs > 0
    ? Math.min(item.delayMs + 1000, 15 * 60 * 1000)
    : DEFERRED_BASE_DELAY_MS * Math.pow(2, attempts - 1);
  _deferredQueue.push({ ...item, attempts, scheduledAt: Date.now() + delay });
  return true;
}

let _deferredDraining = false;
async function _drainDeferredQueue(): Promise<void> {
  if (_deferredDraining || _deferredQueue.length === 0) return;
  _deferredDraining = true;
  try {
    const now = Date.now();
    const ready: DeferredItem[] = [];
    for (let i = _deferredQueue.length - 1; i >= 0; i--) {
      if (_deferredQueue[i].scheduledAt <= now) ready.push(_deferredQueue.splice(i, 1)[0]);
    }
    for (const item of ready) {
      try {
        await queryAI(item.platform, item.query, item.apiKey, item.model, item.brand, { ...item.options, silent: true });
      } catch (e) {
        const ok = enqueueDeferredRetry(item);
        if (!ok) {
          logger.warn(`[deferred.gave_up] ${item.platform}`, {
            platform: item.platform,
            attempts: item.attempts,
            errorClass: (e as Error).name || 'Error',
            errorMessage: ((e as Error).message || '').slice(0, 240),
          });
        }
      }
    }
  } finally {
    _deferredDraining = false;
  }
}
// Sweep every 60s; cheap no-op when empty.
if (typeof setInterval !== 'undefined') {
  setInterval(() => { _drainDeferredQueue().catch(() => {}); }, 60 * 1000);
}

// ── queryAI ─────────────────────────────────────────────────────
interface QueryResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  citations: string[];
  cached?: boolean;
}
export interface QueryOptions {
  systemPrompt?: string;
  maxTokens?: number;
  jsonMode?: boolean;
  silent?: boolean;
  deepRetryBudgetMs?: number;
  // Caller-supplied AbortSignal. When it fires, the underlying fetch
  // is aborted AND any in-flight retry sleeps inside fetchAI throw
  // immediately, so a per-task deadline genuinely bounds the call.
  signal?: AbortSignal;
  // Correlation ID threaded through to ChatGPT rate-limit logs so a
  // specific 429 can be traced to a specific run+query in DO runtime
  // logs (grep `[chatgpt.ratelimit]`).
  queryId?: string;
  // Tenant identifier (typically the brand owner's user_id). Used as
  // (a) a metric label so per-(tenant, platform, outcome) counters
  // and latency histograms can be aggregated, (b) the fairness
  // scheduler partition key so a noisy tenant can't starve siblings,
  // and (c) the cost-cap / tenant_cost_events ledger key. When set,
  // queryAI runs the pre-flight cap check before dispatching to the
  // provider and writes a ledger row on success. Optional - falls
  // through to 'unknown' on the metrics side when absent and disables
  // cost tracking + fairness partitioning.
  tenantId?: string;
  // Optional brand/run/request identifiers, propagated into structured
  // logs (NOT into the metrics label set, which would explode
  // cardinality) for log correlation. runId is additionally used as
  // the foreign key on tenant_cost_events ledger rows.
  brandId?: string;
  runId?: string;
  requestId?: string;
}

// Gemini fallback chain - pro → flash → flash-lite. Each tier runs on a
// separate Google capacity pool, so dropping tier often clears "high demand".
const GEMINI_FALLBACK_CHAIN: Record<string, string[]> = {
  'gemini-2.5-pro':        ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  'gemini-2.5-flash':      ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  'gemini-2.5-flash-lite': ['gemini-2.5-flash-lite'],
};

interface GeminiPayload {
  systemInstruction: { parts: Array<{ text: string }> };
  contents: Array<{ parts: Array<{ text: string }> }>;
  generationConfig: { maxOutputTokens: number; responseMimeType?: string };
}

async function callGemini(model: string, query: string, apiKey: string, sysPrompt: string, maxTok: number, options?: QueryOptions): Promise<QueryResult> {
  const attemptModels = GEMINI_FALLBACK_CHAIN[model] || [model];
  const signal = options?.signal;
  let lastErr: AiError | undefined;
  for (let m = 0; m < attemptModels.length; m++) {
    if (signal?.aborted) {
      throw lastErr || tagError('Gemini: aborted before fallback', { isTransient: false });
    }
    const geminiModel = attemptModels[m];
    const url = `${API_ENDPOINTS.gemini.base}${geminiModel}:generateContent`;
    const payload: GeminiPayload = {
      systemInstruction: { parts: [{ text: sysPrompt }] },
      contents: [{ parts: [{ text: query }] }],
      generationConfig: { maxOutputTokens: maxTok },
    };
    if (options?.jsonMode) payload.generationConfig.responseMimeType = 'application/json';
    try {
      const d = await fetchAI(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
        signal,
      }, AI_GEMINI_REQUEST_TIMEOUT_MS, apiKey, 'Gemini');
      if (d.promptFeedback?.blockReason) throw new Error(`Gemini blocked: ${d.promptFeedback.blockReason}`);
      const cand = d.candidates?.[0];
      if (!cand) throw tagError('Gemini returned no candidates', { isTransient: true });
      const finish = cand.finishReason;
      if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') throw new Error(`Gemini blocked (${finish})`);
      const parts = cand.content?.parts || [];
      const text = parts.map((p: { text?: string }) => p.text || '').join('\n').trim();
      if (!text) throw tagError('Gemini empty response', { isTransient: true });
      return {
        text, model: geminiModel,
        tokensIn: d.usageMetadata?.promptTokenCount || 0,
        tokensOut: d.usageMetadata?.candidatesTokenCount || 0,
        citations: [],
      };
    } catch (e) {
      lastErr = e as AiError;
      const transient = isTransientError(e);
      if (transient && m < attemptModels.length - 1) {
        logger.warn('[gemini.fallback]', {
          platform: 'Gemini',
          fromModel: geminiModel,
          toModel: attemptModels[m + 1],
          errorClass: (lastErr as Error).name || 'AiError',
          errorMessage: ((lastErr as Error).message || '').slice(0, 240),
        });
        continue;
      }
      throw e;
    }
  }
  throw lastErr || tagError('Gemini: all fallbacks exhausted', { isTransient: true });
}

// ── ChatGPT smart model routing (ON by default) ──
// OpenAI's Search-Preview models (`*-search-preview`, `*-search-api`) run
// on a far tighter quota pool than standard gpt-4o/gpt-4o-mini. Not every
// brand-tracking query actually needs web search - definitional queries
// ("what is X", "explain Y") can be answered from the model's training
// data. By default we route non-search-intent queries to `gpt-4o`
// (no-search) to spare the preview quota for queries that genuinely
// need fresh web data. Set CHATGPT_SMART_MODEL_ROUTING=false to disable.
//
// Conservative heuristic: only drop to non-search when (a) the
// admin-selected model is a search-preview model, (b) the query has a
// clear definitional/explanatory intent, AND (c) it has NO freshness/
// location/comparison qualifiers. Mis-routing a query costs us answer
// quality; under-routing costs us quota - so we err on the side of
// keeping search when in doubt.
const NON_SEARCH_INTENT_RE = /^\s*(what\s+is|what\s+are|how\s+does|how\s+do|how\s+to|explain|define|describe|tell\s+me\s+about)\b/i;
const FRESHNESS_OR_LOCAL_RE = /\b(best|top|recommend(?:ed|ation)?s?|review(?:ed|s)?|pricing|compare|vs\.?|versus|near\s+me|in\s+\w+|latest|today|this\s+year|20\d{2})\b/i;

// Shared heuristic: a query is "non-search-intent" when it reads as
// definitional/explanatory AND lacks any freshness/local/comparison
// qualifier that would benefit from live web data. Used by both the
// model-routing fallback and the per-query web_search_options gate.
function isNonSearchIntentQuery(query: string): boolean {
  const q = (query || '').trim();
  if (!q) return false;
  if (!NON_SEARCH_INTENT_RE.test(q)) return false;
  if (FRESHNESS_OR_LOCAL_RE.test(q)) return false;
  return true;
}

export function resolveChatGPTModel(query: string, adminModel: string): string {
  if (process.env.CHATGPT_SMART_MODEL_ROUTING === 'false') return adminModel;
  // Only route AWAY from search-preview models. If admin already picked a
  // non-search model, leave it alone.
  if (!adminModel.includes('search')) return adminModel;
  if (!isNonSearchIntentQuery(query)) return adminModel;
  // Safe to route to standard model.
  const fallback = 'gpt-4o';
  logger.warn('[chatgpt.ratelimit]', {
    event: 'smart_route',
    platform: 'ChatGPT',
    fromModel: adminModel,
    toModel: fallback,
    query: (query || '').trim().slice(0, 120),
  });
  return fallback;
}

// Per-query gate for ChatGPT's `web_search_options`. Defense in depth on
// top of `resolveChatGPTModel`: when a search-preview model is still in
// play (admin override, smart routing disabled, or smart routing didn't
// fire), suppressing `web_search_options` for clearly definitional
// queries lets the model answer from training data and spares the
// Search-Preview pool. Default ON; set CHATGPT_WEB_SEARCH_GATING=false
// to attach `web_search_options` on every search-model call.
export function shouldAttachChatGPTWebSearch(query: string): boolean {
  if (process.env.CHATGPT_WEB_SEARCH_GATING === 'false') return true;
  return !isNonSearchIntentQuery(query);
}

export async function queryAI(
  platform: string,
  query: string,
  apiKey: string,
  model?: string,
  brand?: BrandContext,
  options?: QueryOptions,
): Promise<QueryResult> {
  // Fast-fail when the platform-wide rate-limit breaker is open so every
  // remaining task in the cron tick short-circuits instead of queueing
  // behind the platform semaphore and burning the per-task budget on
  // sleeps. Tagged isRateLimit so the run route's processError routes it
  // through the normal "skip after N failures" path.
  if (platformBreakerOpen(platform)) {
    const remaining = Math.round(platformBreakerRemainingMs(platform) / 1000);
    throw tagError(
      `${platform}: platform rate-limit circuit open (cooling ${remaining}s)`,
      { isRateLimit: true, budgetExhausted: true },
    );
  }
  // Per-tenant cost cap (issue #411). The caller has already acquired
  // the fairness slot in `acquirePlatformSlot`; running the cap check
  // here - BEFORE the distributed Redis breaker query and the actual
  // provider fetch - means a capped tenant throws CostCapExceededError
  // immediately and the caller's finally{} releases the fairness slot
  // straight away, so capped traffic can't park slots that healthy
  // tenants need. CostCapExceededError carries paymentRequired=true;
  // route handlers (and the run worker) translate that into HTTP 402.
  if (options?.tenantId) {
    await enforceCostCap(options.tenantId);
  }
  // Distributed breaker check: a sibling pod that absorbed the 8th 429
  // already opened the breaker in Redis. Honour it here so this pod
  // short-circuits the same way without first having to hit its own
  // local 429 quota. Best-effort: a Redis hiccup falls through to the
  // local check above (which has already passed).
  if (distributedLimiterEnabled()) {
    try {
      if (await redisIsRateLimited(platform)) {
        throw tagError(
          `${platform}: platform rate-limit circuit open (distributed)`,
          { isRateLimit: true, budgetExhausted: true },
        );
      }
    } catch (err) {
      const e = err as AiError;
      if (e.isRateLimit) throw err;
      if (process.env.AI_REDIS_REQUIRED === 'true') throw err;
      // else fall through
    }
  }
  const useModel = model || getDefaultModel(platform);
  const sysPrompt = options?.systemPrompt ?? SYSTEM_PROMPT;
  const maxTok = options?.maxTokens ?? MAX_OUTPUT_TOKENS;
  const brandCity = brand?.city || '';
  const coalesceKey = `${platform}::${useModel}::${query.trim().toLowerCase()}::${brandCity}`;

  return coalesce(coalesceKey, async () => {
    const startMs = Date.now();
    // NOTE: queryAI does NOT acquire a platform slot. Slot lifetime is
    // owned by the caller (run/route.ts singleAttempt + run-worker.ts
    // runWorker), which acquires BEFORE entering queryAI and releases
    // in finally. A duplicate acquire here was the root cause of the
    // Apr 26 ChatGPT 100% timeout incident at maxConcurrent=1
    // (see PR #405). Keeping slot acquisition single-sited and
    // caller-owned makes the deadlock class structurally impossible.
    // Plumb the caller-supplied signal into every provider fetch so a
    // per-task AbortController in the runner actually cancels the
    // in-flight request (and any retry sleeps inside fetchAI).
    const signal = options?.signal;
    try {
      await rateLimitWait(platform, apiKey);
      let result: QueryResult;
      // Per-call extras parsed alongside `result`. Only ChatGPT populates
      // these today (web_search tool calls are an OpenAI-specific concept);
      // other platforms leave them at 0/null and recordCall falls back to
      // estimateCostUsd. Set here so the success-path `recordCall` below
      // can read them without a platform-specific branch.
      let webSearchCalls = 0;
      let chatgptCostUsd: number | null = null;

      if (platform === 'ChatGPT') {
        const isSearch = useModel.includes('search');
        interface OpenAiPayload {
          model: string;
          max_tokens: number;
          messages: Array<{ role: string; content: string }>;
          web_search_options?: {
            user_location?: {
              type: 'approximate';
              approximate: { city: string; country: string };
            };
          };
        }
        const payload: OpenAiPayload = {
          model: useModel, max_tokens: maxTok,
          messages: isSearch ? [{ role: 'user', content: query }] : [{ role: 'system', content: sysPrompt }, { role: 'user', content: query }],
        };
        if (isSearch && shouldAttachChatGPTWebSearch(query)) {
          payload.web_search_options = {};
          if (brand?.city) payload.web_search_options.user_location = { type: 'approximate', approximate: { city: brand.city, country: 'US' } };
        } else if (isSearch) {
          logger.warn('[chatgpt.ratelimit]', {
            event: 'web_search_gated',
            platform: 'ChatGPT',
            model: useModel,
            query: query.trim().slice(0, 120),
          });
        }
        // ChatGPT-specific retry config. Search-Preview model pool is
        // tight, so we allow more attempts (default 6 vs. 2) and a larger
        // per-call sleep budget (default 60s vs. 15s) to honour OpenAI's
        // Retry-After hints. `logPrefix: '[chatgpt.ratelimit]'` emits
        // structured logs on every 429 so DO runtime logs can confirm
        // the fix without a deploy.
        const d = await fetchAI(API_ENDPOINTS.openai.chat, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(payload),
          signal,
        }, AI_CHATGPT_REQUEST_TIMEOUT_MS, apiKey, 'ChatGPT', {
          maxRetries: Number(process.env.AI_CHATGPT_MAX_RETRIES) || 6,
          maxSleepMs: Number(process.env.AI_CHATGPT_MAX_RETRY_SLEEP_MS) || 60000,
          logPrefix: '[chatgpt.ratelimit]',
          queryId: options?.queryId,
          model: useModel,
        });
        const citations = (d.choices?.[0]?.message?.annotations || [])
          .filter((a: { type: string; url?: string }) => a.type === 'url_citation' && a.url)
          .map((a: { url: string }) => a.url);
        result = {
          text: d.choices?.[0]?.message?.content || '',
          model: d.model || useModel,
          tokensIn: d.usage?.prompt_tokens || 0,
          tokensOut: d.usage?.completion_tokens || 0,
          citations: [...new Set(citations)].slice(0, 10) as string[],
        };
        // Count billable web_search tool invocations. OpenAI exposes them
        // in two shapes depending on the surface:
        //   1. d.usage.tool_calls (current Search-Preview chat-completion
        //      shape: object keyed by tool name -> count, OR a number).
        //   2. d.choices[0].message.tool_calls (generic Chat Completions
        //      shape: array of { type, function?: { name } }).
        // We accept whichever the SDK gave us and never double count.
        webSearchCalls = countWebSearchCalls(d);
        const tIn = d.usage?.prompt_tokens || 0;
        const tOut = d.usage?.completion_tokens || 0;
        const tokenCost = estimateCostUsd(result.model, tIn, tOut);
        const searchSurcharge = useModel === 'gpt-4o-mini-search-preview'
          ? webSearchCalls * CHATGPT_WEB_SEARCH_CALL_USD
          : 0;
        chatgptCostUsd = tokenCost + searchSurcharge;
      } else if (platform === 'Claude') {
        const d = await fetchAI(API_ENDPOINTS.claude.messages, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: useModel, max_tokens: maxTok, system: sysPrompt, messages: [{ role: 'user', content: query }] }),
          signal,
        }, AI_CLAUDE_REQUEST_TIMEOUT_MS, apiKey, 'Claude');
        result = {
          text: d.content?.[0]?.text || '',
          model: d.model || useModel,
          tokensIn: d.usage?.input_tokens || 0,
          tokensOut: d.usage?.output_tokens || 0,
          citations: [],
        };
      } else if (platform === 'Gemini') {
        result = await callGemini(useModel, query, apiKey, sysPrompt, maxTok, options);
      } else if (platform === 'Perplexity') {
        const d = await fetchAI(API_ENDPOINTS.perplexity.chat, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: useModel, max_tokens: maxTok, return_citations: true, messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: query }] }),
          signal,
        }, AI_PERPLEXITY_REQUEST_TIMEOUT_MS, apiKey, 'Perplexity');
        result = {
          text: d.choices?.[0]?.message?.content || '',
          model: d.model || useModel,
          tokensIn: d.usage?.prompt_tokens || 0,
          tokensOut: d.usage?.completion_tokens || 0,
          citations: d.citations || [],
        };
      } else if (platform === 'Grok') {
        const d = await fetchAI(API_ENDPOINTS.grok.chat, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: useModel, max_tokens: maxTok, messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: query }] }),
          signal,
        }, AI_GROK_REQUEST_TIMEOUT_MS, apiKey, 'Grok');
        result = {
          text: d.choices?.[0]?.message?.content || '',
          model: d.model || useModel,
          tokensIn: d.usage?.prompt_tokens || 0,
          tokensOut: d.usage?.completion_tokens || 0,
          citations: [],
        };
      } else {
        throw new Error(`Unknown platform: ${platform}`);
      }

      resetApiKeyFailures(apiKey);
      clearKeyCooldown(apiKey);

      const responseTimeMs = Date.now() - startMs;
      const tenantId = options?.tenantId || (brand?.id as string) || 'unknown';
      recordAiCall({ tenant: tenantId, platform, outcome: 'success' }, responseTimeMs);
      logger.info('ai.call.success', {
        platform,
        outcome: 'success' satisfies Outcome,
        latencyMs: responseTimeMs,
        model: result.model,
        tenantId,
        brandId: options?.brandId || (brand?.id as string),
        runId: options?.runId,
        requestId: options?.requestId,
        queryId: options?.queryId,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });
      try {
        await pool.query(
          `INSERT INTO api_logs (platform, query, status, model, response_ms) VALUES ($1, $2, $3, $4, $5)`,
          [platform, query.substring(0, 500), 'ok', result.model, responseTimeMs],
        );
      } catch { /* best-effort logging */ }

      // Persist a tenant cost event for the ledger / next pre-flight
      // check. Best-effort: recordCostEvent swallows DB errors so a
      // hiccup never fails the in-flight call.
      if (options?.tenantId) {
        await recordCostEvent({
          tenantId: options.tenantId,
          runId: options.runId,
          platform,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          usdCost: chatgptCostUsd ?? undefined,
        });
      }

      // Aggregate per-(day, platform, model) totals for the admin
      // dashboard and the daily threshold alarm. Only fires on the
      // success path; the failure branch below does not call this, so
      // retries cannot double-count. recordCall swallows DB errors.
      await recordCall({
        platform,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        webSearchCalls,
        costUsd: chatgptCostUsd ?? undefined,
      });

      return result;
    } catch (e) {
      // Tag every failure into the bounded outcome set so per-(tenant,
      // platform, outcome) aggregation works without callers inventing
      // their own taxonomy. Latency is recorded even on failure - a
      // 60s timeout is meaningful signal.
      const responseTimeMs = Date.now() - startMs;
      const outcome = classifyOutcome(e);
      const tenantId = options?.tenantId || (brand?.id as string) || 'unknown';
      recordAiCall({ tenant: tenantId, platform, outcome }, responseTimeMs);
      const err = e as AiError;
      logger.warn('ai.call.failure', {
        platform,
        outcome,
        latencyMs: responseTimeMs,
        tenantId,
        brandId: options?.brandId || (brand?.id as string),
        runId: options?.runId,
        requestId: options?.requestId,
        queryId: options?.queryId,
        errorClass: err.name || 'AiError',
        errorMessage: (err.message || '').slice(0, 240),
        isRateLimit: !!err.isRateLimit,
        budgetExhausted: !!err.budgetExhausted,
      });
      // Cost-cap rejections are user-actionable, not transient - never
      // park them on the deferred retry queue. The tenant won't pay for
      // the next minute either; replaying just adds noise.
      if (e instanceof CostCapExceededError) throw e;
      if (!options?.silent && (isTransientError(e) || (e as AiError).budgetExhausted)) {
        // When fetchAI surfaces `needsDeferral: true` (ChatGPT only, when
        // Retry-After > per-call sleep cap) we park the query just past
        // the window reset instead of the generic 5-min backoff.
        const aiErr = e as AiError;
        const delayMs = aiErr.needsDeferral && aiErr.deferralMs ? aiErr.deferralMs : undefined;
        enqueueDeferredRetry({ platform, query, apiKey, model: useModel, brand, options, delayMs });
      }
      throw e;
    }
  }, platform, options?.signal);
}
