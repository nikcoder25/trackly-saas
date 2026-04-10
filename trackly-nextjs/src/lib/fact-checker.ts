/**
 * AI-powered fact-checking utility
 * Analyzes AI platform responses against canonical brand facts
 * Uses the cheapest available AI model to minimize cost
 */

const API_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  claude: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models/',
};

// Platform search URLs for verifying inaccuracies directly
const PLATFORM_SEARCH_URLS: Record<string, string> = {
  Perplexity: 'https://www.perplexity.ai/search?q=',
  ChatGPT: 'https://chatgpt.com/?q=',
  Claude: 'https://claude.ai/new?q=',
  Gemini: 'https://gemini.google.com/app?q=',
  Grok: 'https://x.com/i/grok?text=',
};

// Prefer cheaper models for fact-checking
const CHECKER_MODELS = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  claude: 'claude-haiku-4-5-20251001',
};

interface CanonicalFact {
  key: string;
  value: string;
  category: string;
}

export interface FactCheckIssue {
  platform: string;
  model: string;
  fact_key: string;
  expected: string;
  found: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  date: string;
  category: string;
  explanation: string;
  run_id: string;
  source_url: string;
  query: string;
  count: number;
}

export interface FactCheckResult {
  issues: FactCheckIssue[];
  checkedRuns: number;
  accuracyRate: number;
  platformStats: Record<string, { total: number; accurate: number }>;
  categoryStats: Record<string, { total: number; accurate: number }>;
  error?: string;
}

interface PromptRun {
  id: string;
  platform: string;
  model: string;
  response_raw: string;
  created_at: string;
  prompt: string;
  citations: string[];
}

function parseKeys(envVar: string): string[] {
  const keys: string[] = [];
  const raw = (process.env[envVar] || '').trim();
  if (raw) raw.split(',').map(k => k.trim()).filter(k => k.length > 0).forEach(k => keys.push(k));
  for (let i = 1; i <= 10; i++) {
    const numbered = (process.env[envVar + '_' + i] || '').trim();
    if (numbered) keys.push(numbered);
  }
  return [...new Set(keys)];
}

function getAvailableChecker(userKeys?: Record<string, string | null>): { type: 'gemini' | 'openai' | 'claude'; key: string; model: string } | null {
  // Prefer Gemini (cheapest), then OpenAI, then Claude
  // Check server env vars first, then fall back to user-provided API keys
  const geminiKeys = parseKeys('GEMINI_API_KEY');
  if (geminiKeys.length) return { type: 'gemini', key: geminiKeys[0], model: CHECKER_MODELS.gemini };

  const openaiKeys = parseKeys('OPENAI_API_KEY');
  if (openaiKeys.length) return { type: 'openai', key: openaiKeys[0], model: CHECKER_MODELS.openai };

  const claudeKeys = parseKeys('CLAUDE_API_KEY');
  if (claudeKeys.length) return { type: 'claude', key: claudeKeys[0], model: CHECKER_MODELS.claude };

  // Fall back to user-configured keys from database
  if (userKeys) {
    if (userKeys.gemini) return { type: 'gemini', key: userKeys.gemini, model: CHECKER_MODELS.gemini };
    if (userKeys.openai) return { type: 'openai', key: userKeys.openai, model: CHECKER_MODELS.openai };
    if (userKeys.claude) return { type: 'claude', key: userKeys.claude, model: CHECKER_MODELS.claude };
  }

  return null;
}

