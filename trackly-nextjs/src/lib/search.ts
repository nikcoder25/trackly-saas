/**
 * Global search over a user's own data: tracked prompts, AI mentions, and
 * cited sources.
 *
 * Backs the command palette in the dashboard topbar. Three entity types,
 * matching the three things the palette advertises:
 *
 *   prompt  - a distinct buyer-intent prompt we run, aggregated across its
 *             runs, so one prompt is one result rather than one per engine
 *             per day.
 *   mention - an individual AI response whose text matches the query. The
 *             snippet is cut out in SQL (see below) rather than by shipping
 *             whole responses to Node and slicing there.
 *   source  - a cited domain, aggregated over its URLs.
 *
 * SECURITY. Everything here is scoped by `brand_id IN (accessible brands)`.
 * `prompt_runs` and `citations` carry no user_id of their own - a query that
 * forgets the brand filter returns every tenant's data, which is the failure
 * this module is shaped to prevent. `resolveAccessibleBrandIds()` is the only
 * way results are reached, and tests/search-scope.test.ts pins that an empty
 * accessible set returns nothing instead of everything.
 */
import { pool } from '@/lib/db';

export type SearchKind = 'prompt' | 'mention' | 'source';

export interface SearchResult {
  kind: SearchKind;
  /** Stable id for React keys and de-duplication. */
  id: string;
  /** Primary line in the palette. */
  title: string;
  /** Secondary line: snippet, counts, or metadata. */
  subtitle: string;
  /** Where selecting this result navigates to. */
  href: string;
  brandId: string;
  platform?: string;
  when?: string;
}

/** Per-entity result cap. The palette shows a short list, not a report. */
const PER_KIND_LIMIT = 6;

/**
 * How far back to search. Text matching cannot use a btree index, so the
 * scan is bounded by brand + recency to keep it predictable on large
 * tenants. If this ever needs to go further back, the fix is a pg_trgm GIN
 * index on the searched columns, not a bigger window.
 */
const LOOKBACK_DAYS = 180;

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;

/**
 * Escapes LIKE metacharacters in user input.
 *
 * Without this, `%` and `_` from the query act as wildcards: searching for
 * "100%" would match everything, and a query of "%%%%%%" turns into a
 * pathological backtracking scan. Paired with `ESCAPE '\'` at every call
 * site. Does NOT protect against injection - that is parameterisation's job,
 * and every query below is parameterised.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (c) => '\\' + c);
}

/**
 * Every brand id this user may read: brands they own, plus brands shared
 * with them through team membership.
 *
 * Mirrors the two-branch logic of `getBrandWithAccess` in src/lib/helpers.ts.
 * That helper answers "may I see THIS brand"; this answers "which brands may
 * I see at all", which is the set form search needs.
 */
export async function resolveAccessibleBrandIds(userId: string): Promise<string[]> {
  const res = await pool.query(
    `SELECT id FROM brands WHERE user_id = $1
     UNION
     SELECT b.id FROM brands b
       JOIN team_members tm ON b.user_id = tm.owner_id
      WHERE tm.member_id = $1`,
    [userId]
  );
  return res.rows.map((r: { id: string }) => r.id);
}

/** Brand id -> display name, for labelling results across multiple brands. */
export async function resolveBrandNames(brandIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!brandIds.length) return names;
  const res = await pool.query(
    `SELECT id, COALESCE(NULLIF(data->>'name', ''), 'Untitled brand') AS name
       FROM brands WHERE id = ANY($1)`,
    [brandIds]
  );
  for (const row of res.rows as Array<{ id: string; name: string }>) names.set(row.id, row.name);
  return names;
}

function collapse(text: string | null | undefined): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Tidies a snippet cut at a fixed character offset.
 *
 * The SQL window starts ~70 characters before the match, which lands
 * mid-word far more often than not - the first cut of this shipped snippets
 * reading "mmended for reliability…". Drop the partial word at each end and
 * mark the elisions, so the result reads as a quote rather than as damage.
 */
function tidySnippet(raw: string | null, startedAt: number, fullLength: number): string {
  let text = collapse(raw);
  if (!text) return '';

  if (startedAt > 1) {
    const firstSpace = text.indexOf(' ');
    // Only trim when a space is close to the start; otherwise the whole
    // snippet is one long token and cutting to it would leave nothing.
    if (firstSpace > 0 && firstSpace < 25) text = text.slice(firstSpace + 1);
    text = '…' + text;
  }
  if (startedAt - 1 + collapse(raw).length < fullLength) {
    const lastSpace = text.lastIndexOf(' ');
    if (lastSpace > text.length - 25) text = text.slice(0, lastSpace);
    text = text + '…';
  }
  return text;
}

// ── Per-entity queries ──────────────────────────────────────────

async function searchPrompts(brandIds: string[], like: string): Promise<SearchResult[]> {
  // Grouped by prompt so a prompt tracked across five engines for six months
  // is one row. mention_rate is what the user actually wants to know about a
  // prompt at a glance, and it comes free from the same aggregate.
  const res = await pool.query(
    `SELECT prompt,
            brand_id,
            COUNT(*)::int                          AS runs,
            COUNT(*) FILTER (WHERE mentioned)::int AS mentions,
            MAX(created_at)                        AS last_seen
       FROM prompt_runs
      WHERE brand_id = ANY($1)
        AND created_at > NOW() - INTERVAL '1 day' * $3
        AND prompt ILIKE $2 ESCAPE '\\'
      GROUP BY prompt, brand_id
      ORDER BY MAX(created_at) DESC
      LIMIT $4`,
    [brandIds, like, LOOKBACK_DAYS, PER_KIND_LIMIT]
  );

  return (res.rows as Array<{
    prompt: string; brand_id: string; runs: number; mentions: number; last_seen: Date;
  }>).map((r) => ({
    kind: 'prompt' as const,
    id: `prompt:${r.brand_id}:${r.prompt}`,
    title: collapse(r.prompt),
    subtitle: `${r.mentions}/${r.runs} runs mentioned you`,
    href: `/dashboard/prompt-details?q=${encodeURIComponent(r.prompt)}`,
    brandId: r.brand_id,
    when: r.last_seen?.toISOString(),
  }));
}

