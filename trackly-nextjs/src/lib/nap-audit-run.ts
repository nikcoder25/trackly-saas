/**
 * NAP check runner — the server-only side of the engine. Fetches each citation
 * URL with the SSRF-hardened client, runs the pure extraction/matching from
 * nap-verify, and assembles the scored result. Shared by both the free public
 * tool (/api/tools/nap-checker) and the saved-audit feature (lib/nap-audits).
 *
 * Kept separate from nap-verify.ts because that module is pure and bundled into
 * the client; safeFetch pulls in node:dns/node:net and must stay server-only.
 */
import { safeFetch, SSRFError, ssrfErrorToCopy } from '@/lib/safe-fetch';
import {
  compareNap,
  consistencyScore,
  classifyUnreachable,
  detectDuplicates,
  verifyNap,
  type CanonicalNap,
  type CompareResult,
  type DuplicateGroup,
  type UrlResult,
} from '@/lib/nap-verify';

export const NAP_MAX_URLS = 50;
const FETCH_TIMEOUT_MS = 12_000;
// Present as a real Chrome "direct navigation" request. Many directories return
// 403 (or a cloaked 404) to anything that doesn't look like a browser; a full,
// internally-consistent set of navigation headers + client hints clears the
// common header/UA gates. (We're fetching the user's own public listings.)
// Note: Accept-Encoding is intentionally omitted — undici sets and decompresses
// it automatically, and setting it by hand risks an undecoded body.
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Cache-Control': 'max-age=0',
};
// Statuses that usually mean "anti-bot block / transient", not "page gone".
// Worth one retry and worth labelling as blocked rather than a dead link.
const BLOCK_STATUSES = new Set([401, 403, 406, 409, 429, 451, 503]);
// Cap simultaneous outbound fetches so a 50-URL batch doesn't open 50 sockets
// at once or hammer a single directory.
const FETCH_CONCURRENCY = 8;
// ── Layer 3: unblocker / headless-render (optional) ──────────────────────────
// Weak or blocked pages (Cloudflare/WAF/JS-only) are re-fetched through a real
// browser + residential proxies so their NAP becomes readable. Two backends,
// tried in order; absent both, behaviour is byte-identical to Layers 1+2.
//
//  1. ScraperAPI (SCRAPERAPI_KEY) — hosted unblocker. Credit cost per request
//     depends on mode: render≈10, premium(residential)≈10-25, ultra_premium
//     (beats Cloudflare)≈30. Defaults to render + premium; set
//     SCRAPERAPI_ULTRA=true for the hardest sites. Optional SCRAPERAPI_COUNTRY
//     (e.g. "gb"/"us") geo-targets the proxy. SCRAPERAPI_RENDER=false drops JS
//     rendering to save credits.
//  2. NAP_RENDER_ENDPOINT — a generic "POST {url} → HTML" service (e.g.
//     self-hosted browserless).
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY?.trim();
const SCRAPERAPI_ULTRA = process.env.SCRAPERAPI_ULTRA === 'true';
const SCRAPERAPI_RENDER = process.env.SCRAPERAPI_RENDER !== 'false';
const SCRAPERAPI_COUNTRY = process.env.SCRAPERAPI_COUNTRY?.trim();
const RENDER_ENDPOINT = process.env.NAP_RENDER_ENDPOINT?.trim();
const RENDER_TOKEN = process.env.NAP_RENDER_TOKEN?.trim();
const RENDER_TIMEOUT_MS = 25_000;
// Unblocker APIs run a real browser + solve challenges, which can take a while.
const SCRAPER_TIMEOUT_MS = 70_000;
const UNBLOCKER_ENABLED = !!(SCRAPERAPI_KEY || RENDER_ENDPOINT);

export function renderServiceEnabled(): boolean {
  return UNBLOCKER_ENABLED;
}

