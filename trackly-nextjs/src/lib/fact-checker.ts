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

function getAvailableChecker(): { type: 'gemini' | 'openai' | 'claude'; key: string; model: string } | null {
  // Prefer Gemini (cheapest), then OpenAI, then Claude
  const geminiKeys = parseKeys('GEMINI_API_KEY');
  if (geminiKeys.length) return { type: 'gemini', key: geminiKeys[0], model: CHECKER_MODELS.gemini };

  const openaiKeys = parseKeys('OPENAI_API_KEY');
  if (openaiKeys.length) return { type: 'openai', key: openaiKeys[0], model: CHECKER_MODELS.openai };

  const claudeKeys = parseKeys('CLAUDE_API_KEY');
  if (claudeKeys.length) return { type: 'claude', key: claudeKeys[0], model: CHECKER_MODELS.claude };

  return null;
}

function buildFactCheckPrompt(facts: CanonicalFact[], responseText: string, platform: string): string {
  const factsList = facts.map(f => `- ${f.key} (${f.category}): "${f.value}"`).join('\n');

  return `You are a fact-checking assistant. Analyze the following AI-generated response and check it against the canonical facts provided.

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

Respond ONLY with valid JSON array. Each item must have:
- "fact_key": the fact key name
- "status": "accurate" | "inaccurate" | "not_mentioned"
- "found": what the AI actually said (empty string if not mentioned or accurate)
- "severity": "critical" | "high" | "medium" | "low" (only for inaccurate items — critical for completely wrong core facts like company name/founding, high for wrong numbers/prices, medium for partial errors, low for minor discrepancies)
- "explanation": brief explanation of the finding

Example response:
[{"fact_key":"founded_year","status":"inaccurate","found":"2015","severity":"high","explanation":"Response states company was founded in 2015, but actual founding year is 2009"},{"fact_key":"ceo","status":"accurate","found":"","severity":"low","explanation":"CEO name mentioned correctly"},{"fact_key":"phone","status":"not_mentioned","found":"","severity":"low","explanation":"Phone number was not discussed in the response"}]

Return ONLY the JSON array, no markdown, no extra text.`;
}

async function callChecker(
  checker: { type: 'gemini' | 'openai' | 'claude'; key: string; model: string },
  prompt: string
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    if (checker.type === 'openai') {
      const resp = await fetch(API_ENDPOINTS.openai, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${checker.key}` },
        body: JSON.stringify({
          model: checker.model,
          max_tokens: 1500,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error?.message || `OpenAI API error ${resp.status}`);
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
          max_tokens: 1500,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error?.message || `Claude API error ${resp.status}`);
      return d.content?.[0]?.text || '';
    }

    if (checker.type === 'gemini') {
      const url = `${API_ENDPOINTS.gemini}${checker.model}:generateContent`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': checker.key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1500, temperature: 0 },
        }),
        signal: controller.signal,
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error?.message || `Gemini API error ${resp.status}`);
      return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    return '';
  } finally {
    clearTimeout(timer);
  }
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
        const cat = facts.find(f => f.key === finding.fact_key)?.category || 'general';
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
            fact_key: finding.fact_key,
            expected: facts.find(f => f.key === finding.fact_key)?.value || '',
            found: finding.found,
            severity: (['critical', 'high', 'medium', 'low'].includes(finding.severity)
              ? finding.severity
              : 'medium') as FactCheckIssue['severity'],
            date: run.created_at,
            category: cat,
            explanation: finding.explanation || '',
            run_id: run.id,
          });
        }
      }
    }
  }

  // Calculate overall accuracy
  const totalChecks = Object.values(platformStats).reduce((sum, s) => sum + s.total, 0);
  const totalAccurate = Object.values(platformStats).reduce((sum, s) => sum + s.accurate, 0);
  const accuracyRate = totalChecks > 0 ? Math.round((totalAccurate / totalChecks) * 100) : 100;

  // Sort issues: critical first, then high, etc.
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    issues: allIssues,
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
  existingResponses?: string[]
): Promise<AutoDiscoverResult> {
  const checker = getAvailableChecker();
  if (!checker) {
    return { facts: [], error: 'No AI API keys configured. Add GEMINI_API_KEY, OPENAI_API_KEY, or CLAUDE_API_KEY to your environment.' };
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
    const parsed = parseCheckerResponse(raw) as unknown as SuggestedFact[];

    if (!Array.isArray(parsed) || parsed.length === 0) {
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
    console.error('[AutoDiscover]', (e as Error).message);
    return { facts: [], error: 'Failed to auto-discover facts. Please try again.' };
  }
}
