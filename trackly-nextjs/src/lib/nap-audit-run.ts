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

// Capped at 500 so an operator can audit a brand's full citation set in a
// single run (the practical ceiling we've observed; bigger sets are rare
// enough that we'd rather catch a typo than process them silently). The
// worker runs in the background via Next.js after() + a cron safety net,
// so wall-clock time is bounded by FETCH_CONCURRENCY × per-URL timeout
// rather than any single request lifetime.
export const NAP_MAX_URLS = 500;
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
// Cap simultaneous outbound fetches so a large batch doesn't open hundreds
// of sockets at once or hammer a single directory. Sized so a 500-URL run
// completes in single-digit minutes when most pages return promptly.
const FETCH_CONCURRENCY = 16;
// ── Layer 3: unblocker / headless-render (optional) ──────────────────────────
// Weak or blocked pages (Cloudflare/WAF/JS-only) are re-fetched through a real
// browser + residential proxies so their NAP becomes readable. Several paid
// backends, tried in order; absent all of them, behaviour is byte-identical to
// Layers 1+2. They bill per *successful* request, so at the small residual
// volume left after the free Layer-3b/c/d chain the cost is typically cents.
//
//  1. ScraperAPI (SCRAPERAPI_KEY) — hosted unblocker. Credit cost per request
//     depends on mode: render≈10, premium(residential)≈10-25, ultra_premium
//     (beats Cloudflare)≈30. Defaults to render + premium; set
//     SCRAPERAPI_ULTRA=true for the hardest sites. Optional SCRAPERAPI_COUNTRY
//     (e.g. "gb"/"us") geo-targets the proxy. SCRAPERAPI_RENDER=false drops JS
//     rendering to save credits.
//  2. NAP_RENDER_ENDPOINT — a generic "POST {url} → HTML" service (e.g.
//     self-hosted browserless).
//  3. Zyte API (ZYTE_API_KEY) — pay-per-success unblocker with built-in
//     anti-ban + residential proxies; we request browserHtml so JS-rendered,
//     JSON-LD-bearing pages come back ready to parse. $5 trial, no monthly min.
//  4. Bright Data Web Unlocker (BRIGHTDATA_API_TOKEN + BRIGHTDATA_UNLOCKER_ZONE)
//     — highest independent success rate on hard anti-bot sites; direct API
//     (api.brightdata.com/request) returns the raw unblocked HTML.
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY?.trim();
const SCRAPERAPI_ULTRA = process.env.SCRAPERAPI_ULTRA === 'true';
const SCRAPERAPI_RENDER = process.env.SCRAPERAPI_RENDER !== 'false';
const SCRAPERAPI_COUNTRY = process.env.SCRAPERAPI_COUNTRY?.trim();
const RENDER_ENDPOINT = process.env.NAP_RENDER_ENDPOINT?.trim();
const RENDER_TOKEN = process.env.NAP_RENDER_TOKEN?.trim();
const RENDER_TIMEOUT_MS = 25_000;
// Unblocker APIs run a real browser + solve challenges, which can take a while.
const SCRAPER_TIMEOUT_MS = 70_000;
// Zyte / Bright Data run a real browser + anti-ban upstream; give them room.
const UNBLOCKER_API_TIMEOUT_MS = 40_000;
const ZYTE_API_KEY = process.env.ZYTE_API_KEY?.trim();
// Set ZYTE_BROWSER=false to use the cheaper httpResponseBody mode (no JS
// render); default uses browserHtml, which is more reliable on anti-bot/JS
// directories and gives us the original markup for JSON-LD extraction.
const ZYTE_BROWSER = process.env.ZYTE_BROWSER !== 'false';
const BRIGHTDATA_API_TOKEN = process.env.BRIGHTDATA_API_TOKEN?.trim();
const BRIGHTDATA_UNLOCKER_ZONE = process.env.BRIGHTDATA_UNLOCKER_ZONE?.trim();
// Paid unblockers fetch the *live* page through residential proxies + a real
// browser. Enabled only when a key/endpoint is configured.
const PAID_UNBLOCKER_ENABLED = !!(
  SCRAPERAPI_KEY ||
  RENDER_ENDPOINT ||
  ZYTE_API_KEY ||
  (BRIGHTDATA_API_TOKEN && BRIGHTDATA_UNLOCKER_ZONE)
);

