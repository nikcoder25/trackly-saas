/**
 * Fix Engine - competitor SERP intelligence for title/meta generation.
 *
 * Before rewriting a title or meta description, we look at what's currently
 * ranking for the page's primary query and hand those competitor titles +
 * descriptions to the prompt — so the rewrite is written to WIN the click
 * against the real SERP, not in a vacuum.
 *
 * Sourcing order:
 *   1. Serper.dev (real Google results, ~$1/1k searches) — SERPER_API_KEY.
 *   2. SerpApi (real Google results) — SERPAPI_KEY.
 *   3. A web-grounded model call (Perplexity, the same grounded engine the
 *      product's tracking uses) — a close approximation, no extra vendor.
 * Either way results are cached 7 days per (brand, query) to keep
 * generation fast and cheap. Everything here is best-effort: any failure
 * returns [] and generation proceeds without competitor context.
 */

import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { safeFetch } from '@/lib/safe-fetch';
import { generateJson } from './generate';
import { getValidAccessToken, searchAnalytics, trailingDateRange } from './gsc';
import { normUrl } from './page-metrics';
import type { FixContext } from './types';

export const SERP_CACHE_DAYS = 7;
const MAX_RESULTS = 8;

export interface SerpResult {
  title: string;
  description: string;
  url: string;
}

let schemaEnsured = false;
async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fix_serp_cache (
      brand_id   TEXT NOT NULL,
      query      TEXT NOT NULL,
      results    JSONB NOT NULL DEFAULT '[]'::jsonb,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (brand_id, query)
    )
  `);
  schemaEnsured = true;
}

const SERP_FETCH_SYSTEM = `You are a search-results researcher with live web access. The user gives you a search query. Search the web and report the CURRENT top-ranking pages for that query — the real pages a searcher sees, with their real title tags and meta-description-style snippets.

Hard rules:
- Report what actually ranks; do not invent pages, titles, or snippets.
- Skip ads, and skip google.com/youtube.com/social-media profile results.
- Titles and descriptions should be as close to the pages' actual metadata as you can determine.

