/**
 * Per-prompt metadata: the topic a tracked prompt belongs to, and the page
 * on the brand's site that is supposed to win it.
 *
 * Why a side table rather than more fields on the brand JSON: prompts live
 * in `brands.data.queries` as a bare `string[]`, and that array is rewritten
 * wholesale every time someone edits their prompt list. Hanging metadata off
 * it would mean re-deriving the mapping on every write and losing manual
 * edits whenever the array shifted. Keying on (brand_id, normalized query)
 * instead means a prompt keeps its topic and its page binding as long as the
 * text survives, no matter where it moves in the list.
 *
 * The `source` column is the reason this table isn't just a cache. An
 * automatic reclassification must never silently overwrite a topic or page
 * a human chose, so auto writes skip rows marked 'manual' unless the caller
 * explicitly asks for a full rebuild.
 */

import { pool } from './db';
import { logger } from './logger';

export type PromptMetaSource = 'auto' | 'manual';

export interface PromptMeta {
  /** The prompt text as tracked (original casing preserved). */
  query: string;
  /** Short topic label, e.g. "HVAC Financing". Null = unclassified. */
  topic: string | null;
  /** Absolute URL of the page expected to win this prompt. Null = brand-level. */
  pageUrl: string | null;
  source: PromptMetaSource;
  updatedAt?: string;
}

export interface PromptMetaInput {
  query: string;
  topic?: string | null;
  pageUrl?: string | null;
  source?: PromptMetaSource;
}

/** Label used everywhere a prompt has no topic yet. */
export const UNGROUPED_TOPIC = 'Ungrouped';

const MAX_TOPIC_LENGTH = 60;
const MAX_URL_LENGTH = 2048;
const MAX_QUERY_KEY_LENGTH = 500;

/**
 * Identity key for a prompt within a brand. Deliberately NOT the response
 * cache's normalizer: this one only has to be stable across casing and
 * whitespace edits, and it must not strip trailing punctuation, because
 * "hvac financing" and "hvac financing?" are two prompts a user can track
 * separately and would be surprised to see merged.
 */
export function normalizePromptKey(query: string): string {
  return (query || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_QUERY_KEY_LENGTH);
}

/** Trim a model- or user-supplied topic to something a table cell can hold. */
export function sanitizeTopic(topic: unknown): string | null {
  if (typeof topic !== 'string') return null;
  const clean = topic.trim().replace(/\s+/g, ' ').slice(0, MAX_TOPIC_LENGTH);
  if (!clean) return null;
  // A model that returns the literal fallback label is saying "no topic".
  if (clean.toLowerCase() === UNGROUPED_TOPIC.toLowerCase()) return null;
  return clean;
}

/**
 * Accept a page URL only if it is a plain http(s) URL. Returns the
 * normalized form (fragment stripped) or null.
 */
export function sanitizePageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    const url = parsed.toString();
    return url.length <= MAX_URL_LENGTH ? url : null;
  } catch {
    return null;
  }
}

