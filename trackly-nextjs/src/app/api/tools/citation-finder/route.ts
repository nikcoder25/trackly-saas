import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { queryAI, pickBestKey } from '@/lib/ai-platforms';
import { getAdminModel } from '@/lib/site-config';
import { getServerKeys } from '@/lib/server-keys';
import { logError, serverError } from '@/lib/api-error';

interface Citation {
  url: string;
  domain: string;
  title?: string;
}

function extractCitations(text: string): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];

  // Match URLs in markdown links [title](url)
  const mdLinkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdLinkRe.exec(text)) !== null) {
    const url = m[2];
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const domain = new URL(url).host;
      citations.push({ url, domain, title: m[1].trim() });
    } catch {}
  }

  // Match raw URLs
  const rawRe = /https?:\/\/[^\s)<>"]+/g;
  while ((m = rawRe.exec(text)) !== null) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, '');
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const domain = new URL(url).host;
      citations.push({ url, domain });
    } catch {}
  }

  return citations.slice(0, 25);
}

function buildPrompt(query: string, brand?: string): string {
  if (brand && brand.trim()) {
    return `Answer this question and include the URLs and sources you would cite. Mention which sources you trust most for ${brand.trim()}.\n\nQuestion: ${query.trim()}`;
  }
  return `Answer this question and include the URLs and sources you would cite for your claims.\n\nQuestion: ${query.trim()}`;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    // 2 queries per IP per day - this tool calls Perplexity/ChatGPT which
    // costs us per-query. Anything beyond a tasting menu should sign up.
    const { allowed, retryAfter } = await rateLimit(`citation-finder:${ip}`, 24 * 60 * 60 * 1000, 2);
    if (!allowed) return rateLimitResponse(retryAfter);

    const body = await req.json().catch(() => ({}));
    const query: string = typeof body?.query === 'string' ? body.query.trim() : '';
    const brand: string = typeof body?.brand === 'string' ? body.brand.trim() : '';
    const platformChoice: string = typeof body?.platform === 'string' ? body.platform : 'Perplexity';

    if (!query || query.length > 400) {
      return Response.json({ error: 'A question is required (max 400 chars).' }, { status: 400 });
    }

    const keys = getServerKeys();
    let platform: 'Perplexity' | 'ChatGPT';
    let apiKey: string | null = null;
    if (platformChoice === 'ChatGPT') {
      apiKey = pickBestKey(keys.openai);
      platform = 'ChatGPT';
    } else {
      apiKey = pickBestKey(keys.perplexity);
      platform = 'Perplexity';
    }
    if (!apiKey) {
      // Fall back to whichever is available
      const fallback = pickBestKey(keys.perplexity) || pickBestKey(keys.openai);
      if (!fallback) return Response.json({ error: 'No AI platform is currently available.' }, { status: 503 });
      apiKey = fallback;
      platform = pickBestKey(keys.perplexity) ? 'Perplexity' : 'ChatGPT';
    }

    const prompt = buildPrompt(query, brand);
    const model = await getAdminModel(platform);
    const result = await queryAI(platform, prompt, apiKey, model);
    const text = result.text || '';

    const citations = extractCitations(text);

    let brandCited = false;
    if (brand) {
      const brandLower = brand.toLowerCase();
      brandCited = citations.some((c) => c.domain.toLowerCase().includes(brandLower) || (c.title || '').toLowerCase().includes(brandLower));
    }

    return Response.json({
      platform,
      model,
      query,
      brand,
      brandCited,
      citations,
      answerSnippet: text.slice(0, 500) + (text.length > 500 ? '...' : ''),
    });
  } catch (error) {
    logError('tools.citation_finder.failed', error);
    return serverError({ message: 'Failed to find citations. Please try again later.' });
  }
}