/** Fetch fully-rendered HTML for a blocked/JS page via ScraperAPI. */
async function fetchViaScraperApi(url: string): Promise<string | null> {
  if (!SCRAPERAPI_KEY) return null;
  const params = new URLSearchParams({ api_key: SCRAPERAPI_KEY, url });
  if (SCRAPERAPI_RENDER) params.set('render', 'true');
  // ultra_premium already implies residential proxies, so only set one.
  if (SCRAPERAPI_ULTRA) params.set('ultra_premium', 'true');
  else params.set('premium', 'true');
  if (SCRAPERAPI_COUNTRY) params.set('country_code', SCRAPERAPI_COUNTRY);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPER_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.scraperapi.com/?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null; // 4xx from ScraperAPI = couldn't unblock / out of credits
    const html = await res.text();
    return html && html.length > 0 ? html : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch rendered HTML via the generic POST {url} → HTML render endpoint. */
async function fetchViaRenderEndpoint(url: string): Promise<string | null> {
  if (!RENDER_ENDPOINT) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
  try {
    const res = await fetch(RENDER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(RENDER_TOKEN ? { Authorization: `Bearer ${RENDER_TOKEN}` } : {}),
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = (await res.json().catch(() => null)) as { html?: string } | null;
      return typeof j?.html === 'string' ? j.html : null;
    }
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Re-fetch a URL through the configured unblocker (ScraperAPI first, then the
 * generic render endpoint). Returns null when none configured / all fail, so
 * the caller keeps the Layer 1/2 result.
 */
async function renderHtml(url: string): Promise<string | null> {
  return (await fetchViaScraperApi(url)) ?? (await fetchViaRenderEndpoint(url));
}

export interface NapRunSummary {
  total: number;
  clean: number;
  withIssues: number;
  deadLinks: number;
  /** Subset of unreachable that were anti-bot blocked (vs genuinely gone). */
  blocked: number;
  duplicateListings: number;
}

export interface NapRunResult {
  results: UrlResult[];
  score: number;
  summary: NapRunSummary;
  duplicates: DuplicateGroup[];
}

/** Number of canonical-defined fields that matched — used to gate Layer 3. */
function matchedCount(cmp: CompareResult): number {
  return Object.values(cmp.fields).filter((f) => f.status === 'match').length;
}

/** Verify against fetched HTML and shape into a reachable UrlResult. */
function evaluate(
  url: string,
  httpStatus: number | null,
  html: string,
  canonical: CanonicalNap,
  rendered: boolean,
): UrlResult {
  const v = verifyNap(canonical, html);
  return {
    url,
    httpStatus,
    reachable: true,
    extracted: v.extracted,
    ...(rendered ? { rendered: true } : {}),
    fields: v.fields,
    tags: v.tags,
    matchScore: v.matchScore,
  };
}

function deadResult(
  url: string,
  httpStatus: number | null,
  canonical: CanonicalNap,
  extra: { error?: string } = {},
): UrlResult {
  const cmp = compareNap(canonical, { source: {} }, false);
  const cls = classifyUnreachable(httpStatus);
  return {
    url,
    httpStatus,
    reachable: false,
    extracted: { source: {} },
    error: extra.error ?? cls.message,
    ...cmp,
    tags: [cls.tag],
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fetchOnce(url: string): Promise<Response> {
  return safeFetch(url, { timeoutMs: FETCH_TIMEOUT_MS, headers: BROWSER_HEADERS });
}

/**
 * Layer 3 attempt: re-render `url` and keep it only if it verifies more fields
 * than the current result. Returns null to keep the original.
 */
async function tryRender(
  url: string,
  httpStatus: number | null,
  canonical: CanonicalNap,
  current: UrlResult | null,
): Promise<UrlResult | null> {
  const html = await renderHtml(url);
  if (!html) return null;
  const rendered = evaluate(url, httpStatus, html, canonical, true);
  if (current && matchedCount(rendered) <= matchedCount(current)) return null;
  return rendered;
}

async function checkUrl(url: string, canonical: CanonicalNap): Promise<UrlResult> {
  try {
    let res = await fetchOnce(url);
    // Anti-bot blocks are often transient — one retry after a short pause
    // clears a meaningful share of them.
    if (!(res.status >= 200 && res.status < 400) && BLOCK_STATUSES.has(res.status)) {
      await delay(700);
      res = await fetchOnce(url);
    }
    const reachable = res.status >= 200 && res.status < 400;

    if (!reachable) {
      // Blocked / error status — the unblocker may still get through.
      if (UNBLOCKER_ENABLED) {
        const rendered = await tryRender(url, res.status, canonical, null);
        if (rendered) return rendered;
      }
      return deadResult(url, res.status, canonical);
    }

    const html = await res.text();
    const result = evaluate(url, res.status, html, canonical, false);
    // Only spend an unblocker call when the static fetch verified little.
    if (UNBLOCKER_ENABLED && matchedCount(result) < 2) {
      const rendered = await tryRender(url, res.status, canonical, result);
      if (rendered) return rendered;
    }
    return result;
  } catch (err) {
    // Never render an SSRF-blocked target (it resolved to a private IP).
    if (UNBLOCKER_ENABLED && !(err instanceof SSRFError)) {
      const rendered = await tryRender(url, null, canonical, null);
      if (rendered) return rendered;
    }
    const code = err instanceof SSRFError ? err.code : 'FETCH_FAILED';
    const error =
      err instanceof SSRFError ? ssrfErrorToCopy(code) : 'Could not fetch this URL.';
    return deadResult(url, null, canonical, { error });
  }
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

/** Fetch + extract + compare every URL against the canonical NAP. */
export async function runNapCheck(
  canonical: CanonicalNap,
  urls: string[],
): Promise<NapRunResult> {
  const results = await mapWithConcurrency(urls, FETCH_CONCURRENCY, (u) =>
    checkUrl(u, canonical),
  );
  const score = consistencyScore(results);
  const duplicates = detectDuplicates(results);
  const summary: NapRunSummary = {
    total: results.length,
    clean: results.filter((r) => r.reachable && r.tags.length === 0).length,
    withIssues: results.filter((r) => r.reachable && r.tags.length > 0).length,
    deadLinks: results.filter((r) => !r.reachable).length,
    blocked: results.filter((r) => r.tags.includes('blocked')).length,
    duplicateListings: duplicates.length,
  };
  return { results, score, summary, duplicates };
}
