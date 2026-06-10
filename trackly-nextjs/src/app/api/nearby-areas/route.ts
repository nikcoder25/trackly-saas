import { verifyRequestAuth } from '@/lib/auth';
import { queryAI, getDefaultModel, withCacheAndRetry } from '@/lib/ai-platforms';
import { isSearchEnabled } from '@/lib/response-cache';
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

function findAvailablePlatform(): { platform: string; apiKey: string } | null {
  const platformOrder = ['gemini', 'grok', 'claude', 'openai', 'perplexity'];
  for (const p of platformOrder) {
    const envVar = PLATFORM_KEY_MAP[p];
    const keys = parseKeys(envVar);
    if (keys.length > 0) {
      return { platform: PLATFORM_DISPLAY[p], apiKey: keys[Math.floor(Math.random() * keys.length)] };
    }
  }
  return null;
}

// Per-platform attempt timeout. queryAI has its own internal retry budget that
// can balloon to 8 minutes on transient errors - this caps each attempt so the
// user isn't stuck on "FETCHING..." forever. Bounded by TOTAL_BUDGET_MS across
// both primary + fallback platforms.
const PER_ATTEMPT_TIMEOUT_MS = 20000;
const TOTAL_BUDGET_MS = 45000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const rl = await rateLimit('nearby:' + user.id, 15 * 60 * 1000, 10);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const body = await request.json().catch(() => ({}));
  const { city, industry, website } = body;
  if (!city || typeof city !== 'string' || !city.trim()) {
    return Response.json({ error: 'City is required' }, { status: 400 });
  }

  // Sanitize inputs
  const sanitizedCity = city.trim().replace(/[^\w\s,.\-']/g, '').substring(0, 100);
  if (!sanitizedCity) return Response.json({ error: 'Invalid city name' }, { status: 400 });
  const sanitizedIndustry = typeof industry === 'string'
    ? industry.trim().replace(/[^\w\s,.\-&/']/g, '').substring(0, 60)
    : '';
  const sanitizedWebsite = typeof website === 'string'
    ? website.trim().replace(/[^\w\s:/.\-?=&%#]/g, '').substring(0, 200)
    : '';

  // Find an available AI platform
  const found = findAvailablePlatform();
  if (!found) {
    return Response.json({
      error: 'AI nearby area detection is not available right now. You can add nearby areas manually.',
    }, { status: 503 });
  }

  const contextParts: string[] = [];
  if (sanitizedIndustry) contextParts.push(`Business type: ${sanitizedIndustry}`);
  if (sanitizedWebsite) contextParts.push(`Website: ${sanitizedWebsite}`);
  const contextHeader = contextParts.length ? contextParts.join('. ') + '. ' : '';

  const prompt = `${contextHeader}List exactly 10-15 nearby cities, towns, suburbs, and service areas within a 30-mile radius of "${sanitizedCity}" that this business would reasonably serve. Return ONLY a JSON array of strings, nothing else. Example format: ["City 1", "City 2", "City 3"]. Include the county/region name and state abbreviation. Do not include "${sanitizedCity}" itself.`;

  // Try up to 2 platforms if the first one fails, bounded by TOTAL_BUDGET_MS
  const { platform, apiKey } = found;
  const platformsToTry = [{ platform, apiKey }];
  const fallbackPlatform = findFallbackPlatform(platform);
  if (fallbackPlatform) platformsToTry.push(fallbackPlatform);

  const startedAt = Date.now();
  let lastError: unknown = null;

  for (const { platform: plat, apiKey: key } of platformsToTry) {
    const remainingBudget = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remainingBudget < 3000) break;
    const attemptTimeout = Math.min(PER_ATTEMPT_TIMEOUT_MS, remainingBudget);

    try {
      const model = getDefaultModel(plat);
      // Read-through response cache: nearby-area lists for the same
      // city/industry/website don't change, so repeat setups (and the
      // retry-after-timeout case) serve from response_cache for free.
      const { data: result } = await withTimeout(
        withCacheAndRetry(
          { prompt, platform: plat, model, searchEnabled: isSearchEnabled(plat, model), city: sanitizedCity },
          () => queryAI(plat, prompt, key, model, undefined, {
            systemPrompt: 'You are a geography assistant. Return ONLY valid JSON arrays with no extra text, no markdown, no explanation.',
            maxTokens: 800,
            jsonMode: true,
            silent: true,
          }),
        ),
        attemptTimeout,
        `nearby-areas[${plat}]`,
      );

      if (!result?.text) {
        console.warn(`[nearby-areas] ${plat} returned empty text`);
        continue;
      }

      const areas = parseAreas(result.text);
      if (areas.length > 0) {
        return Response.json({ areas, city: sanitizedCity, platform: plat });
      }
      console.warn(`[nearby-areas] ${plat} response did not parse into areas:`, result.text.slice(0, 200));
    } catch (e) {
      lastError = e;
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      console.warn(`[nearby-areas] ${plat} failed: ${msg}`);
      continue;
    }
  }

  const lastMsg = lastError instanceof Error ? lastError.message.toLowerCase() : '';
  const timedOut = lastMsg.includes('timed out') || lastMsg.includes('timeout');
  return Response.json({
    error: timedOut
      ? 'AI service is slow right now. Please try again or add areas manually.'
      : 'Could not fetch nearby areas. Please try again or add areas manually.',
  }, { status: timedOut ? 504 : 500 });
}

function findFallbackPlatform(exclude: string): { platform: string; apiKey: string } | null {
  const platformOrder = ['gemini', 'grok', 'claude', 'openai', 'perplexity'];
  for (const p of platformOrder) {
    const displayName = PLATFORM_DISPLAY[p];
    if (displayName === exclude) continue;
    const keys = parseKeys(PLATFORM_KEY_MAP[p]);
    if (keys.length > 0) {
      return { platform: displayName, apiKey: keys[Math.floor(Math.random() * keys.length)] };
    }
  }
  return null;
}

function parseAreas(rawText: string): string[] {
  const text = rawText.trim();

  // Strategy 1: Direct JSON parse
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const areas = parsed.filter((a: unknown) => typeof a === 'string' && (a as string).trim().length > 0).map((a: string) => a.trim());
      if (areas.length > 0) return areas.slice(0, 15);
    }
  } catch { /* fall through */ }

  // Strategy 2: Strip markdown fences and extract JSON array
  const cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const areas = JSON.parse(jsonMatch[0])
        .filter((a: unknown) => typeof a === 'string' && (a as string).trim().length > 0)
        .map((a: string) => a.trim());
      if (areas.length > 0) return areas.slice(0, 15);
    } catch { /* fall through */ }
  }

  // Strategy 3: Extract quoted strings as fallback
  const quoted = text.match(/"([^"]{2,80})"/g);
  if (quoted && quoted.length >= 3) {
    return quoted.map(q => q.replace(/^"|"$/g, '').trim()).filter(a => a.length > 0).slice(0, 15);
  }

  // Strategy 4: Look for numbered or comma-separated lists
  const lines = text.split('\n').map(l => l.replace(/^\d+[\.\)]\s*/, '').replace(/^[-*]\s*/, '').trim()).filter(l => l.length > 2 && l.length < 80);
  if (lines.length >= 3) return lines.slice(0, 15);

  return [];
}
