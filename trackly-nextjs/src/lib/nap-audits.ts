/**
 * Saved NAP audits — persistence for the logged-in "save an audit per client,
 * re-run later to track progress" feature. One table, created idempotently via
 * ensureNapAuditsSchema (matching the repo's per-module CREATE TABLE IF NOT
 * EXISTS pattern used by ensureGeoAuditsSchema etc.).
 *
 * Runs are processed in the background (status queued → running → done/failed)
 * so a 50-URL fetch can't blow the request timeout: the POST returns a queued
 * row and processNapAudit() does the work in a Next.js after() callback, with
 * /api/cron/nap-audits-worker as the cold-restart safety net (mirrors the
 * geo-audits lifecycle exactly).
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

export type NapAuditStatus = 'queued' | 'running' | 'done' | 'failed';
export type NapAuditSchedule = 'off' | 'weekly' | 'monthly';
export const NAP_SCHEDULES: NapAuditSchedule[] = ['off', 'weekly', 'monthly'];

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
  status: NapAuditStatus;
  error: string | null;
  schedule: NapAuditSchedule;
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
      status       TEXT NOT NULL DEFAULT 'done'
                    CHECK (status IN ('queued','running','done','failed')),
      error        TEXT,
      schedule     TEXT NOT NULL DEFAULT 'off',
      score        INTEGER,
      summary      JSONB,
      duplicates   JSONB NOT NULL DEFAULT '[]'::jsonb,
      results      JSONB NOT NULL DEFAULT '[]'::jsonb,
      history      JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at   TIMESTAMPTZ,
      last_run_at  TIMESTAMPTZ
    )
  `);
  // Backfill columns for installations created before background processing /
  // scheduling existed — idempotent, no-op on fresh DBs.
  await pool.query(`ALTER TABLE nap_audits ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done'`);
  await pool.query(`ALTER TABLE nap_audits ADD COLUMN IF NOT EXISTS error TEXT`);
  await pool.query(`ALTER TABLE nap_audits ADD COLUMN IF NOT EXISTS schedule TEXT NOT NULL DEFAULT 'off'`);
  await pool.query(`ALTER TABLE nap_audits ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_nap_audits_user_created
      ON nap_audits (user_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_nap_audits_status_active
      ON nap_audits (status, created_at)
      WHERE status IN ('queued','running')
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
  status: NapAuditStatus;
  error: string | null;
  schedule: NapAuditSchedule;
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
    status: r.status,
    error: r.error,
    schedule: r.schedule,
    score: r.score,
    summary: r.summary,
    duplicates: Array.isArray(r.duplicates) ? r.duplicates : [],
    results: Array.isArray(r.results) ? r.results : [],
    history: Array.isArray(r.history) ? r.history : [],
    createdAt: toIso(r.created_at)!,
    lastRunAt: toIso(r.last_run_at),
  };
}

const FULL_COLS =
  'id, label, canonical, urls, status, error, schedule, score, summary, duplicates, results, history, created_at, last_run_at';
const LIST_COLS =
  'id, label, canonical, urls, status, error, schedule, score, summary, history, created_at, last_run_at';

export async function countNapAudits(userId: string): Promise<number> {
  await ensureNapAuditsSchema();
  const res = await pool.query(`SELECT COUNT(*)::int AS n FROM nap_audits WHERE user_id = $1`, [userId]);
  return (res.rows[0]?.n as number) ?? 0;
}

export async function listNapAudits(userId: string): Promise<NapAuditListItem[]> {
  await ensureNapAuditsSchema();
  const res = await pool.query(
    `SELECT ${LIST_COLS}
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
    `SELECT ${FULL_COLS} FROM nap_audits WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [id, userId],
  );
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0] as NapAuditDbRow);
}

/** Insert a saved audit in 'queued' state. The caller dispatches processNapAudit. */
export async function insertNapAudit(input: {
  userId: string;
  label: string;
  canonical: CanonicalNap;
  urls: string[];
}): Promise<NapAuditRecord> {
  await ensureNapAuditsSchema();
  const urls = input.urls.slice(0, NAP_MAX_URLS);
  const id = randomUUID();
  const res = await pool.query(
    `INSERT INTO nap_audits (id, user_id, label, canonical, urls, status)
     VALUES ($1, $2, $3, $4::jsonb, $5, 'queued')
     RETURNING ${FULL_COLS}`,
    [id, input.userId, input.label, JSON.stringify(input.canonical), urls],
  );
  return mapRow(res.rows[0] as NapAuditDbRow);
}

