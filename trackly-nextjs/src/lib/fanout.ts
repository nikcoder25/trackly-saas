/**
 * Query fan-out: the sub-queries an engine issues to a search index while
 * answering one of your tracked prompts.
 *
 * Modern grounded answers are not one query in, one answer out. The engine
 * expands "best heat pump installer near me" into a handful of narrower
 * searches, retrieves against those, and writes an answer from what came
 * back. Those narrower searches are the queries you are actually competing
 * in, and they are frequently nothing like the prompt you tracked.
 *
 * What makes this table trustworthy is that it is not inferred. Gemini's
 * `groundingMetadata.webSearchQueries` reports the queries Google's own
 * model chose - we store exactly that, attributed to the engine that said
 * it, and nothing else. Engines that do not report their fan-out simply
 * contribute no rows; there is no reconstruction, no guessing, and no
 * blending of the two.
 */

import { pool } from './db';
import { uid } from './helpers';
import { logger } from './logger';

const MAX_QUERY_LENGTH = 300;
const MAX_FANOUT_PER_RESULT = 20;

export interface FanoutBatchRow {
  promptRunId: string;
  brandId: string;
  /** The tracked prompt that produced this fan-out. */
  prompt: string;
  platform: string;
  /** Sub-queries the engine reported issuing. */
  queries: string[];
}

let schemaEnsured = false;
export async function ensureFanoutSchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prompt_fanout (
      id            TEXT PRIMARY KEY,
      prompt_run_id TEXT NOT NULL,
      brand_id      TEXT NOT NULL,
      prompt        TEXT NOT NULL,
      platform      TEXT NOT NULL,
      fanout_query  TEXT NOT NULL,
      position      INT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS prompt_fanout_run_query_uniq
      ON prompt_fanout (prompt_run_id, fanout_query);
    CREATE INDEX IF NOT EXISTS prompt_fanout_brand_created_idx
      ON prompt_fanout (brand_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS prompt_fanout_brand_query_idx
      ON prompt_fanout (brand_id, fanout_query);
  `);
  schemaEnsured = true;
}

/** Test seam: forget that the schema was ensured. */
export function __resetFanoutSchemaCache(): void {
  schemaEnsured = false;
}

/** Collapse casing/whitespace so the same sub-query aggregates cleanly. */
export function normalizeFanoutQuery(raw: string): string | null {
  const clean = (raw || '').trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH);
  return clean.length >= 2 ? clean : null;
}

/**
 * Persist fan-out rows for a batch of prompt_runs.
 *
 * Best-effort, exactly like persistCitations: a run that measured fine must
 * not be failed by a bookkeeping insert. Called right after the prompt_runs
 * batch lands so prompt_run_id always resolves.
 */
export async function persistFanout(rows: FanoutBatchRow[]): Promise<void> {
  const values: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any[] = [];
  let pi = 1;

  for (const row of rows) {
    const seen = new Set<string>();
    let position = 0;
    for (const raw of row.queries || []) {
      const clean = normalizeFanoutQuery(raw);
      if (!clean) continue;
      const dedupeKey = clean.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      position++;
      if (position > MAX_FANOUT_PER_RESULT) break;
      values.push(`($${pi},$${pi + 1},$${pi + 2},$${pi + 3},$${pi + 4},$${pi + 5},$${pi + 6})`);
      params.push(uid(), row.promptRunId, row.brandId, row.prompt, row.platform, clean, position);
      pi += 7;
    }
  }
  if (!values.length) return;

  try {
    await ensureFanoutSchema();
    await pool.query(
      `INSERT INTO prompt_fanout
         (id, prompt_run_id, brand_id, prompt, platform, fanout_query, position)
       VALUES ${values.join(',')}
       ON CONFLICT (prompt_run_id, fanout_query) DO NOTHING`,
      params,
    );
  } catch (e) {
    logger.error('fanout.persist_failed', {
      rows: rows.length,
      errorMessage: (e as Error).message,
    });
  }
}

export interface FanoutAggregate {
  /** The sub-query, as the engine phrased it. */
  query: string;
  /** How many times it has been observed in the window. */
  timesSeen: number;
  /** Engines that reported it. */
  platforms: string[];
  /** Tracked prompts that expanded into it. */
  prompts: string[];
  lastSeen: string;
}

export interface FanoutSummary {
  aggregates: FanoutAggregate[];
  totalObservations: number;
  distinctQueries: number;
  /** Engines that reported any fan-out at all in the window. */
  reportingPlatforms: string[];
}

/**
 * Aggregate a brand's fan-out over the last `days`, most-seen first.
 *
 * Grouping is case-insensitive on the sub-query but the display form keeps
 * the engine's own casing (via min(), so it is at least deterministic).
 */
export async function getFanoutSummary(
  brandId: string,
  days = 30,
  limit = 200,
): Promise<FanoutSummary> {
  const empty: FanoutSummary = {
    aggregates: [], totalObservations: 0, distinctQueries: 0, reportingPlatforms: [],
  };
  try {
    await ensureFanoutSchema();
    const res = await pool.query(
      `SELECT MIN(fanout_query)                    AS query,
              COUNT(*)::int                        AS times_seen,
              ARRAY_AGG(DISTINCT platform)         AS platforms,
              ARRAY_AGG(DISTINCT prompt)           AS prompts,
              MAX(created_at)                      AS last_seen
         FROM prompt_fanout
        WHERE brand_id = $1
          AND created_at >= NOW() - ($2 || ' days')::interval
        GROUP BY LOWER(fanout_query)
        ORDER BY times_seen DESC, last_seen DESC
        LIMIT $3`,
      [brandId, String(days), limit],
    );

    const aggregates: FanoutAggregate[] = res.rows.map(r => ({
      query: r.query,
      timesSeen: r.times_seen,
      platforms: (r.platforms || []).filter(Boolean),
      prompts: (r.prompts || []).filter(Boolean),
      lastSeen: r.last_seen ? new Date(r.last_seen).toISOString() : '',
    }));

    // Counted separately rather than taken from `aggregates.length`, which
    // would silently report the LIMIT as the true distinct count on any
    // brand with more fan-out than one page shows.
    const totals = await pool.query(
      `SELECT COUNT(*)::int                                 AS total,
              COUNT(DISTINCT LOWER(fanout_query))::int      AS distinct_queries,
              ARRAY_AGG(DISTINCT platform)                  AS platforms
         FROM prompt_fanout
        WHERE brand_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval`,
      [brandId, String(days)],
    );

    return {
      aggregates,
      totalObservations: totals.rows[0]?.total ?? 0,
      distinctQueries: totals.rows[0]?.distinct_queries ?? aggregates.length,
      reportingPlatforms: (totals.rows[0]?.platforms || []).filter(Boolean),
    };
  } catch (e) {
    logger.error('fanout.summary_failed', {
      brandId,
      errorMessage: (e as Error).message,
    });
    return empty;
  }
}
