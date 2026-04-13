import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { queryAI, getDefaultModel } from '@/lib/ai-platforms';
import { decryptApiKeys } from '@/lib/helpers';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const PLATFORM_KEY_MAP: Record<string, string> = {
  claude: 'CLAUDE_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
  grok: 'GROK_API_KEY',
};

const USER_KEY_MAP: Record<string, string> = {
  claude: 'claude',
  openai: 'openai',
  gemini: 'gemini',
  perplexity: 'perplexity',
  grok: 'grok',
};

const PLATFORM_DISPLAY: Record<string, string> = {
  claude: 'Claude',
  openai: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  grok: 'Grok',
};

export async function POST(request: Request) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const rl = await rateLimit('aigen:' + user.id, 15 * 60 * 1000, 10);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { brandName, industry, city, existingQueries, competitors, nearbyAreas } = await request.json();
  if (!brandName || !industry) {
    return Response.json({ error: 'Brand name and industry are required' }, { status: 400 });
  }

  // Build a list of all available platform+key combos for fallback
  const platformOrder = ['claude', 'openai', 'gemini', 'grok', 'perplexity'];
  const availableKeys: Array<{ platform: string; apiKey: string }> = [];
  const usedKeys = new Set<string>();

  // Server keys first (all keys per platform, not just the first)
  for (const p of platformOrder) {
    const envVar = PLATFORM_KEY_MAP[p];
    const keys = (process.env[envVar] || '').split(',').map(k => k.trim()).filter(Boolean);
    // Also check numbered variants (_1, _2, _3, ...)
    for (let i = 1; i <= 10; i++) {
      const numbered = (process.env[envVar + '_' + i] || '').trim();
      if (numbered && !keys.includes(numbered)) keys.push(numbered);
    }
    for (const key of keys) {
      if (!usedKeys.has(key)) { availableKeys.push({ platform: PLATFORM_DISPLAY[p], apiKey: key }); usedKeys.add(key); }
    }
  }

  // Fall back to user's own API keys
  try {
    const userResult = await pool.query('SELECT api_keys FROM users WHERE id = $1', [user.id]);
    const userKeys = decryptApiKeys(userResult.rows[0]?.api_keys || {});
    for (const p of platformOrder) {
      const key = userKeys[USER_KEY_MAP[p]];
      if (key && !usedKeys.has(key)) { availableKeys.push({ platform: PLATFORM_DISPLAY[p], apiKey: key }); usedKeys.add(key); }
    }
  } catch {}

  if (availableKeys.length === 0) {
    return Response.json({ error: 'No AI API keys available. Add keys in Account Settings or contact admin.' }, { status: 400 });
  }

  const existingList = Array.isArray(existingQueries) && existingQueries.length > 0
    ? `\n\nAlready tracked queries (do NOT repeat these):\n${existingQueries.join('\n')}`
    : '';

  const competitorList = Array.isArray(competitors) && competitors.length > 0
    ? `\n\nKnown competitors: ${competitors.join(', ')}`
    : '';

  const areaList = Array.isArray(nearbyAreas) && nearbyAreas.length > 0
    ? `\nNearby areas the business serves: ${nearbyAreas.join(', ')}`
    : '';

  const location = city || '';

  const prompt = `You are an AI visibility strategist. Generate 15 high-value search queries that real people type into AI chatbots (ChatGPT, Claude, Perplexity, Gemini, Grok) when looking for "${industry}" services${location ? ' in or near ' + location : ''}.

Brand: "${brandName}"
Industry: ${industry}${location ? '\nLocation: ' + location : ''}${competitorList}${areaList}

These queries will be used to monitor whether "${brandName}" appears in AI responses. Generate queries across ALL of these categories:

1. HIGH-INTENT COMMERCIAL (people ready to buy/hire):
   - "best ${industry} in ${location || 'my area'}", "who should I hire for...", "top rated..."

2. COMPARISON & ALTERNATIVES:
   - "${brandName} vs [competitor]", "alternatives to...", "compare ${industry} companies in..."${competitors?.length ? `\n   - Include at least 2 queries comparing "${brandName}" against known competitors` : ''}

3. REPUTATION & TRUST:
   - "${brandName} reviews", "is ${brandName} good", "can I trust..."

4. PROBLEM-SOLUTION (what problems does this business solve):
   - Queries describing specific pain points that someone needing ${industry} would ask about

5. SPECIFIC SERVICE QUERIES:
   - Queries about specific services/offerings within ${industry} (e.g., "residential vs commercial", pricing, emergency services)
${nearbyAreas?.length ? `\n6. NEARBY AREA COVERAGE:\n   - Include 2-3 queries mentioning nearby service areas` : ''}

Requirements:
- Write them exactly how real people talk to AI chatbots — conversational, natural language
- Mix question formats: "who is...", "what's the best...", "recommend me a...", "I need...", "top 5..."
- Include both branded queries (mentioning "${brandName}") and unbranded category queries
- Every query should be one that, if "${brandName}" does NOT appear in the AI response, represents a missed opportunity
- Return ONLY a JSON array of strings, nothing else${existingList}

Example format: ["best ${industry} in ${location || 'my area'}", "is ${brandName} worth it", "I need a reliable ${industry} company"]`;

  // Try each available key, falling back on transient errors
  let lastError = '';
  for (let i = 0; i < availableKeys.length; i++) {
    const { platform, apiKey } = availableKeys[i];
    try {
      const model = getDefaultModel(platform);
      const result = await queryAI(platform, prompt, apiKey, model);

      if (!result?.text) {
        // Empty response may be a soft block — try next key if available
        if (i < availableKeys.length - 1) {
          console.warn(`[AI Generate Queries] Empty response from ${platform}, trying next key...`);
          continue;
        }
        return Response.json({ error: 'AI returned empty response. Please try again.' }, { status: 500 });
      }

      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return Response.json({ error: 'Could not parse queries from AI response' }, { status: 500 });
      }

      let queries: string[];
      try {
        queries = JSON.parse(jsonMatch[0])
          .filter((q: unknown) => typeof q === 'string' && (q as string).trim().length > 0)
          .map((q: string) => q.trim())
          .slice(0, 15);
      } catch {
        return Response.json({ error: 'AI returned malformed JSON. Please try again.' }, { status: 500 });
      }

      if (!queries.length) {
        return Response.json({ error: 'No queries generated' }, { status: 500 });
      }

      return Response.json({ queries, platform });
    } catch (e) {
      const msg = (e as Error).message || '';
      lastError = msg;
      const isTransient = msg.includes('429') || msg.includes('rate limit') || msg.includes('high demand')
        || msg.includes('overloaded') || msg.includes('resource exhausted')
        || msg.includes('timed out') || msg.includes('timeout') || msg.includes('AbortError')
        || /API error 5\d\d/.test(msg);
      if (isTransient && i < availableKeys.length - 1) {
        console.warn(`[AI Generate Queries] ${platform} failed (${msg.slice(0, 80)}), trying next key...`);
        continue;
      }
      console.error('[AI Generate Queries]', msg);
      return Response.json({ error: 'Failed to generate queries. Please try again.' }, { status: 500 });
    }
  }

  console.error('[AI Generate Queries] All keys exhausted:', lastError);
  return Response.json({ error: 'All AI services are currently busy. Please try again in a few moments.' }, { status: 500 });
}
