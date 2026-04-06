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

function parseKeys(envVar: string): string[] {
  const keys: string[] = [];
  const raw = (process.env[envVar] || '').trim();
  if (raw) raw.split(',').map(k => k.trim()).filter(k => k.length > 0).forEach(k => keys.push(k));
  for (let i = 1; i <= 10; i++) {
    const numbered = (process.env[envVar + '_' + i] || '').trim();
    if (numbered) numbered.split(',').map(k => k.trim()).filter(k => k.length > 0).forEach(k => keys.push(k));
  }
  return [...new Set(keys)];
}

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = await rateLimit('nearby:' + user.id, 15 * 60 * 1000, 10);
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
    const keys = parseKeys(envVar);
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
    const result = await queryAI(platform, prompt, apiKey, model, undefined, {
      systemPrompt: 'You are a geography assistant. Return ONLY valid JSON arrays with no extra text, no markdown, no explanation.',
      maxTokens: 800,
      jsonMode: true,
    });

    if (!result?.text) {
      return Response.json({ error: 'AI returned empty response. Please try again.' }, { status: 500 });
    }

    // Try multiple parsing strategies
    let areas: string[] = [];
    const rawText = result.text.trim();

    // Strategy 1: Direct JSON parse
    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        areas = parsed.filter((a: unknown) => typeof a === 'string' && (a as string).trim().length > 0).map((a: string) => a.trim());
      }
    } catch {
      // Strategy 2: Strip markdown fences and extract JSON array
      const cleaned = rawText.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          areas = JSON.parse(jsonMatch[0])
            .filter((a: unknown) => typeof a === 'string' && (a as string).trim().length > 0)
            .map((a: string) => a.trim());
        } catch { /* fall through */ }
      }

      // Strategy 3: Extract quoted strings as fallback
      if (!areas.length) {
        const quoted = rawText.match(/"([^"]{2,80})"/g);
        if (quoted && quoted.length >= 3) {
          areas = quoted.map(q => q.replace(/^"|"$/g, '').trim()).filter(a => a.length > 0);
        }
      }
    }

    areas = areas.slice(0, 15);

    if (!areas.length) {
      console.error('[NearbyAreas] Could not parse areas from AI response:', rawText.substring(0, 500));
      return Response.json({ error: 'Could not parse nearby areas from AI response. Please try again.' }, { status: 500 });
    }

    return Response.json({ areas, city: sanitizedCity, platform });
  } catch (e) {
    console.error('[NearbyAreas]', (e as Error).message);
    return Response.json({ error: 'Failed to fetch nearby areas. Please try again.' }, { status: 500 });
  }
}
