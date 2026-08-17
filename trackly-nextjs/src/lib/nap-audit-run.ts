/**
 * NAP check runner - the server-only side of the engine. Fetches each citation
 * URL with the SSRF-hardened client, runs the pure extraction/matching from
 * nap-verify, and assembles the scored result. Shared by both the free public
 * tool (/api/tools/nap-checker) and the saved-audit feature (lib/nap-audits).
 *
 * Kept separate from nap-verify.ts because that module is pure and bundled into
 * the client; safeFetch pulls in node:dns/node:net and must stay server-only.
 */
import { safeFetch, SSRFError, ssrfErrorToCopy } from '@/lib/safe-fetch';
// The unblocker / headless-render cascade used to live in this file; it moved
// to page-render.ts when competitor content analysis needed it too. Behaviour
// here is unchanged — same backends, same order, same env vars.
import { BROWSER_HEADERS, paidRenderEnabled, renderHtml, renderServiceEnabled } from '@/lib/page-render';
// Re-exported so existing importers of this module keep working.
export { renderServiceEnabled };
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
// Statuses that usually mean "anti-bot block / transient", not "page gone".
// Worth one retry and worth labelling as blocked rather than a dead link.
const BLOCK_STATUSES = new Set([401, 403, 406, 409, 429, 451, 503]);
// Cap simultaneous outbound fetches so a large batch doesn't open hundreds
// of sockets at once or hammer a single directory. Sized so a 500-URL run
// completes in single-digit minutes when most pages return promptly.
const FETCH_CONCURRENCY = 16;

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

/** Number of canonical-defined fields that matched - used to gate Layer 3. */
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
    // Anti-bot blocks are often transient - one retry after a short pause
    // clears a meaningful share of them.
    if (!(res.status >= 200 && res.status < 400) && BLOCK_STATUSES.has(res.status)) {
      await delay(700);
      res = await fetchOnce(url);
    }
    const reachable = res.status >= 200 && res.status < 400;

    if (!reachable) {
      // Blocked / error status - the unblocker (paid live fetch or the free
      // Wayback snapshot) may still get through.
      if (renderServiceEnabled()) {
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
    if (paidRenderEnabled() && matchedCount(result) < 2) {
      const rendered = await tryRender(url, res.status, canonical, result, false);
      if (rendered) return rendered;
    }
    return result;
  } catch (err) {
    // Never render an SSRF-blocked target (it resolved to a private IP).
    if (renderServiceEnabled() && !(err instanceof SSRFError)) {
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
