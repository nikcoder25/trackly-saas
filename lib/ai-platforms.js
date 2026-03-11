/**
 * AI platform API integrations
 */
const https = require('https');
const http  = require('http');

// System prompt — encourages AI to give specific named recommendations
const SYSTEM_PROMPT = 'You are a helpful recommendation assistant. When asked about businesses, services, or products, always provide specific company names, brands, or providers. Never say you cannot provide recommendations. Give concrete, named suggestions based on your knowledge. If asked about a specific location, name real businesses in that area.';

async function fetchJSON(url, options) {
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
        try { resolve(JSON.parse(data)); }
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

async function callOpenAI(query, apiKey, model) {
  const useModel = model || 'gpt-4o';
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

async function callPerplexity(query, apiKey) {
  const body = JSON.stringify({
    model: 'sonar-pro',
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
    model: d.model || 'sonar-pro'
  };
}

async function callGemini(query, apiKey) {
  const geminiModel = 'gemini-2.0-flash';
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

async function callGeminiWithSearch(query, apiKey) {
  const geminiModel = 'gemini-2.0-flash';
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

async function callGrok(query, apiKey) {
  const grokModel = 'grok-3-mini';
  const body = JSON.stringify({
    model: grokModel,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query }
    ]
  });
  const d = await fetchJSON('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  if (!d.choices || !d.choices[0]) throw new Error('Grok API returned empty response');
  return { text: d.choices[0].message.content || '', simulated: false, citations: [], model: d.model || grokModel };
}

async function callClaude(query, apiKey) {
  const claudeModel = 'claude-sonnet-4-20250514';
  const body = JSON.stringify({
    model: claudeModel,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: query }]
  });
  const d = await fetchJSON('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body
  });
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  const claudeText = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
  return { text: claudeText || '', simulated: false, citations: [], model: d.model || claudeModel };
}

async function callDeepSeek(query, apiKey) {
  const model = 'deepseek-chat';
  const body = JSON.stringify({
    model, max_tokens: 4000,
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
  return { text: d.choices?.[0]?.message?.content || '', simulated: false, citations: [], model: d.model || model };
}

async function callMistral(query, apiKey) {
  const model = 'mistral-large-latest';
  const body = JSON.stringify({
    model, max_tokens: 4000,
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
  return { text: d.choices?.[0]?.message?.content || '', simulated: false, citations: [], model: d.model || model };
}

async function queryAI(query, platform, brand, keys) {
  const rawQuery = query;

  if (platform === 'ChatGPT' && keys.openai)    return await callOpenAI(rawQuery, keys.openai, 'gpt-4o');
  if (platform === 'Perplexity' && keys.perplexity) return await callPerplexity(rawQuery, keys.perplexity);
  if (platform === 'Gemini' && keys.gemini)      return await callGemini(rawQuery, keys.gemini);
  if (platform === 'Grok' && keys.grok)          return await callGrok(rawQuery, keys.grok);
  if (platform === 'Claude' && keys.claude)      return await callClaude(rawQuery, keys.claude);
  if (platform === 'Google AIO' && keys.gemini)  return await callGeminiWithSearch(rawQuery, keys.gemini);
  if (platform === 'DeepSeek' && keys.deepseek)  return await callDeepSeek(rawQuery, keys.deepseek);
  if (platform === 'Mistral' && keys.mistral)    return await callMistral(rawQuery, keys.mistral);

  return null;
}

module.exports = { queryAI, fetchJSON, SYSTEM_PROMPT };
