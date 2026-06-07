import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { safeFetch, SSRFError, ssrfErrorToCopy } from '@/lib/safe-fetch';
import { logError, serverError } from '@/lib/api-error';
import {
  compareNap,
  consistencyScore,
  extractNap,
  type CanonicalNap,
  type UrlResult,
} from '@/lib/nap-verify';

const MAX_URLS = 20;
const FETCH_TIMEOUT_MS = 12_000;

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
  let list: string[] = [];
  if (Array.isArray(input)) {
    list = input.filter((u): u is string => typeof u === 'string');
  } else if (typeof input === 'string') {
    list = input.split(/[\n,]+/);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    let u = raw.trim();
    if (!u) continue;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      const norm = parsed.toString();
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push(norm);
    } catch {
      /* skip unparseable lines */
    }
    if (out.length >= MAX_URLS) break;
  }
  return out;
}

async function checkUrl(url: string, canonical: CanonicalNap): Promise<UrlResult> {
  try {
    const res = await safeFetch(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      headers: {
        // Some directories 403 a bare fetch; present a normal UA.
        'User-Agent':
          'Mozilla/5.0 (compatible; LivesovNAPBot/1.0; +https://livesov.com/tools/nap-verification)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const reachable = res.status >= 200 && res.status < 400;
    if (!reachable) {
      const cmp = compareNap(canonical, { source: {} }, false);
      return {
        url,
        httpStatus: res.status,
        reachable: false,
        extracted: { source: {} },
        ...cmp,
      };
    }
    const html = await res.text();
    const extracted = extractNap(html);
    const cmp = compareNap(canonical, extracted, true);
    return { url, httpStatus: res.status, reachable: true, extracted, ...cmp };
  } catch (err) {
    const code = err instanceof SSRFError ? err.code : 'FETCH_FAILED';
    const error =
      err instanceof SSRFError ? ssrfErrorToCopy(code) : 'Could not fetch this URL.';
    const cmp = compareNap(canonical, { source: {} }, false);
    return {
      url,
      httpStatus: null,
      reachable: false,
      error,
      extracted: { source: {} },
      ...cmp,
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    // Each run fetches up to 20 external pages, so cap runs per IP per day.
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
      return Response.json(
        { error: 'Add at least one citation URL.' },
        { status: 400 },
      );
    }

    const results = await Promise.all(urls.map((u) => checkUrl(u, canonical)));
    const score = consistencyScore(results);

    const summary = {
      total: results.length,
      clean: results.filter((r) => r.reachable && r.tags.length === 0).length,
      withIssues: results.filter((r) => r.reachable && r.tags.length > 0).length,
      deadLinks: results.filter((r) => !r.reachable).length,
    };

    return Response.json({ canonical, score, summary, results });
  } catch (error) {
    logError('tools.nap_checker.failed', error);
    return serverError({ message: 'Failed to run the NAP check. Please try again later.' });
  }
}
