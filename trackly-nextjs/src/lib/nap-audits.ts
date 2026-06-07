/**
 * Saved NAP audits — persistence for the logged-in "save an audit per client,
 * re-run later to track progress" feature. One table, created idempotently via
 * ensureNapAuditsSchema (matching the repo's per-module CREATE TABLE IF NOT
 * EXISTS pattern used by ensureGeoAuditsSchema etc.).
 *
 * Runs are processed in the background (status queued → running → done/failed)
 * so a 500-URL fetch can't blow the request timeout: the POST returns a queued
 * row and processNapAudit() does the work in a Next.js after() callback, with
 * /api/cron/nap-audits-worker as the cold-restart safety net (mirrors the
 * geo-audits lifecycle exactly). During the run the worker writes a throttled
 * `progress_done` counter so the dashboard can show a live progress bar.
 *
 * The full per-URL results are stored as JSONB on the row — the set is bounded
 * (<=500 URLs) so a child table would be overkill. Each run appends {at, score}
 * to a capped `history` array so the detail view can chart consistency over time.
 */
import { randomUUID } from 'node:crypto';
import { pool } from '@/lib/db';
import { effectiveScore, type CanonicalNap, type DuplicateGroup, type UrlResult } from '@/lib/nap-verify';
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
  brandId: string | null;
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
  /** Manual per-URL verification: { [url]: true } counts that citation as OK. */
  overrides: Record<string, boolean>;
  /**
   * URLs the worker has finished for the in-flight run; the UI divides this
   * by urls.length to render a live progress bar. Reset to 0 when a run
   * starts and brought up to total when the run terminates so the column
   * always reflects the most recent run's state.
   */
  progressDone: number;
  createdAt: string;
  lastRunAt: string | null;
}

/**
 * Lightweight shape for the list view. We drop the per-run heavy fields
 * (`results`, `duplicates`) and the raw `urls` array — at 500 URLs that
 * would otherwise inflate every row in the dashboard payload — and surface
 * just the count instead.
 */
export type NapAuditListItem = Omit<NapAuditRecord, 'results' | 'duplicates' | 'urls'> & {
  urlCount: number;
};

let schemaEnsured = false;

export async function ensureNapAuditsSchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nap_audits (
      id            UUID PRIMARY KEY,
      user_id       TEXT NOT NULL,
      brand_id      TEXT,
      label         TEXT NOT NULL,
      canonical     JSONB NOT NULL,
      urls          TEXT[] NOT NULL,
      status        TEXT NOT NULL DEFAULT 'done'
                     CHECK (status IN ('queued','running','done','failed')),
      error         TEXT,
      schedule      TEXT NOT NULL DEFAULT 'off',
      score         INTEGER,
      summary       JSONB,
      duplicates    JSONB NOT NULL DEFAULT '[]'::jsonb,
      results       JSONB NOT NULL DEFAULT '[]'::jsonb,
      history       JSONB NOT NULL DEFAULT '[]'::jsonb,
      overrides     JSONB NOT NULL DEFAULT '{}'::jsonb,
      progress_done INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at    TIMESTAMPTZ,
      last_run_at   TIMESTAMPTZ
    )
  `);
  // Backfill columns for installations created before background processing /
  // scheduling existed — idempotent, no-op on fresh DBs.
  await pool.query(`ALTER TABLE nap_audits ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done'`);
  await pool.query(`ALTER TABLE nap_audits ADD COLUMN IF NOT EXISTS error TEXT`);
  await pool.query(`ALTER TABLE nap_audits ADD COLUMN IF NOT EXISTS schedule TEXT NOT NULL DEFAULT 'off'`);
  await pool.query(`ALTER TABLE nap_audits ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE nap_audits ADD COLUMN IF NOT EXISTS brand_id TEXT`);
  await pool.query(`ALTER TABLE nap_audits ADD COLUMN IF NOT EXISTS overrides JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE nap_audits ADD COLUMN IF NOT EXISTS progress_done INTEGER NOT NULL DEFAULT 0`);
  // FK + cascade-on-brand-delete. Add only if missing — Postgres has no
  // ADD CONSTRAINT IF NOT EXISTS, so we guard via information_schema.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_name = 'nap_audits' AND constraint_name = 'nap_audits_brand_fk'
      ) THEN
        ALTER TABLE nap_audits
          ADD CONSTRAINT nap_audits_brand_fk
          FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;
      END IF;
    END$$;
  `);
  // One-shot heuristic backfill so pre-brand-scoping audits don't become
  // invisible after the listing route starts filtering by brand_id. We
  // only auto-associate when the audit's canonical business name matches
  // exactly one of the owner's brands by name (case-insensitive), which
  // is the common single-tenant shape. Audits with no confident match
  // stay NULL and the user must re-assign them.
  await pool.query(`
    UPDATE nap_audits a
       SET brand_id = b.id
      FROM brands b
     WHERE a.brand_id IS NULL
       AND b.user_id = a.user_id
       AND LOWER(b.data->>'name') = LOWER(a.canonical->>'name')
       AND NOT EXISTS (
         SELECT 1 FROM brands b2
          WHERE b2.user_id = a.user_id
            AND b2.id <> b.id
            AND LOWER(b2.data->>'name') = LOWER(a.canonical->>'name')
       )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_nap_audits_user_created
      ON nap_audits (user_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_nap_audits_user_brand_created
      ON nap_audits (user_id, brand_id, created_at DESC)
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
  brand_id: string | null;
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
  overrides: Record<string, boolean> | null;
  progress_done: number | string | null;
  created_at: Date | string;
  last_run_at: Date | string | null;
}

