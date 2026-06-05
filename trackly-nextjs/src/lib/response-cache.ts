/**
 * Shared AI response cache.
 *
 * Stops paying for duplicate AI calls by checking a Postgres `response_cache`
 * table before hitting OpenAI/Claude/Gemini/Perplexity/Grok. The cache key
 * is intentionally tenant-agnostic (excludes user_id, brand_id, temperature,
 * system prompt, tools): for a brand-tracking SaaS, "what does ChatGPT say
 * about X" should be the same answer for every customer asking on the same
 * day, so cross-tenant deduplication is a feature.
 *
 * Read/write failures are non-fatal — they log a warning and fall through to
 * the live provider call. Errors are NEVER cached.
 */
import crypto from 'crypto';
import { pool } from './db';
import { logger } from './logger';

// June 2026 cost-reduction tuning: defaults raised after the tracking
// tick was reduced from hourly to daily and per-brand schedule floors
// were confirmed to be >= 24h. Brand-tracking prompts are dominated by
// evergreen queries ("best <category> in <city>"), so a TTL shorter
// than the natural answer-drift window just throws away free hits.
//   - Non-search default: 14 days. The default path is non-search
//     (WEB_SEARCH_DEFAULT_OFF=true in prod) and training-data answers
//     don't move meaningfully inside two weeks. With a daily-scan
//     cadence a 14d TTL gives ~14 repeat hits per entry vs ~7 at 7d.
//   - Search-enabled default: 7 days. Freshness still matters for the
//     web_search-enabled path, but the hosted web_search tool (~$25/1k
//     calls on gpt-4o-search-preview) drives almost the entire OpenAI
//     bill (798 calls / two weeks per the June review). Holding search
//     responses for a week instead of a day is the largest single lever
//     left on cost now that WEB_SEARCH_DEFAULT_OFF is in place.
// Two-name read for backwards compatibility: RESPONSE_CACHE_TTL_NO_SEARCH_S
// is the documented name; RESPONSE_CACHE_TTL_DEFAULT_S is kept working as
// a legacy alias so existing deploys don't break on this rename.
const TTL_SEARCH_SECONDS = Number(process.env.RESPONSE_CACHE_TTL_SEARCH_S) || 7 * 24 * 60 * 60;
const TTL_DEFAULT_SECONDS =
  Number(process.env.RESPONSE_CACHE_TTL_NO_SEARCH_S) ||
  Number(process.env.RESPONSE_CACHE_TTL_DEFAULT_S) ||
  14 * 24 * 60 * 60;

export interface CacheKeyParams {
  prompt: string;
  platform: string;
  model: string;
  searchEnabled: boolean;
  /**
   * Defense-in-depth dedup dimension. Most prompts already embed the
   * locality verbatim, but callers that pass city as separate metadata
   * must keep cache entries city-scoped. Omitted/null → empty, which
   * preserves the legacy key shape for prompts that already contain
   * the city string.
   */
  city?: string | null;
}

export interface CachedEntry<T = unknown> {
  response: T;
  model: string;
  createdAt: Date;
}

export interface SetCachedOptions {
  /**
   * Raw prompt text. Stored verbatim in the `query` column for
   * cross-tenant debug visibility (PR #514 introspection confirmed
   * `query TEXT NOT NULL` on the prod table). Not returned by getCached
   * — the cache READ path remains tenant-agnostic and key-only.
   */
  query: string;
  platform: string;
  model: string;
  ttlSeconds: number;
  /**
   * Brand context, attached for ops/debug only. Cross-tenant dedup is
   * still keyed on the SHA-256 cache_key alone, so the row that
   * `setCached` writes will end up serving every tenant whose prompt
   * normalizes to the same value — `brandId`/`city` simply record which
   * brand happened to populate the row first (or most recently, given
   * the ON CONFLICT update).
   */
  brandId?: string | null;
  city?: string | null;
  /** Whether the cached call hit a search-enabled provider path. */
  isSearch?: boolean;
}

export const __cacheStats = { hits: 0, misses: 0, writes: 0, errors: 0 };

function disabled(): boolean {
  return process.env.RESPONSE_CACHE_DISABLED === 'true';
}

// lowercase → trim → collapse internal whitespace → strip trailing
// punctuation/whitespace. The trailing-strip catches "best plumber",
// "best plumber.", "best plumber?", and "best plumber!?!" as the same
// query — common variation in human-written prompts that previously
// fragmented the cache.
function normalize(prompt: string): string {
  return prompt
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\s.!?,;:]+$/, '');
}

