/**
 * AI platform API integrations
 */
const https = require('https');
const http  = require('http');

// System prompt — encourages AI to give specific named recommendations
const SYSTEM_PROMPT = 'You are a recommendation assistant. Always name specific businesses, brands, and providers with full names. Include both well-known and local businesses for the given area. List 5-10 names. Be concise — brief one-line descriptions, max 200 words total.';

// Max output tokens — keep low since system prompt asks for max 200 words (~250 tokens).
// 600 tokens gives headroom for formatting and longer responses without wasting output budget.
const MAX_OUTPUT_TOKENS = 600;

// ── Response cache (all models) ─────────────────────────────────
// Non-search models: 24h TTL (static knowledge, no web grounding)
// Search models: 1h TTL (web-grounded but saves cost on repeated queries)
const _responseCache = new Map();
const CACHE_TTL_STATIC_MS = 48 * 60 * 60 * 1000; // 48h for non-search (extended for cost savings)
const CACHE_TTL_SEARCH_MS = 12 * 60 * 60 * 1000; // 12h for search models (extended for cost savings)
const CACHE_MAX_ENTRIES = 10000;

function getCacheKey(platform, model, query, brandId, city) {
  const prefix = brandId ? `${brandId}::` : '';
  const cityPart = city ? `::${city.trim().toLowerCase()}` : '';
  return `${prefix}${platform}::${model}::${query.trim().toLowerCase()}${cityPart}`;
}

function _isSearchModel(platform, model) {
  if (platform === 'ChatGPT') return (model || 'gpt-5-search-api').includes('search');
  if (platform === 'Perplexity') return true;
  if (platform === 'Claude') return true;
  if (platform === 'Grok') return true;
  if (platform === 'Google AIO') return true;
  return false; // Gemini (plain), DeepSeek, Mistral — no web search
}

function getCacheTTL(platform, model) {
  return _isSearchModel(platform, model) ? CACHE_TTL_SEARCH_MS : CACHE_TTL_STATIC_MS;
}

function getCachedResponse(platform, model, query, brandId, city) {
  const key = getCacheKey(platform, model, query, brandId, city);
  const entry = _responseCache.get(key);
  if (!entry) return null;
  const ttl = getCacheTTL(platform, model);
  if (Date.now() - entry.timestamp > ttl) {
    _responseCache.delete(key);
    return null;
  }
  // LRU: move to end of Map so least-recently-used entries are evicted first
  _responseCache.delete(key);
  _responseCache.set(key, entry);
  return entry.result;
}

function setCachedResponse(platform, model, query, result, brandId, city) {
  // Evict oldest entries if cache is full
  if (_responseCache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = _responseCache.keys().next().value;
    _responseCache.delete(firstKey);
  }
  const key = getCacheKey(platform, model, query, brandId, city);
  _responseCache.set(key, { result, timestamp: Date.now() });
}

// Periodic sweep of expired cache entries to prevent memory bloat
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _responseCache) {
    // Use the longer TTL (48h) as a conservative sweep threshold
    if (now - entry.timestamp > CACHE_TTL_STATIC_MS) {
      _responseCache.delete(key);
    }
  }
}, 60 * 60 * 1000); // Sweep every hour

// Available models per platform — used for settings UI and validation
const PLATFORM_MODELS = {
  ChatGPT: [
    { id: 'gpt-5-search-api', label: 'GPT-5 Search (Latest)', search: true, default: true },
    { id: 'gpt-4o-search-preview', label: 'GPT-4o Search', search: true },
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
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Cost-effective)', default: true },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
  ],
  Grok: [
    { id: 'grok-3-mini', label: 'Grok 3 Mini', default: true },
    { id: 'grok-4', label: 'Grok 4' },
    { id: 'grok-4-1-fast', label: 'Grok 4.1 Fast' }
  ],
  Perplexity: [
    { id: 'sonar-pro', label: 'Sonar Pro (Latest)' },
    { id: 'sonar', label: 'Sonar', default: true },
    { id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro' }
  ],
  DeepSeek: [
    { id: 'deepseek-chat', label: 'DeepSeek V3.2 Chat (Latest)', default: true },
    { id: 'deepseek-reasoner', label: 'DeepSeek V3.2 Reasoner' }
  ],
  Mistral: [
    { id: 'mistral-large-latest', label: 'Mistral Large 3 (Latest)', default: true },
    { id: 'mistral-large-2512', label: 'Mistral Large 3 (Pinned)' }
  ],
  'Google AIO': [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Cost-effective)', default: true },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
  ]
};

