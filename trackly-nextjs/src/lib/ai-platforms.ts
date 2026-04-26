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
  Number(process.env.AI_PLATFORM_CB_THRESHOLD) || 8;
const PLATFORM_CB_WINDOW_MS =
  Number(process.env.AI_PLATFORM_CB_WINDOW_MS) || 60000;
const PLATFORM_CB_COOLDOWN_MS =
  Number(process.env.AI_PLATFORM_CB_COOLDOWN_MS) || 5 * 60 * 1000;

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
    console.warn(
      `[${platform}] rate-limit circuit OPEN for ${Math.round(PLATFORM_CB_COOLDOWN_MS / 1000)}s ` +
      `after ${existing.failures.length} 429s in ${Math.round(PLATFORM_CB_WINDOW_MS / 1000)}s`,
    );
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
  ChatGPT:    { maxConcurrent: Number(process.env.AI_CHATGPT_MAX_CONCURRENT) || Number(process.env.AI_LIMITS_CHATGPT_CONCURRENCY) || 2, rpm: Number(process.env.AI_LIMITS_CHATGPT_RPM) || 300, windowMs: 60000 },
  Claude:     { maxConcurrent: Number(process.env.AI_LIMITS_CLAUDE_CONCURRENCY)     || 3, rpm: Number(process.env.AI_LIMITS_CLAUDE_RPM)     || 80,  windowMs: 60000 },
  Gemini:     { maxConcurrent: Number(process.env.AI_LIMITS_GEMINI_CONCURRENCY)     || 6, rpm: Number(process.env.AI_LIMITS_GEMINI_RPM)     || 400, windowMs: 60000 },
  Grok:       { maxConcurrent: Number(process.env.AI_LIMITS_GROK_CONCURRENCY)       || 3, rpm: Number(process.env.AI_LIMITS_GROK_RPM)       || 100, windowMs: 60000 },
  Perplexity: { maxConcurrent: Number(process.env.AI_LIMITS_PERPLEXITY_CONCURRENCY) || 3, rpm: Number(process.env.AI_LIMITS_PERPLEXITY_RPM) || 80,  windowMs: 60000 },
};

interface PlatformState { inFlight: number; waiters: Array<() => void>; timestamps: number[]; }
const _platformState: Record<string, PlatformState> = {};

function _getPlatformState(platform: string): PlatformState {
  let s = _platformState[platform];
  if (!s) { s = { inFlight: 0, waiters: [], timestamps: [] }; _platformState[platform] = s; }
  return s;
}

// Acquire a slot respecting both concurrency and sliding-window RPM.
// The concurrency slot is claimed BEFORE the RPM sleep so parallel callers
// cannot bypass the concurrency cap while waiting on the RPM window.
export async function acquirePlatformSlot(platform: string): Promise<() => void> {
  const limits = PLATFORM_LIMITS[platform];
  if (!limits) return () => {};
  const state = _getPlatformState(platform);

  while (state.inFlight >= limits.maxConcurrent) {
    await new Promise<void>(resolve => state.waiters.push(resolve));
  }
  state.inFlight++;

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    state.inFlight--;
    const next = state.waiters.shift();
    if (next) next();
  };

  try {
    for (;;) {
      const now = Date.now();
      state.timestamps = state.timestamps.filter(t => now - t < limits.windowMs);
      if (state.timestamps.length < limits.rpm) break;
      const oldest = state.timestamps[0];
      const waitMs = Math.max(50, limits.windowMs - (now - oldest) + 25);
      await sleep(waitMs);
    }
    state.timestamps.push(Date.now());
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
      console.warn(`[${platform}] transient (deep retry #${attempt + 1}, ${Math.round(elapsed/1000)}s/${Math.round(budget/1000)}s): ${(lastErr.message || '').slice(0, 120)}. Sleeping ${Math.round(delay/1000)}s.`);
      // Pass the caller signal so an outer abort (per-task timeout in the
      // run route) interrupts the sleep - otherwise a 10-17s sleep would
      // outlive the 60s per-platform deadline and burn budget for nothing.
      await sleep(delay, signal);
      attempt++;
    }
  }
}

// ── In-flight request coalescing ────────────────────────────────
// Two callers asking for the same (platform, model, query, city) at once
// get coalesced into one outbound call. Halves load during cron batches
// where multiple brands share a city/query.
const _inFlightCalls = new Map<string, Promise<QueryResult>>();
function coalesce(key: string, fn: () => Promise<QueryResult>): Promise<QueryResult> {
  const existing = _inFlightCalls.get(key);
  if (existing) return existing;
  const promise = Promise.resolve().then(fn).finally(() => { _inFlightCalls.delete(key); });
  _inFlightCalls.set(key, promise);
  return promise;
}

