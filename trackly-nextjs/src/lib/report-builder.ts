/**
 * Custom Report builder — per-brand "draft" of selected items (mentions and
 * queries) that the user assembles via "Add to report" and then downloads as a
 * Custom Report PDF (see lib/pdf-custom-report.ts).
 *
 * Follows the repo's per-module `ensureXSchema()` + `CREATE TABLE IF NOT EXISTS`
 * convention (mirrors ensureGeoAuditsSchema / ensureCreditsSchema).
 */
import { randomUUID } from 'crypto';
import { pool } from './db';

export type ReportItemKind = 'mention' | 'query';
export interface ReportItem { id: string; kind: ReportItemKind; payload: Record<string, unknown>; position: number }
export interface ReportDraft { title: string; note: string; items: ReportItem[] }

let schemaEnsured = false;
export async function ensureReportSchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_drafts (
      brand_id   TEXT PRIMARY KEY,
      title      TEXT,
      note       TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT report_drafts_brand_fk
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_items (
      id         UUID PRIMARY KEY,
      brand_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      kind       TEXT NOT NULL CHECK (kind IN ('mention','query')),
      payload    JSONB NOT NULL DEFAULT '{}',
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT report_items_brand_fk
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_report_items_brand ON report_items (brand_id, position, created_at)`);
  schemaEnsured = true;
}

export async function getReport(brandId: string): Promise<ReportDraft> {
  const draftRes = await pool.query('SELECT title, note FROM report_drafts WHERE brand_id = $1', [brandId]);
  const itemsRes = await pool.query(
    'SELECT id, kind, payload, position FROM report_items WHERE brand_id = $1 ORDER BY position ASC, created_at ASC',
    [brandId]
  );
  return {
    title: draftRes.rows[0]?.title || '',
    note: draftRes.rows[0]?.note || '',
    items: itemsRes.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string, kind: r.kind as ReportItemKind,
      payload: (r.payload as Record<string, unknown>) || {}, position: Number(r.position) || 0,
    })),
  };
}

/** Add an item. De-duplicates mentions by (platform, query) and queries by (q). */
export async function addReportItem(brandId: string, userId: string, kind: ReportItemKind, payload: Record<string, unknown>): Promise<ReportItem | null> {
  // soft de-dupe so the same mention/query isn't added twice
  if (kind === 'mention' && payload.query && payload.platform) {
    const dup = await pool.query(
      `SELECT id FROM report_items WHERE brand_id = $1 AND kind = 'mention'
         AND payload->>'query' = $2 AND payload->>'platform' = $3 LIMIT 1`,
      [brandId, String(payload.query), String(payload.platform)]
    );
    if (dup.rows.length) return null;
  } else if (kind === 'query' && payload.q) {
    const dup = await pool.query(
      `SELECT id FROM report_items WHERE brand_id = $1 AND kind = 'query' AND payload->>'q' = $2 LIMIT 1`,
      [brandId, String(payload.q)]
    );
    if (dup.rows.length) return null;
  }
  const posRes = await pool.query('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM report_items WHERE brand_id = $1', [brandId]);
  const position = Number(posRes.rows[0]?.pos) || 0;
  const id = randomUUID();
  await pool.query(
    'INSERT INTO report_items (id, brand_id, user_id, kind, payload, position) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, brandId, userId, kind, JSON.stringify(payload), position]
  );
  return { id, kind, payload, position };
}

export async function removeReportItem(brandId: string, itemId: string): Promise<void> {
  await pool.query('DELETE FROM report_items WHERE brand_id = $1 AND id = $2', [brandId, itemId]);
}

export async function clearReport(brandId: string): Promise<void> {
  await pool.query('DELETE FROM report_items WHERE brand_id = $1', [brandId]);
}

export async function updateDraftMeta(brandId: string, title: string | undefined, note: string | undefined): Promise<void> {
  await pool.query(
    `INSERT INTO report_drafts (brand_id, title, note, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (brand_id) DO UPDATE SET
       title = COALESCE(EXCLUDED.title, report_drafts.title),
       note  = COALESCE(EXCLUDED.note,  report_drafts.note),
       updated_at = NOW()`,
    [brandId, title ?? null, note ?? null]
  );
}

/** Map a stored draft into the shape generateCustomReport() expects. */
export function draftToSelection(draft: ReportDraft) {
  const mentions = draft.items.filter(i => i.kind === 'mention').map(i => i.payload);
  const queries = draft.items.filter(i => i.kind === 'query').map(i => i.payload);
  return { title: draft.title || undefined, note: draft.note || undefined, mentions, queries };
}
