import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { queryAI, getDefaultModel, pickBestKey, withCacheAndRetry } from '@/lib/ai-platforms';
import { isSearchEnabled } from '@/lib/response-cache';
import { getServerKeys } from '@/lib/server-keys';
import { logError, serverError } from '@/lib/api-error';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    // Build notes: 1 query per IP per day. Email gate kicks in beyond.
    const { allowed, retryAfter } = await rateLimit(`chatgpt-mention-check:${ip}`, 24 * 60 * 60 * 1000, 1);
    if (!allowed) return rateLimitResponse(retryAfter);

    const body = await req.json().catch(() => ({}));
    const brandName: string = typeof body?.brandName === 'string' ? body.brandName.trim() : '';
    const query: string = typeof body?.query === 'string' ? body.query.trim() : '';

    if (!brandName || brandName.length > 200) {
      return Response.json({ error: 'Brand name is required (max 200 chars).' }, { status: 400 });
    }
    if (!query || query.length > 400) {
      return Response.json({ error: 'A question is required (max 400 chars).' }, { status: 400 });
    }

    const keys = getServerKeys().openai;
    const apiKey = pickBestKey(keys);
    if (!apiKey) {
      return Response.json({ error: 'ChatGPT is not currently available. Please try again later.' }, { status: 503 });
    }

    const model = getDefaultModel('ChatGPT');
    // Public tool — same brand+query pair can be requested by many
    // anonymous users. The cross-tenant response cache dedupes them so
    // we only pay once per (normalized query, model) combination.
    const { data: result } = await withCacheAndRetry(
      {
        prompt: query,
        platform: 'ChatGPT',
        model,
        searchEnabled: isSearchEnabled('ChatGPT', model),
      },
      () => queryAI('ChatGPT', query, apiKey!, model),
    );

    const text = result.text || '';
    const lower = text.toLowerCase();
    const target = brandName.toLowerCase();
    const mentioned = lower.includes(target);

    let snippet = '';
    if (mentioned) {
      const idx = lower.indexOf(target);
      const start = Math.max(0, idx - 140);
      const end = Math.min(text.length, idx + brandName.length + 140);
      snippet = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
    } else {
      snippet = text.slice(0, 320) + (text.length > 320 ? '...' : '');
    }

    // Try to extract competitor brand names mentioned (simple heuristic: capitalised tokens preceded by a list marker)
    const competitorRegex = /(?:^|\n|\d+\.\s+|[-•*]\s+|:\s+)([A-Z][A-Za-z0-9.&'’-]{1,30}(?:\s+[A-Z][A-Za-z0-9.&'’-]{1,30}){0,3})/g;
    const competitorSet = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = competitorRegex.exec(text)) !== null) {
      const candidate = m[1].trim();
      if (!new RegExp(`\\b${escapeRegex(brandName)}\\b`, 'i').test(candidate) && candidate.length > 1) {
        competitorSet.add(candidate);
      }
      if (competitorSet.size >= 8) break;
    }
    const competitors = [...competitorSet].slice(0, 8);

    return Response.json({
      brandName,
      query,
      platform: 'ChatGPT',
      model,
      mentioned,
      snippet,
      competitors,
    });
  } catch (error) {
    logError('tools.chatgpt_mention_checker.failed', error);
    return serverError({ message: 'Failed to check ChatGPT. Please try again later.' });
  }
}
