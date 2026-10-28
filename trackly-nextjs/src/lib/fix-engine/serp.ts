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
 * Every call is pinned to the brand's market (see marketFor) so the
 * competitor set is the one the customer's own searchers see, not whatever
 * the vendor's default egress resolves to.
 *
 * Either way results are cached 7 days per (brand, query) to keep
 * generation fast and cheap. The market is derived from the brand, so the
 * existing key already scopes it - two brands in different countries never
 * share a cached SERP. A brand that edits its own country or city keeps the
 * old market's results until the 7-day entry expires.
 *
 * Everything here is best-effort: any failure returns [] and generation
 * proceeds without competitor context.
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

/**
 * Google market for a brand's SERP lookups.
 *
 * An unpinned SERP call is not a neutral one - the provider resolves it
 * from its own default egress, so the "top 3 competitors" a US plumber is
 * measured against can quietly come back as the top 3 in whatever market
 * the vendor happened to route through. For a local service business that
 * is not a rounding error, it is the wrong competitor set entirely, and
 * every downstream content brief inherits the mistake.
 *
 * So every call is pinned. `gl`/`hl` come from the brand's country (free
 * text, so it is normalised), and the brand's city is passed as the
 * provider's `location` when we have one, which is what actually makes a
 * "near me" query resolve like the customer's own searchers see it.
 */
const COUNTRY_CODES: Record<string, string> = {
  'united states': 'us', 'united states of america': 'us', usa: 'us', 'u.s.': 'us', 'u.s.a.': 'us', america: 'us',
  'united kingdom': 'gb', uk: 'gb', 'great britain': 'gb', britain: 'gb', england: 'gb', scotland: 'gb', wales: 'gb',
  canada: 'ca', australia: 'au', 'new zealand': 'nz', ireland: 'ie', india: 'in', 'south africa': 'za',
  germany: 'de', deutschland: 'de', france: 'fr', spain: 'es', espana: 'es', italy: 'it', italia: 'it',
  netherlands: 'nl', holland: 'nl', belgium: 'be', sweden: 'se', norway: 'no', denmark: 'dk', finland: 'fi',
  poland: 'pl', portugal: 'pt', austria: 'at', switzerland: 'ch', mexico: 'mx', brazil: 'br', brasil: 'br',
  argentina: 'ar', japan: 'jp', singapore: 'sg', 'united arab emirates': 'ae', uae: 'ae', philippines: 'ph',
};

/** Default market. The product's customer base is overwhelmingly US local. */
export const DEFAULT_MARKET = { gl: 'us', hl: 'en' } as const;

/**
 * Normalise a brand's free-text country to a 2-letter Google `gl` code.
 * Unrecognised input falls back to the default rather than guessing, so a
 * typo degrades to "US results" instead of to "some other country's".
 */
export function countryCode(country: string | null | undefined): string {
  const raw = (country ?? '').trim().toLowerCase();
  if (!raw) return DEFAULT_MARKET.gl;
  if (/^[a-z]{2}$/.test(raw)) return raw;
  return COUNTRY_CODES[raw.replace(/\./g, '.')] ?? COUNTRY_CODES[raw] ?? DEFAULT_MARKET.gl;
}

export interface SerpMarket {
  /** Google country code, e.g. "us". */
  gl: string;
  /** Interface language, e.g. "en". */
  hl: string;
  /** Free-text location for the provider ("Boise, Idaho"), when known. */
  location: string | null;
}

/** The market to search in for one brand. */
export function marketFor(brand: { country?: string | null; city?: string | null }): SerpMarket {
  const gl = countryCode(brand.country);
  const city = (brand.city ?? '').trim();
  return { gl, hl: DEFAULT_MARKET.hl, location: city || null };
}

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
async function fetchSerper(query: string, market: SerpMarket): Promise<SerpResult[] | null> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return null;
  const res = await safeFetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      q: query,
      num: MAX_RESULTS + 4, // headroom for own-domain filtering
      gl: market.gl,
      hl: market.hl,
      ...(market.location ? { location: market.location } : {}),
    }),
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
async function fetchSerpApi(query: string, market: SerpMarket): Promise<SerpResult[] | null> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return null;
  const u = new URL('https://serpapi.com/search.json');
  u.searchParams.set('engine', 'google');
  u.searchParams.set('q', query);
  u.searchParams.set('num', String(MAX_RESULTS + 4)); // headroom for own-domain filtering
  u.searchParams.set('gl', market.gl);
  u.searchParams.set('hl', market.hl);
  if (market.location) u.searchParams.set('location', market.location);
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

    // Pin the market before any provider is asked. See marketFor().
    const market = marketFor(ctx.brand);
    let fetched = (await fetchSerper(q, market)) ?? (await fetchSerpApi(q, market));
    if (!fetched) {
      const where = market.location
        ? `${market.location} (${market.gl.toUpperCase()})`
        : market.gl.toUpperCase();
      const { data } = await generateJson<{ results: SerpResult[] }>({
        ctx,
        platform: 'Perplexity',
        system: SERP_FETCH_SYSTEM,
        user: `Search query: "${q}"\nSearcher's market: ${where}, interface language ${market.hl}.\n\n`
          + `Report the current top ${MAX_RESULTS} ranking pages as a searcher in that market sees them.`,
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
