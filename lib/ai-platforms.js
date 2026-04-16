/**
 * AI platform API integrations
 */
const https = require('https');
const http  = require('http');
const { getDbCachedResponse, setDbCachedResponse } = require('../config/db');
const { API_ENDPOINTS, TIMEOUTS, CACHE, AI } = require('../config/constants');
const { createLogger } = require('./logger');

const logger = createLogger('AIPlatforms');

const SYSTEM_PROMPT = AI.systemPrompt;
const MAX_OUTPUT_TOKENS = AI.maxOutputTokens;
const GEMINI_MAX_TOKENS = AI.geminiMaxOutputTokens || 800;

// ── Response cache (all models) ─────────────────────────────────
const _responseCache = new Map();
const CACHE_TTL_STATIC_MS = CACHE.staticTtlMs;
const CACHE_TTL_SEARCH_MS = CACHE.searchTtlMs;
const CACHE_MAX_ENTRIES = CACHE.maxMemoryEntries;

// Normalize query text for cache key — strips noise that doesn't affect AI responses.
// Improves cache hit rate by ~15-25% (e.g. "Best pizza in NYC?" = "best pizza in nyc").
function normalizeQuery(q) {
  return q.trim().toLowerCase()
    .replace(/[?!.,;:]+$/g, '')       // strip trailing punctuation
    .replace(/\s+/g, ' ')             // collapse multiple spaces
    .replace(/[\u2018\u2019\u201A\u0060]/g, "'")  // normalize smart/curly single quotes
    .replace(/[\u201C\u201D\u201E]/g, '"');       // normalize smart/curly double quotes
}

function getCacheKey(platform, model, query, brandId, city) {
  const prefix = brandId ? `${brandId}::` : '';
  const cityPart = city ? `::${city.trim().toLowerCase()}` : '';
  return `${prefix}${platform}::${model}::${normalizeQuery(query)}${cityPart}`;
}

// Global cache key (ignores brandId) — for cross-brand sharing of identical queries
function getGlobalCacheKey(platform, model, query, city) {
  const cityPart = city ? `::${city.trim().toLowerCase()}` : '';
  return `global::${platform}::${model}::${normalizeQuery(query)}${cityPart}`;
}

function _isSearchModel(platform, model) {
  if (platform === 'ChatGPT') return (model || 'gpt-4o-mini-search-preview').includes('search');
  if (platform === 'Perplexity') return true;
  if (platform === 'Claude') return true;
      if (platform === 'Grok') return (model || 'grok-4').startsWith('grok-4');
  return false; // Gemini (plain) — no web search
}

function getCacheTTL(platform, model) {
  return _isSearchModel(platform, model) ? CACHE_TTL_SEARCH_MS : CACHE_TTL_STATIC_MS;
}

function getCachedResponse(platform, model, query, brandId, city) {
  // L1: In-memory cache (fast path)
  const key = getCacheKey(platform, model, query, brandId, city);
  const entry = _responseCache.get(key);
  if (entry) {
    const ttl = getCacheTTL(platform, model);
    if (Date.now() - entry.timestamp > ttl) {
      _responseCache.delete(key);
    } else {
      // LRU: move to end of Map so least-recently-used entries are evicted first
      _responseCache.delete(key);
      _responseCache.set(key, entry);
      return entry.result;
    }
  }
  // Also check global (cross-brand) memory cache
  const globalKey = getGlobalCacheKey(platform, model, query, city);
  const globalEntry = _responseCache.get(globalKey);
  if (globalEntry) {
    const ttl = getCacheTTL(platform, model);
    if (Date.now() - globalEntry.timestamp > ttl) {
      _responseCache.delete(globalKey);
    } else {
      _responseCache.delete(globalKey);
      _responseCache.set(globalKey, globalEntry);
      return globalEntry.result;
    }
  }
  return null;
}

// Async L2 DB cache lookup — called when L1 misses
async function getCachedResponseWithDb(platform, model, query, brandId, city) {
  // L1: memory
  const memResult = getCachedResponse(platform, model, query, brandId, city);
  if (memResult) return memResult;

  // L2: DB — check brand-specific key first, then global key
  const key = getCacheKey(platform, model, query, brandId, city);
  const isSearch = _isSearchModel(platform, model);
  const dbResult = await getDbCachedResponse(key);
  if (dbResult) {
    // Promote to L1 memory cache
    _setMemoryCache(key, dbResult, isSearch);
    return dbResult;
  }

  // L2: DB — check global (cross-brand) cache
  const globalKey = getGlobalCacheKey(platform, model, query, city);
  const globalDbResult = await getDbCachedResponse(globalKey);
  if (globalDbResult) {
    _setMemoryCache(globalKey, globalDbResult, isSearch);
    return globalDbResult;
  }

  return null;
}

function _setMemoryCache(key, result, isSearch) {
  if (_responseCache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = _responseCache.keys().next().value;
    _responseCache.delete(firstKey);
  }
  _responseCache.set(key, { result, timestamp: Date.now(), isSearch: !!isSearch });
}

function setCachedResponse(platform, model, query, result, brandId, city) {
  const isSearch = _isSearchModel(platform, model);
  // L1: In-memory
  const key = getCacheKey(platform, model, query, brandId, city);
  _setMemoryCache(key, result, isSearch);

  // Also store in global (cross-brand) memory cache for sharing
  const globalKey = getGlobalCacheKey(platform, model, query, city);
  _setMemoryCache(globalKey, result, isSearch);

  // L2: DB (async, fire-and-forget for performance)
  const ttl = getCacheTTL(platform, model);
  setDbCachedResponse(key, platform, model, normalizeQuery(query), brandId, city, result, isSearch, ttl).catch(() => {});
  // Also store global cache in DB for cross-brand sharing
  setDbCachedResponse(globalKey, platform, model, normalizeQuery(query), null, city, result, isSearch, ttl).catch(() => {});
}

// Periodic sweep of expired cache entries to prevent memory bloat
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _responseCache) {
    // Use each entry's actual TTL for accurate expiration
    const ttl = entry.isSearch ? CACHE_TTL_SEARCH_MS : CACHE_TTL_STATIC_MS;
    if (now - entry.timestamp > ttl) {
      _responseCache.delete(key);
    }
  }
}, TIMEOUTS.cacheSweepInterval); // Sweep every hour

// ── Circuit breaker for bad API keys ────────────────────────────
// Tracks per-key consecutive failures. If a key has 5+ auth failures within
// 5 minutes, it is temporarily skipped to avoid wasting rate limit quota.
const apiKeyFailures = new Map();
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function circuitBreakerCheck(apiKey) {
  const entry = apiKeyFailures.get(apiKey);
  if (!entry) return false;
  if (Date.now() - entry.lastFailure > CIRCUIT_BREAKER_WINDOW_MS) {
    apiKeyFailures.delete(apiKey);
    return false;
  }
  return entry.count >= CIRCUIT_BREAKER_THRESHOLD;
}