function buildFactCheckPrompt(facts: CanonicalFact[], responseText: string, platform: string): string {
  const factsList = facts.map(f => `- ${f.key} (${f.category}): "${f.value}"`).join('\n');

  return `You are a strict fact-checking assistant. Analyze the following AI-generated response and check it against the canonical facts provided.

CANONICAL FACTS (these are the ground truth):
${factsList}

AI RESPONSE (from ${platform}):
"""
${responseText.slice(0, 3000)}
"""

For each canonical fact, determine if the AI response:
1. Mentions the topic and gets it RIGHT → mark as "accurate"
2. Mentions the topic but gets it WRONG → mark as "inaccurate" with what was found
3. Does NOT mention the topic at all → mark as "not_mentioned"

IMPORTANT — Avoid false positives. These are NOT inaccuracies:
- Minor punctuation differences (periods, commas, hyphens): "C Brooks" vs "C. Brooks" → accurate
- Case differences: "c brooks paving" vs "C. Brooks Paving" → accurate
- Truncated but correct values: "480 Old B..." or "A family-owned busi..." → accurate (the start matches)
- Semantically equivalent wording: "Family-owned business" vs "A family-owned business" → accurate
- Abbreviations: "TX" vs "Texas", "St" vs "Street" → accurate
- Minor word order changes that preserve meaning → accurate
- Extra context added but core fact correct: "Founded in 2009 in Austin" when fact is "2009" → accurate

Only flag as "inaccurate" if the information is genuinely WRONG or MISLEADING — the core factual claim must be incorrect.

Respond ONLY with valid JSON array. Each item must have:
- "fact_key": the exact fact key name from the CANONICAL FACTS list above (use the key before the parentheses, e.g. "company_name" not "company_name (company)")
- "status": "accurate" | "inaccurate" | "not_mentioned"
- "found": what the AI actually said (empty string if not mentioned or accurate)
- "severity": "critical" | "high" | "medium" | "low" (only for inaccurate items — critical for completely wrong core facts like wrong company name/wrong founding year, high for wrong numbers/prices, medium for partial errors, low for truly minor differences)
- "explanation": brief explanation of the finding

Example response:
[{"fact_key":"founded_year","status":"inaccurate","found":"2015","severity":"high","explanation":"Response states company was founded in 2015, but actual founding year is 2009"},{"fact_key":"ceo","status":"accurate","found":"","severity":"low","explanation":"CEO name mentioned correctly"},{"fact_key":"phone","status":"not_mentioned","found":"","severity":"low","explanation":"Phone number was not discussed in the response"}]

Return ONLY the JSON array, no markdown, no extra text.`;
}

