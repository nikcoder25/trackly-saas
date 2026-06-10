/**
 * Aggregate, anonymized platform-wide statistics for the public
 * "State of AI Search" research report (/research/state-of-ai-search).
 *
 * Privacy rules (do not weaken without an operator decision):
 *  - Only aggregates are exposed: no brand names, prompts, tenant ids, or
 *    response text ever leave this module.
 *  - A platform's stats are published only when BOTH gates pass:
 *    >= MIN_RESPONSES responses AND >= MIN_BRANDS distinct brands in the
 *    window (k-anonymity - one big customer must not be identifiable).
 *  - Top-cited domains exclude every domain that belongs to a tracked
 *    brand (brands.website), so customer identity can't leak through the
 *    citation list.
 *
 * Cached in-process for CACHE_TTL_MS so the public page costs a handful of
 * aggregate queries per pod per few hours, not per request.
 */
import { pool } from '@/lib/db';

export interface PlatformResearchStats {
  platform: string;
  responses: number;
  brands: number;
  /** Share of responses that mentioned the tracked brand (0-1). */
  mentionRate: number;
  /** Share of responses that recommended the tracked brand (0-1). */
  recommendationRate: number;
  /** Sentiment shares over responses with a sentiment label (0-1 each). */
  sentiment: { positive: number; neutral: number; negative: number };
  /** Average list position when the brand appeared in a ranked list. */
  avgListPosition: number | null;
}

export interface StateOfAiSearchStats {
  /** ISO dates bounding the trailing window. */
  windowStart: string;
  windowEnd: string;
  windowDays: number;
  totalResponses: number;
  totalBrands: number;
  totalPrompts: number;
  platforms: PlatformResearchStats[];
  /** Top externally-cited domains by share of citation occurrences. */
  topCitedDomains: Array<{ domain: string; share: number }>;
  /** Accuracy issues recorded per 1,000 responses, per platform. */
  accuracyIssuesPer1k: Array<{ platform: string; per1k: number }>;
  generatedAt: string;
}

const WINDOW_DAYS = 90;
const MIN_RESPONSES = Number(process.env.RESEARCH_MIN_RESPONSES || 200);
const MIN_BRANDS = Number(process.env.RESEARCH_MIN_BRANDS || 5);
const MIN_TOTAL_RESPONSES = Number(process.env.RESEARCH_MIN_TOTAL_RESPONSES || 500);
const CACHE_TTL_MS = Number(process.env.RESEARCH_CACHE_TTL_MS || 6 * 60 * 60 * 1000);

let cache: { value: StateOfAiSearchStats | null; expiresAt: number } | null = null;

