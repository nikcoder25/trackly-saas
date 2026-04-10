/**
 * AI platform API integrations - ported from Express app
 */

const SYSTEM_PROMPT = 'Recommendation assistant. Name specific businesses/brands with full names. List 5-10 with brief descriptions. Max 200 words.';
const MAX_OUTPUT_TOKENS = 300;

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
    { id: 'gpt-4o-mini-search-preview', label: 'GPT-4o Mini Search', search: true, default: true },
    { id: 'gpt-4o', label: 'GPT-4o (No search)' },
  ],
  Claude: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', default: true },
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  ],
  Gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', default: true },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
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

interface QueryResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  citations: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAI(url: string, options: RequestInit, timeoutMs = 60000): Promise<any> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { ...options, signal: controller.signal });
      if (resp.status === 429) {
        clearTimeout(timer);
        if (attempt < MAX_RETRIES) {
          // Exponential backoff: 2s, 4s, 8s + jitter
          const delay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new Error('Rate limited (429) — retries exhausted');
      }
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error?.message || `API error ${resp.status}`);
      return data;
    } catch (e) {
      clearTimeout(timer);
      if ((e as Error).message?.includes('Rate limited') && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function queryAI(platform: string, query: string, apiKey: string, model?: string, brand?: any, options?: { systemPrompt?: string; maxTokens?: number; jsonMode?: boolean }): Promise<QueryResult> {
  const useModel = model || getDefaultModel(platform);
  const sysPrompt = options?.systemPrompt ?? SYSTEM_PROMPT;
  const maxTok = options?.maxTokens ?? MAX_OUTPUT_TOKENS;

  if (platform === 'ChatGPT') {
    const isSearch = useModel.includes('search');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      model: useModel, max_tokens: maxTok,
      messages: isSearch ? [{ role: 'user', content: query }] : [{ role: 'system', content: sysPrompt }, { role: 'user', content: query }],
    };
    if (isSearch) {
      payload.web_search_options = {};
      if (brand?.city) payload.web_search_options.user_location = { type: 'approximate', approximate: { city: brand.city, country: 'US' } };
    }
    const d = await fetchAI(API_ENDPOINTS.openai.chat, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    const citations = (d.choices?.[0]?.message?.annotations || []).filter((a: { type: string; url?: string }) => a.type === 'url_citation' && a.url).map((a: { url: string }) => a.url);
    return { text: d.choices?.[0]?.message?.content || '', model: d.model || useModel, tokensIn: d.usage?.prompt_tokens || 0, tokensOut: d.usage?.completion_tokens || 0, citations: [...new Set(citations)].slice(0, 10) as string[] };
  }

  if (platform === 'Claude') {
    const d = await fetchAI(API_ENDPOINTS.claude.messages, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: useModel, max_tokens: maxTok, system: sysPrompt, messages: [{ role: 'user', content: query }] }),
    });
    return { text: d.content?.[0]?.text || '', model: d.model || useModel, tokensIn: d.usage?.input_tokens || 0, tokensOut: d.usage?.output_tokens || 0, citations: [] };
  }

  if (platform === 'Gemini') {
    const url = `${API_ENDPOINTS.gemini.base}${useModel}:generateContent`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geminiPayload: any = {
      systemInstruction: { parts: [{ text: sysPrompt }] },
      contents: [{ parts: [{ text: query }] }],
      generationConfig: { maxOutputTokens: maxTok },
    };
    if (options?.jsonMode) {
      geminiPayload.generationConfig.responseMimeType = 'application/json';
    }
    const d = await fetchAI(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(geminiPayload),
    });
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { text, model: useModel, tokensIn: d.usageMetadata?.promptTokenCount || 0, tokensOut: d.usageMetadata?.candidatesTokenCount || 0, citations: [] };
  }

  if (platform === 'Perplexity') {
    const d = await fetchAI(API_ENDPOINTS.perplexity.chat, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: useModel, max_tokens: maxTok, return_citations: true, messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: query }] }),
    });
    const citations = d.citations || [];
    return { text: d.choices?.[0]?.message?.content || '', model: d.model || useModel, tokensIn: d.usage?.prompt_tokens || 0, tokensOut: d.usage?.completion_tokens || 0, citations };
  }

  if (platform === 'Grok') {
    const d = await fetchAI(API_ENDPOINTS.grok.chat, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: useModel, max_tokens: maxTok, messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: query }] }),
    });
    return { text: d.choices?.[0]?.message?.content || '', model: d.model || useModel, tokensIn: d.usage?.prompt_tokens || 0, tokensOut: d.usage?.completion_tokens || 0, citations: [] };
  }

  throw new Error(`Unknown platform: ${platform}`);
}
