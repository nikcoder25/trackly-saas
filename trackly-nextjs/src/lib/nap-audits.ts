/**
 * Saved NAP audits — persistence for the logged-in "save an audit per client,
 * re-run later to track progress" feature. One table, created idempotently via
 * ensureNapAuditsSchema (matching the repo's per-module CREATE TABLE IF NOT
 * EXISTS pattern used by ensureGeoAuditsSchema etc.).
 *
 * The full per-URL results are stored as JSONB on the row — the set is bounded
 * (<=50 URLs) so a child table would be overkill. Each run appends {at, score}
 * to a capped `history` array so the detail view can chart consistency over time.
 */
import { randomUUID } from 'node:crypto';
import { pool } from '@/lib/db';
import type { CanonicalNap, DuplicateGroup, UrlResult } from '@/lib/nap-verify';
import { runNapCheck, NAP_MAX_URLS, type NapRunSummary } from '@/lib/nap-audit-run';

export const NAP_MAX_SAVED_AUDITS = 200;
const HISTORY_CAP = 30;

export interface NapAuditHistoryPoint {
  at: string;
  score: number;
}

/** Row shape returned to API/UI (camelCased). */
export interface NapAuditRecord {
  id: string;
  label: string;
  canonical: CanonicalNap;
  urls: string[];
  score: number | null;
  summary: NapRunSummary | null;
  duplicates: DuplicateGroup[];
  results: UrlResult[];
  history: NapAuditHistoryPoint[];
  createdAt: string;
  lastRunAt: string | null;
}

/** Lightweight shape for the list view (omits the heavy results/duplicates). */
export type NapAuditListItem = Omit<NapAuditRecord, 'results' | 'duplicates'> & {
  urlCount: number;
};

let schemaEnsured = false;

export async function ensureNapAuditsSchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nap_audits (
      id           UUID PRIMARY KEY,
      user_id      TEXT NOT NULL,
      label        TEXT NOT NULL,
      canonical    JSONB NOT NULL,
      urls         TEXT[] NOT NULL,
      score        INTEGER,
      summary      JSONB,
      duplicates   JSONB NOT NULL DEFAULT '[]'::jsonb,
      results      JSONB NOT NULL DEFAULT '[]'::jsonb,
      history      JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_run_at  TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_nap_audits_user_created
      ON nap_audits (user_id, created_at DESC)
  `);
  schemaEnsured = true;
}

function toIso(v: Date | string | null): string | null {
  if (v == null) return null;
  return typeof v === 'string' ? v : v.toISOString();
}

interface NapAuditDbRow {
  id: string;
  label: string;
  canonical: CanonicalNap;
  urls: string[];
  score: number | null;
  summary: NapRunSummary | null;
  duplicates: DuplicateGroup[] | null;
  results: UrlResult[] | null;
  history: NapAuditHistoryPoint[] | null;
  created_at: Date | string;
  last_run_at: Date | string | null;
}

function mapRow(r: NapAuditDbRow): NapAuditRecord {
  return {
    id: r.id,
    label: r.label,
    canonical: r.canonical,
    urls: Array.isArray(r.urls) ? r.urls : [],
    score: r.score,
    summary: r.summary,
    duplicates: Array.isArray(r.duplicates) ? r.duplicates : [],
    results: Array.isArray(r.results) ? r.results : [],
    history: Array.isArray(r.history) ? r.history : [],
    createdAt: toIso(r.created_at)!,
    lastRunAt: toIso(r.last_run_at),
  };
}

export async function countNapAudits(userId: string): Promise<number> {
  await ensureNapAuditsSchema();
  const res = await pool.query(`SELECT COUNT(*)::int AS n FROM nap_audits WHERE user_id = $1`, [userId]);
  return (res.rows[0]?.n as number) ?? 0;
}

export async function listNapAudits(userId: string): Promise<NapAuditListItem[]> {
  await ensureNapAuditsSchema();
  const res = await pool.query(
    `SELECT id, label, canonical, urls, score, summary, history, created_at, last_run_at
       FROM nap_audits
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, NAP_MAX_SAVED_AUDITS],
  );
  return (res.rows as NapAuditDbRow[]).map((r) => {
    const rec = mapRow({ ...r, duplicates: [], results: [] });
    const { results: _results, duplicates: _duplicates, ...rest } = rec;
    void _results;
    void _duplicates;
    return { ...rest, urlCount: rec.urls.length };
  });
}

export async function getNapAudit(userId: string, id: string): Promise<NapAuditRecord | null> {
  await ensureNapAuditsSchema();
  const res = await pool.query(
    `SELECT id, label, canonical, urls, score, summary, duplicates, results, history, created_at, last_run_at
       FROM nap_audits
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0] as NapAuditDbRow);
}

/** Create a saved audit and run it immediately. */
export async function createNapAudit(input: {
  userId: string;
  label: string;
  canonical: CanonicalNap;
  urls: string[];
}): Promise<NapAuditRecord> {
  await ensureNapAuditsSchema();
  const urls = input.urls.slice(0, NAP_MAX_URLS);
  const run = await runNapCheck(input.canonical, urls);
  const now = new Date().toISOString();
  const history: NapAuditHistoryPoint[] = [{ at: now, score: run.score }];
  const id = randomUUID();
  const res = await pool.query(
    `INSERT INTO nap_audits
       (id, user_id, label, canonical, urls, score, summary, duplicates, results, history, last_run_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, NOW())
     RETURNING id, label, canonical, urls, score, summary, duplicates, results, history, created_at, last_run_at`,
    [
      id,
      input.userId,
      input.label,
      JSON.stringify(input.canonical),
      urls,
      run.score,
      JSON.stringify(run.summary),
      JSON.stringify(run.duplicates),
      JSON.stringify(run.results),
      JSON.stringify(history),
    ],
  );
  return mapRow(res.rows[0] as NapAuditDbRow);
}

/** Re-run a saved audit with its stored canonical NAP + URLs, appending to history. */
export async function rerunNapAudit(userId: string, id: string): Promise<NapAuditRecord | null> {
  const existing = await getNapAudit(userId, id);
  if (!existing) return null;
  const run = await runNapCheck(existing.canonical, existing.urls);
  const now = new Date().toISOString();
  const history = [...existing.history, { at: now, score: run.score }].slice(-HISTORY_CAP);
  const res = await pool.query(
    `UPDATE nap_audits
        SET score = $3, summary = $4::jsonb, duplicates = $5::jsonb,
            results = $6::jsonb, history = $7::jsonb, last_run_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, label, canonical, urls, score, summary, duplicates, results, history, created_at, last_run_at`,
    [
      id,
      userId,
      run.score,
      JSON.stringify(run.summary),
      JSON.stringify(run.duplicates),
      JSON.stringify(run.results),
      JSON.stringify(history),
    ],
  );
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0] as NapAuditDbRow);
}

export async function deleteNapAudit(userId: string, id: string): Promise<boolean> {
  await ensureNapAuditsSchema();
  const res = await pool.query(`DELETE FROM nap_audits WHERE id = $1 AND user_id = $2`, [id, userId]);
  return (res.rowCount ?? 0) > 0;
}