async function callChecker(
  checker: { type: 'gemini' | 'openai' | 'claude'; key: string; model: string },
  prompt: string
): Promise<string> {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    try {
      if (checker.type === 'openai') {
        const resp = await fetch(API_ENDPOINTS.openai, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${checker.key}` },
          body: JSON.stringify({
            model: checker.model,
            max_tokens: 4096,
            temperature: 0,
            messages: [{ role: 'user', content: prompt }],
          }),
          signal: controller.signal,
        });
        const d = await resp.json();
        if (!resp.ok) {
          const msg = d.error?.message || `OpenAI API error ${resp.status}`;
          if ((resp.status === 429 || resp.status >= 500) && attempt < MAX_RETRIES) {
            console.warn(`[FactChecker] OpenAI transient error (attempt ${attempt + 1}): ${msg}`);
            await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
            continue;
          }
          throw new Error(msg);
        }
        return d.choices?.[0]?.message?.content || '';
      }

      if (checker.type === 'claude') {
        const resp = await fetch(API_ENDPOINTS.claude, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': checker.key,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: checker.model,
            max_tokens: 4096,
            temperature: 0,
            messages: [{ role: 'user', content: prompt }],
          }),
          signal: controller.signal,
        });
        const d = await resp.json();
        if (!resp.ok) {
          const msg = d.error?.message || `Claude API error ${resp.status}`;
          if ((resp.status === 429 || resp.status >= 500) && attempt < MAX_RETRIES) {
            console.warn(`[FactChecker] Claude transient error (attempt ${attempt + 1}): ${msg}`);
            await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
            continue;
          }
          throw new Error(msg);
        }
        return d.content?.[0]?.text || '';
      }

      if (checker.type === 'gemini') {
        const url = `${API_ENDPOINTS.gemini}${checker.model}:generateContent`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': checker.key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 4096, temperature: 0 },
          }),
          signal: controller.signal,
        });
        const d = await resp.json();
        if (!resp.ok) {
          const msg = d.error?.message || `Gemini API error ${resp.status}`;
          const isTransient = resp.status === 429 || resp.status >= 500 || (msg && (msg.toLowerCase().includes('high demand') || msg.toLowerCase().includes('overloaded')));
          if (isTransient && attempt < MAX_RETRIES) {
            console.warn(`[FactChecker] Gemini transient error (attempt ${attempt + 1}): ${msg}`);
            await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
            continue;
          }
          throw new Error(msg);
        }
        // Handle 200 response with error in body (Gemini-specific)
        if (d.error) {
          const msg = d.error.message || JSON.stringify(d.error);
          const isTransient = msg.toLowerCase().includes('high demand') || msg.toLowerCase().includes('overloaded') || msg.toLowerCase().includes('resource exhausted');
          if (isTransient && attempt < MAX_RETRIES) {
            console.warn(`[FactChecker] Gemini transient body error (attempt ${attempt + 1}): ${msg}`);
            await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
            continue;
          }
          throw new Error(msg);
        }
        // Handle safety-blocked or empty responses
        if (d.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request: ${d.promptFeedback.blockReason}`);
        const candidate = d.candidates?.[0];
        if (candidate && candidate.finishReason === 'SAFETY') throw new Error('Gemini blocked the response due to safety filters');
        return candidate?.content?.parts?.[0]?.text || '';
      }

      return '';
    } catch (e) {
      clearTimeout(timer);
      if (attempt < MAX_RETRIES && (e as Error).name === 'AbortError') {
        console.warn(`[FactChecker] Request timed out (attempt ${attempt + 1}), retrying...`);
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Max retries exhausted for fact checker');
}

function parseCheckerResponse(raw: string): Array<{
  fact_key: string;
  status: 'accurate' | 'inaccurate' | 'not_mentioned';
  found: string;
  severity: string;
  explanation: string;
}> {
  try {
    // Extract JSON from response (handle markdown code blocks)
    let json = raw.trim();
    if (json.startsWith('```')) {
      json = json.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed;
    // Handle AI returning a JSON object wrapping the array (e.g. {"facts": [...]})
    if (parsed && typeof parsed === 'object') {
      for (const val of Object.values(parsed)) {
        if (Array.isArray(val) && val.length > 0) return val;
      }
    }
    return [];
  } catch {
    // Try to find JSON array in the response
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // Handle truncated JSON (missing closing bracket due to token limits)
        const truncated = match[0].replace(/,?\s*\{[^}]*$/, '') + ']';
        try {
          return JSON.parse(truncated);
        } catch {
          return [];
        }
      }
    }
    // Last resort: try adding a closing bracket if the response starts with [
    const arrayStart = raw.indexOf('[');
    if (arrayStart >= 0) {
      const truncated = raw.slice(arrayStart).replace(/,?\s*\{[^}]*$/, '') + ']';
      try {
        return JSON.parse(truncated);
      } catch {
        return [];
      }
    }
    return [];
  }
}

/**
 * Run AI-powered fact-checking on recent prompt runs
 */
export async function runFactCheck(
  facts: CanonicalFact[],
  runs: PromptRun[]
): Promise<FactCheckResult> {
  const checker = getAvailableChecker();

  if (!checker) {
    return {
      issues: [],
      checkedRuns: 0,
      accuracyRate: 100,
      platformStats: {},
      categoryStats: {},
      error: 'No AI API keys configured. Add GEMINI_API_KEY, OPENAI_API_KEY, or CLAUDE_API_KEY to your environment.',
    };
  }

  if (facts.length === 0 || runs.length === 0) {
    return {
      issues: [],
      checkedRuns: 0,
      accuracyRate: facts.length === 0 ? 100 : 100,
      platformStats: {},
      categoryStats: {},
    };
  }

  // Only check runs that have response text, limit to recent runs per platform
  const runsWithResponse = runs.filter(r => r.response_raw && r.response_raw.length > 20);
  const platformGroups: Record<string, PromptRun[]> = {};
  for (const run of runsWithResponse) {
    const p = run.platform || 'unknown';
    if (!platformGroups[p]) platformGroups[p] = [];
    platformGroups[p].push(run);
  }

  // Take up to 3 most recent runs per platform (to limit cost)
  const runsToCheck: PromptRun[] = [];
  for (const pRuns of Object.values(platformGroups)) {
    runsToCheck.push(...pRuns.slice(0, 3));
  }

  const allIssues: FactCheckIssue[] = [];
  const platformStats: Record<string, { total: number; accurate: number }> = {};
  const categoryStats: Record<string, { total: number; accurate: number }> = {};

  // Process runs concurrently (max 5 at a time)
  const batchSize = 5;
  for (let i = 0; i < runsToCheck.length; i += batchSize) {
    const batch = runsToCheck.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (run) => {
        const prompt = buildFactCheckPrompt(facts, run.response_raw, run.platform);
        const responseText = await callChecker(checker, prompt);
        const findings = parseCheckerResponse(responseText);
        return { run, findings };
      })
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { run, findings } = result.value;
      const platform = run.platform || 'unknown';

      if (!platformStats[platform]) platformStats[platform] = { total: 0, accurate: 0 };

      for (const finding of findings) {
        // Normalize key for lookup — AI may return slightly different casing/spacing
        const normalizeKey = (k: string) => k.toLowerCase().replace(/[\s-]+/g, '_').trim();
        const normalizedFindingKey = normalizeKey(finding.fact_key);
        const matchedFact = facts.find(f => normalizeKey(f.key) === normalizedFindingKey);
        const cat = matchedFact?.category || 'general';
        if (!categoryStats[cat]) categoryStats[cat] = { total: 0, accurate: 0 };

        if (finding.status === 'not_mentioned') continue; // Skip — no claim to check

        platformStats[platform].total++;
        categoryStats[cat].total++;

        if (finding.status === 'accurate') {
          platformStats[platform].accurate++;
          categoryStats[cat].accurate++;
        } else if (finding.status === 'inaccurate') {
          allIssues.push({
            platform,
            model: run.model,
            fact_key: matchedFact?.key || finding.fact_key,
            expected: matchedFact?.value || '',
            found: finding.found,
            severity: (['critical', 'high', 'medium', 'low'].includes(finding.severity)
              ? finding.severity
              : 'medium') as FactCheckIssue['severity'],
            date: run.created_at,
            category: cat,
            explanation: finding.explanation || '',
            run_id: run.id,
            source_url: (run.citations && run.citations.length > 0)
              ? run.citations[0]
              : (PLATFORM_SEARCH_URLS[platform]
                ? PLATFORM_SEARCH_URLS[platform] + encodeURIComponent(run.prompt)
                : ''),
            query: run.prompt,
            count: 1,
          });
        }
      }
    }
  }

  // Deduplicate: group by (fact_key + normalized found + platform)
  const deduped: FactCheckIssue[] = [];
  const seen = new Map<string, number>();
  for (const issue of allIssues) {
    const normFound = issue.found.toLowerCase().replace(/[.\s]+/g, ' ').trim();
    const dedupKey = `${issue.fact_key}|${normFound}|${issue.platform}`;
    const existingIdx = seen.get(dedupKey);
    if (existingIdx !== undefined) {
      deduped[existingIdx].count++;
      // Keep the most severe version
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      if (sevOrder[issue.severity] < sevOrder[deduped[existingIdx].severity]) {
        const count = deduped[existingIdx].count;
        deduped[existingIdx] = { ...issue, count };
      }
    } else {
      seen.set(dedupKey, deduped.length);
      deduped.push(issue);
    }
  }

  // Calculate overall accuracy
  const totalChecks = Object.values(platformStats).reduce((sum, s) => sum + s.total, 0);
  const totalAccurate = Object.values(platformStats).reduce((sum, s) => sum + s.accurate, 0);
  const accuracyRate = totalChecks > 0 ? Math.round((totalAccurate / totalChecks) * 100) : 100;

  // Sort issues: critical first, then high, etc.
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  deduped.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    issues: deduped,
    checkedRuns: runsToCheck.length,
    accuracyRate,
    platformStats,
    categoryStats,
  };
}

