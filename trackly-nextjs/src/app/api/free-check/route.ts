import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { queryAI, getDefaultModel, withCacheAndRetry, pickBestKey } from '@/lib/ai-platforms';
import { getServerKeys } from '@/lib/server-keys';
import { isSearchEnabled } from '@/lib/response-cache';
import { logError, serverError } from '@/lib/api-error';

// Keys come from getServerKeys() so comma lists and numbered _N vars work
// here the same as everywhere else.
const PLATFORMS_CONFIG = [
  { name: 'ChatGPT', keyGroup: 'openai' },
  { name: 'Claude', keyGroup: 'claude' },
  { name: 'Gemini', keyGroup: 'gemini' },
  { name: 'Perplexity', keyGroup: 'perplexity' },
  { name: 'Grok', keyGroup: 'grok' },
];

export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP: 3 checks per hour
    const ip = getClientIp(req);
    const { allowed, retryAfter } = await rateLimit(`free-check:${ip}`, 60 * 60 * 1000, 3);
    if (!allowed) return rateLimitResponse(retryAfter);

    // A malformed body falls through to the 400 below rather than throwing
    // into the catch-all as a 500 (see geo-audit/route.ts for the rationale).
    const body = await req.json().catch(() => ({}));
    const { brandName, industry } = body as { brandName?: unknown; industry?: unknown };

    if (!brandName || typeof brandName !== 'string' || !brandName.trim() || brandName.length > 200) {
      return Response.json({ error: 'Brand name is required (max 200 chars).' }, { status: 400 });
    }
    if (!industry || typeof industry !== 'string' || !industry.trim() || industry.length > 200) {
      return Response.json({ error: 'Industry is required (max 200 chars).' }, { status: 400 });
    }

    // Find the first platform with an available API key
    let platform: string | null = null;
    let apiKey: string | null = null;

    const serverKeys = getServerKeys();
    for (const p of PLATFORMS_CONFIG) {
      const key = pickBestKey(serverKeys[p.keyGroup] || []);
      if (key) {
        platform = p.name;
        apiKey = key;
        break;
      }
    }

    if (!platform || !apiKey) {
      return Response.json({ error: 'No AI platform is currently available. Please try again later.' }, { status: 503 });
    }

    const query = `What are the best ${industry.trim()} companies or brands you would recommend?`;
    const model = getDefaultModel(platform);

    // Read-through response cache: the prompt is templated on industry
    // only, so every visitor checking a brand in the same industry shares
    // one provider call. The brand-mention check below runs locally on
    // the cached text.
    const { data: result } = await withCacheAndRetry(
      { prompt: query, platform, model, searchEnabled: isSearchEnabled(platform, model) },
      () => queryAI(platform, query, apiKey, model),
    );

    const text = result.text || '';
    const mentioned = text.toLowerCase().includes(brandName.trim().toLowerCase());
    const snippet = text.slice(0, 300);

    return Response.json({
      mentioned,
      platform,
      snippet,
      totalPlatforms: 5,
    });
  } catch (error) {
    logError('free_check.failed', error);
    return serverError({ message: 'Something went wrong. Please try again later.' });
  }
}
