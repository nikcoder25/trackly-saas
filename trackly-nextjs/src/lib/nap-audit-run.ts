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
  detectDuplicates,
  extractNap,
  extractionStrength,
  isWeakExtraction,
  type CanonicalNap,
  type DuplicateGroup,
  type ExtractedNap,
  type UrlResult,
} from '@/lib/nap-verify';

export const NAP_MAX_URLS = 50;
const FETCH_TIMEOUT_MS = 12_000;
// Cap simultaneous outbound fetches so a 50-URL batch doesn't open 50 sockets
// at once or hammer a single directory.
const FETCH_CONCURRENCY = 8;
// Layer 3 (optional). When NAP_RENDER_ENDPOINT is configured, weak/blocked
// pages are re-fetched through an operator-provided headless-render service
// (e.g. a browserless instance) instead of bundling Chromium into the app.
// Absent the env var, behaviour is byte-identical to Layers 1+2 only.
const RENDER_ENDPOINT = process.env.NAP_RENDER_ENDPOINT?.trim();
const RENDER_TOKEN = process.env.NAP_RENDER_TOKEN?.trim();
const RENDER_TIMEOUT_MS = 25_000;

export function renderServiceEnabled(): boolean {
  return !!RENDER_ENDPOINT;
}

/**
 * Ask the render service for fully-rendered HTML. The endpoint is operator-
 * configured (trusted), so we call it directly; it is responsible for safely
 * fetching the target URL. Accepts a raw-HTML body or a { html } JSON payload.
 * Returns null on any failure so the caller falls back to the Layer 1/2 result.
 */
async function renderHtml(url: string): Promise<string | null> {
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

export interface NapRunSummary {
  total: number;
  clean: number;
  withIssues: number;
  deadLinks: number;
  duplicateListings: number;
}

export interface NapRunResult {
  results: UrlResult[];
  score: number;
  summary: NapRunSummary;
  duplicates: DuplicateGroup[];
}

function build(
  url: string,
  httpStatus: number | null,
  reachable: boolean,
  extracted: ExtractedNap,
  canonical: CanonicalNap,
  extra: { error?: string; rendered?: boolean } = {},
): UrlResult {
  const cmp = compareNap(canonical, extracted, reachable);
  return { url, httpStatus, reachable, extracted, ...extra, ...cmp };
}

/**
 * Layer 3 attempt: re-render `url` and, if it yields a stronger extraction than
 * what we already have, return the upgraded result. Returns null to keep the
 * original. `httpStatus` is the status from the direct fetch (may be null).
 */
async function tryRender(
  url: string,
  httpStatus: number | null,
  current: ExtractedNap,
  canonical: CanonicalNap,
): Promise<UrlResult | null> {
  const html = await renderHtml(url);
  if (!html) return null;
  const extracted = extractNap(html);
  if (extractionStrength(extracted) <= extractionStrength(current)) return null;
  return build(url, httpStatus, true, extracted, canonical, { rendered: true });
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
      // Blocked / error status — Layer 3 may still get through.
      if (RENDER_ENDPOINT) {
        const rendered = await tryRender(url, res.status, { source: {} }, canonical);
        if (rendered) return rendered;
      }
      return build(url, res.status, false, { source: {} }, canonical);
    }

    const html = await res.text();
    const extracted = extractNap(html);
    if (RENDER_ENDPOINT && isWeakExtraction(extracted)) {
      const rendered = await tryRender(url, res.status, extracted, canonical);
      if (rendered) return rendered;
    }
    return build(url, res.status, true, extracted, canonical);
  } catch (err) {
    // Never render an SSRF-blocked target (it resolved to a private IP).
    if (RENDER_ENDPOINT && !(err instanceof SSRFError)) {
      const rendered = await tryRender(url, null, { source: {} }, canonical);
      if (rendered) return rendered;
    }
    const code = err instanceof SSRFError ? err.code : 'FETCH_FAILED';
    const error =
      err instanceof SSRFError ? ssrfErrorToCopy(code) : 'Could not fetch this URL.';
    return build(url, null, false, { source: {} }, canonical, { error });
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
    duplicateListings: duplicates.length,
  };
  return { results, score, summary, duplicates };
}