// ── Auto-Discover Facts ─────────────────────────────────────────

export interface SuggestedFact {
  key: string;
  value: string;
  category: string;
  source: 'website' | 'ai_responses';
  confidence: 'high' | 'medium' | 'low';
}

export interface AutoDiscoverResult {
  facts: SuggestedFact[];
  error?: string;
}

function isPrivateHostname(hostname: string): boolean {
  // Reject localhost and internal hostnames
  if (hostname === 'localhost' || hostname.includes('internal')) return true;
  // Check for IPv6 loopback
  if (hostname === '::1' || hostname === '[::1]') return true;
  // Check for private IPv4/IPv6 ranges
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every(p => !isNaN(p))) {
    if (parts[0] === 127) return true;                              // 127.0.0.0/8
    if (parts[0] === 10) return true;                               // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true;         // 192.168.0.0/16
    if (parts[0] === 169 && parts[1] === 254) return true;         // 169.254.0.0/16
    if (parts[0] === 0) return true;                                // 0.0.0.0/8
  }
  // Check for IPv6 private ranges (fc00::/7 includes fd00::/8)
  if (hostname.startsWith('fc') || hostname.startsWith('fd')) return true;
  return false;
}

async function fetchWebsiteText(url: string): Promise<string> {
  try {
    let fullUrl = url;
    if (!fullUrl.startsWith('http')) fullUrl = 'https://' + fullUrl;

    // SSRF protection: validate URL before fetching
    const parsed = new URL(fullUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (isPrivateHostname(parsed.hostname)) return '';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(fullUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Livesov/1.0)' },
    });
    clearTimeout(timer);
    if (!resp.ok) return '';
    const html = await resp.text();
    // Strip HTML tags, scripts, styles to get text content
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);
  } catch {
    return '';
  }
}