function mapRow(r: NapAuditDbRow): NapAuditRecord {
  return {
    id: r.id,
    brandId: r.brand_id,
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
    overrides: r.overrides && typeof r.overrides === 'object' ? r.overrides : {},
    progressDone: Number(r.progress_done ?? 0) || 0,
    createdAt: toIso(r.created_at)!,
    lastRunAt: toIso(r.last_run_at),
  };
}

const FULL_COLS =
  'id, brand_id, label, canonical, urls, status, error, schedule, score, summary, duplicates, results, history, overrides, progress_done, created_at, last_run_at';
// LIST_COLS swaps the raw `urls` array for its length so list responses
// stay slim even when an audit holds the 500-URL maximum.
const LIST_COLS =
  "id, brand_id, label, canonical, COALESCE(array_length(urls, 1), 0)::int AS url_count, status, error, schedule, score, summary, history, progress_done, created_at, last_run_at";

export async function countNapAudits(userId: string): Promise<number> {
  await ensureNapAuditsSchema();
  const res = await pool.query(`SELECT COUNT(*)::int AS n FROM nap_audits WHERE user_id = $1`, [userId]);
  return (res.rows[0]?.n as number) ?? 0;
}

/**
 * List the user's audits. When `brandId` is provided, results are scoped
 * strictly to that brand so the dashboard never bleeds another brand's
 * audits into the current view; audits with a NULL brand_id (pre-scoping
 * legacy rows whose canonical name didn't match any brand during the
 * schema backfill) are excluded from brand-scoped queries.
 */