Return ONLY a JSON object:
{ "results": [ { "title": "<page title>", "description": "<snippet/meta description>", "url": "<page url>" } ] }`;

/**
 * The page's primary query: its top GSC query by impressions (28d), or null
 * when GSC isn't connected / has no data for the URL. Callers may fall back
 * to deriveQuery().
 */
export async function getPrimaryQueryForPage(ctx: FixContext, url: string): Promise<string | null> {
  try {
    const token = await getValidAccessToken(ctx.brand.id, ctx.tenantId);
    if (!token || !token.siteUrl) return null;
    const { startDate, endDate } = trailingDateRange(28);
    const rows = await searchAnalytics({
      accessToken: token.accessToken, siteUrl: token.siteUrl, startDate, endDate,
      dimensions: ['page', 'query'], rowLimit: 3000,
    });
    const want = normUrl(url);
    let best: { query: string; impressions: number } | null = null;
    for (const r of rows) {
      const [page, query] = r.keys;
      if (!page || !query || normUrl(page) !== want) continue;
      if (!best || r.impressions > best.impressions) best = { query, impressions: r.impressions };
    }
    return best?.query ?? null;
  } catch {
    return null;
  }
}

/**
 * Derive a search query from the page's own title/H1 when GSC can't supply
 * one: strip the brand suffix ("… | Acme" / "… - Acme") and collapse.
 */
export function deriveQuery(title: string | null, h1: string | null, brandName?: string): string | null {
  let base = (title || h1 || '').trim();
  if (!base) return null;
  base = base.split(/\s+[|\-–—]\s+/)[0].trim();
  if (brandName) {
    base = base.replace(new RegExp(brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
  }
  base = base.replace(/\s{2,}/g, ' ');
  return base.length >= 3 ? base.toLowerCase() : null;
}

/**
 * Real Google results via Serper.dev (the budget option: ~$1 per 1,000
 * searches, pay-as-you-go credits). Used when SERPER_API_KEY is set —
 * checked before SerpApi since operators who set it chose it on cost.
 * Returns null when the key is absent; throws on request failure.
 */
async function fetchSerper(query: string): Promise<SerpResult[] | null> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return null;
  const res = await safeFetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ q: query, num: MAX_RESULTS + 4 }), // headroom for own-domain filtering
  });
  if (!res.ok) throw new Error(`serper ${res.status}`);
  const body = (await res.json()) as { organic?: { title?: string; snippet?: string; link?: string }[] };
  return (body.organic || [])
    .filter((r) => r.title && r.link)
    .map((r) => ({ title: String(r.title), description: String(r.snippet || ''), url: String(r.link) }));
}

/**
 * Real Google results via SerpApi, used when the operator sets SERPAPI_KEY.
 * Returns null (not []) when the key is absent so the caller can fall back
 * to the web-grounded model path; throws on request failure so the shared
 * catch treats it like any other fetch error.
 */
async function fetchSerpApi(query: string): Promise<SerpResult[] | null> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return null;
  const u = new URL('https://serpapi.com/search.json');
  u.searchParams.set('engine', 'google');
  u.searchParams.set('q', query);
  u.searchParams.set('num', String(MAX_RESULTS + 4)); // headroom for own-domain filtering
  u.searchParams.set('api_key', key);
  const res = await safeFetch(u.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`serpapi ${res.status}`);
  const body = (await res.json()) as { organic_results?: { title?: string; snippet?: string; link?: string }[] };
  return (body.organic_results || [])
    .filter((r) => r.title && r.link)
    .map((r) => ({ title: String(r.title), description: String(r.snippet || ''), url: String(r.link) }));
}

/**
 * Top-ranking competitor results for a query, excluding the brand's own
 * domain. Cache-first; on miss, one SerpApi call (when SERPAPI_KEY is set)
 * or one web-grounded model call. Best-effort: returns [] on any failure.
 */
export async function getTopSerpResults(ctx: FixContext, query: string): Promise<SerpResult[]> {
  const q = query.trim().toLowerCase().slice(0, 150);
  if (!q) return [];
  try {
    await ensureSchema();
    const cached = await pool.query(
      `SELECT results FROM fix_serp_cache
        WHERE brand_id = $1 AND query = $2
          AND fetched_at > NOW() - ($3 || ' days')::interval`,
      [ctx.brand.id, q, String(SERP_CACHE_DAYS)],
    );
    if (cached.rows[0]) return (cached.rows[0].results as SerpResult[]) ?? [];

    let fetched = (await fetchSerper(q)) ?? (await fetchSerpApi(q));
    if (!fetched) {
      const { data } = await generateJson<{ results: SerpResult[] }>({
        ctx,
        platform: 'Perplexity',
        system: SERP_FETCH_SYSTEM,
        user: `Search query: "${q}"\n\nReport the current top ${MAX_RESULTS} ranking pages.`,
        maxTokens: 1200,
      });
      fetched = data.results || [];
    }

    const ownHost = (() => {
      try { return new URL(ctx.brand.website?.startsWith('http') ? ctx.brand.website : `https://${ctx.brand.website}`).hostname.replace(/^www\./, ''); }
      catch { return ''; }
    })();
    const results = fetched
      .filter((r) => r && typeof r.title === 'string' && typeof r.url === 'string')
      .filter((r) => {
        try { return !ownHost || !new URL(r.url).hostname.replace(/^www\./, '').endsWith(ownHost); }
        catch { return true; }
      })
      .slice(0, MAX_RESULTS)
      .map((r) => ({ title: r.title.slice(0, 200), description: String(r.description || '').slice(0, 400), url: r.url.slice(0, 500) }));

    await pool.query(
      `INSERT INTO fix_serp_cache (brand_id, query, results, fetched_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (brand_id, query) DO UPDATE SET results = EXCLUDED.results, fetched_at = NOW()`,
      [ctx.brand.id, q, JSON.stringify(results)],
    );
    return results;
  } catch (e) {
    logger.warn('fix_engine.serp_fetch_failed', { brandId: ctx.brand.id, query: q, err: (e as Error).message });
    return [];
  }
}

/**
 * Convenience for the title/meta/CTR modules: primary query (GSC → derived)
 * plus its competitor results, all best-effort.
 */
export async function getCompetitorContext(
  ctx: FixContext,
  url: string,
  title: string | null,
  h1: string | null,
): Promise<{ query: string | null; competitors: SerpResult[] }> {
  const query = (await getPrimaryQueryForPage(ctx, url)) ?? deriveQuery(title, h1, ctx.brand.name);
  if (!query) return { query: null, competitors: [] };
  const competitors = await getTopSerpResults(ctx, query);
  return { query, competitors };
}