function recordApiKeyFailure(apiKey) {
  const entry = apiKeyFailures.get(apiKey);
  if (entry && Date.now() - entry.lastFailure <= CIRCUIT_BREAKER_WINDOW_MS) {
    entry.count++;
    entry.lastFailure = Date.now();
  } else {
    apiKeyFailures.set(apiKey, { count: 1, lastFailure: Date.now() });
  }
}

function resetApiKeyFailures(apiKey) {
  apiKeyFailures.delete(apiKey);
}

// ── Per-key rate-limit cooldowns ────────────────────────────────
// When a key gets rate-limited (429), park it for a cool-down period
// proportional to consecutive 429 count. The key picker skips keys that
// are in cooldown so parallel workers don't hammer a throttled key.
const _keyCooldown = new Map(); // apiKey -> { until, consecutive }

function markKeyRateLimited(apiKey, hintMs) {
  const now = Date.now();
  const prev = _keyCooldown.get(apiKey);
  const consecutive = prev && prev.until > now - 30000 ? prev.consecutive + 1 : 1;
  // Cooldown grows with consecutive 429s: 15s, 30s, 60s, 120s, capped at 240s.
  // A provider-supplied Retry-After hint takes precedence when larger.
  const scaled = Math.min(15000 * Math.pow(2, consecutive - 1), 240000);
  const cool = Math.max(scaled, Math.min(hintMs || 0, 240000));
  _keyCooldown.set(apiKey, { until: now + cool, consecutive });
  return cool;
}

function keyCooldownRemaining(apiKey) {
  const entry = _keyCooldown.get(apiKey);
  if (!entry) return 0;
  const remaining = entry.until - Date.now();
  if (remaining <= 0) { _keyCooldown.delete(apiKey); return 0; }
  return remaining;
}

function clearKeyCooldown(apiKey) {
  _keyCooldown.delete(apiKey);
}

// ── Global per-platform rate limiter ────────────────────────────
// Prevents bursts to a single provider that would otherwise 429 even with
// per-key spacing. Sliding-window RPM + concurrency semaphore, enforced
// across all brands/queries in this worker process.
//
// Values are intentionally conservative to leave headroom under OpenAI/Google
// published limits (OpenAI Tier 1+ is ~500 RPM; we cap at 300 RPM to absorb
// multi-worker/multi-brand bursts and the occasional burst from retries).
const PLATFORM_LIMITS = {
  ChatGPT:    { maxConcurrent: 4, rpm: 300, windowMs: 60000 },
  Claude:     { maxConcurrent: 3, rpm: 80,  windowMs: 60000 },
  Gemini:     { maxConcurrent: 6, rpm: 400, windowMs: 60000 },
  Grok:       { maxConcurrent: 3, rpm: 100, windowMs: 60000 },
  Perplexity: { maxConcurrent: 3, rpm: 80,  windowMs: 60000 },
};

const _platformState = Object.create(null);
function _getPlatformState(platform) {
  if (!_platformState[platform]) {
    _platformState[platform] = { inFlight: 0, waiters: [], timestamps: [] };
  }
  return _platformState[platform];
}

// Acquire a slot respecting both concurrency and sliding-window RPM.
// Returns a release() function that must be called in a finally block.
// The concurrency slot is claimed BEFORE the RPM sleep so parallel callers
// cannot bypass the concurrency cap while waiting on the RPM window.
async function acquirePlatformSlot(platform) {
  const limits = PLATFORM_LIMITS[platform];
  if (!limits) return () => {};
  const state = _getPlatformState(platform);

  while (state.inFlight >= limits.maxConcurrent) {
    await new Promise(resolve => state.waiters.push(resolve));
  }
  state.inFlight++;

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    state.inFlight--;
    const next = state.waiters.shift();
    if (next) next();
  };

  try {
    while (true) {
      const now = Date.now();
      state.timestamps = state.timestamps.filter(t => now - t < limits.windowMs);
      if (state.timestamps.length < limits.rpm) break;
      const oldest = state.timestamps[0];
      const waitMs = Math.max(50, limits.windowMs - (now - oldest) + 25);
      await sleep(waitMs);
    }
    state.timestamps.push(Date.now());
  } catch(e) {
    release();
    throw e;
  }
  return release;
}

// ── In-flight request coalescing ────────────────────────────────
// If two callers need the exact same (platform, model, query, brand-city)
// at the same moment, coalesce them into one HTTP call. This halves load
// during cron batches where multiple brands share a city/query.
const _inFlightCalls = new Map();

function coalesce(key, fn) {
  const existing = _inFlightCalls.get(key);
  if (existing) return existing;
  const promise = Promise.resolve().then(fn).finally(() => {
    _inFlightCalls.delete(key);
  });
  _inFlightCalls.set(key, promise);
  return promise;
}

// ── Deferred retry queue ────────────────────────────────────────
// When a query exhausts its full retry budget, enqueue it for a later
// background retry. On success, the result is written to the response
// cache so the next cron tick (or manual re-run) returns instantly
// instead of re-hitting the overloaded provider.
//
// This is in-memory and per-process. For cross-process durability,
// persistence would need to move to a DB table — see `prompt_runs`
// (config/db.js:146) for a natural extension point.
const _deferredQueue = [];
const DEFERRED_MAX_ATTEMPTS = 4;
const DEFERRED_BASE_DELAY_MS = 5 * 60 * 1000; // 5 min initial delay
const DEFERRED_QUEUE_MAX = 500;                // cap memory usage

function enqueueDeferredRetry(item) {
  if (_deferredQueue.length >= DEFERRED_QUEUE_MAX) return false;
  const attempts = (item.attempts || 0) + 1;
  if (attempts > DEFERRED_MAX_ATTEMPTS) return false;
  const delay = DEFERRED_BASE_DELAY_MS * Math.pow(2, attempts - 1);
  _deferredQueue.push({ ...item, attempts, scheduledAt: Date.now() + delay });
  return true;
}

let _deferredDraining = false;
async function _drainDeferredQueue() {
  if (_deferredDraining || _deferredQueue.length === 0) return;
  _deferredDraining = true;
  try {
    const now = Date.now();
    const ready = [];
    for (let i = _deferredQueue.length - 1; i >= 0; i--) {
      if (_deferredQueue[i].scheduledAt <= now) {
        ready.push(_deferredQueue.splice(i, 1)[0]);
      }
    }
    for (const item of ready) {
      try {
        await queryAI(item.query, item.platform, item.brand, item.keys, item.modelPrefs, { silent: true });
        logger.info(`Deferred retry succeeded for ${item.platform}: ${String(item.query).slice(0, 60)}`);
      } catch(e) {
        const ok = enqueueDeferredRetry(item);
        if (!ok) {
          logger.warn(`Deferred retry gave up for ${item.platform} after ${item.attempts} attempts: ${(e.message || '').slice(0, 120)}`);
        }
      }
    }
  } finally {
    _deferredDraining = false;
  }
}

