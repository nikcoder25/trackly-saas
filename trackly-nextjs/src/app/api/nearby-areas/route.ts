import { verifyRequestAuth } from '@/lib/auth';
import { queryAI, getDefaultModel } from '@/lib/ai-platforms';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const PLATFORM_KEY_MAP: Record<string, string> = {
  claude: 'CLAUDE_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
  grok: 'GROK_API_KEY',
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

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = rateLimit('nearby:' + user.id, 15 * 60 * 1000, 10);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { city } = await request.json();
  if (!city || typeof city !== 'string' || !city.trim()) {
    return Response.json({ error: 'City is required' }, { status: 400 });
  }

  // Sanitize city input - allow only safe characters
  const sanitizedCity = city.trim().replace(/[^\w\s,.\-']/g, '').substring(0, 100);
  if (!sanitizedCity) return Response.json({ error: 'Invalid city name' }, { status: 400 });

  // Find an available AI platform (prefer cheaper ones)
  const platformOrder = ['gemini', 'claude', 'openai', 'grok', 'perplexity'];
  let platform: string | null = null;
  let apiKey: string | null = null;

  for (const p of platformOrder) {
    const envVar = PLATFORM_KEY_MAP[p];
    const keys = (process.env[envVar] || '').split(',').map(k => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      platform = PLATFORM_DISPLAY[p];
      apiKey = keys[0];
      break;
    }
  }

  if (!platform || !apiKey) {
    return Response.json({ error: 'No AI platform API keys configured. Contact admin.' }, { status: 400 });
  }

  const prompt = `List exactly 10-15 nearby cities, towns, suburbs, and service areas within a 30-mile radius of "${sanitizedCity}". Return ONLY a JSON array of strings, nothing else. Example format: ["City 1", "City 2", "City 3"]. Include the county/region name and state abbreviation. Do not include the original city itself.`;

  try {
    const model = getDefaultModel(platform);
    const result = await queryAI(platform, prompt, apiKey, model);

    if (!result?.text) {
      return Response.json({ error: 'AI returned empty response. Please try again.' }, { status: 500 });
    }

    // Parse JSON array from response
    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return Response.json({ error: 'Could not parse nearby areas from AI response' }, { status: 500 });
    }

    let areas: string[];
    try {
      areas = JSON.parse(jsonMatch[0])
        .filter((a: unknown) => typeof a === 'string' && (a as string).trim().length > 0)
        .map((a: string) => a.trim())
        .slice(0, 15);
    } catch {
      return Response.json({ error: 'AI returned malformed data. Please try again.' }, { status: 500 });
    }

    if (!areas.length) {
      return Response.json({ error: 'No nearby areas found for this city' }, { status: 500 });
    }

    return Response.json({ areas, city: sanitizedCity, platform });
  } catch (e) {
    console.error('[NearbyAreas]', (e as Error).message);
    return Response.json({ error: 'Failed to fetch nearby areas. Please try again.' }, { status: 500 });
  }
}