let schemaEnsured = false;
export async function ensurePromptMetaSchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prompt_meta (
      brand_id   TEXT NOT NULL,
      query_norm TEXT NOT NULL,
      query      TEXT NOT NULL,
      topic      TEXT,
      page_url   TEXT,
      source     TEXT NOT NULL DEFAULT 'auto',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (brand_id, query_norm)
    );
    CREATE INDEX IF NOT EXISTS prompt_meta_brand_topic_idx
      ON prompt_meta (brand_id, topic);
  `);
  schemaEnsured = true;
}

/** Test seam: forget that the schema was ensured. */
export function __resetPromptMetaSchemaCache(): void {
  schemaEnsured = false;
}

/**
 * Load every prompt's metadata for a brand, keyed by normalized prompt.
 * Returns an empty map (never throws) so a metadata outage degrades the
 * prompts page to a flat list rather than breaking it.
 */
export async function getPromptMeta(brandId: string): Promise<Map<string, PromptMeta>> {
  const out = new Map<string, PromptMeta>();
  try {
    await ensurePromptMetaSchema();
    const res = await pool.query(
      `SELECT query_norm, query, topic, page_url, source, updated_at
         FROM prompt_meta WHERE brand_id = $1`,
      [brandId],
    );
    for (const row of res.rows) {
      out.set(row.query_norm, {
        query: row.query,
        topic: row.topic ?? null,
        pageUrl: row.page_url ?? null,
        source: row.source === 'manual' ? 'manual' : 'auto',
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
      });
    }
  } catch (e) {
    logger.error('prompt_meta.load_failed', {
      brandId,
      errorMessage: (e as Error).message,
    });
  }
  return out;
}

export interface UpsertOptions {
  /**
   * When false (the default for automatic classification), rows whose
   * existing `source` is 'manual' are left untouched - a human's choice
   * outranks the classifier. Set true for an explicit "rebuild from
   * scratch" action the user asked for.
   */
  overwriteManual?: boolean;
}

/**
 * Insert or update metadata for a set of prompts.
 *
 * Returns the number of rows actually written, which is not the same as
 * `rows.length` when manual entries were skipped - callers surface that
 * difference so "reclassified 12 of 20 prompts (8 manually set)" is
 * something the UI can say honestly.
 */
export async function upsertPromptMeta(
  brandId: string,
  rows: PromptMetaInput[],
  opts: UpsertOptions = {},
): Promise<number> {
  if (!rows.length) return 0;
  await ensurePromptMetaSchema();

  const values: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any[] = [];
  let i = 1;
  for (const row of rows) {
    const norm = normalizePromptKey(row.query);
    if (!norm) continue;
    values.push(`($${i},$${i + 1},$${i + 2},$${i + 3},$${i + 4},$${i + 5},NOW())`);
    params.push(
      brandId,
      norm,
      row.query.trim().slice(0, MAX_QUERY_KEY_LENGTH),
      sanitizeTopic(row.topic),
      sanitizePageUrl(row.pageUrl),
      row.source === 'manual' ? 'manual' : 'auto',
    );
    i += 6;
  }
  if (!values.length) return 0;

  // The WHERE clause on the DO UPDATE is what protects manual edits: an
  // auto write against a manual row matches no target and is dropped,
  // while the same statement still inserts brand-new prompts.
  const guard = opts.overwriteManual
    ? ''
    : `WHERE prompt_meta.source <> 'manual' OR EXCLUDED.source = 'manual'`;

  const res = await pool.query(
    `INSERT INTO prompt_meta (brand_id, query_norm, query, topic, page_url, source, updated_at)
     VALUES ${values.join(',')}
     ON CONFLICT (brand_id, query_norm) DO UPDATE SET
       query      = EXCLUDED.query,
       topic      = EXCLUDED.topic,
       page_url   = EXCLUDED.page_url,
       source     = EXCLUDED.source,
       updated_at = NOW()
     ${guard}`,
    params,
  );
  return res.rowCount ?? 0;
}

export interface PromptStats {
  /** Non-errored measurements in the window. */
  runs: number;
  mentions: number;
  /** 0..100, or null when nothing has been measured yet. */
  mentionRate: number | null;
  /** Mean list position across answers that ranked the brand at all. */
  avgPosition: number | null;
  /** Distinct competitor brands seen in answers to this prompt. */
  competitorBrands: string[];
}

/**
 * Per-prompt outcome stats read from `prompt_runs`.
 *
 * Read from the table rather than from the brand JSON on purpose: the JSON
 * blob keeps `allResults` only for the most recent run (older ones are
 * stripped on every list read), so rollups built from it would silently be
 * "the last run" while looking like "the last 30 days".
 *
 * Keyed by normalized prompt so it lines up with the metadata map.
 */
export async function getPromptStats(
  brandId: string,
  days = 30,
): Promise<Map<string, PromptStats>> {
  const out = new Map<string, PromptStats>();
  try {
    const res = await pool.query(
      `SELECT LOWER(TRIM(prompt))                                       AS key,
              COUNT(*)::int                                             AS runs,
              COUNT(*) FILTER (WHERE mentioned)::int                    AS mentions,
              AVG(list_position) FILTER (WHERE list_position IS NOT NULL) AS avg_position,
              COALESCE(
                ARRAY_AGG(DISTINCT comp.name) FILTER (WHERE comp.name IS NOT NULL),
                '{}'
              )                                                          AS competitors
         FROM prompt_runs pr
         LEFT JOIN LATERAL jsonb_array_elements_text(
                     CASE WHEN jsonb_typeof(pr.competitor_mentions) = 'array'
                          THEN pr.competitor_mentions ELSE '[]'::jsonb END
                   ) AS comp(name) ON TRUE
        WHERE pr.brand_id = $1
          AND pr.success = true
          AND pr.created_at >= NOW() - ($2 || ' days')::interval
        GROUP BY LOWER(TRIM(prompt))`,
      [brandId, String(days)],
    );

    for (const row of res.rows) {
      const runs = row.runs ?? 0;
      out.set(row.key, {
        runs,
        mentions: row.mentions ?? 0,
        mentionRate: runs > 0 ? Math.round(((row.mentions ?? 0) / runs) * 100) : null,
        avgPosition: row.avg_position == null ? null : Number(row.avg_position),
        competitorBrands: (row.competitors || []).filter(Boolean),
      });
    }
  } catch (e) {
    logger.error('prompt_meta.stats_failed', {
      brandId,
      errorMessage: (e as Error).message,
    });
  }
  return out;
}

/**
 * Drop metadata for prompts the brand no longer tracks. Called after a
 * prompt-list edit so a deleted-and-retyped prompt doesn't silently inherit
 * the topic of its namesake from months ago.
 */
export async function prunePromptMeta(brandId: string, currentQueries: string[]): Promise<void> {
  try {
    await ensurePromptMetaSchema();
    const keys = currentQueries.map(normalizePromptKey).filter(Boolean);
    if (!keys.length) {
      await pool.query('DELETE FROM prompt_meta WHERE brand_id = $1', [brandId]);
      return;
    }
    await pool.query(
      'DELETE FROM prompt_meta WHERE brand_id = $1 AND NOT (query_norm = ANY($2::text[]))',
      [brandId, keys],
    );
  } catch (e) {
    logger.error('prompt_meta.prune_failed', {
      brandId,
      errorMessage: (e as Error).message,
    });
  }
}
