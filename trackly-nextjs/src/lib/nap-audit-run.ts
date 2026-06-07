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
  type CanonicalNap,
  type DuplicateGroup,
  type UrlResult,
} from '@/lib/nap-verify';

export const NAP_MAX_URLS = 50;
const FETCH_TIMEOUT_MS = 12_000;
// Cap simultaneous outbound fetches so a 50-URL batch doesn't open 50 sockets
// at once or hammer a single directory.
const FETCH_CONCURRENCY = 8;

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