export async function listNapAudits(
  userId: string,
  brandId?: string | null,
): Promise<NapAuditListItem[]> {
  await ensureNapAuditsSchema();
  const res = brandId
    ? await pool.query(
        `SELECT ${LIST_COLS}
           FROM nap_audits
          WHERE user_id = $1 AND brand_id = $2
          ORDER BY created_at DESC
          LIMIT $3`,
        [userId, brandId, NAP_MAX_SAVED_AUDITS],
      )
    : await pool.query(
        `SELECT ${LIST_COLS}
           FROM nap_audits
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [userId, NAP_MAX_SAVED_AUDITS],
      );
  return (res.rows as (NapAuditDbRow & { url_count: number })[]).map((r) => {
    // url_count comes from SQL; we synthesise an empty urls array purely
    // to satisfy mapRow's row shape, then strip it from the list item.
    const rec = mapRow({ ...r, urls: [], duplicates: [], results: [] });
    const { results: _results, duplicates: _duplicates, urls: _urls, ...rest } = rec;
    void _results;
    void _duplicates;
    void _urls;
    return { ...rest, urlCount: Number(r.url_count) || 0 };
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
  brandId: string;
  label: string;
  canonical: CanonicalNap;
  urls: string[];
}): Promise<NapAuditRecord> {
  await ensureNapAuditsSchema();
  const urls = input.urls.slice(0, NAP_MAX_URLS);
  const id = randomUUID();
  const res = await pool.query(
    `INSERT INTO nap_audits (id, user_id, brand_id, label, canonical, urls, status)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'queued')
     RETURNING ${FULL_COLS}`,
    [id, input.userId, input.brandId, input.label, JSON.stringify(input.canonical), urls],
  );
  return mapRow(res.rows[0] as NapAuditDbRow);
}

/** Atomically claim a queued audit for processing. Returns false if not claimable. */
export async function claimNapAuditForRunning(id: string): Promise<boolean> {
  await ensureNapAuditsSchema();
  const res = await pool.query(
    `UPDATE nap_audits SET status = 'running', started_at = NOW(), progress_done = 0
      WHERE id = $1 AND status = 'queued'
      RETURNING id`,
    [id],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Throttle progress writes so a 500-URL run with concurrency 16 doesn't fire
 * a DB UPDATE per completed URL. We persist when the in-flight count crosses
 * a 1%-of-total step (min 1) or 1.5 s have passed since the last write —
 * both of which the UI's 4 s polling interval comfortably samples.
 */
const PROGRESS_WRITE_INTERVAL_MS = 1500;

/**
 * Run a claimed audit: fetch + extract + compare, persist results, append to
 * history, mark terminal. Returns the updated record (or null if it wasn't
 * claimable — already running/terminal/gone).
 */
export async function processNapAudit(id: string): Promise<NapAuditRecord | null> {
  if (!(await claimNapAuditForRunning(id))) return null;
  const row = await pool.query(`SELECT canonical, urls, history, overrides FROM nap_audits WHERE id = $1`, [id]);
  if (row.rows.length === 0) return null;
  const canonical = row.rows[0].canonical as CanonicalNap;
  const urls = (row.rows[0].urls as string[]) ?? [];
  const prevHistory = (row.rows[0].history as NapAuditHistoryPoint[]) ?? [];
  const overrides = (row.rows[0].overrides as Record<string, boolean>) ?? {};

  let lastWrittenDone = 0;
  let lastWriteAt = 0;
  const stepThreshold = Math.max(1, Math.floor(urls.length / 100));
  const onProgress = (done: number, _total: number) => {
    const now = Date.now();
    const enoughItems = done - lastWrittenDone >= stepThreshold;
    const enoughTime = now - lastWriteAt >= PROGRESS_WRITE_INTERVAL_MS;
    if (!enoughItems && !enoughTime) return;
    lastWrittenDone = done;
    lastWriteAt = now;
    // Fire-and-forget — a single dropped write is fine because the next
    // tick (or the terminal UPDATE) will overwrite it. We avoid awaiting
    // so the in-flight fetches keep saturating their concurrency budget.
    pool
      .query(`UPDATE nap_audits SET progress_done = $2 WHERE id = $1`, [id, done])
      .catch(() => undefined);
  };

  try {
    const run = await runNapCheck(canonical, urls, { onProgress });
    // Honor manual verification so a re-run doesn't wipe operator-confirmed rows.
    const score = effectiveScore(run.results, overrides);
    const history = [...prevHistory, { at: new Date().toISOString(), score }].slice(-HISTORY_CAP);
    const res = await pool.query(
      `UPDATE nap_audits
          SET status = 'done', error = NULL, score = $2, summary = $3::jsonb,
              duplicates = $4::jsonb, results = $5::jsonb, history = $6::jsonb,
              progress_done = $7, last_run_at = NOW()
        WHERE id = $1
        RETURNING ${FULL_COLS}`,
      [id, score, JSON.stringify(run.summary), JSON.stringify(run.duplicates), JSON.stringify(run.results), JSON.stringify(history), urls.length],
    );
    return mapRow(res.rows[0] as NapAuditDbRow);
  } catch (e) {
    await pool.query(
      `UPDATE nap_audits SET status = 'failed', error = $2, progress_done = $3 WHERE id = $1`,
      [id, (e as Error).message.slice(0, 300), urls.length],
    );
    return null;
  }
}

/** Reset a saved audit to 'queued' so it can be (re-)processed. */
export async function requeueNapAudit(userId: string, id: string): Promise<NapAuditRecord | null> {
  await ensureNapAuditsSchema();
  const res = await pool.query(
    `UPDATE nap_audits SET status = 'queued', error = NULL, progress_done = 0
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

/**
 * Edit a saved audit's label, canonical NAP and/or URL list. Preserves the
 * row (and its score history); the caller re-runs to refresh results against
 * the new inputs.
 */
export async function updateNapAudit(
  userId: string,
  id: string,
  input: { label?: string; canonical?: CanonicalNap; urls?: string[] },
): Promise<NapAuditRecord | null> {
  await ensureNapAuditsSchema();
  const existing = await getNapAudit(userId, id);
  if (!existing) return null;
  const label = input.label?.trim() ? input.label.trim().slice(0, 120) : existing.label;
  const canonical = input.canonical ?? existing.canonical;
  const urls = input.urls ? input.urls.slice(0, NAP_MAX_URLS) : existing.urls;
  const res = await pool.query(
    `UPDATE nap_audits SET label = $3, canonical = $4::jsonb, urls = $5
      WHERE id = $1 AND user_id = $2
      RETURNING ${FULL_COLS}`,
    [id, userId, label, JSON.stringify(canonical), urls],
  );
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0] as NapAuditDbRow);
}

/**
 * Manually mark a citation OK (or undo it). When `ok` is true the URL counts as
 * a full match in the consistency score — for pages the fetcher was blocked from
 * but the operator verified by hand. Recomputes and persists the score from the
 * stored results; does not append to history (it's not a fresh run).
 */
export async function setNapAuditOverride(
  userId: string,
  id: string,
  url: string,
  ok: boolean,
): Promise<NapAuditRecord | null> {
  const existing = await getNapAudit(userId, id);
  if (!existing) return null;
  const overrides = { ...existing.overrides };
  if (ok) overrides[url] = true;
  else delete overrides[url];
  const score = effectiveScore(existing.results, overrides);
  const res = await pool.query(
    `UPDATE nap_audits SET overrides = $3::jsonb, score = $4
      WHERE id = $1 AND user_id = $2
      RETURNING ${FULL_COLS}`,
    [id, userId, JSON.stringify(overrides), score],
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