setInterval(() => { _drainDeferredQueue().catch(() => {}); }, 60 * 1000);

// ── Deep-retry wall-clock budget ────────────────────────────────
// Wraps a provider call with "never-give-up" semantics: keeps retrying
// transient/rate-limit errors until the wall-clock budget expires, with
// backoff that grows to 60s between attempts.
const DEEP_RETRY_BUDGET_MS = parseInt(process.env.AI_DEEP_RETRY_BUDGET_MS, 10) || (8 * 60 * 1000);

function _isTransientError(e) {
  if (!e) return false;
  if (e.isRateLimit || e.isTransient) return true;
  const msg = (e.message || '').toLowerCase();
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

async function withDeepRetry(platform, fn, budgetMs) {
  const budget = budgetMs || DEEP_RETRY_BUDGET_MS;
  const start = Date.now();
  let attempt = 0;
  let lastErr;
  while (true) {
    try {
      return await fn();
    } catch(e) {
      lastErr = e;
      if (!_isTransientError(e)) throw e;
      const elapsed = Date.now() - start;
      const remaining = budget - elapsed;
      if (remaining <= 1500) { lastErr.budgetExhausted = true; throw lastErr; }
      const base = Math.min(60000, 10000 * Math.pow(1.5, attempt));
      const jitter = Math.floor(Math.random() * 3000);
      const delay = Math.min(base + jitter, Math.max(1000, remaining - 500));
      logger.warn(`${platform} transient (deep retry #${attempt + 1}, elapsed ${Math.round(elapsed/1000)}s/${Math.round(budget/1000)}s): ${(e.message || '').slice(0, 120)}. Sleeping ${Math.round(delay/1000)}s.`);
      await sleep(delay);
      attempt++;
    }
  }
}

// Available models per platform — used for settings UI and validation
const PLATFORM_MODELS = {
  ChatGPT: [
    { id: 'gpt-5-search-api', label: 'GPT-5 Search (Latest)', search: true },
    { id: 'gpt-4o-search-preview', label: 'GPT-4o Search', search: true },
    { id: 'gpt-4o-mini-search-preview', label: 'GPT-4o Mini Search (Most cost-effective)', search: true, default: true },
    { id: 'gpt-5.4', label: 'GPT-5.4 (No search)', search: false },
    { id: 'gpt-4o', label: 'GPT-4o (No search)', search: false }
  ],
  Claude: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Cost-effective)', default: true },
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' }
  ],
  Gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Cost-effective)', default: true },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Fallback)' }
  ],
  Grok: [
    { id: 'grok-3-mini', label: 'Grok 3 Mini (Cost-effective)', default: true },
    { id: 'grok-4', label: 'Grok 4' },
    { id: 'grok-4-1-fast', label: 'Grok 4.1 Fast' }
  ],
  Perplexity: [
    { id: 'sonar-pro', label: 'Sonar Pro (Latest)' },
    { id: 'sonar', label: 'Sonar', default: true },
    { id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro' }
  ],
};

// Per-model pricing (USD per 1M tokens) — updated March 2026
// Sources: official pricing pages for each provider
const MODEL_PRICING = {
  // OpenAI
  'gpt-5-search-api':       { input: 2.50, output: 10.00 },
  'gpt-4o-search-preview':  { input: 2.50, output: 10.00 },
    'gpt-4o-mini-search-preview': { input: 0.15, output: 0.60 },
  'gpt-5.4':                { input: 2.50, output: 10.00 },
  'gpt-4o':                 { input: 2.50, output: 10.00 },
  // Anthropic Claude
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-opus-4-6':          { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6':        { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001':{ input: 0.80, output: 4.00 },
  // Google Gemini
  'gemini-2.5-flash':      { input: 0.15, output: 0.60 },
  'gemini-2.5-pro':        { input: 1.25, output: 10.00 },
  'gemini-2.5-flash-lite': { input: 0.075, output: 0.30 },
  // Grok (xAI)
  'grok-3-mini':    { input: 0.30, output: 0.50 },
  'grok-4':         { input: 3.00, output: 15.00 },
  'grok-4-1-fast':  { input: 2.00, output: 10.00 },
  // Perplexity
  'sonar-pro':            { input: 3.00, output: 15.00 },
  'sonar':                { input: 1.00, output: 1.00 },
  'sonar-reasoning-pro':  { input: 3.00, output: 15.00 },
};

function estimateCost(model, tokensIn, tokensOut) {
  let pricing = MODEL_PRICING[model];
  // Fallback: try prefix match (APIs often return versioned names like gpt-4o-search-preview-2025-03-11)
  if (!pricing && model) {
    const key = Object.keys(MODEL_PRICING).find(k => model.startsWith(k) || k.startsWith(model));
    if (key) pricing = MODEL_PRICING[key];
  }
  if (!pricing || (!tokensIn && !tokensOut)) return null;
  return ((tokensIn || 0) * pricing.input + (tokensOut || 0) * pricing.output) / 1_000_000;
}

function getDefaultModel(platform) {
  const models = PLATFORM_MODELS[platform];
  if (!models) return null;
  const def = models.find(m => m.default);
  return def ? def.id : models[0].id;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Per-platform rate limiting — minimum delay (ms) between requests per API key.
// Tuned for paid-tier RPM limits (most Livesov users have paid keys).
// These are *per-key* delays — multiple keys multiply throughput proportionally.
// If rate-limited (429), the retry logic automatically backs off further.
const PLATFORM_RATE_LIMITS = {
  ChatGPT:      { minDelayMs: 500,  rpm: 500 },  // Tier 1+ paid: ~500 RPM (more spacing to avoid 429s)
  Claude:       { minDelayMs: 300,  rpm: 100 },  // Tier 1 paid: ~100 RPM
  Gemini:       { minDelayMs: 300,  rpm: 1000 }, // Paid: 1000+ RPM (more spacing to avoid capacity errors)
  Grok:         { minDelayMs: 250,  rpm: 120 },  // xAI paid: ~60-120 RPM
  Perplexity:   { minDelayMs: 300,  rpm: 100 },  // Paid: ~100 RPM
};

// Track last request timestamp per key (not per platform) for multi-key rotation
const lastRequestTimePerKey = {};

// Per-key mutex queues to prevent TOCTOU race in rateLimitWait
const _rateLimitQueues = {};

// Pick a key for a platform using hash-based distribution (safe for concurrent requests)
function rotateKey(keysArray, platform, query) {
  if (!keysArray || keysArray.length === 0) return null;
  if (keysArray.length === 1) return keysArray[0];
  // Hash-based selection: distribute keys evenly across concurrent requests
  // using the query as entropy so different queries hit different keys
  const seed = (query || '') + Date.now().toString(36) + Math.random().toString(36);
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % keysArray.length;
  return keysArray[idx];
}

// Rate-limit key for a given API key — ensures the delay is enforced per
// *actual* API key, not per platform name.
function _rateLimitTrackKey(platform, apiKey) {
  const keySuffix = apiKey ? apiKey.slice(-8) : 'default';
  return platform + ':' + keySuffix;
}

async function rateLimitWait(platform, apiKey) {
  const limits = PLATFORM_RATE_LIMITS[platform];
  if (!limits) return;
  const trackKey = _rateLimitTrackKey(platform, apiKey);

  // Serialize access per trackKey to prevent TOCTOU race when multiple
  // concurrent calls share the same key (e.g. across batches or shared platforms).
  if (!_rateLimitQueues[trackKey]) _rateLimitQueues[trackKey] = Promise.resolve();
  const gate = _rateLimitQueues[trackKey].then(async () => {
    const now = Date.now();
    const last = lastRequestTimePerKey[trackKey] || 0;
    const elapsed = now - last;
    if (elapsed < limits.minDelayMs) {
      await sleep(limits.minDelayMs - elapsed);
    }
    lastRequestTimePerKey[trackKey] = Date.now();
  });
  _rateLimitQueues[trackKey] = gate.catch(() => {}); // prevent queue stall on error
  return gate;
}

function resetBatchCount(platform) {
  // Hash-based key rotation holds no per-platform state, so nothing to reset.
}

// Periodically clean up stale rate-limit queue entries to prevent memory growth
setInterval(() => {
  const cutoff = Date.now() - TIMEOUTS.rateLimitCleanup;
  for (const key of Object.keys(lastRequestTimePerKey)) {
    if (lastRequestTimePerKey[key] < cutoff) {
      delete lastRequestTimePerKey[key];
      delete _rateLimitQueues[key];
    }
  }
}, TIMEOUTS.rateLimitCleanup);

function isRateLimitError(statusCode, body) {
  if (statusCode === 429) return true;
  if (statusCode === 529) return true; // Anthropic overloaded
  const msg = (typeof body === 'string' ? body : JSON.stringify(body || '')).toLowerCase();
  return msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('too many requests');
}

// Configurable request timeout — default 60s. Controls the hard deadline for AI requests.
const AI_REQUEST_TIMEOUT_MS = parseInt(process.env.AI_REQUEST_TIMEOUT_MS, 10) || 60000;

async function fetchJSONOnce(url, options) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const body = options.body;
    const timeoutMs = options.timeout || AI_REQUEST_TIMEOUT_MS;
    const reqOptions = {
      method: options.method || 'POST',
      headers: options.headers || {},
      timeout: Math.floor(timeoutMs / 2), // idle timeout = half of hard deadline
    };
    if (body) reqOptions.headers['Content-Length'] = Buffer.byteLength(body);

    // Hard deadline: abort if total request exceeds the configured timeout.
    let settled = false;
    const hardTimeout = setTimeout(() => {
      if (!settled) { settled = true; req.destroy(); reject(new Error(`Request timeout after ${Math.round(timeoutMs / 1000)}s to ` + new URL(url).hostname)); }
    }, timeoutMs);

    const req = lib.request(url, reqOptions, (res) => {
      res.setEncoding('utf8');
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(hardTimeout);
        try { resolve({ statusCode: res.statusCode, headers: res.headers, data: JSON.parse(data) }); }
        catch(e) { reject(new Error('Invalid JSON response from ' + new URL(url).hostname + ': ' + data.substring(0, 200))); }
      });
    });
    req.on('timeout', () => { if (!settled) { settled = true; clearTimeout(hardTimeout); req.destroy(); reject(new Error(`Request idle timeout to ${new URL(url).hostname}`)); } });
    req.on('error', (e) => { if (!settled) { settled = true; clearTimeout(hardTimeout); reject(e); } });
    if (body) req.write(body);
    req.end();
  });
}

