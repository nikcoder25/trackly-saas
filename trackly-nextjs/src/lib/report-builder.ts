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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_history (
      id         UUID PRIMARY KEY,
      brand_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      kind       TEXT NOT NULL CHECK (kind IN ('standard','custom')),
      title      TEXT,
      filename   TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      meta       JSONB NOT NULL DEFAULT '{}',
      pdf        BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT report_history_brand_fk
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_report_history_brand ON report_history (brand_id, created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_schedules (
      brand_id    TEXT PRIMARY KEY,
      frequency   TEXT NOT NULL DEFAULT 'off' CHECK (frequency IN ('off','weekly','monthly')),
      last_run_at TIMESTAMPTZ,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT report_schedules_brand_fk
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    )
  `);
  schemaEnsured = true;
}

export type ReportFrequency = 'off' | 'weekly' | 'monthly';

export async function getSchedule(brandId: string): Promise<{ frequency: ReportFrequency; lastRunAt: string | null }> {
  const res = await pool.query('SELECT frequency, last_run_at FROM report_schedules WHERE brand_id = $1', [brandId]);
  const row = res.rows[0];
  return {
    frequency: (row?.frequency as ReportFrequency) || 'off',
    lastRunAt: row?.last_run_at ? new Date(row.last_run_at).toISOString() : null,
  };
}

export async function setSchedule(brandId: string, frequency: ReportFrequency): Promise<void> {
  await pool.query(
    `INSERT INTO report_schedules (brand_id, frequency, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (brand_id) DO UPDATE SET frequency = EXCLUDED.frequency, updated_at = NOW()`,
    [brandId, frequency]
  );
}

export async function markScheduleRun(brandId: string): Promise<void> {
  await pool.query('UPDATE report_schedules SET last_run_at = NOW() WHERE brand_id = $1', [brandId]);
}

const HISTORY_KEEP = 20;
export interface HistoryEntry { id: string; kind: 'standard' | 'custom'; title: string; filename: string; sizeBytes: number; meta: Record<string, unknown>; createdAt: string }

/** Record a generated report's bytes in history (best-effort), keeping the
 *  most recent HISTORY_KEEP per brand. Never throws — a logging failure must
 *  not break the download. */
export async function recordReport(brandId: string, userId: string, kind: 'standard' | 'custom', title: string, filename: string, pdf: Buffer, meta: Record<string, unknown>): Promise<void> {
  try {
    const id = randomUUID();
    await pool.query(
      'INSERT INTO report_history (id, brand_id, user_id, kind, title, filename, size_bytes, meta, pdf) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, brandId, userId, kind, title, filename, pdf.length, JSON.stringify(meta || {}), pdf]
    );
    await pool.query(
      `DELETE FROM report_history WHERE brand_id = $1 AND id NOT IN (
         SELECT id FROM report_history WHERE brand_id = $1 ORDER BY created_at DESC LIMIT $2
       )`,
      [brandId, HISTORY_KEEP]
    );
  } catch (e) {
    console.error('[report-history] record failed:', (e as Error).message);
  }
}

export async function listHistory(brandId: string): Promise<HistoryEntry[]> {
  const res = await pool.query(
    'SELECT id, kind, title, filename, size_bytes, meta, created_at FROM report_history WHERE brand_id = $1 ORDER BY created_at DESC',
    [brandId]
  );
  return res.rows.map((r: Record<string, unknown>) => ({
    id: r.id as string, kind: r.kind as 'standard' | 'custom', title: (r.title as string) || '',
    filename: (r.filename as string) || 'report.pdf', sizeBytes: Number(r.size_bytes) || 0,
    meta: (r.meta as Record<string, unknown>) || {}, createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

export async function getHistoryPdf(brandId: string, id: string): Promise<{ filename: string; pdf: Buffer } | null> {
  const res = await pool.query('SELECT filename, pdf FROM report_history WHERE brand_id = $1 AND id = $2', [brandId, id]);
  if (!res.rows.length) return null;
  return { filename: res.rows[0].filename || 'report.pdf', pdf: res.rows[0].pdf as Buffer };
}

export async function deleteHistory(brandId: string, id: string): Promise<void> {
  await pool.query('DELETE FROM report_history WHERE brand_id = $1 AND id = $2', [brandId, id]);
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
