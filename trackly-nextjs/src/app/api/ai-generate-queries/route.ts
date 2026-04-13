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

  const { brandName, industry, city, website, existingQueries } = await request.json();
  if (!brandName || !industry) {
    return Response.json({ error: 'Brand name and industry are required' }, { status: 400 });
  }

  // Find an available AI platform (server keys first, then user keys)
  const platformOrder = ['claude', 'openai', 'gemini', 'grok', 'perplexity'];
  let platform: string | null = null;
  let apiKey: string | null = null;

  // Try server keys first
  for (const p of platformOrder) {
    const envVar = PLATFORM_KEY_MAP[p];
    const keys = (process.env[envVar] || '').split(',').map(k => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      platform = PLATFORM_DISPLAY[p];
      apiKey = keys[0];
      break;
    }
  }

  // Fall back to user's own API keys
  if (!platform || !apiKey) {
    try {
      const userResult = await pool.query('SELECT api_keys FROM users WHERE id = $1', [user.id]);
      const userKeys = decryptApiKeys(userResult.rows[0]?.api_keys || {});
      for (const p of platformOrder) {
        const key = userKeys[USER_KEY_MAP[p]];
        if (key) {
          platform = PLATFORM_DISPLAY[p];
          apiKey = key;
          break;
        }
      }
    } catch {}
  }

  if (!platform || !apiKey) {
    return Response.json({ error: 'No AI API keys available. Add keys in Account Settings or contact admin.' }, { status: 400 });
  }

  const existingList = Array.isArray(existingQueries) && existingQueries.length > 0
    ? `\n\nAlready tracked queries (do NOT repeat these):\n${existingQueries.join('\n')}`
    : '';

  const websiteLine = website ? `Website: ${website}` : '';

  const prompt = `Act as an AI SEO expert specializing in GEO (Generative Engine Optimization) and AI brand visibility tracking. Analyze the following business and generate exactly 10 AI prompts/queries that should be tracked on AI platforms (ChatGPT, Perplexity, Google AI Overviews) to monitor whether this brand is being mentioned or recommended.

Business Name: ${brandName}
Industry/Services: ${industry}
${city ? 'Primary Location: ' + city : ''}
${websiteLine}

Instructions:

1. Based on the business details above${website ? ' and the website URL' : ''}, understand the business name, services offered, service areas/locations, unique differentiators, and niche specializations.

2. Generate exactly 10 prompts across these categories:
   - Branded queries (1): Does AI know this business exists?
   - Local intent for primary market (2): High-intent service queries for their main city/area
   - Local intent for secondary markets (1-2): Key queries for other cities they serve
   - Service-specific queries (2): Focused on their core and niche services
   - Comparison/recommendation queries (2): Prompts where AI recommends or lists businesses
   - Conversational/voice queries (1-2): Natural language queries mimicking how real users ask AI for help

3. Prioritize prompts that:
   - Have real commercial intent (someone looking to hire or buy)
   - Focus on their strongest differentiators and niche services
   - Cover their top geographic markets by importance
   - Include the exact business name in branded queries only

4. Return ONLY a JSON array of exactly 10 prompt strings. No tables, no extra columns, no explanations. Just the JSON array.${existingList}

Example format: ["best ${industry} in ${city || 'my area'}", "who is the best ${industry} company near me"]`;

  try {
    const model = getDefaultModel(platform);
    const result = await queryAI(platform, prompt, apiKey, model);

    if (!result?.text) {
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
        .slice(0, 10);
    } catch {
      return Response.json({ error: 'AI returned malformed JSON. Please try again.' }, { status: 500 });
    }

    if (!queries.length) {
      return Response.json({ error: 'No queries generated' }, { status: 500 });
    }

    return Response.json({ queries, platform });
  } catch (e) {
    console.error('[AI Generate Queries]', (e as Error).message);
    return Response.json({ error: 'Failed to generate queries. Please try again.' }, { status: 500 });
  }
}