async function searchMentions(brandIds: string[], like: string, raw: string): Promise<SearchResult[]> {
  // The snippet is cut in SQL: `position()` finds the match and `substring()`
  // takes a window around it. Doing this in Node would mean transferring
  // every matching response_raw - which are full AI answers, frequently
  // several KB each - just to throw almost all of it away.
  const res = await pool.query(
    `SELECT id, brand_id, prompt, platform, created_at,
            GREATEST(1, POSITION(LOWER($5) IN LOWER(response_raw)) - 70) AS snippet_start,
            LENGTH(response_raw) AS full_length,
            substring(
              response_raw
              FROM   GREATEST(1, POSITION(LOWER($5) IN LOWER(response_raw)) - 70)
              FOR    220
            ) AS snippet
       FROM prompt_runs
      WHERE brand_id = ANY($1)
        AND created_at > NOW() - INTERVAL '1 day' * $3
        AND response_raw IS NOT NULL
        AND response_raw ILIKE $2 ESCAPE '\\'
      ORDER BY created_at DESC
      LIMIT $4`,
    [brandIds, like, LOOKBACK_DAYS, PER_KIND_LIMIT, raw]
  );

  return (res.rows as Array<{
    id: string; brand_id: string; prompt: string; platform: string;
    created_at: Date; snippet: string | null; snippet_start: number; full_length: number;
  }>).map((r) => ({
    kind: 'mention' as const,
    id: `mention:${r.id}`,
    title: tidySnippet(r.snippet, Number(r.snippet_start), Number(r.full_length)) || collapse(r.prompt),
    subtitle: `${r.platform} · ${collapse(r.prompt).slice(0, 80)}`,
    href: `/dashboard/mentions?run=${encodeURIComponent(r.id)}`,
    brandId: r.brand_id,
    platform: r.platform,
    when: r.created_at?.toISOString(),
  }));
}

async function searchSources(brandIds: string[], like: string): Promise<SearchResult[]> {
  // Grouped by domain: "which sites does the AI cite about us" is the
  // question, and one row per URL would bury it under near-duplicates.
  //
  // Two stages on purpose. `matched` finds which domains the query hits -
  // possibly via a single URL - and the outer query then counts EVERY
  // citation for those domains. Counting only the matching rows was the
  // first cut, and it reported "yelp.com - 1 citation" for a domain cited
  // five times, because only one of its URLs contained the search term.
  // The useful number is the domain's real footprint, not the substring's.
  const res = await pool.query(
    `WITH matched AS (
       SELECT DISTINCT domain
         FROM citations
        WHERE brand_id = ANY($1)
          AND created_at > NOW() - INTERVAL '1 day' * $3
          AND domain IS NOT NULL
          AND (domain ILIKE $2 ESCAPE '\\' OR url ILIKE $2 ESCAPE '\\')
        LIMIT $4
     )
     SELECT c.domain,
            MIN(c.brand_id)                  AS brand_id,
            COUNT(*)::int                    AS citation_count,
            COUNT(DISTINCT c.platform)::int  AS platforms,
            MAX(c.created_at)                AS last_seen
       FROM citations c
       JOIN matched m ON m.domain = c.domain
      WHERE c.brand_id = ANY($1)
        AND c.created_at > NOW() - INTERVAL '1 day' * $3
      GROUP BY c.domain
      ORDER BY COUNT(*) DESC`,
    [brandIds, like, LOOKBACK_DAYS, PER_KIND_LIMIT]
  );

  return (res.rows as Array<{
    domain: string; brand_id: string; citation_count: number; platforms: number; last_seen: Date;
  }>).map((r) => ({
    kind: 'source' as const,
    id: `source:${r.domain}`,
    title: r.domain,
    subtitle: `${r.citation_count} citation${r.citation_count === 1 ? '' : 's'} across ${r.platforms} engine${r.platforms === 1 ? '' : 's'}`,
    href: `/dashboard/citations?domain=${encodeURIComponent(r.domain)}`,
    brandId: r.brand_id,
    when: r.last_seen?.toISOString(),
  }));
}

// ── Entry point ─────────────────────────────────────────────────

export interface SearchOptions {
  /** Restrict to a single brand. Must already be verified as accessible. */
  brandId?: string | null;
}

/**
 * Runs all three searches concurrently and returns them grouped.
 *
 * Returns empty (never throws, never falls back to an unscoped query) when
 * the user has no accessible brands - see the security note at the top.
 */
export async function runSearch(
  userId: string,
  query: string,
  options: SearchOptions = {}
): Promise<{ prompts: SearchResult[]; mentions: SearchResult[]; sources: SearchResult[] }> {
  const empty = { prompts: [], mentions: [], sources: [] };

  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return empty;

  let brandIds = await resolveAccessibleBrandIds(userId);
  if (options.brandId) {
    // Intersect rather than trust: a brandId the user cannot access narrows
    // the set to nothing instead of widening it.
    brandIds = brandIds.filter((id) => id === options.brandId);
  }
  if (!brandIds.length) return empty;

  const like = `%${escapeLikePattern(trimmed)}%`;

  const [prompts, mentions, sources] = await Promise.all([
    searchPrompts(brandIds, like),
    searchMentions(brandIds, like, trimmed),
    searchSources(brandIds, like),
  ]);

  return { prompts, mentions, sources };
}