function buildDiscoverPrompt(brandName: string, websiteText: string, aiResponses: string[]): string {
  let context = '';

  if (websiteText) {
    context += `\nBRAND WEBSITE CONTENT:\n"""\n${websiteText.slice(0, 4000)}\n"""\n`;
  }

  if (aiResponses.length > 0) {
    context += `\nAI PLATFORM RESPONSES ABOUT THIS BRAND:\n`;
    for (const [i, resp] of aiResponses.slice(0, 5).entries()) {
      context += `\n--- Response ${i + 1} ---\n${resp.slice(0, 1500)}\n`;
    }
  }

  return `You are a fact extraction assistant. Extract all verifiable, specific facts about the brand "${brandName}" from the content below.

${context}

Extract facts that can be objectively verified — things like:
- Company name, founding year, headquarters, CEO/founder
- Products, services, pricing, plans
- Key features, capabilities, technology
- Contact info (phone, email, address)
- Industry, target market, company size
- Awards, certifications, partnerships
- Any specific numbers, dates, or claims

For each fact, provide:
- "key": a snake_case identifier (e.g. "founding_year", "headquarters", "starting_price")
- "value": the specific factual value (e.g. "2009", "Austin, TX", "$29/mo")
- "category": one of "general", "pricing", "features", "company"
- "source": "${websiteText ? 'website' : 'ai_responses'}" (use "website" if the fact came from website content, "ai_responses" if from AI responses)
- "confidence": "high" if the fact is explicitly and clearly stated, "medium" if inferred or partially stated, "low" if uncertain or contradicted between sources

Return ONLY a valid JSON array. Example:
[{"key":"founding_year","value":"2009","category":"company","source":"website","confidence":"high"},{"key":"starting_price","value":"$9/mo","category":"pricing","source":"website","confidence":"high"}]

Important:
- Only include facts that are specific and verifiable (not vague marketing claims)
- Prefer facts from the website over AI responses when both are available
- Set confidence to "low" if different sources disagree
- Return 10-25 facts maximum, prioritizing the most important ones
- Return ONLY the JSON array, no markdown, no extra text.`;
}

