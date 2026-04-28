import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { queryAI, getDefaultModel } from '@/lib/ai-platforms';
import { decryptApiKeys } from '@/lib/helpers';
import { getServerKeys } from '@/lib/server-keys';
import { resolveKeysForTenant, PROVIDER_SPECS } from '@/lib/tenant-keys';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logError, serverError } from '@/lib/api-error';

// Try platforms in this order so we prefer the cheapest / fastest
// generator first, then fall back. Names match `ProviderSpec.keyName`.
const PLATFORM_ORDER: Array<'claude' | 'openai' | 'gemini' | 'grok' | 'perplexity'> = [
  'claude', 'openai', 'gemini', 'grok', 'perplexity',
];

export async function POST(request: Request) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const rl = await rateLimit('aigen:' + user.id, 15 * 60 * 1000, 10);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { brandName, industry, city, existingQueries } = await request.json();
  if (!brandName || !industry) {
    return Response.json({ error: 'Brand name and industry are required' }, { status: 400 });
  }

  // Walk the same key-resolution chain the run path uses
  // (tenant_api_keys → users.api_keys → server env). Without this,
  // tenants who configured their key via Account Settings (which
  // writes to `tenant_api_keys`) would see "No AI API keys available"
  // even though the rest of the platform finds their key fine.
  let legacyUserKeys: Record<string, string | null | undefined> = {};
  try {
    const userResult = await pool.query('SELECT api_keys FROM users WHERE id = $1', [user.id]);
    legacyUserKeys = decryptApiKeys(userResult.rows[0]?.api_keys || {}) as Record<string, string | null | undefined>;
  } catch {}
  const serverKeys = getServerKeys();

  let platform: string | null = null;
  let apiKey: string | null = null;
  for (const keyName of PLATFORM_ORDER) {
    const spec = PROVIDER_SPECS.find(s => s.keyName === keyName);
    if (!spec) continue;
    const resolved = await resolveKeysForTenant({
      tenantId: user.id,
      platformKeyName: keyName,
      legacyUserKeys,
      serverKeys: serverKeys[keyName] || [],
    });
    if (resolved) {
      platform = spec.platform;
      apiKey = resolved.key;
      break;
    }
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
- Make them natural - how real people actually ask AI chatbots
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
    logError('ai_generate_queries.failed', e);
    return serverError({ message: 'Failed to generate queries. Please try again.' });
  }
}
