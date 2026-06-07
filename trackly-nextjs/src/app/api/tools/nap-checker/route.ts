import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { logError, serverError } from '@/lib/api-error';
import { extractUrlsFromText, type CanonicalNap } from '@/lib/nap-verify';
import { runNapCheck, NAP_MAX_URLS } from '@/lib/nap-audit-run';

interface NapCheckerBody {
  canonical?: Partial<CanonicalNap>;
  urls?: unknown;
  website?: string; // honeypot
}

function parseCanonical(input: Partial<CanonicalNap> | undefined): CanonicalNap | null {
  if (!input || typeof input !== 'object') return null;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 200) return null;
  const clamp = (v: unknown) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : undefined;
  return {
    name: name.slice(0, 200),
    phone: clamp(input.phone),
    street: clamp(input.street),
    suite: clamp(input.suite),
    city: clamp(input.city),
    postcode: clamp(input.postcode),
  };
}

function parseUrls(input: unknown): string[] {
  const text = Array.isArray(input)
    ? input.filter((u): u is string => typeof u === 'string').join('\n')
    : typeof input === 'string'
      ? input
      : '';
  return extractUrlsFromText(text, NAP_MAX_URLS);
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    // Each run fetches up to 50 external pages, so cap runs per IP per day.
    const { allowed, retryAfter } = await rateLimit(
      `nap-checker:${ip}`,
      24 * 60 * 60 * 1000,
      5,
    );
    if (!allowed) return rateLimitResponse(retryAfter);

    const body = (await req.json().catch(() => ({}))) as NapCheckerBody;
    if (body.website) return Response.json({ error: 'Bad request.' }, { status: 400 });

    const canonical = parseCanonical(body.canonical);
    if (!canonical) {
      return Response.json(
        { error: 'A business name is required (max 200 chars).' },
        { status: 400 },
      );
    }

    const urls = parseUrls(body.urls);
    if (urls.length === 0) {
      return Response.json({ error: 'Add at least one citation URL.' }, { status: 400 });
    }

    const { results, score, summary, duplicates } = await runNapCheck(canonical, urls);
    return Response.json({ canonical, score, summary, duplicates, results });
  } catch (error) {
    logError('tools.nap_checker.failed', error);
    return serverError({ message: 'Failed to run the NAP check. Please try again later.' });
  }
}