async function fetchJSON(url, options) {
  const MAX_RETRIES = AI.fetchMaxRetries;
  const NETWORK_BASE_DELAY = AI.networkBaseDelay;
  const RATE_LIMIT_BASE_DELAY = AI.rateLimitBaseDelay;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let statusCode, data, headers;
    try {
      ({ statusCode, data, headers } = await fetchJSONOnce(url, options));
    } catch(e) {
      // Network error (timeout, DNS, connection refused) — retry
      lastError = e;
      if (attempt < MAX_RETRIES) {
        const delay = NETWORK_BASE_DELAY * Math.pow(2, attempt);
        console.log(`[Network error] ${e.message} - retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      throw e;
    }

    // Auth errors (401/403 = bad API key) — fail immediately, no retry
    if (statusCode === 401 || statusCode === 403) {
      const errMsg = data?.error?.message || `Auth error ${statusCode} from ${new URL(url).hostname}`;
      throw new Error(errMsg);
    }

    if (isRateLimitError(statusCode, data)) {
      // Prefer the server-provided Retry-After header; fall back to body hint, then exponential backoff.
      const headerHint = parseRetryAfterHeader(headers);
      const bodyHint = extractRetryAfter(data);
      const retryAfterHint = headerHint || bodyHint;
      lastError = new Error(`Rate limited by ${new URL(url).hostname} (${statusCode})`);
      if (attempt < MAX_RETRIES) {
        const jitter = Math.floor(Math.random() * AI.rateLimitJitterMax);
        const backoff = RATE_LIMIT_BASE_DELAY * Math.pow(2, attempt);
        const delay = (retryAfterHint || backoff) + jitter;
        console.log(`[Rate limit] ${new URL(url).hostname} - retrying in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        // Also reset the platform rate limiter to add extra spacing
        const host = new URL(url).hostname;
        for (const [plat] of Object.entries(PLATFORM_RATE_LIMITS)) {
          if (host.includes(plat.toLowerCase()) || matchesPlatformHost(host, plat)) {
            // Mark all keys for this platform as recently used to add spacing after rate limit
            for (const k of Object.keys(lastRequestTimePerKey)) {
              if (k.startsWith(plat + ':')) lastRequestTimePerKey[k] = Date.now();
            }
          }
        }
        continue;
      }
      // All retries exhausted — throw rate limit error (tagged for caller detection)
      lastError.isRateLimit = true;
      throw lastError;
    }

    // Also retry on 5xx server errors (platform is temporarily down)
    if (statusCode >= 500 && statusCode !== 529) {
      lastError = new Error(`Server error ${statusCode} from ${new URL(url).hostname}`);
      lastError.isTransient = true;
      if (attempt < MAX_RETRIES) {
        const delay = NETWORK_BASE_DELAY * Math.pow(2, attempt);
        console.log(`[Server error] ${new URL(url).hostname} (${statusCode}) - retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      throw lastError;
    }

    return data;
  }
  throw lastError || new Error('Max retries exceeded for ' + new URL(url).hostname);
}

function matchesPlatformHost(host, platform) {
  const map = { ChatGPT:'openai', Claude:'anthropic', Gemini:'googleapis', Grok:'x.ai', Perplexity:'perplexity' };
  return host.includes((map[platform]||'').toLowerCase());
}

function extractRetryAfter(data) {
  // Try to extract retry-after seconds from error response body
  if (!data) return null;
  const msg = typeof data === 'string' ? data : JSON.stringify(data);
  const match = msg.match(/retry.?after[:\s]*(\d+)/i) || msg.match(/try again in (\d+)/i);
  if (match) return Math.min(parseInt(match[1], 10) * 1000, 120000); // cap at 2 min
  return null;
}

// Honour the server's Retry-After header on 429/503 responses.
// Per RFC 7231 the value is either delta-seconds or an HTTP-date; OpenAI sends seconds.
function parseRetryAfterHeader(headers) {
  if (!headers) return null;
  const raw = headers['retry-after'] || headers['Retry-After'] || headers['x-ratelimit-reset-requests'] || headers['x-ratelimit-reset-tokens'];
  if (!raw) return null;
  const secs = parseInt(raw, 10);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 120000);
  const when = Date.parse(raw);
  if (Number.isFinite(when)) return Math.max(0, Math.min(when - Date.now(), 120000));
  return null;
}

async function callOpenAI(query, apiKey, model, brand) {
  const useModel = model || 'gpt-4o-mini-search-preview';
  const isSearchModel = useModel.includes('search');

  if (isSearchModel) {
    // Search-enabled model — use web_search_options for real-time results
    const payload = {
      model: useModel, max_tokens: MAX_OUTPUT_TOKENS,
      web_search_options: {},
      messages: [
        { role: 'user', content: query }
      ]
    };
    if (brand && brand.city) {
      payload.web_search_options.user_location = {
        type: 'approximate',
        approximate: { city: brand.city, country: 'US' }
      };
    }
    const body = JSON.stringify(payload);
    const d = await fetchJSON(API_ENDPOINTS.openai.chat, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body
    });
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    const citations = [];
    try {
      const annotations = d.choices?.[0]?.message?.annotations || [];
      annotations.forEach(a => {
        if (a.type === 'url_citation' && a.url) citations.push(a.url);
      });
    } catch(e) { /* ignore */ }
    const tokensIn = d.usage?.prompt_tokens || 0;
    const tokensOut = d.usage?.completion_tokens || 0;
    return { text: d.choices?.[0]?.message?.content || '', simulated: false, citations: [...new Set(citations)].slice(0, 10), model: d.model || useModel, tokensIn, tokensOut };
  } else {
    // Standard model — use system prompt
    const body = JSON.stringify({
      model: useModel, max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: query }
      ]
    });
    const d = await fetchJSON(API_ENDPOINTS.openai.chat, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body
    });
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    const tokensIn = d.usage?.prompt_tokens || 0;
    const tokensOut = d.usage?.completion_tokens || 0;
    return { text: d.choices?.[0]?.message?.content || '', simulated: false, citations: [], model: d.model || useModel, tokensIn, tokensOut };
  }
}

async function callPerplexity(query, apiKey, model) {
  const useModel = model || 'sonar';
  const body = JSON.stringify({
    model: useModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    return_citations: true,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query }
    ]
  });
  const d = await fetchJSON(API_ENDPOINTS.perplexity.chat, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body
  });
  if (d.error) throw new Error(JSON.stringify(d.error));
  const tokensIn = d.usage?.prompt_tokens || 0;
  const tokensOut = d.usage?.completion_tokens || 0;
  return {
    text: d.choices?.[0]?.message?.content || '',
    simulated: false,
    citations: (d.citations || []).slice(0, 10),
    model: d.model || useModel,
    tokensIn, tokensOut
  };
}

async function callGemini(query, apiKey, model) {
  const requestedModel = model || 'gemini-2.5-flash';
  // Fallback chain for persistent "high demand". Each tier runs on a
  // separate Google capacity pool, so dropping tier often clears the error.
  const FALLBACK_CHAIN = {
    'gemini-2.5-pro':        ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    'gemini-2.5-flash':      ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    'gemini-2.5-flash-lite': ['gemini-2.5-flash-lite'],
  };
  const attemptModels = FALLBACK_CHAIN[requestedModel] || [requestedModel];

  let lastTransient = null;
  for (let m = 0; m < attemptModels.length; m++) {
    const geminiModel = attemptModels[m];
    const url = `${API_ENDPOINTS.gemini.base}${geminiModel}:generateContent?key=` + apiKey;
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: query }] }],
      generationConfig: { maxOutputTokens: GEMINI_MAX_TOKENS },
      tools: [{ googleSearch: {} }]
    });

    // Retry loop for transient errors (high demand, overloaded, etc.).
    // Delays: 5s, 10s, 20s, 40s (+ up to 2s jitter).
    const MAX_GEMINI_RETRIES = 4;
    const GEMINI_BASE_DELAY_MS = 5000;
    let done = false;
    for (let attempt = 0; attempt <= MAX_GEMINI_RETRIES && !done; attempt++) {
      const d = await fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });
      if (d.error) {
        const msg = (d.error.message || JSON.stringify(d.error)).toLowerCase();
        const isTransient = msg.includes('high demand') || msg.includes('try again later') || msg.includes('overloaded') || msg.includes('resource exhausted') || msg.includes('unavailable');
        if (isTransient && attempt < MAX_GEMINI_RETRIES) {
          const delay = (GEMINI_BASE_DELAY_MS * Math.pow(2, attempt)) + Math.floor(Math.random() * 2000);
          logger.warn(`Gemini transient error on ${geminiModel} (attempt ${attempt + 1}/${MAX_GEMINI_RETRIES + 1}): ${msg.slice(0, 120)}. Retrying in ${Math.round(delay/1000)}s...`);
          await sleep(delay);
          continue;
        }
        if (isTransient && m < attemptModels.length - 1) {
          // Exhausted retries on this model, fall back to the next one.
          logger.warn(`Gemini ${geminiModel} exhausted retries with transient errors; falling back to ${attemptModels[m + 1]}.`);
          lastTransient = d.error;
          done = true;
          break;
        }
        const err = new Error(d.error.message || JSON.stringify(d.error));
        err.isTransient = isTransient;
        throw err;
      }
      // Detect blocked responses (safety filter, etc.) — Gemini omits candidates or content
      if (d.promptFeedback?.blockReason) {
        throw new Error(`Gemini blocked response: ${d.promptFeedback.blockReason}`);
      }
      const candidate = d.candidates?.[0];
      if (!candidate) {
        throw new Error('Gemini returned no candidates — response may be blocked or model unavailable');
      }
      const finishReason = candidate.finishReason;
      if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
        throw new Error(`Gemini response blocked (finishReason: ${finishReason})`);
      }
      const parts = candidate.content?.parts || [];
      const fullText = parts.map(p => p.text || '').join('\n').trim();
      if (!fullText) {
        throw new Error('Gemini returned empty response text');
      }
      const tokensIn = d.usageMetadata?.promptTokenCount || 0;
      const tokensOut = d.usageMetadata?.candidatesTokenCount || 0;
      // Extract grounding citations from Google Search grounding
      const groundingChunks = candidate.groundingMetadata?.groundingChunks || [];
      const citations = [...new Set(groundingChunks.filter(c => c.web?.uri).map(c => c.web.uri))].slice(0, 10);
      return { text: fullText, simulated: false, citations, model: geminiModel, tokensIn, tokensOut };
    }
  }
  // All models + retries exhausted with transient errors
  const tail = lastTransient ? (lastTransient.message || JSON.stringify(lastTransient)) : 'unknown error';
  const err = new Error(`Gemini: max retries exhausted across ${attemptModels.join(', ')} — ${tail}`);
  err.isTransient = true;
  throw err;
}

async function callGrok(query, apiKey, model) {
      const grokModel = model || 'grok-4';
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) throw new Error('Grok API key is not configured');

      // Only grok-4 family supports server-side tools (web_search).
      // grok-3-mini and other non-grok-4 models use Chat Completions API instead.
      const supportsTools = grokModel.startsWith('grok-4');

      if (!supportsTools) {
              // Use Chat Completions API for models that don't support tools
              const body = JSON.stringify({
                        model: grokModel,
                        max_tokens: MAX_OUTPUT_TOKENS,
                        messages: [
                          { role: 'system', content: SYSTEM_PROMPT },
                          { role: 'user', content: query }
                                  ]
              });
              const d = await fetchJSON(API_ENDPOINTS.grok.chat, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cleanKey },
                        body
              });
              if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
              const tokensIn = d.usage?.prompt_tokens || 0;
              const tokensOut = d.usage?.completion_tokens || 0;
              return {
                        text: d.choices?.[0]?.message?.content || '',
                        simulated: false,
                        citations: [],
                        model: d.model || grokModel,
                        tokensIn,
                        tokensOut
              };
      }
  // Use Responses API with web_search for real-time web-grounded results
  const body = JSON.stringify({
    model: grokModel,
    tools: [{ type: 'web_search' }],
    input: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query }
    ]
  });
  const d = await fetchJSON(API_ENDPOINTS.grok.responses, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cleanKey },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  // Extract text and citations from Responses API output
  let text = '';
  const citations = [];
  const output = d.output || [];
  for (const item of output) {
    if (item.type === 'message') {
      for (const c of (item.content || [])) {
        if (c.type === 'output_text') {
          text += (c.text || '');
          for (const ann of (c.annotations || [])) {
            if (ann.type === 'url_citation' && ann.url) citations.push(ann.url);
          }
        }
      }
    }
  }
  if (!text) throw new Error('Grok API returned empty response');
  const tokensIn = d.usage?.input_tokens || 0;
  const tokensOut = d.usage?.output_tokens || 0;
  return { text: text.trim(), simulated: false, citations: [...new Set(citations)].slice(0, 10), model: d.model || grokModel, tokensIn, tokensOut };
}

async function callClaude(query, apiKey, model) {
  const claudeModel = model || 'claude-haiku-4-5-20251001';
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) throw new Error('Claude API key is not configured');
  const body = JSON.stringify({
    model: claudeModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    // Prompt caching: mark system prompt + tools with cache_control so Anthropic
    // caches them across requests. Cached input tokens cost ~90% less ($0.08/M vs $0.80/M on Haiku).
    // The system prompt + tool definition is identical across all queries, so after the first
    // call they're served from cache for up to 5 minutes (auto-extended on each hit).
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    // max_uses: 1 instead of 3 — saves ~60% Claude token cost per query.
    // Each web search injects 2000-5000 tokens of search results into context.
    // 1 search is sufficient for brand recommendation queries.
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: query }]
  });
  const d = await fetchJSON(API_ENDPOINTS.claude.messages, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cleanKey,
      'anthropic-version': AI.anthropicVersion
    },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  const textParts = [];
  const citations = [];
  for (const block of (d.content || [])) {
    if (block.type === 'text') {
      textParts.push(block.text);
      for (const ann of (block.citations || [])) {
        if (ann.type === 'web_search_result_location' && ann.url) citations.push(ann.url);
      }
    }
  }
  const claudeText = textParts.join('\n').trim();
  const tokensIn = d.usage?.input_tokens || 0;
  const tokensOut = d.usage?.output_tokens || 0;
  return { text: claudeText || '', simulated: false, citations: [...new Set(citations)].slice(0, 10), model: d.model || claudeModel, tokensIn, tokensOut };
}

// ── Claude Message Batches API (50% cheaper for scheduled/cron runs) ─────
// https://docs.anthropic.com/en/docs/build-with-claude/batch-processing
// Batch requests are charged at 50% of standard per-model prices.
// Flow: create batch → poll until ended → retrieve results.

function _buildClaudeRequest(query, model) {
  return {
    model: model || 'claude-haiku-4-5-20251001',
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: query }]
  };
}

function _parseClaudeResponse(messageResult, model) {
  const textParts = [];
  const citations = [];
  for (const block of (messageResult.content || [])) {
    if (block.type === 'text') {
      textParts.push(block.text);
      for (const ann of (block.citations || [])) {
        if (ann.type === 'web_search_result_location' && ann.url) citations.push(ann.url);
      }
    }
  }
  const text = textParts.join('\n').trim();
  const tokensIn = messageResult.usage?.input_tokens || 0;
  const tokensOut = messageResult.usage?.output_tokens || 0;
  return { text: text || '', simulated: false, citations: [...new Set(citations)].slice(0, 10), model: messageResult.model || model, tokensIn, tokensOut };
}

async function createClaudeBatch(queries, apiKey, model) {
  const claudeModel = model || 'claude-haiku-4-5-20251001';
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) throw new Error('Claude API key is not configured');

  const requests = queries.map((q, i) => ({
    custom_id: `q_${i}`,
    params: _buildClaudeRequest(q, claudeModel)
  }));

  const body = JSON.stringify({ requests });
  const d = await fetchJSON(API_ENDPOINTS.claude.batches, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cleanKey,
      'anthropic-version': AI.anthropicVersion
    },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d; // { id, type, processing_status, request_counts, ... }
}

async function pollClaudeBatch(batchId, apiKey, maxWaitMs) {
  const cleanKey = (apiKey || '').trim();
  const maxWait = maxWaitMs || TIMEOUTS.batchMaxWait;
  const startTime = Date.now();
  const pollInterval = TIMEOUTS.batchPollInterval;

  while (Date.now() - startTime < maxWait) {
    const d = await fetchJSON(`${API_ENDPOINTS.claude.batches}/${batchId}`, {
      method: 'GET',
      headers: {
        'x-api-key': cleanKey,
        'anthropic-version': AI.anthropicVersion
      }
    });
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));

    if (d.processing_status === 'ended') {
      return d; // { id, results_url, request_counts: { succeeded, errored, ... } }
    }
    // Still processing — wait before polling again
    await sleep(pollInterval);
  }
  throw new Error(`Claude batch ${batchId} timed out after ${Math.round(maxWait/1000)}s`);
}

async function getClaudeBatchResults(batchId, apiKey) {
  const cleanKey = (apiKey || '').trim();
  // Fetch results as JSONL from the results endpoint
  return new Promise((resolve, reject) => {
    const url = `${API_ENDPOINTS.claude.batches}/${batchId}/results`;
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'x-api-key': cleanKey,
        'anthropic-version': AI.anthropicVersion
      },
      timeout: TIMEOUTS.batchResults
    }, (res) => {
      res.setEncoding('utf8');
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          // Response is JSONL (one JSON object per line)
          const results = data.trim().split('\n').map(line => JSON.parse(line));
          resolve(results);
        } catch(e) {
          reject(new Error('Failed to parse batch results: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Batch results fetch timeout')); });
    req.end();
  });
}

// High-level: run multiple Claude queries via batch API (50% cheaper)
// Returns Map<queryIndex, result> for successful results
async function runClaudeBatch(queries, apiKey, model) {
  if (!queries.length) return new Map();

  const batch = await createClaudeBatch(queries, apiKey, model);
  console.log(`[Claude Batch] Created batch ${batch.id} with ${queries.length} requests`);

  const completed = await pollClaudeBatch(batch.id, apiKey);
  console.log(`[Claude Batch] Batch ${batch.id} ended: ${completed.request_counts?.succeeded || 0} succeeded, ${completed.request_counts?.errored || 0} errored`);

  const rawResults = await getClaudeBatchResults(batch.id, apiKey);
  const resultMap = new Map();

  for (const item of rawResults) {
    // custom_id format: "q_0", "q_1", etc.
    const idx = parseInt(item.custom_id.replace('q_', ''), 10);
    if (item.result?.type === 'succeeded' && item.result.message) {
      resultMap.set(idx, _parseClaudeResponse(item.result.message, model));
    }
    // errored/expired items are simply not in the map — caller handles missing
  }

  return resultMap;
}

// ── OpenAI Batch API (50% cheaper for scheduled/cron runs) ───────
// https://platform.openai.com/docs/guides/batch
// Batch requests are charged at 50% of standard per-model prices.
// Flow: upload JSONL file → create batch → poll until completed → retrieve results.

function _buildOpenAIRequest(query, model, brand) {
  const useModel = model || 'gpt-4o-mini-search-preview';
  const isSearchModel = useModel.includes('search');

  if (isSearchModel) {
    const payload = {
      model: useModel, max_tokens: MAX_OUTPUT_TOKENS,
      web_search_options: {},
      messages: [{ role: 'user', content: query }]
    };
    if (brand && brand.city) {
      payload.web_search_options.user_location = {
        type: 'approximate',
        approximate: { city: brand.city, country: 'US' }
      };
    }
    return payload;
  }
  return {
    model: useModel, max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query }
    ]
  };
}

function _parseOpenAIBatchResponse(responseBody, model) {
  if (responseBody.error) throw new Error(responseBody.error.message || JSON.stringify(responseBody.error));
  const citations = [];
  try {
    const annotations = responseBody.choices?.[0]?.message?.annotations || [];
    annotations.forEach(a => {
      if (a.type === 'url_citation' && a.url) citations.push(a.url);
    });
  } catch(_) {}
  const tokensIn = responseBody.usage?.prompt_tokens || 0;
  const tokensOut = responseBody.usage?.completion_tokens || 0;
  return {
    text: responseBody.choices?.[0]?.message?.content || '',
    simulated: false,
    citations: [...new Set(citations)].slice(0, 10),
    model: responseBody.model || model,
    tokensIn, tokensOut
  };
}

async function createOpenAIBatch(queries, apiKey, model, brand) {
  const useModel = model || 'gpt-4o-mini-search-preview';
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) throw new Error('OpenAI API key is not configured');

  // Build JSONL content for batch
  const jsonlLines = queries.map((q, i) => JSON.stringify({
    custom_id: `q_${i}`,
    method: 'POST',
    url: '/v1/chat/completions',
    body: _buildOpenAIRequest(q, useModel, brand)
  }));
  const jsonlContent = jsonlLines.join('\n');

  // Upload JSONL file
  const boundary = '----BatchBoundary' + Date.now();
  const fileBody = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="purpose"',
    '',
    'batch',
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="batch.jsonl"',
    'Content-Type: application/json',
    '',
    jsonlContent,
    `--${boundary}--`
  ].join('\r\n');

  const uploadResult = await fetchJSON(API_ENDPOINTS.openai.files, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + cleanKey,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body: fileBody
  });
  if (uploadResult.error) throw new Error(uploadResult.error.message || JSON.stringify(uploadResult.error));

  // Create batch
  const batchResult = await fetchJSON(API_ENDPOINTS.openai.batches, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cleanKey
    },
    body: JSON.stringify({
      input_file_id: uploadResult.id,
      endpoint: '/v1/chat/completions',
      completion_window: '24h'
    })
  });
  if (batchResult.error) throw new Error(batchResult.error.message || JSON.stringify(batchResult.error));
  return batchResult;
}

async function pollOpenAIBatch(batchId, apiKey, maxWaitMs) {
  const cleanKey = (apiKey || '').trim();
  const maxWait = maxWaitMs || TIMEOUTS.batchMaxWait;
  const startTime = Date.now();
  const pollInterval = TIMEOUTS.batchPollInterval;

  while (Date.now() - startTime < maxWait) {
    const d = await fetchJSON(`${API_ENDPOINTS.openai.batches}/${batchId}`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + cleanKey }
    });
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    if (d.status === 'completed') return d;
    if (d.status === 'failed' || d.status === 'expired' || d.status === 'cancelled') {
      throw new Error(`OpenAI batch ${batchId} ${d.status}`);
    }
    await sleep(pollInterval);
  }
  throw new Error(`OpenAI batch ${batchId} timed out after ${Math.round(maxWait/1000)}s`);
}

async function getOpenAIBatchResults(outputFileId, apiKey) {
  const cleanKey = (apiKey || '').trim();
  return new Promise((resolve, reject) => {
    const url = `${API_ENDPOINTS.openai.files}/${outputFileId}/content`;
    const req = https.request(url, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + cleanKey },
      timeout: TIMEOUTS.batchResults
    }, (res) => {
      res.setEncoding('utf8');
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const results = data.trim().split('\n').map(line => JSON.parse(line));
          resolve(results);
        } catch(e) {
          reject(new Error('Failed to parse OpenAI batch results: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('OpenAI batch results fetch timeout')); });
    req.end();
  });
}

// High-level: run multiple OpenAI queries via batch API (50% cheaper)
async function runOpenAIBatch(queries, apiKey, model, brand) {
  if (!queries.length) return new Map();

  const batch = await createOpenAIBatch(queries, apiKey, model, brand);
  console.log(`[OpenAI Batch] Created batch ${batch.id} with ${queries.length} requests`);

  const completed = await pollOpenAIBatch(batch.id, apiKey);
  console.log(`[OpenAI Batch] Batch ${batch.id} completed`);

  if (!completed.output_file_id) throw new Error('OpenAI batch completed but no output file');
  const rawResults = await getOpenAIBatchResults(completed.output_file_id, apiKey);
  const resultMap = new Map();

  for (const item of rawResults) {
    const idx = parseInt(item.custom_id.replace('q_', ''), 10);
    if (item.response?.status_code === 200 && item.response?.body) {
      try {
        resultMap.set(idx, _parseOpenAIBatchResponse(item.response.body, model));
      } catch(_) {}
    }
  }

  return resultMap;
}

const KEY_NAME_MAP = {
  'ChatGPT': 'openai', 'Perplexity': 'perplexity', 'Claude': 'claude',
  'Gemini': 'gemini', 'Grok': 'grok'
};

// Pick the best key: skip circuit-broken keys, prefer keys NOT in cooldown,
// then pick the one with the earliest cooldown expiry. Falls back to any
// non-null key so the call still goes through after a brief extra wait.
function pickBestKey(keysArray, platform, query) {
  if (!keysArray || !keysArray.length) return null;
  const healthy = [];
  const cooling = [];
  for (const k of keysArray) {
    if (circuitBreakerCheck(k)) continue; // bad key
    const rem = keyCooldownRemaining(k);
    if (rem === 0) healthy.push(k);
    else cooling.push({ k, rem });
  }
  if (healthy.length) return rotateKey(healthy, platform, query);
  if (cooling.length) {
    cooling.sort((a, b) => a.rem - b.rem);
    return cooling[0].k;
  }
  // All keys circuit-broken — try the freshest one anyway
  return rotateKey(keysArray, platform, query);
}

async function _invokePlatform(platform, query, apiKey, prefs, brand) {
  if (platform === 'ChatGPT')    return callOpenAI(query, apiKey, prefs.ChatGPT, brand);
  if (platform === 'Perplexity') return callPerplexity(query, apiKey, prefs.Perplexity);
  if (platform === 'Gemini')     return callGemini(query, apiKey, prefs.Gemini);
  if (platform === 'Grok')       return callGrok(query, apiKey, prefs.Grok);
  if (platform === 'Claude')     return callClaude(query, apiKey, prefs.Claude);
  throw new Error('Unknown platform: ' + platform);
}

async function queryAI(query, platform, brand, keys, modelPrefs, logContext) {
  const rawQuery = query;
  const prefs = modelPrefs || {};
  const ctx = logContext || {};
  const resolvedModel = prefs[platform] || getDefaultModel(platform);
  const brandCity = brand?.city || '';

  // Cache check first (L1 memory → L2 DB, cross-brand sharing enabled)
  const cached = await getCachedResponseWithDb(platform, resolvedModel, rawQuery, ctx.brandId, brandCity);
  if (cached) {
    if (ctx.logFn) {
      ctx.logFn({ userId: ctx.userId, brandId: ctx.brandId, runId: ctx.runId, platform, query: rawQuery, status: 'cached', error: null, keyHint: 'cache', model: cached.model, responseMs: 0, tokensIn: 0, tokensOut: 0, cost: 0 });
    }
    return { ...cached, cached: true };
  }

  // Coalesce concurrent identical calls to one outgoing request.
  const coalesceKey = getGlobalCacheKey(platform, resolvedModel, rawQuery, brandCity);
  return coalesce(coalesceKey, () => _queryAIUncached(rawQuery, platform, brand, keys, prefs, ctx, resolvedModel, brandCity));
}

async function _queryAIUncached(rawQuery, platform, brand, keys, prefs, ctx, resolvedModel, brandCity) {
  const keysArray = keys[KEY_NAME_MAP[platform]] || [];
  if (!keysArray.length) return null;

  const startMs = Date.now();
  let modelUsed = null;
  let keyHint = 'unknown';

  // Build the single-attempt call: pick key → acquire slot → per-key spacing → provider call.
  const singleAttempt = async () => {
    const apiKey = pickBestKey(keysArray, platform, rawQuery);
    if (!apiKey) throw new Error(`No usable API key for ${platform}`);
    keyHint = apiKey.slice(-6);

    const release = await acquirePlatformSlot(platform);
    try {
      await rateLimitWait(platform, apiKey);
      try {
        const r = await _invokePlatform(platform, rawQuery, apiKey, prefs, brand);
        resetApiKeyFailures(apiKey);
        clearKeyCooldown(apiKey);
        return r;
      } catch(e) {
        const msg = (e.message || '').toLowerCase();
        if (e.isRateLimit || msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
          markKeyRateLimited(apiKey);
        } else if (msg.includes('auth error') || msg.includes('401') || msg.includes('403') || msg.includes('invalid api key') || msg.includes('invalid x-api-key') || msg.includes('permission')) {
          recordApiKeyFailure(apiKey);
        }
        throw e;
      }
    } finally {
      release();
    }
  };

  let result;
  try {
    result = await withDeepRetry(platform, singleAttempt);
    modelUsed = result?.model || null;
  } catch(e) {
    if (ctx.logFn) {
      ctx.logFn({ userId: ctx.userId, brandId: ctx.brandId, runId: ctx.runId, platform, query: rawQuery, status: 'error', error: e.message, keyHint, model: modelUsed, responseMs: Date.now() - startMs, tokensIn: 0, tokensOut: 0, cost: null });
    }
    // Never give up: if the budget exhausted on a transient error, schedule a
    // deferred background retry that will warm the cache for the next run.
    if (!ctx.silent && (e.budgetExhausted || _isTransientError(e))) {
      enqueueDeferredRetry({ query: rawQuery, platform, brand, keys, modelPrefs: prefs });
    }
    throw e;
  }

  if (result) {
    setCachedResponse(platform, resolvedModel, rawQuery, result, ctx.brandId, brandCity);
  }

  const tokensIn = result?.tokensIn || 0;
  const tokensOut = result?.tokensOut || 0;
  const cost = estimateCost(modelUsed, tokensIn, tokensOut);
  if (ctx.logFn) {
    ctx.logFn({ userId: ctx.userId, brandId: ctx.brandId, runId: ctx.runId, platform, query: rawQuery, status: 'ok', error: null, keyHint, model: modelUsed, responseMs: Date.now() - startMs, tokensIn, tokensOut, cost });
  }
  return result;
}

module.exports = {
  queryAI, fetchJSON, PLATFORM_MODELS, getDefaultModel, resetBatchCount,
  MODEL_PRICING, estimateCost, runClaudeBatch, runOpenAIBatch,
  circuitBreakerCheck, recordApiKeyFailure, resetApiKeyFailures,
  // New rate-limit / reliability primitives — exported for tests and diagnostics.
  PLATFORM_LIMITS, acquirePlatformSlot, markKeyRateLimited, keyCooldownRemaining,
  withDeepRetry, enqueueDeferredRetry,
};