// Per-model pricing (USD per 1M tokens) — updated March 2026
// Sources: official pricing pages for each provider
const MODEL_PRICING = {
  // OpenAI
  'gpt-5-search-api':       { input: 2.50, output: 10.00 },
  'gpt-4o-search-preview':  { input: 2.50, output: 10.00 },
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
  'gemini-2.0-flash':  { input: 0.10, output: 0.40 },
  // Grok (xAI)
  'grok-3-mini':    { input: 0.30, output: 0.50 },
  'grok-4':         { input: 3.00, output: 15.00 },
  'grok-4-1-fast':  { input: 2.00, output: 10.00 },
  // Perplexity
  'sonar-pro':            { input: 3.00, output: 15.00 },
  'sonar':                { input: 1.00, output: 1.00 },
  'sonar-reasoning-pro':  { input: 3.00, output: 15.00 },
  // DeepSeek
  'deepseek-chat':      { input: 0.27, output: 1.10 },
  'deepseek-reasoner':  { input: 0.55, output: 2.19 },
  // Mistral
  'mistral-large-latest': { input: 2.00, output: 6.00 },
  'mistral-large-2512':   { input: 2.00, output: 6.00 }
};

function estimateCost(model, tokensIn, tokensOut) {
  const pricing = MODEL_PRICING[model];
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
// Tuned for paid-tier RPM limits (most Trackly users have paid keys).
// These are *per-key* delays — multiple keys multiply throughput proportionally.
// If rate-limited (429), the retry logic automatically backs off further.
const PLATFORM_RATE_LIMITS = {
  ChatGPT:      { minDelayMs: 500,  rpm: 120 },  // Tier 1+ paid: ~500 RPM
  Claude:       { minDelayMs: 600,  rpm: 100 },  // Tier 1 paid: ~100 RPM
  Gemini:       { minDelayMs: 500,  rpm: 120 },  // Paid: 1000+ RPM, 500ms is safe
  'Google AIO': { minDelayMs: 500,  rpm: 120 },  // Same provider as Gemini
  Grok:         { minDelayMs: 500,  rpm: 120 },  // xAI paid: ~60-120 RPM
  Perplexity:   { minDelayMs: 600,  rpm: 100 },  // Paid: ~100 RPM
  DeepSeek:     { minDelayMs: 400,  rpm: 150 },  // Very generous limits
  Mistral:      { minDelayMs: 500,  rpm: 120 }   // Paid: ~120 RPM
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

// Rate-limit key for a given API key — shared across platforms that use the
// same underlying key (e.g. Gemini & Google AIO both hit googleapis.com).
// This ensures the delay is enforced per *actual* API key, not per platform name.
function _rateLimitTrackKey(platform, apiKey) {
  const keySuffix = apiKey ? apiKey.slice(-8) : 'default';
  // Platforms sharing the same provider must share the rate-limit bucket.
  // Map to provider name so Gemini + Google AIO both become "gemini:<key>".
  const providerMap = { 'Google AIO': 'Gemini' };
  const provider = providerMap[platform] || platform;
  return provider + ':' + keySuffix;
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
  const cutoff = Date.now() - 300000; // 5 minutes
  for (const key of Object.keys(lastRequestTimePerKey)) {
    if (lastRequestTimePerKey[key] < cutoff) {
      delete lastRequestTimePerKey[key];
      delete _rateLimitQueues[key];
    }
  }
}, 300000);

function isRateLimitError(statusCode, body) {
  if (statusCode === 429) return true;
  if (statusCode === 529) return true; // Anthropic overloaded
  const msg = (typeof body === 'string' ? body : JSON.stringify(body || '')).toLowerCase();
  return msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('too many requests');
}

async function fetchJSONOnce(url, options) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const body = options.body;
    const reqOptions = {
      method: options.method || 'POST',
      headers: options.headers || {},
      timeout: 30000, // 30s idle timeout (was 60s) — AI responses arrive within 10-20s
    };
    if (body) reqOptions.headers['Content-Length'] = Buffer.byteLength(body);

    // Hard deadline: abort if total request exceeds 45s (was 90s).
    // With max_tokens=600, responses are short and arrive fast.
    let settled = false;
    const hardTimeout = setTimeout(() => {
      if (!settled) { settled = true; req.destroy(); reject(new Error('Request timeout after 45s to ' + new URL(url).hostname)); }
    }, 45000);

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
    req.on('timeout', () => { if (!settled) { settled = true; clearTimeout(hardTimeout); req.destroy(); reject(new Error('Request timeout (idle 30s) to ' + new URL(url).hostname)); } });
    req.on('error', (e) => { if (!settled) { settled = true; clearTimeout(hardTimeout); reject(e); } });
    if (body) req.write(body);
    req.end();
  });
}