/** Test hook - clears the module cache. */
export function __clearResearchStatsCache(): void {
  cache = null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Returns aggregate stats for the trailing 90 days, or null when the
 * platform-wide sample is below MIN_TOTAL_RESPONSES (the page then renders
 * its "first edition pending" state instead of thin, misleading numbers).
 */
export async function getStateOfAiSearchStats(): Promise<StateOfAiSearchStats | null> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  let value: StateOfAiSearchStats | null = null;
  try {
    value = await computeStats();
  } catch (err) {
    console.error('[research-stats] aggregate query failed:', err instanceof Error ? err.message : err);
    value = null;
  }
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

async function computeStats(): Promise<StateOfAiSearchStats | null> {
  // Cache-served rows are re-served copies of an earlier response; counting
  // them would double-count identical answers, so they're excluded.
  const windowFilter = `
    success = true
    AND COALESCE(cache_hit, false) = false
    AND created_at >= NOW() - INTERVAL '${WINDOW_DAYS} days'`;

  const totals = await pool.query(
    `SELECT COUNT(*)::bigint AS responses,
            COUNT(DISTINCT brand_id)::bigint AS brands,
            COUNT(DISTINCT prompt)::bigint AS prompts,
            MIN(created_at) AS window_start,
            MAX(created_at) AS window_end
     FROM prompt_runs
     WHERE ${windowFilter}`
  );
  const t = totals.rows[0] || {};
  const totalResponses = num(t.responses);
  if (totalResponses < MIN_TOTAL_RESPONSES) return null;

  const perPlatform = await pool.query(
    `SELECT platform,
            COUNT(*)::bigint AS responses,
            COUNT(DISTINCT brand_id)::bigint AS brands,
            AVG(CASE WHEN mentioned THEN 1.0 ELSE 0.0 END) AS mention_rate,
            AVG(CASE WHEN recommended THEN 1.0 ELSE 0.0 END) AS recommendation_rate,
            COUNT(*) FILTER (WHERE sentiment = 'positive')::bigint AS pos,
            COUNT(*) FILTER (WHERE sentiment = 'neutral')::bigint AS neu,
            COUNT(*) FILTER (WHERE sentiment = 'negative')::bigint AS neg,
            AVG(CASE WHEN mentioned AND list_position::text ~ '^[0-9]+$'
                     THEN (list_position::text)::numeric END) AS avg_list_position
     FROM prompt_runs
     WHERE ${windowFilter}
     GROUP BY platform
     ORDER BY responses DESC`
  );

  const platforms: PlatformResearchStats[] = perPlatform.rows
    .filter((r) => num(r.responses) >= MIN_RESPONSES && num(r.brands) >= MIN_BRANDS)
    .map((r) => {
      const labeled = num(r.pos) + num(r.neu) + num(r.neg);
      return {
        platform: String(r.platform),
        responses: num(r.responses),
        brands: num(r.brands),
        mentionRate: num(r.mention_rate),
        recommendationRate: num(r.recommendation_rate),
        sentiment: {
          positive: labeled ? num(r.pos) / labeled : 0,
          neutral: labeled ? num(r.neu) / labeled : 0,
          negative: labeled ? num(r.neg) / labeled : 0,
        },
        avgListPosition: r.avg_list_position == null ? null : num(r.avg_list_position),
      };
    });

  if (platforms.length === 0) return null;

  // Top cited domains, excluding any domain a tracked brand owns so the
  // citation list can never identify a customer.
  const citedDomains = await pool.query(
    `WITH cites AS (
       SELECT LOWER(REGEXP_REPLACE(
                SUBSTRING(url_text FROM 'https?://([^/]+)'),
                '^www\\.', ''))
              AS domain
       FROM prompt_runs,
            LATERAL jsonb_array_elements_text(citations) AS url_text
       WHERE ${windowFilter}
         AND jsonb_typeof(citations) = 'array'
     ),
     brand_domains AS (
       SELECT DISTINCT LOWER(REGEXP_REPLACE(
                SUBSTRING(NULLIF(website, '') FROM '(?:https?://)?(?:www\\.)?([^/]+)'),
                '^www\\.', ''))
              AS domain
       FROM brands
       WHERE website IS NOT NULL AND website <> ''
     )
     SELECT c.domain, COUNT(*)::bigint AS hits
     FROM cites c
     WHERE c.domain IS NOT NULL
       AND c.domain NOT IN (SELECT domain FROM brand_domains WHERE domain IS NOT NULL)
     GROUP BY c.domain
     ORDER BY hits DESC
     LIMIT 10`
  );
  const totalHits = citedDomains.rows.reduce((s, r) => s + num(r.hits), 0);
  const topCitedDomains = citedDomains.rows.map((r) => ({
    domain: String(r.domain),
    share: totalHits ? num(r.hits) / totalHits : 0,
  }));

  // Accuracy issues per 1,000 responses, only for platforms that passed the
  // publication gates above.
  const issues = await pool.query(
    `SELECT platform, COUNT(*)::bigint AS issues
     FROM accuracy_issues
     WHERE created_at >= NOW() - INTERVAL '${WINDOW_DAYS} days'
     GROUP BY platform`
  );
  const issuesByPlatform = new Map<string, number>(
    issues.rows.map((r) => [String(r.platform), num(r.issues)])
  );
  const accuracyIssuesPer1k = platforms.map((p) => ({
    platform: p.platform,
    per1k: p.responses ? ((issuesByPlatform.get(p.platform) || 0) / p.responses) * 1000 : 0,
  }));

  return {
    windowStart: t.window_start ? new Date(t.window_start).toISOString().slice(0, 10) : '',
    windowEnd: t.window_end ? new Date(t.window_end).toISOString().slice(0, 10) : '',
    windowDays: WINDOW_DAYS,
    totalResponses,
    totalBrands: num(t.brands),
    totalPrompts: num(t.prompts),
    platforms,
    topCitedDomains,
    accuracyIssuesPer1k,
    generatedAt: new Date().toISOString(),
  };
}