// ── Layer 3b: Wayback Machine fallback (free, no key) ────────────────────────
// When a directory blocks our server (Cloudflare/WAF 403 etc.), beating it on
// the live site needs paid residential proxies. The free alternative: read the
// page's most recent snapshot from the Internet Archive. archive.org isn't
// behind the live site's anti-bot wall and serves the *original* HTML (JSON-LD
// intact), so the NAP extracts exactly as it would from the live page.
//
// The trade-off is freshness — a snapshot can be weeks or months old — so a
// Wayback result is tagged with its snapshot date, is only ever used to rescue
// a page we genuinely couldn't read live (never to "improve" a live read), and
// never silently overrides fresher data. Enabled by default since it costs
// nothing; set NAP_WAYBACK_FALLBACK=false to turn it off.
const WAYBACK_ENABLED = process.env.NAP_WAYBACK_FALLBACK !== 'false';
const WAYBACK_TIMEOUT_MS = 15_000;

// ── Layer 3c: Save Page Now (free, no key) ───────────────────────────────────
// When the archive has no snapshot, ask archive.org to capture the live page on
// demand, then read that *fresh* copy. Fills the coverage gap left by Wayback
// and dates to today, so it sidesteps the staleness caveat too. Anonymous use
// is rate-limited; optional archive.org S3 keys (free account) raise the
// ceiling. Default on; set NAP_SAVE_PAGE_NOW=false to disable.
const SPN_ENABLED = process.env.NAP_SAVE_PAGE_NOW !== 'false';
const SPN_TIMEOUT_MS = 45_000;
const ARCHIVE_S3_ACCESS_KEY = process.env.ARCHIVE_S3_ACCESS_KEY?.trim();
const ARCHIVE_S3_SECRET_KEY = process.env.ARCHIVE_S3_SECRET_KEY?.trim();

// ── Layer 3d: Jina Reader (free) ─────────────────────────────────────────────
// Last-resort free reader: r.jina.ai fetches the live page through its own clean
// IPs and returns the HTML, often beating an IP-reputation block when even the
// archive's crawler can't. Fresh data (no staleness). Trade-off: the listing
// URL is sent to a third party. Optional JINA_API_KEY raises the free rate
// limit. Default on; set NAP_JINA_FALLBACK=false to disable.
const JINA_ENABLED = process.env.NAP_JINA_FALLBACK !== 'false';
const JINA_TIMEOUT_MS = 30_000;
const JINA_API_KEY = process.env.JINA_API_KEY?.trim();

// Per-process backoff so we stop hammering a free service after it rate-limits
// us (HTTP 429). Skipped until the timestamp passes; reset on restart.
const RATE_LIMIT_BACKOFF_MS = 10 * 60_000;
let spnBackoffUntil = 0;
let jinaBackoffUntil = 0;

// Layer 3 is attempted on a blocked page when any backend (paid or free) exists.
const UNBLOCKER_ENABLED =
  PAID_UNBLOCKER_ENABLED || WAYBACK_ENABLED || SPN_ENABLED || JINA_ENABLED;

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
 * Fetch unblocked HTML via the Zyte API. browserHtml mode renders JS and
 * applies Zyte's anti-ban + residential proxies, returning the page markup
 * directly (JSON-LD intact). httpResponseBody mode is cheaper but no JS; its
 * body is base64-encoded. Bills only on success. Returns null on any failure.
 */