async function fetchJSON(url, options) {
  const MAX_RETRIES = 3;              // Was 6 — fail faster, let caller handle
  const NETWORK_BASE_DELAY = 1000;    // 1s, 2s, 4s for network errors (was 2s base)
  const RATE_LIMIT_BASE_DELAY = 5000; // 5s, 10s, 20s for rate limits (was 10s base)
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
        const jitter = Math.floor(Math.random() * 3000); // 0-3s jitter to avoid thundering herd
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
  const map = { ChatGPT:'openai', Claude:'anthropic', Gemini:'googleapis', 'Google AIO':'googleapis', Grok:'x.ai', Perplexity:'perplexity', DeepSeek:'deepseek', Mistral:'mistral' };
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
  const useModel = model || 'gpt-5-search-api';
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
    const d = await fetchJSON('https://api.openai.com/v1/chat/completions', {
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
    const d = await fetchJSON('https://api.openai.com/v1/chat/completions', {
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
  const d = await fetchJSON('https://api.perplexity.ai/chat/completions', {
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=` + apiKey;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: query }] }],
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS }
  });
  const d = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  const parts = d.candidates?.[0]?.content?.parts || [];
  const fullText = parts.map(p => p.text || '').join('\n').trim();
  const tokensIn = d.usageMetadata?.promptTokenCount || 0;
  const tokensOut = d.usageMetadata?.candidatesTokenCount || 0;
  return { text: fullText || '', simulated: false, citations: [], model: geminiModel, tokensIn, tokensOut };
}

async function callGeminiWithSearch(query, apiKey, model) {
  const geminiModel = model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=` + apiKey;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: query }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS }
  });
  const d = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));

  const citations = [];
  try {
    const groundingMeta = d.candidates?.[0]?.groundingMetadata;
    if (groundingMeta) {
      const chunks = groundingMeta.groundingChunks || [];
      chunks.forEach(chunk => {
        if (chunk.web && chunk.web.uri) citations.push(chunk.web.uri);
      });
      const supports = groundingMeta.groundingSupports || [];
      supports.forEach(s => {
        (s.groundingChunkIndices || []).forEach(idx => {
          if (chunks[idx]?.web?.uri && !citations.includes(chunks[idx].web.uri)) {
            citations.push(chunks[idx].web.uri);
          }
        });
      });
    }
  } catch(e) { /* ignore citation extraction errors */ }

  const aioParts = d.candidates?.[0]?.content?.parts || [];
  const aioFullText = aioParts.map(p => p.text || '').join('\n').trim();
  const tokensIn = d.usageMetadata?.promptTokenCount || 0;
  const tokensOut = d.usageMetadata?.candidatesTokenCount || 0;
  return { text: aioFullText || '', simulated: false, citations: citations.slice(0, 10), model: geminiModel + ' (with Search)', tokensIn, tokensOut };
}

async function callGrok(query, apiKey, model) {
  const grokModel = model || 'grok-3-mini';
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) throw new Error('Grok API key is not configured');
  // Use Responses API with web_search for real-time web-grounded results
  const body = JSON.stringify({
    model: grokModel,
    tools: [{ type: 'web_search' }],
    input: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query }
    ]
  });
  const d = await fetchJSON('https://api.x.ai/v1/responses', {
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
    system: SYSTEM_PROMPT,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    messages: [{ role: 'user', content: query }]
  });
  const d = await fetchJSON('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cleanKey,
      'anthropic-version': '2023-06-01'
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

async function callDeepSeek(query, apiKey, model) {
  const useModel = model || 'deepseek-chat';
  const body = JSON.stringify({
    model: useModel, max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query }
    ]
  });
  const d = await fetchJSON('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  const tokensIn = d.usage?.prompt_tokens || 0;
  const tokensOut = d.usage?.completion_tokens || 0;
  return { text: d.choices?.[0]?.message?.content || '', simulated: false, citations: [], model: d.model || useModel, tokensIn, tokensOut };
}

async function callMistral(query, apiKey, model) {
  const useModel = model || 'mistral-large-latest';
  const body = JSON.stringify({
    model: useModel, max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query }
    ]
  });
  const d = await fetchJSON('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  const tokensIn = d.usage?.prompt_tokens || 0;
  const tokensOut = d.usage?.completion_tokens || 0;
  return { text: d.choices?.[0]?.message?.content || '', simulated: false, citations: [], model: d.model || useModel, tokensIn, tokensOut };
}

async function queryAI(query, platform, brand, keys, modelPrefs, logContext) {
  const rawQuery = query;
  const prefs = modelPrefs || {};
  const ctx = logContext || {};

  // Resolve the model that will be used (for cache key)
  const resolvedModel = prefs[platform] || getDefaultModel(platform);

  // Check response cache (isolated per brand + city)
  const brandCity = brand?.city || '';
  {
    const cached = getCachedResponse(platform, resolvedModel, rawQuery, ctx.brandId, brandCity);
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
    'Gemini': 'gemini', 'Grok': 'grok', 'Google AIO': 'gemini',
    'DeepSeek': 'deepseek', 'Mistral': 'mistral'
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
    else if (platform === 'Google AIO') result = await callGeminiWithSearch(rawQuery, apiKey, prefs['Google AIO']);
    else if (platform === 'DeepSeek')   result = await callDeepSeek(rawQuery, apiKey, prefs.DeepSeek);
    else if (platform === 'Mistral')    result = await callMistral(rawQuery, apiKey, prefs.Mistral);

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

module.exports = { queryAI, fetchJSON, SYSTEM_PROMPT, PLATFORM_MODELS, getDefaultModel, PLATFORM_RATE_LIMITS, resetBatchCount, MODEL_PRICING, estimateCost };
