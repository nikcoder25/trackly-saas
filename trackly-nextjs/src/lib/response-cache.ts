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

const TTL_SEARCH_SECONDS = 6 * 60 * 60;        // 6h for search-enabled calls (results change faster)
const TTL_DEFAULT_SECONDS = 24 * 60 * 60;      // 24h otherwise

export interface CacheKeyParams {
  prompt: string;
  platform: string;
  model: string;
  searchEnabled: boolean;
}

export interface CachedEntry<T = unknown> {
  response: T;
  model: string;
  createdAt: Date;
}

export interface SetCachedOptions {
  platform: string;
  model: string;
  ttlSeconds: number;
}

export const __cacheStats = { hits: 0, misses: 0, writes: 0, errors: 0 };

function disabled(): boolean {
  return process.env.RESPONSE_CACHE_DISABLED === 'true';
}

function normalize(prompt: string): string {
  return prompt.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function buildCacheKey(params: CacheKeyParams): string {
  const { prompt, platform, model, searchEnabled } = params;
  const material = `${normalize(prompt)}|${platform}|${model}|${searchEnabled ? 1 : 0}`;
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
    await pool.query(
      `INSERT INTO response_cache (cache_key, platform, model, response, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW() + ($5 || ' seconds')::interval)
       ON CONFLICT (cache_key) DO UPDATE
         SET response = EXCLUDED.response,
             platform = EXCLUDED.platform,
             model = EXCLUDED.model,
             expires_at = EXCLUDED.expires_at`,
      [cacheKey, opts.platform, opts.model, JSON.stringify(response), String(opts.ttlSeconds)],
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
