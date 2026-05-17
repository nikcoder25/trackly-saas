import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { queryAI } from '@/lib/ai-platforms';
import { getAdminModel } from '@/lib/site-config';
import { logError, serverError } from '@/lib/api-error';

const PLATFORMS_CONFIG = [
  { name: 'ChatGPT', envKey: 'OPENAI_API_KEY' },
  { name: 'Claude', envKey: 'CLAUDE_API_KEY' },
  { name: 'Gemini', envKey: 'GEMINI_API_KEY' },
  { name: 'Perplexity', envKey: 'PERPLEXITY_API_KEY' },
  { name: 'Grok', envKey: 'GROK_API_KEY' },
];

export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP: 3 checks per hour
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed, retryAfter } = await rateLimit(`free-check:${ip}`, 60 * 60 * 1000, 3);
    if (!allowed) return rateLimitResponse(retryAfter);

    const body = await req.json();
    const { brandName, industry } = body;

    if (!brandName || typeof brandName !== 'string' || !brandName.trim() || brandName.length > 200) {
      return Response.json({ error: 'Brand name is required (max 200 chars).' }, { status: 400 });
    }
    if (!industry || typeof industry !== 'string' || !industry.trim() || industry.length > 200) {
      return Response.json({ error: 'Industry is required (max 200 chars).' }, { status: 400 });
    }

    // Find the first platform with an available API key
    let platform: string | null = null;
    let apiKey: string | null = null;

    for (const p of PLATFORMS_CONFIG) {
      const key = process.env[p.envKey];
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
    const model = await getAdminModel(platform);

    const result = await queryAI(platform, query, apiKey, model);

    const mentioned = result.text.toLowerCase().includes(brandName.trim().toLowerCase());
    const snippet = result.text.slice(0, 300);

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