/**
 * Auto-discover canonical facts about a brand using AI
 */
export async function autoDiscoverFacts(
  brandName: string,
  websiteUrl: string,
  existingResponses?: string[],
  userApiKeys?: Record<string, string | null>
): Promise<AutoDiscoverResult> {
  const checker = getAvailableChecker(userApiKeys);
  if (!checker) {
    return { facts: [], error: 'No AI API keys configured. Add API keys in Settings, or set GEMINI_API_KEY, OPENAI_API_KEY, or CLAUDE_API_KEY in your environment.' };
  }

  // Fetch website text if URL provided
  let websiteText = '';
  if (websiteUrl) {
    websiteText = await fetchWebsiteText(websiteUrl);
  }

  const aiResponses = existingResponses || [];

  if (!websiteText && aiResponses.length === 0) {
    return { facts: [], error: 'No data sources available. Add a website URL to your brand or run some queries first.' };
  }

  try {
    const prompt = buildDiscoverPrompt(brandName, websiteText, aiResponses);
    const raw = await callChecker(checker, prompt);

    if (!raw || !raw.trim()) {
      console.error('[AutoDiscover] AI returned empty response via', checker.type);
      return { facts: [], error: `AI returned an empty response (${checker.type}). The request may have been blocked. Try again or check your API key.` };
    }

    const parsed = parseCheckerResponse(raw) as unknown as SuggestedFact[];

    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.error('[AutoDiscover] Could not parse facts from response:', raw.slice(0, 200));
      return { facts: [], error: 'AI could not extract facts from the available data. Try adding more content to your website or running more queries.' };
    }

    // Validate and normalize
    const validFacts: SuggestedFact[] = [];
    for (const f of parsed) {
      if (!f.key || !f.value) continue;
      validFacts.push({
        key: String(f.key).toLowerCase().replace(/\s+/g, '_').slice(0, 50),
        value: String(f.value).slice(0, 500),
        category: ['general', 'pricing', 'features', 'company'].includes(f.category) ? f.category : 'general',
        source: f.source === 'ai_responses' ? 'ai_responses' : 'website',
        confidence: ['high', 'medium', 'low'].includes(f.confidence) ? f.confidence : 'medium',
      });
    }

    // Sort: high confidence first
    const confOrder = { high: 0, medium: 1, low: 2 };
    validFacts.sort((a, b) => confOrder[a.confidence] - confOrder[b.confidence]);

    return { facts: validFacts };
  } catch (e) {
    const msg = (e as Error).message || '';
    console.error('[AutoDiscover]', msg);
    // Return specific error messages so users know what went wrong
    if (msg.includes('AbortError') || msg.includes('timed out') || msg.includes('timeout')) {
      return { facts: [], error: 'AI request timed out. Please try again — this is usually temporary.' };
    }
    if (msg.includes('high demand') || msg.includes('overloaded') || msg.includes('resource exhausted')) {
      return { facts: [], error: 'AI service is experiencing high demand. Please try again in a few moments.' };
    }
    if (msg.includes('API error 401') || msg.includes('invalid') || msg.includes('Unauthorized')) {
      return { facts: [], error: 'API key is invalid or expired. Check your API keys in Settings.' };
    }
    if (msg.includes('API error 429') || msg.includes('rate limit')) {
      return { facts: [], error: 'Rate limit reached. Please wait a moment and try again.' };
    }
    return { facts: [], error: `Failed to auto-discover facts: ${msg.slice(0, 120)}. Please try again.` };
  }
}
