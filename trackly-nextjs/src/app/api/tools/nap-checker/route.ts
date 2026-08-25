/**
 * POST /api/tools/nap-checker - the free public NAP verification check.
 *
 * Anonymous, same-origin (listed in the middleware's CSRF_BOOTSTRAP_PATHS
 * like the other free tools). Takes a canonical NAP + up to 5 citation URLs,
 * runs the same engine as the saved-audit feature and returns the scored
 * results synchronously - 5 URLs at FETCH_CONCURRENCY finish well inside the
 * request timeout. The unblocker cascade is disabled (noRender) so a
 * signed-out visitor can never spend paid render credits; blocked pages
 * simply show as unverified with a signup nudge.
 */
import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { extractUrlsFromText, parseCanonicalNap } from '@/lib/nap-verify';
import { runNapCheck } from '@/lib/nap-audit-run';
import { logError, serverError } from '@/lib/api-error';

export const runtime = 'nodejs';
export const maxDuration = 60;

const FREE_MAX_URLS = 5;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    // 3 checks per IP per day - each check is up to 5 outbound fetches on
    // our dime. Anything beyond a tasting menu should sign up (500 URLs,
    // saved audits, schedules, the unblocker).
    const { allowed, retryAfter } = await rateLimit(`nap-checker:${ip}`, 24 * 60 * 60 * 1000, 3);
    if (!allowed) return rateLimitResponse(retryAfter);

    const body = await req.json().catch(() => ({}));
    // Honeypot: bots that fill every field get a fake success.
    if (typeof body?.company === 'string' && body.company.trim()) {
      return Response.json({ score: 0, summary: null, duplicates: [], results: [] });
    }

    const canonical = parseCanonicalNap(body?.canonical);
    if (!canonical) {
      return Response.json({ error: 'A business name is required (max 200 chars).' }, { status: 400 });
    }

    const urlText = Array.isArray(body?.urls)
      ? (body.urls as unknown[]).filter((u): u is string => typeof u === 'string').join('\n')
      : typeof body?.urls === 'string'
        ? body.urls
        : '';
    const urls = extractUrlsFromText(urlText, FREE_MAX_URLS);
    if (urls.length === 0) {
      return Response.json({ error: `Add 1-${FREE_MAX_URLS} citation or backlink URLs.` }, { status: 400 });
    }

    const run = await runNapCheck(canonical, urls, { noRender: true });
    return Response.json({
      score: run.score,
      summary: run.summary,
      duplicates: run.duplicates,
      results: run.results,
      maxUrls: FREE_MAX_URLS,
    });
  } catch (error) {
    logError('tools.nap_checker.failed', error);
    return serverError({ message: 'Failed to run the NAP check. Please try again later.' });
  }
}