async function fetchViaZyte(url: string): Promise<string | null> {
  if (!ZYTE_API_KEY) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UNBLOCKER_API_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.zyte.com/v1/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${ZYTE_API_KEY}:`).toString('base64')}`,
      },
      body: JSON.stringify(
        ZYTE_BROWSER ? { url, browserHtml: true } : { url, httpResponseBody: true },
      ),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as
      | { browserHtml?: string; httpResponseBody?: string }
      | null;
    if (ZYTE_BROWSER) return data?.browserHtml || null;
    return data?.httpResponseBody
      ? Buffer.from(data.httpResponseBody, 'base64').toString('utf8')
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch unblocked HTML via Bright Data's Web Unlocker direct API. `format:
 * 'raw'` returns the unblocked page body as the response body. Requires both an
 * API token and the configured Unlocker zone name. Bills only on success.
 * Returns null on any failure.
 */
async function fetchViaBrightData(url: string): Promise<string | null> {
  if (!BRIGHTDATA_API_TOKEN || !BRIGHTDATA_UNLOCKER_ZONE) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UNBLOCKER_API_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BRIGHTDATA_API_TOKEN}`,
      },
      body: JSON.stringify({ zone: BRIGHTDATA_UNLOCKER_ZONE, url, format: 'raw' }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface RenderResult {
  html: string;
  /** Set when the HTML came from an Internet Archive snapshot (YYYY-MM-DD). */
  archivedAt?: string;
}

/** "20230615120000" → "2023-06-15"; undefined when the stamp is unusable. */
function formatWaybackTimestamp(ts?: string): string | undefined {
  if (!ts || ts.length < 8) return undefined;
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

/**
 * Free fallback: fetch the most recent Internet Archive snapshot of a blocked
 * page. Two hops — the availability API to find the closest HTTP-200 snapshot,
 * then the raw archived HTML. The `id_` modifier on the snapshot URL returns
 * the original document (no Wayback toolbar or link rewriting), so JSON-LD and
 * microdata parse exactly as they would on the live page. Returns null when
 * nothing is archived, so the caller keeps the blocked result.
 */
async function fetchViaWayback(url: string): Promise<RenderResult | null> {
  if (!WAYBACK_ENABLED) return null;
  const ua = BROWSER_HEADERS['User-Agent'];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WAYBACK_TIMEOUT_MS);
  try {
    const availRes = await fetch(
      `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
      { signal: controller.signal, headers: { 'User-Agent': ua } },
    );
    if (!availRes.ok) return null;
    const data = (await availRes.json().catch(() => null)) as {
      archived_snapshots?: {
        closest?: { available?: boolean; url?: string; timestamp?: string; status?: string };
      };
    } | null;
    const snap = data?.archived_snapshots?.closest;
    if (!snap?.available || !snap.timestamp || snap.status !== '200') return null;
    // Build the raw-snapshot URL from the timestamp so we always request the
    // unmodified original document, regardless of how the API formatted snap.url.
    const rawUrl = `https://web.archive.org/web/${snap.timestamp}id_/${url}`;
    const pageRes = await fetch(rawUrl, { signal: controller.signal, headers: { 'User-Agent': ua } });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    if (!html) return null;
    return { html, archivedAt: formatWaybackTimestamp(snap.timestamp) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the 14-digit Wayback timestamp out of a snapshot URL or path, if present. */
function waybackTimestampFromUrl(u: string | null | undefined): string | undefined {
  const m = u?.match(/\/web\/(\d{14})/);
  return m ? m[1] : undefined;
}

/**
 * Free fallback: ask the Internet Archive to capture the live page right now
 * (Save Page Now), then read the fresh snapshot it just created. This is the
 * gap-filler for pages Wayback hasn't archived before, and the result dates to
 * today. Anonymous capture is heavily rate-limited, so on a 429 we back off for
 * the rest of the run and let the next backend take over; optional archive.org
 * S3 keys raise the limit. Returns null on any failure.
 */
async function fetchViaSavePageNow(url: string): Promise<RenderResult | null> {
  if (!SPN_ENABLED || Date.now() < spnBackoffUntil) return null;
  const ua = BROWSER_HEADERS['User-Agent'];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SPN_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'User-Agent': ua };
    if (ARCHIVE_S3_ACCESS_KEY && ARCHIVE_S3_SECRET_KEY) {
      headers.Authorization = `LOW ${ARCHIVE_S3_ACCESS_KEY}:${ARCHIVE_S3_SECRET_KEY}`;
    }
    // Synchronous capture: archive.org fetches the page and redirects us to the
    // freshly-minted snapshot. We follow it to learn the snapshot timestamp.
    const res = await fetch(`https://web.archive.org/save/${url}`, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
    if (res.status === 429) {
      spnBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      return null;
    }
    if (!res.ok) return null;
    const ts =
      waybackTimestampFromUrl(res.url) ||
      waybackTimestampFromUrl(res.headers.get('content-location'));
    if (ts) {
      // Re-read the original document (no toolbar/rewriting) for clean JSON-LD.
      const raw = await fetch(`https://web.archive.org/web/${ts}id_/${url}`, {
        headers: { 'User-Agent': ua },
        signal: controller.signal,
      });
      if (raw.ok) {
        const html = await raw.text();
        if (html) return { html, archivedAt: formatWaybackTimestamp(ts) };
      }
    }
    // Fall back to the body SPN returned directly (toolbar-wrapped, but the
    // original JSON-LD/microdata is still embedded, so the extractor copes).
    const body = await res.text();
    return body ? { html: body, archivedAt: formatWaybackTimestamp(ts) } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Free fallback: route the blocked page through r.jina.ai, which fetches it via
 * its own infrastructure and returns the HTML. Fresh data, often gets through
 * an IP-reputation block. We request the HTML form (Jina defaults to markdown)
 * so the NAP extractor still sees the original structured-data tags. Backs off
 * for the rest of the run on a 429. Returns null on any failure.
 */
async function fetchViaJina(url: string): Promise<RenderResult | null> {
  if (!JINA_ENABLED || Date.now() < jinaBackoffUntil) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JINA_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      'X-Return-Format': 'html',
      'User-Agent': BROWSER_HEADERS['User-Agent'],
    };
    if (JINA_API_KEY) headers.Authorization = `Bearer ${JINA_API_KEY}`;
    const res = await fetch(`https://r.jina.ai/${url}`, { headers, signal: controller.signal });
    if (res.status === 429) {
      jinaBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      return null;
    }
    if (!res.ok) return null;
    const html = await res.text();
    // Jina returns live data, so there's no archive date to attach.
    return html ? { html } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Re-fetch a blocked URL through the configured unblockers, in cost/quality
 * order. Paid backends (the live page via ScraperAPI / a render endpoint /
 * Zyte / Bright Data) win when configured. The free chain runs only when
 * `includeArchive` is set — we
 * never use it to "improve" a page that already loaded live:
 *   1. existing Wayback snapshot — instant when present (may be stale)
 *   2. Save Page Now — captures a fresh snapshot when none exists
 *   3. Jina Reader — live read via a third-party proxy as a last resort
 * Returns null when none configured / all fail, so the caller keeps the
 * Layer 1/2 result.
 */
async function renderHtml(url: string, includeArchive: boolean): Promise<RenderResult | null> {
  const live =
    (await fetchViaScraperApi(url)) ??
    (await fetchViaRenderEndpoint(url)) ??
    (await fetchViaZyte(url)) ??
    (await fetchViaBrightData(url));
  if (live) return { html: live };
  if (!includeArchive) return null;
  return (
    (await fetchViaWayback(url)) ??
    (await fetchViaSavePageNow(url)) ??
    (await fetchViaJina(url))
  );
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
  archivedAt?: string,
): UrlResult {
  const v = verifyNap(canonical, html);
  return {
    url,
    httpStatus,
    reachable: true,
    extracted: v.extracted,
    ...(rendered ? { rendered: true } : {}),
    ...(archivedAt ? { archivedAt } : {}),
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
  includeArchive: boolean,
): Promise<UrlResult | null> {
  const r = await renderHtml(url, includeArchive);
  if (!r) return null;
  const rendered = evaluate(url, httpStatus, r.html, canonical, true, r.archivedAt);
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
      // Blocked / error status — the unblocker (paid live fetch or the free
      // Wayback snapshot) may still get through.
      if (UNBLOCKER_ENABLED) {
        const rendered = await tryRender(url, res.status, canonical, null, true);
        if (rendered) return rendered;
      }
      return deadResult(url, res.status, canonical);
    }

    const html = await res.text();
    const result = evaluate(url, res.status, html, canonical, false);
    // Only spend a *paid* unblocker call when the static fetch verified little.
    // We deliberately don't fall back to Wayback here: the page already loaded
    // live, so a possibly-stale archive snapshot of it wouldn't be an upgrade.
    if (PAID_UNBLOCKER_ENABLED && matchedCount(result) < 2) {
      const rendered = await tryRender(url, res.status, canonical, result, false);
      if (rendered) return rendered;
    }
    return result;
  } catch (err) {
    // Never render an SSRF-blocked target (it resolved to a private IP).
    if (UNBLOCKER_ENABLED && !(err instanceof SSRFError)) {
      const rendered = await tryRender(url, null, canonical, null, true);
      if (rendered) return rendered;
    }
    const code = err instanceof SSRFError ? err.code : 'FETCH_FAILED';
    const error =
      err instanceof SSRFError ? ssrfErrorToCopy(code) : 'Could not fetch this URL.';
    return deadResult(url, null, canonical, { error });
  }
}

/**
 * Run `fn` over `items` with at most `limit` in flight, preserving order.
 * Calls `onProgress(done, total)` after each completion so callers can
 * surface live progress to the UI without re-querying.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let done = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

export interface RunNapCheckOptions {
  /** Called after each URL finishes; used to persist live progress. */
  onProgress?: (done: number, total: number) => void;
}

/** Fetch + extract + compare every URL against the canonical NAP. */
export async function runNapCheck(
  canonical: CanonicalNap,
  urls: string[],
  options: RunNapCheckOptions = {},
): Promise<NapRunResult> {
  const results = await mapWithConcurrency(
    urls,
    FETCH_CONCURRENCY,
    (u) => checkUrl(u, canonical),
    options.onProgress,
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
