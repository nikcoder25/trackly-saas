import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { queryAI, getDefaultModel, pickBestKey, withCacheAndRetry } from '@/lib/ai-platforms';
import { isSearchEnabled } from '@/lib/response-cache';
import { getServerKeys } from '@/lib/server-keys';
import { logError, serverError } from '@/lib/api-error';

interface Brand {
  name: string;
  rank: number;
  description?: string;
}

function parseBrands(text: string): Brand[] {
  const brands: Brand[] = [];
  const seen = new Set<string>();

  // Pattern: "1. **Name** - description" or "1. Name - description" or "1. Name: description"
  const lineRe = /^\s*(\d{1,2})[.):]\s+(?:\*\*)?([^*\n:\-–—]{1,80})(?:\*\*)?(?:\s*[:\-–—]\s+(.*))?$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) !== null) {
    const rank = parseInt(m[1], 10);
    const name = m[2].trim().replace(/[*_]/g, '').replace(/\s+/g, ' ');
    if (!name || name.length < 2) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    brands.push({ rank, name, description: m[3]?.trim().slice(0, 200) });
    if (brands.length >= 10) break;
  }

  // Fallback: bullet list with markdown-bold names
  if (brands.length < 3) {
    const bulletRe = /^\s*[-•*]\s+(?:\*\*)?([A-Z][^*\n:\-–—]{1,60})(?:\*\*)?(?:\s*[:\-–—]\s+(.*))?$/gm;
    let i = brands.length;
    while ((m = bulletRe.exec(text)) !== null) {
      const name = m[1].trim().replace(/[*_]/g, '').replace(/\s+/g, ' ');
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      i += 1;
      brands.push({ rank: i, name, description: m[2]?.trim().slice(0, 200) });
      if (brands.length >= 10) break;
    }
  }

  return brands;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    // 3 queries per IP per day - calls a paid AI provider per request.
    const { allowed, retryAfter } = await rateLimit(`competitor-finder:${ip}`, 24 * 60 * 60 * 1000, 3);
    if (!allowed) return rateLimitResponse(retryAfter);

    const body = await req.json().catch(() => ({}));
    const industry: string = typeof body?.industry === 'string' ? body.industry.trim() : '';
    const region: string = typeof body?.region === 'string' ? body.region.trim() : '';

    if (!industry || industry.length > 200) {
      return Response.json({ error: 'Industry is required (max 200 chars).' }, { status: 400 });
    }

    const keys = getServerKeys();
    const apiKey = pickBestKey(keys.openai) || pickBestKey(keys.claude) || pickBestKey(keys.gemini);
    if (!apiKey) {
      return Response.json({ error: 'No AI platform is currently available. Please try again later.' }, { status: 503 });
    }
    const platform = pickBestKey(keys.openai) ? 'ChatGPT' : pickBestKey(keys.claude) ? 'Claude' : 'Gemini';

    const regionClause = region ? ` in ${region}` : '';
    const prompt = `List the top 10 ${industry}${regionClause} companies you would recommend. For each, give the brand name and a one-line description. Reply as a numbered list. Format: "1. Brand Name - description".`;

    const model = getDefaultModel(platform);
    // Read-through response cache: the prompt is templated on
    // industry+region, so every visitor exploring the same niche shares
    // one provider call.
    const { data: result } = await withCacheAndRetry(
      { prompt, platform, model, searchEnabled: isSearchEnabled(platform, model) },
      () => queryAI(platform, prompt, apiKey, model),
    );
    const text = result.text || '';

    const brands = parseBrands(text);

    return Response.json({
      industry,
      region,
      platform,
      model,
      brands,
      raw: text.length > 1500 ? text.slice(0, 1500) + '...' : text,
    });
  } catch (error) {
    logError('tools.competitor_finder.failed', error);
    return serverError({ message: 'Failed to find competitors. Please try again later.' });
  }
}