/** Atomically claim a queued audit for processing. Returns false if not claimable. */
export async function claimNapAuditForRunning(id: string): Promise<boolean> {
  await ensureNapAuditsSchema();
  const res = await pool.query(
    `UPDATE nap_audits SET status = 'running', started_at = NOW()
      WHERE id = $1 AND status = 'queued'
      RETURNING id`,
    [id],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Run a claimed audit: fetch + extract + compare, persist results, append to
 * history, mark terminal. Returns the updated record (or null if it wasn't
 * claimable — already running/terminal/gone).
 */
export async function processNapAudit(id: string): Promise<NapAuditRecord | null> {
  if (!(await claimNapAuditForRunning(id))) return null;
  const row = await pool.query(`SELECT canonical, urls, history FROM nap_audits WHERE id = $1`, [id]);
  if (row.rows.length === 0) return null;
  const canonical = row.rows[0].canonical as CanonicalNap;
  const urls = (row.rows[0].urls as string[]) ?? [];
  const prevHistory = (row.rows[0].history as NapAuditHistoryPoint[]) ?? [];

  try {
    const run = await runNapCheck(canonical, urls);
    const history = [...prevHistory, { at: new Date().toISOString(), score: run.score }].slice(-HISTORY_CAP);
    const res = await pool.query(
      `UPDATE nap_audits
          SET status = 'done', error = NULL, score = $2, summary = $3::jsonb,
              duplicates = $4::jsonb, results = $5::jsonb, history = $6::jsonb, last_run_at = NOW()
        WHERE id = $1
        RETURNING ${FULL_COLS}`,
      [id, run.score, JSON.stringify(run.summary), JSON.stringify(run.duplicates), JSON.stringify(run.results), JSON.stringify(history)],
    );
    return mapRow(res.rows[0] as NapAuditDbRow);
  } catch (e) {
    await pool.query(`UPDATE nap_audits SET status = 'failed', error = $2 WHERE id = $1`, [
      id,
      (e as Error).message.slice(0, 300),
    ]);
    return null;
  }
}

/** Reset a saved audit to 'queued' so it can be (re-)processed. */
export async function requeueNapAudit(userId: string, id: string): Promise<NapAuditRecord | null> {
  await ensureNapAuditsSchema();
  const res = await pool.query(
    `UPDATE nap_audits SET status = 'queued', error = NULL
      WHERE id = $1 AND user_id = $2 AND status IN ('done','failed','queued')
      RETURNING ${FULL_COLS}`,
    [id, userId],
  );
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0] as NapAuditDbRow);
}

export async function setNapAuditSchedule(
  userId: string,
  id: string,
  schedule: NapAuditSchedule,
): Promise<NapAuditRecord | null> {
  await ensureNapAuditsSchema();
  const res = await pool.query(
    `UPDATE nap_audits SET schedule = $3 WHERE id = $1 AND user_id = $2 RETURNING ${FULL_COLS}`,
    [id, userId, schedule],
  );
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0] as NapAuditDbRow);
}

export async function deleteNapAudit(userId: string, id: string): Promise<boolean> {
  await ensureNapAuditsSchema();
  const res = await pool.query(`DELETE FROM nap_audits WHERE id = $1 AND user_id = $2`, [id, userId]);
  return (res.rowCount ?? 0) > 0;
}

/** IDs of audits stuck in 'queued' beyond the threshold (cron safety net). */
export async function findStuckQueuedNapAudits(staleSeconds = 60): Promise<string[]> {
  await ensureNapAuditsSchema();
  const res = await pool.query(
    `SELECT id FROM nap_audits
       WHERE status = 'queued'
         AND created_at < NOW() - ($1::int || ' seconds')::interval
       ORDER BY created_at ASC
       LIMIT 50`,
    [staleSeconds],
  );
  return (res.rows as Array<{ id: string }>).map((r) => r.id);
}

export interface DueScheduledAudit {
  id: string;
  userId: string;
  email: string;
  label: string;
}

/**
 * Audits whose schedule matches `frequency` and that haven't run within the
 * cadence window, joined to the owner's email for the alert. Skips audits
 * already queued/running so a long monitor tick can't double-dispatch.
 */
export async function listDueScheduledAudits(
  frequency: 'weekly' | 'monthly',
): Promise<DueScheduledAudit[]> {
  await ensureNapAuditsSchema();
  const minDays = frequency === 'weekly' ? 6 : 27; // small slack before the nominal cadence
  const res = await pool.query(
    `SELECT a.id, a.user_id, a.label, u.email
       FROM nap_audits a
       JOIN users u ON u.id = a.user_id
      WHERE a.schedule = $1
        AND a.status IN ('done','failed')
        AND (a.last_run_at IS NULL OR a.last_run_at < NOW() - ($2::int || ' days')::interval)
      ORDER BY a.last_run_at ASC NULLS FIRST
      LIMIT 200`,
    [frequency, minDays],
  );
  return (res.rows as Array<{ id: string; user_id: string; label: string; email: string }>).map((r) => ({
    id: r.id,
    userId: r.user_id,
    label: r.label,
    email: r.email,
  }));
}
