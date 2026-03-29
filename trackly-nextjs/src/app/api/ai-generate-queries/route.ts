import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
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
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const rl = rateLimit('aigen:' + user.id, 15 * 60 * 1000, 10);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { brandName, industry, city, existingQueries } = await request.json();
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

  const prompt = `Generate 10-15 search queries that a person would type into an AI chatbot (like ChatGPT, Claude, Perplexity) when looking for "${industry}" services${city ? ' in or near ' + city : ''}.

These queries will be used to track whether the brand "${brandName}" appears in AI responses.

Requirements:
- Mix of general queries ("best ${industry} in ${city || 'my area'}") and specific queries ("affordable", "top rated", "most recommended", "near me")
- Include different question styles: "who is the best...", "recommend a...", "top 5...", "which company..."
- Include queries with and without location
- Make them natural — how real people actually ask AI chatbots
- Return ONLY a JSON array of strings, nothing else${existingList}

Example format: ["best ${industry} in ${city || 'my area'}", "top rated ${industry} company"]`;

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
        .slice(0, 15);
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
