/**
 * AI platform API integrations
 */
const https = require('https');
const http  = require('http');
const { getDbCachedResponse, setDbCachedResponse } = require('../config/db');
const { API_ENDPOINTS, TIMEOUTS, CACHE, AI } = require('../config/constants');

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
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
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
  'gemini-2.5-flash':  { input: 0.15, output: 0.60 },
  'gemini-2.5-pro':    { input: 1.25, output: 10.00 },
  'gemini-2.5-flash':  { input: 0.10, output: 0.40 },
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
  ChatGPT:      { minDelayMs: 200,  rpm: 500 },  // Tier 1+ paid: ~500 RPM (faster)
  Claude:       { minDelayMs: 300,  rpm: 100 },  // Tier 1 paid: ~100 RPM (faster)
  Gemini:       { minDelayMs: 150,  rpm: 1000 }, // Paid: 1000+ RPM (faster)
  Grok:         { minDelayMs: 250,  rpm: 120 },  // xAI paid: ~60-120 RPM (faster)
  Perplexity:   { minDelayMs: 300,  rpm: 100 },  // Paid: ~100 RPM (faster)
};

// Track last request timestamp per key (not per platform) for multi-key rotation
const lastRequestTimePerKey = {};

// Per-key mutex queues to prevent TOCTOU race in rateLimitWait
const _rateLimitQueues = {};

// Round-robin key rotation index per platform
const keyRotationIndex = {};

// Pick the next key for a platform using round-robin
function rotateKey(keysArray, platform) {
  if (!keysArray || keysArray.length === 0) return null;
  if (keysArray.length === 1) return keysArray[0];
  if (!keyRotationIndex[platform]) keyRotationIndex[platform] = 0;
  const idx = keyRotationIndex[platform] % keysArray.length;
  keyRotationIndex[platform]++;
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
  // Reset rotation index for clean starts
  keyRotationIndex[platform] = 0;
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
        try { resolve({ statusCode: res.statusCode, data: JSON.parse(data) }); }
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
    let statusCode, data;
    try {
      ({ statusCode, data } = await fetchJSONOnce(url, options));
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

    if (isRateLimitError(statusCode, data)) {
      // Extract retry-after header hint if available
      const retryAfterHint = extractRetryAfter(data);
      lastError = new Error(`Rate limited by ${new URL(url).hostname} (${statusCode})`);
      if (attempt < MAX_RETRIES) {
        const jitter = Math.floor(Math.random() * AI.rateLimitJitterMax);
        const delay = (retryAfterHint || (RATE_LIMIT_BASE_DELAY * Math.pow(2, attempt))) + jitter;
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
      // All retries exhausted — throw rate limit error
      throw lastError;
    }

    // Also retry on 5xx server errors (platform is temporarily down)
    if (statusCode >= 500 && statusCode !== 529) {
      lastError = new Error(`Server error ${statusCode} from ${new URL(url).hostname}`);
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
  const geminiModel = model || 'gemini-2.0-flash';
  const url = `${API_ENDPOINTS.gemini.base}${geminiModel}:generateContent?key=` + apiKey;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: query }] }],
    generationConfig: { maxOutputTokens: GEMINI_MAX_TOKENS },
        tools: [{ googleSearch: {} }]
  });
  const d = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
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

async function queryAI(query, platform, brand, keys, modelPrefs, logContext) {
  const rawQuery = query;
  const prefs = modelPrefs || {};
  const ctx = logContext || {};

  // Resolve the model that will be used (for cache key)
  const resolvedModel = prefs[platform] || getDefaultModel(platform);

  // Check response cache: L1 memory → L2 DB (cross-brand sharing enabled)
  const brandCity = brand?.city || '';
  {
    const cached = await getCachedResponseWithDb(platform, resolvedModel, rawQuery, ctx.brandId, brandCity);
    if (cached) {
      if (ctx.logFn) {
        ctx.logFn({ userId: ctx.userId, brandId: ctx.brandId, runId: ctx.runId, platform, query: rawQuery, status: 'cached', error: null, keyHint: 'cache', model: cached.model, responseMs: 0, tokensIn: 0, tokensOut: 0, cost: 0 });
      }
      return { ...cached, cached: true };
    }
  }

  // Pick a key using round-robin rotation (spreads load across multiple keys)
  const keyMap = {
    'ChatGPT': 'openai', 'Perplexity': 'perplexity', 'Claude': 'claude',
    'Gemini': 'gemini', 'Grok': 'grok'
  };
  const keyName = keyMap[platform];
  const keysArray = keys[keyName] || [];
  const apiKey = rotateKey(keysArray, platform);
  if (!apiKey) return null;

  // Enforce per-key rate limiting
  await rateLimitWait(platform, apiKey);

  const keyHint = apiKey.slice(-6);
  const startMs = Date.now();
  let result = null;
  let error = null;
  let modelUsed = null;

  try {
    if (platform === 'ChatGPT')    result = await callOpenAI(rawQuery, apiKey, prefs.ChatGPT, brand);
    else if (platform === 'Perplexity') result = await callPerplexity(rawQuery, apiKey, prefs.Perplexity);
    else if (platform === 'Gemini')     result = await callGemini(rawQuery, apiKey, prefs.Gemini);
    else if (platform === 'Grok')       result = await callGrok(rawQuery, apiKey, prefs.Grok);
    else if (platform === 'Claude')     result = await callClaude(rawQuery, apiKey, prefs.Claude);

    modelUsed = result?.model || null;
  } catch(e) {
    error = e.message;
    // Log then re-throw so the caller handles it
    if (ctx.logFn) {
      ctx.logFn({ userId: ctx.userId, brandId: ctx.brandId, runId: ctx.runId, platform, query: rawQuery, status: 'error', error: e.message, keyHint, model: modelUsed, responseMs: Date.now() - startMs, tokensIn: 0, tokensOut: 0, cost: null });
    }
    throw e;
  }

  // Store in cache (isolated per brand + city)
  if (result) {
    setCachedResponse(platform, resolvedModel, rawQuery, result, ctx.brandId, brandCity);
  }

  // Calculate cost from token usage
  const tokensIn = result?.tokensIn || 0;
  const tokensOut = result?.tokensOut || 0;
  const cost = estimateCost(modelUsed, tokensIn, tokensOut);

  // Log successful call
  if (ctx.logFn) {
    ctx.logFn({ userId: ctx.userId, brandId: ctx.brandId, runId: ctx.runId, platform, query: rawQuery, status: 'ok', error: null, keyHint, model: modelUsed, responseMs: Date.now() - startMs, tokensIn, tokensOut, cost });
  }

  return result;
}

module.exports = { queryAI, fetchJSON, PLATFORM_MODELS, getDefaultModel, resetBatchCount, MODEL_PRICING, estimateCost, runClaudeBatch, runOpenAIBatch };