// ── Per-platform, per-key minimum spacing ───────────────────────
// Upper bound on per-key request rate - complements the global semaphore.
interface RateLimit { minDelayMs: number; }
// ChatGPT default raised from 500ms → 1500ms to pace against Search-Preview
// pool (see PLATFORM_LIMITS comment). Tune via AI_CHATGPT_MIN_DELAY_MS.
const PLATFORM_RATE_LIMITS: Record<string, RateLimit> = {
  ChatGPT:    { minDelayMs: Number(process.env.AI_CHATGPT_MIN_DELAY_MS) || 1500 },
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

// ── Model catalog & pricing ─────────────────────────────────────
const API_ENDPOINTS = {
  openai: { chat: 'https://api.openai.com/v1/chat/completions' },
  perplexity: { chat: 'https://api.perplexity.ai/chat/completions' },
  gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/models/' },
  grok: { chat: 'https://api.x.ai/v1/chat/completions' },
  claude: { messages: 'https://api.anthropic.com/v1/messages' },
};

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

// Per-call cap on the total time fetchAI will sleep across all retries.
// Without this, a 429 with a generous Retry-After (e.g. Gemini suggesting
// 12s on every retry) could chew through the entire per-task budget on
// sleeps alone, starving the rest of the fanout. 15s default mirrors the
// "two short backoffs" intent of MAX_RETRIES=2.
const MAX_RETRY_SLEEP_MS = Number(process.env.AI_MAX_RETRY_SLEEP_MS) || 15000;

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

async function fetchAI(url: string, options: RequestInit, timeoutMs = AI_REQUEST_TIMEOUT_MS, apiKey?: string, platform?: string, retryConfig?: FetchAiRetryConfig): Promise<AiResponseData> {
  const MAX_RETRIES = retryConfig?.maxRetries ?? (Number(process.env.AI_MAX_RETRIES) || 2);
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
      throw lastErr || tagError('Aborted by caller before attempt', { isTransient: false });
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
    let resp: Response;
    try {
      resp = await fetch(url, { ...options, signal: controller.signal });
    } catch (e) {
      cleanup();
      if (callerSignal?.aborted) {
        throw tagError('Aborted by caller', { isTransient: false });
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
        if (platform) recordPlatformRateLimit(platform);
        // Structured observability for ChatGPT (only emitted when caller
        // passes logPrefix - non-ChatGPT paths stay quiet as before).
        if (logPrefix) {
          console.warn(logPrefix, {
            event: 'rate_limited',
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
            console.warn(logPrefix, {
              event: 'defer_for_reset',
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
          console.warn(logPrefix, {
            event: 'final_failure',
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
        if (!ok) console.warn(`[Deferred] ${item.platform} gave up after ${item.attempts} attempts: ${((e as Error).message || '').slice(0, 120)}`);
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
      }, AI_REQUEST_TIMEOUT_MS, apiKey, 'Gemini');
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
        console.warn(`[Gemini] ${geminiModel} transient - falling back to ${attemptModels[m + 1]}`);
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

export function resolveChatGPTModel(query: string, adminModel: string): string {
  if (process.env.CHATGPT_SMART_MODEL_ROUTING === 'false') return adminModel;
  // Only route AWAY from search-preview models. If admin already picked a
  // non-search model, leave it alone.
  if (!adminModel.includes('search')) return adminModel;
  const q = (query || '').trim();
  if (!q) return adminModel;
  if (!NON_SEARCH_INTENT_RE.test(q)) return adminModel;
  if (FRESHNESS_OR_LOCAL_RE.test(q)) return adminModel;
  // Safe to route to standard model.
  const fallback = 'gpt-4o';
  console.warn('[chatgpt.ratelimit]', {
    event: 'smart_route',
    from: adminModel,
    to: fallback,
    query: q.slice(0, 120),
  });
  return fallback;
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
  const useModel = model || getDefaultModel(platform);
  const sysPrompt = options?.systemPrompt ?? SYSTEM_PROMPT;
  const maxTok = options?.maxTokens ?? MAX_OUTPUT_TOKENS;
  const brandCity = brand?.city || '';
  const coalesceKey = `${platform}::${useModel}::${query.trim().toLowerCase()}::${brandCity}`;

  return coalesce(coalesceKey, async () => {
    const startMs = Date.now();
    const release = await acquirePlatformSlot(platform);
    // Plumb the caller-supplied signal into every provider fetch so a
    // per-task AbortController in the runner actually cancels the
    // in-flight request (and any retry sleeps inside fetchAI).
    const signal = options?.signal;
    try {
      await rateLimitWait(platform, apiKey);
      let result: QueryResult;

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
        if (isSearch) {
          payload.web_search_options = {};
          if (brand?.city) payload.web_search_options.user_location = { type: 'approximate', approximate: { city: brand.city, country: 'US' } };
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
        }, AI_REQUEST_TIMEOUT_MS, apiKey, 'ChatGPT', {
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
      } else if (platform === 'Claude') {
        const d = await fetchAI(API_ENDPOINTS.claude.messages, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: useModel, max_tokens: maxTok, system: sysPrompt, messages: [{ role: 'user', content: query }] }),
          signal,
        }, AI_REQUEST_TIMEOUT_MS, apiKey, 'Claude');
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
        }, AI_REQUEST_TIMEOUT_MS, apiKey, 'Perplexity');
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
        }, AI_REQUEST_TIMEOUT_MS, apiKey, 'Grok');
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
      try {
        await pool.query(
          `INSERT INTO api_logs (platform, query, status, model, response_ms) VALUES ($1, $2, $3, $4, $5)`,
          [platform, query.substring(0, 500), 'ok', result.model, responseTimeMs],
        );
      } catch { /* best-effort logging */ }

      return result;
    } catch (e) {
      if (!options?.silent && (isTransientError(e) || (e as AiError).budgetExhausted)) {
        // When fetchAI surfaces `needsDeferral: true` (ChatGPT only, when
        // Retry-After > per-call sleep cap) we park the query just past
        // the window reset instead of the generic 5-min backoff.
        const aiErr = e as AiError;
        const delayMs = aiErr.needsDeferral && aiErr.deferralMs ? aiErr.deferralMs : undefined;
        enqueueDeferredRetry({ platform, query, apiKey, model: useModel, brand, options, delayMs });
      }
      throw e;
    } finally {
      release();
    }
  });
}