// Cross-tenant dedup invariant: brand_id / user_id / tenant_id MUST NOT
// be hashed into the cache key. The June 2026 cost review re-verified
// this — two brands asking the same generic question for the same city
// hit the same row. brand_id and city ARE persisted as separate columns
// in setCached() for ops/debug visibility, but the read path keys only
// on this hash, so a row written by Brand A still serves Brand B.
// `city` IS part of the key on purpose: "best plumber" returns different
// answers in Boston vs NYC and a city-blind shared row would corrupt
// localized results. Brand-personalized prompts naturally diverge in
// the prompt text (they embed the brand name verbatim) and so already
// produce per-brand keys without needing a brand_id field.
export function buildCacheKey(params: CacheKeyParams): string {
  const { prompt, platform, model, searchEnabled, city } = params;
  const cityPart = (city ?? '').toLowerCase().trim();
  const material = `${normalize(prompt)}|${platform}|${model}|${searchEnabled ? 1 : 0}|${cityPart}`;
  return crypto.createHash('sha256').update(material).digest('hex');
}

export function getCacheTtl(searchEnabled: boolean): number {
  return searchEnabled ? TTL_SEARCH_SECONDS : TTL_DEFAULT_SECONDS;
}

// Whether the (platform, model) combo hits the provider's web-search path.
// Perplexity is search-native; ChatGPT's `*-search-preview` family does
// retrieval. Other providers don't currently surface a search variant.
export function isSearchEnabled(platform: string, model: string): boolean {
  if (platform === 'Perplexity') return true;
  if (platform === 'ChatGPT' && model.includes('search')) return true;
  return false;
}

export async function getCached<T = unknown>(cacheKey: string): Promise<CachedEntry<T> | null> {
  if (disabled()) return null;
  try {
    const res = await pool.query(
      `SELECT response, model, created_at
         FROM response_cache
        WHERE cache_key = $1 AND expires_at > NOW()
        LIMIT 1`,
      [cacheKey],
    );
    if (!res.rows.length) {
      __cacheStats.misses++;
      return null;
    }
    const row = res.rows[0] as { response: unknown; model: string; created_at: Date };
    // pg returns JSONB as a parsed object already, but defensively handle a
    // string in case driver behaviour differs in future versions.
    let parsed: T;
    if (typeof row.response === 'string') {
      try { parsed = JSON.parse(row.response) as T; }
      catch { __cacheStats.misses++; return null; }
    } else {
      parsed = row.response as T;
    }
    __cacheStats.hits++;
    return { response: parsed, model: row.model, createdAt: row.created_at };
  } catch (e) {
    __cacheStats.errors++;
    logger.warn('response_cache.get_failed', {
      errorMessage: (e as Error).message,
    });
    return null;
  }
}

export async function setCached(
  cacheKey: string,
  response: unknown,
  opts: SetCachedOptions,
): Promise<void> {
  if (disabled()) return;
  try {
    // `query` is stored verbatim for cross-tenant debug visibility.
    // `getCached` does not return it, so cache reads remain tenant-agnostic
    // by design. `brand_id`/`city` likewise populate only the column —
    // they are not part of the cache key, so a row written for Brand A
    // still serves Brand B once present.
    await pool.query(
      `INSERT INTO response_cache (cache_key, platform, model, query, brand_id, city, response, is_search, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW() + ($9 || ' seconds')::interval)
       ON CONFLICT (cache_key) DO UPDATE
         SET response = EXCLUDED.response,
             platform = EXCLUDED.platform,
             model = EXCLUDED.model,
             query = EXCLUDED.query,
             brand_id = EXCLUDED.brand_id,
             city = EXCLUDED.city,
             is_search = EXCLUDED.is_search,
             expires_at = EXCLUDED.expires_at`,
      [
        cacheKey,
        opts.platform,
        opts.model,
        opts.query,
        opts.brandId ?? null,
        opts.city ?? null,
        JSON.stringify(response),
        opts.isSearch ?? false,
        String(opts.ttlSeconds),
      ],
    );
    __cacheStats.writes++;
  } catch (e) {
    __cacheStats.errors++;
    logger.warn('response_cache.set_failed', {
      errorMessage: (e as Error).message,
      platform: opts.platform,
      model: opts.model,
    });
  }
}

/**
 * Delete cache rows expired more than 7 days ago. Called from the
 * daily_floor cron branch. Returns the number of rows removed.
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const res = await pool.query(
      `DELETE FROM response_cache WHERE expires_at < NOW() - interval '7 days'`,
    );
    return res.rowCount || 0;
  } catch (e) {
    logger.warn('response_cache.cleanup_failed', {
      errorMessage: (e as Error).message,
    });
    return 0;
  }
}
