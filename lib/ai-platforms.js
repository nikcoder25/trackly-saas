/**
 * AI platform API integrations
 */
const https = require('https');
const http  = require('http');

// System prompt — encourages AI to give specific named recommendations
const SYSTEM_PROMPT = 'You are a helpful recommendation assistant. When asked about businesses, services, or products, always provide specific company names, brands, or providers with their full business names. Never say you cannot provide recommendations or that you lack information. Give concrete, named suggestions based on your knowledge. If asked about a specific location, name real local businesses, contractors, and companies that operate in that area. Include both well-known and smaller local businesses. Always aim to list at least 5-10 specific business names.';

// Available models per platform — used for settings UI and validation
const PLATFORM_MODELS = {
  ChatGPT: [
    { id: 'gpt-5-search-api', label: 'GPT-5 Search (Latest)', search: true, default: true },
    { id: 'gpt-4o-search-preview', label: 'GPT-4o Search', search: true },
    { id: 'gpt-5.4', label: 'GPT-5.4 (No search)', search: false },
    { id: 'gpt-4o', label: 'GPT-4o (No search)', search: false }
  ],
  Claude: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', default: true },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }
  ],
  Gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Latest)', default: true },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' }
  ],
  Grok: [
    { id: 'grok-3-mini', label: 'Grok 3 Mini', default: true },
    { id: 'grok-4', label: 'Grok 4' },
    { id: 'grok-4-1-fast', label: 'Grok 4.1 Fast' }
  ],
  Perplexity: [
    { id: 'sonar-pro', label: 'Sonar Pro (Latest)', default: true },
    { id: 'sonar', label: 'Sonar' },
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
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Latest)', default: true },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
  ]
};

function getDefaultModel(platform) {
  const models = PLATFORM_MODELS[platform];
  if (!models) return null;
  const def = models.find(m => m.default);
  return def ? def.id : models[0].id;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
      timeout: 45000,
    };
    if (body) reqOptions.headers['Content-Length'] = Buffer.byteLength(body);

    const req = lib.request(url, reqOptions, (res) => {
      res.setEncoding('utf8');
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { reject(new Error('Invalid JSON response from ' + new URL(url).hostname + ': ' + data.substring(0, 200))); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout after 45s to ' + new URL(url).hostname)); });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Response timeout after 60s to ' + new URL(url).hostname)); });
    if (body) req.write(body);
    req.end();
  });
}

async function fetchJSON(url, options) {
  const MAX_RETRIES = 3;
  const BASE_DELAY = 2000; // 2s, 4s, 8s

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { statusCode, data } = await fetchJSONOnce(url, options);

    if (isRateLimitError(statusCode, data)) {
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, attempt);
        console.log(`[Rate limit] ${new URL(url).hostname} - retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
    }
    return data;
  }
}

async function callOpenAI(query, apiKey, model, brand) {
  const useModel = model || 'gpt-5-search-api';
  const isSearchModel = useModel.includes('search');

  if (isSearchModel) {
    // Search-enabled model — use web_search_options for real-time results
    const payload = {
      model: useModel, max_tokens: 4000,
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
    return { text: d.choices?.[0]?.message?.content || '', simulated: false, citations: [...new Set(citations)].slice(0, 10), model: d.model || useModel };
  } else {
    // Standard model — use system prompt
    const body = JSON.stringify({
      model: useModel, max_tokens: 4000,
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
    return { text: d.choices?.[0]?.message?.content || '', simulated: false, citations: [], model: d.model || useModel };
  }
}

async function callPerplexity(query, apiKey, model) {
  const useModel = model || 'sonar-pro';
  const body = JSON.stringify({
    model: useModel,
    max_tokens: 4000,
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
  return {
    text: d.choices?.[0]?.message?.content || '',
    simulated: false,
    citations: (d.citations || []).slice(0, 10),
    model: d.model || useModel
  };
}

async function callGemini(query, apiKey, model) {
  const geminiModel = model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=` + apiKey;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: query }] }],
    generationConfig: { maxOutputTokens: 4000 }
  });
  const d = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  const parts = d.candidates?.[0]?.content?.parts || [];
  const fullText = parts.map(p => p.text || '').join('\n').trim();
  return { text: fullText || '', simulated: false, citations: [], model: geminiModel };
}

async function callGeminiWithSearch(query, apiKey, model) {
  const geminiModel = model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=` + apiKey;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: query }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 4000 }
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
  return { text: aioFullText || '', simulated: false, citations: citations.slice(0, 10), model: geminiModel + ' (with Search)' };
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
  return { text: text.trim(), simulated: false, citations: [...new Set(citations)].slice(0, 10), model: d.model || grokModel };
}

async function callClaude(query, apiKey, model) {
  const claudeModel = model || 'claude-sonnet-4-20250514';
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) throw new Error('Claude API key is not configured');
  const body = JSON.stringify({
    model: claudeModel,
    max_tokens: 4000,
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
  return { text: claudeText || '', simulated: false, citations: [...new Set(citations)].slice(0, 10), model: d.model || claudeModel };
}

async function callDeepSeek(query, apiKey, model) {
  const useModel = model || 'deepseek-chat';
  const body = JSON.stringify({
    model: useModel, max_tokens: 4000,
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
  return { text: d.choices?.[0]?.message?.content || '', simulated: false, citations: [], model: d.model || useModel };
}

async function callMistral(query, apiKey, model) {
  const useModel = model || 'mistral-large-latest';
  const body = JSON.stringify({
    model: useModel, max_tokens: 4000,
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
  return { text: d.choices?.[0]?.message?.content || '', simulated: false, citations: [], model: d.model || useModel };
}

async function queryAI(query, platform, brand, keys, modelPrefs) {
  const rawQuery = query;
  const prefs = modelPrefs || {};

  if (platform === 'ChatGPT' && keys.openai)    return await callOpenAI(rawQuery, keys.openai, prefs.ChatGPT, brand);
  if (platform === 'Perplexity' && keys.perplexity) return await callPerplexity(rawQuery, keys.perplexity, prefs.Perplexity);
  if (platform === 'Gemini' && keys.gemini)      return await callGemini(rawQuery, keys.gemini, prefs.Gemini);
  if (platform === 'Grok' && keys.grok)          return await callGrok(rawQuery, keys.grok, prefs.Grok);
  if (platform === 'Claude' && keys.claude)      return await callClaude(rawQuery, keys.claude, prefs.Claude);
  if (platform === 'Google AIO' && keys.gemini)  return await callGeminiWithSearch(rawQuery, keys.gemini, prefs['Google AIO']);
  if (platform === 'DeepSeek' && keys.deepseek)  return await callDeepSeek(rawQuery, keys.deepseek, prefs.DeepSeek);
  if (platform === 'Mistral' && keys.mistral)    return await callMistral(rawQuery, keys.mistral, prefs.Mistral);

  return null;
}

module.exports = { queryAI, fetchJSON, SYSTEM_PROMPT, PLATFORM_MODELS, getDefaultModel };
