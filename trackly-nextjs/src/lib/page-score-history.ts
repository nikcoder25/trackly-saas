/**
 * Saved page-score snapshots, so the GEO audit can show a before / after.
 *
 * Every signed-in audit of a page stores one row. The first row for a page is
 * its baseline ("before"); the newest is "after". Scoring itself lives in
 * /api/geo-audit; this module only stores and compares results.
 */
import { randomUUID } from 'crypto';
import { pool } from './db';

export interface SnapshotCategory { name: string; score: number }
export interface Snapshot {
  id: string;
  url: string;
  overallScore: number;
  categories: SnapshotCategory[];
  wordCount: number;
  createdAt: string;
}
export interface TrackedPage {
  urlKey: string;
  url: string;
  checks: number;
  before: Snapshot;
  after: Snapshot;
}
export interface CategoryChange { name: string; before: number; after: number; delta: number }
export interface Comparison {
  before: Snapshot;
  after: Snapshot;
  delta: number;
  categories: CategoryChange[];
  checks: number;
}

/** Max snapshots kept per page; the baseline is never pruned. */
export const MAX_SNAPSHOTS_PER_PAGE = 50;

/**
 * One key per page: host without www, path without a trailing slash, no
 * query or hash. "https://www.Site.com/page/?utm=1" and "site.com/page" are
 * the same page.
 */
export function pageUrlKey(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    return (host + path).slice(0, 500);
  } catch {
    return raw.trim().toLowerCase().slice(0, 500);
  }
}

/** Before vs after, overall and per category (matched by category name). */
export function compareSnapshots(before: Snapshot, after: Snapshot, checks = 2): Comparison {
  const beforeByName = new Map(before.categories.map(c => [c.name, c.score]));
  const categories = after.categories.map(c => {
    const b = beforeByName.has(c.name) ? beforeByName.get(c.name)! : c.score;
    return { name: c.name, before: b, after: c.score, delta: c.score - b };
  });
  return { before, after, delta: after.overallScore - before.overallScore, categories, checks };
}

let schemaReady: Promise<void> | null = null;
export function ensurePageScoreSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS page_score_snapshots (
          id            UUID PRIMARY KEY,
          user_id       TEXT NOT NULL,
          url_key       TEXT NOT NULL,
          url           TEXT NOT NULL,
          overall_score INTEGER NOT NULL,
          categories    JSONB NOT NULL DEFAULT '[]'::jsonb,
          word_count    INTEGER NOT NULL DEFAULT 0,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_page_score_snapshots_user_page
          ON page_score_snapshots (user_id, url_key, created_at)
      `);
    })().catch(e => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

interface Row {
  id: string; url: string; url_key: string; overall_score: number;
  categories: unknown; word_count: number; created_at: string | Date;
}
function toSnapshot(r: Row): Snapshot {
  const cats = Array.isArray(r.categories) ? r.categories as Array<{ name?: unknown; score?: unknown }> : [];
  return {
    id: r.id,
    url: r.url,
    overallScore: Number(r.overall_score) || 0,
    categories: cats.map(c => ({ name: String(c.name || ''), score: Number(c.score) || 0 })),
    wordCount: Number(r.word_count) || 0,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/** Store one audit result and return this page's before / after. */
export async function recordSnapshot(
  userId: string,
  input: { url: string; overallScore: number; categories: SnapshotCategory[]; wordCount: number },
): Promise<Comparison | null> {
  await ensurePageScoreSchema();
  const key = pageUrlKey(input.url);
  await pool.query(
    `INSERT INTO page_score_snapshots (id, user_id, url_key, url, overall_score, categories, word_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), userId, key, input.url.slice(0, 2000), Math.round(input.overallScore),
      JSON.stringify(input.categories.map(c => ({ name: c.name, score: Math.round(c.score) }))), input.wordCount || 0],
  );
  // Keep the baseline plus the newest rows.
  await pool.query(
    `DELETE FROM page_score_snapshots WHERE id IN (
       SELECT id FROM (
         SELECT id,
                ROW_NUMBER() OVER (ORDER BY created_at ASC)  AS oldest_rank,
                ROW_NUMBER() OVER (ORDER BY created_at DESC) AS newest_rank
           FROM page_score_snapshots WHERE user_id = $1 AND url_key = $2
       ) t WHERE oldest_rank > 1 AND newest_rank > $3
     )`,
    [userId, key, MAX_SNAPSHOTS_PER_PAGE - 1],
  );
  return getComparison(userId, key);
}

export async function getHistory(userId: string, urlKey: string): Promise<Snapshot[]> {
  await ensurePageScoreSchema();
  const res = await pool.query(
    `SELECT id, url, url_key, overall_score, categories, word_count, created_at
       FROM page_score_snapshots WHERE user_id = $1 AND url_key = $2
      ORDER BY created_at ASC`,
    [userId, urlKey],
  );
  return (res.rows as Row[]).map(toSnapshot);
}

export async function getComparison(userId: string, urlKey: string): Promise<Comparison | null> {
  const history = await getHistory(userId, urlKey);
  if (!history.length) return null;
  return compareSnapshots(history[0], history[history.length - 1], history.length);
}

/** Every page the user has audited, most recently checked first. */
export async function listTrackedPages(userId: string, limit = 50): Promise<TrackedPage[]> {
  await ensurePageScoreSchema();
  const res = await pool.query(
    `SELECT id, url, url_key, overall_score, categories, word_count, created_at, checks, pos
       FROM (
         SELECT s.*,
                COUNT(*) OVER (PARTITION BY url_key) AS checks,
                CASE
                  WHEN ROW_NUMBER() OVER (PARTITION BY url_key ORDER BY created_at ASC) = 1 THEN 'before'
                  WHEN ROW_NUMBER() OVER (PARTITION BY url_key ORDER BY created_at DESC) = 1 THEN 'after'
                END AS pos
           FROM page_score_snapshots s WHERE user_id = $1
       ) t WHERE pos IS NOT NULL`,
    [userId],
  );
  const pages = new Map<string, Partial<TrackedPage> & { urlKey: string }>();
  for (const r of res.rows as Array<Row & { checks: string | number; pos: 'before' | 'after' }>) {
    const p = pages.get(r.url_key) || { urlKey: r.url_key };
    const snap = toSnapshot(r);
    p.checks = Number(r.checks) || 1;
    if (r.pos === 'before') p.before = snap; else p.after = snap;
    pages.set(r.url_key, p);
  }
  return [...pages.values()]
    .map(p => {
      const before = p.before!;
      const after = p.after || before; // a single check is both
      return { urlKey: p.urlKey, url: after.url, checks: p.checks || 1, before, after };
    })
    .sort((a, b) => b.after.createdAt.localeCompare(a.after.createdAt))
    .slice(0, limit);
}

/** Forget a page's history, so the next audit becomes the new baseline. */
export async function resetPage(userId: string, urlKey: string): Promise<number> {
  await ensurePageScoreSchema();
  const res = await pool.query(
    'DELETE FROM page_score_snapshots WHERE user_id = $1 AND url_key = $2',
    [userId, urlKey],
  );
  return res.rowCount || 0;
}
