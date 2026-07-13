/**
 * Fix Engine - schema + row persistence.
 *
 * Four tables, created idempotently via ensureFixEngineSchema() following
 * the repo's per-module `CREATE TABLE IF NOT EXISTS` + `ALTER ... ADD
 * COLUMN IF NOT EXISTS` convention (see geo-audits.ts / db.ts):
 *
 *   fixes            one row per (brand × target × module) fix
 *   fix_batches      header for a scan that produced many fixes (progress)
 *   fix_connections  per-brand integration creds (CMS, GSC, Connector)
 *   fix_events       append-only audit trail (detected/approved/shipped/...)
 *
 * The engine is the only writer of `fixes.status`; modules never touch it.
 */

import crypto from 'crypto';
import { pool } from '@/lib/db';
import type {
  FixBatchRow,
  FixChannel,
  FixRow,
  FixSeverity,
  FixStatus,
} from './types';

let schemaEnsured = false;

export async function ensureFixEngineSchema(): Promise<void> {
  if (schemaEnsured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fix_batches (
      id              UUID PRIMARY KEY,
      user_id         TEXT NOT NULL,
      brand_id        TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','running','done','failed')),
      modules         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      total_expected  INTEGER NOT NULL DEFAULT 0,
      received        INTEGER NOT NULL DEFAULT 0,
      error           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at      TIMESTAMPTZ,
      completed_at    TIMESTAMPTZ,
      CONSTRAINT fix_batches_brand_fk
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fix_batches_status_active
      ON fix_batches (status, created_at)
      WHERE status IN ('queued','running')
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fixes (
      id              UUID PRIMARY KEY,
      user_id         TEXT NOT NULL,
      brand_id        TEXT NOT NULL,
      batch_id        UUID,
      module_key      TEXT NOT NULL,
      channel         TEXT NOT NULL CHECK (channel IN ('A','B')),
      target_url      TEXT,
      dedupe_key      TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'detected',
      severity        TEXT NOT NULL DEFAULT 'medium'
                       CHECK (severity IN ('critical','high','medium','low')),
      summary         TEXT NOT NULL DEFAULT '',
      detected        JSONB NOT NULL DEFAULT '{}'::jsonb,
      generated       JSONB,
      before_snapshot JSONB,
      after_snapshot  JSONB,
      ship_result     JSONB,
      score_before    NUMERIC,
      score_after     NUMERIC,
      error           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fixes_brand_fk
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    )
  `);
  // One open fix per (brand, module, target). A re-scan that finds the
  // same issue updates the existing row instead of stacking duplicates.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_fixes_brand_module_dedupe
      ON fixes (brand_id, module_key, dedupe_key)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fixes_brand_status
      ON fixes (brand_id, status, created_at DESC)
  `);
  // Channel-B delivery marker: set when the Connector plugin has pulled +
  // applied + acked the instruction, so the pull endpoint stops returning it.
  await pool.query(`ALTER TABLE fixes ADD COLUMN IF NOT EXISTS connector_delivered_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE fixes ADD COLUMN IF NOT EXISTS connector_attempts INTEGER NOT NULL DEFAULT 0`);
  // AI-visibility (SOV) snapshots captured at ship and at recheck.
  await pool.query(`ALTER TABLE fixes ADD COLUMN IF NOT EXISTS ai_before JSONB`);
  await pool.query(`ALTER TABLE fixes ADD COLUMN IF NOT EXISTS ai_after JSONB`);
  // Collaboration: free-text note + assignee.
  await pool.query(`ALTER TABLE fixes ADD COLUMN IF NOT EXISTS note TEXT`);
  await pool.query(`ALTER TABLE fixes ADD COLUMN IF NOT EXISTS assignee TEXT`);
  // Staged preview (ship-as-draft): how the fix is written, and the
  // Connector-supplied preview URL once it's staged as a draft revision.
  await pool.query(`ALTER TABLE fixes ADD COLUMN IF NOT EXISTS ship_mode TEXT NOT NULL DEFAULT 'live'`);
  await pool.query(`ALTER TABLE fixes ADD COLUMN IF NOT EXISTS preview_url TEXT`);
  // Per-fix outcome measurement: the target page's 28-day GSC metrics at
  // ship time, and again ~28 days later (set by the outcome cron pass).
  await pool.query(`ALTER TABLE fixes ADD COLUMN IF NOT EXISTS gsc_before JSONB`);
  await pool.query(`ALTER TABLE fixes ADD COLUMN IF NOT EXISTS gsc_after JSONB`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fix_connections (
      id              UUID PRIMARY KEY,
      user_id         TEXT NOT NULL,
      brand_id        TEXT NOT NULL,
      provider        TEXT NOT NULL CHECK (provider IN ('cms','gsc','connector','linear','jira','kwe','sheet')),
      cms_type        TEXT,
      site_url        TEXT,
      encrypted_creds TEXT,
      meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
      status          TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','revoked','error')),
      expires_at      TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fix_connections_brand_fk
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_fix_connections_brand_provider
      ON fix_connections (brand_id, provider)
  `);
  // Queryable hash of the Connector pairing token (the raw token is shown
  // once and never stored; the HMAC secret lives in encrypted_creds).
  await pool.query(`ALTER TABLE fix_connections ADD COLUMN IF NOT EXISTS token_hash TEXT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fix_connections_token_hash ON fix_connections (token_hash)`);
  // Connector heartbeat: updated on every successful pull.
  await pool.query(`ALTER TABLE fix_connections ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`);
  // Allow native issue-tracker providers (linear, jira) on existing DBs
  // whose CHECK constraint predates them. Drop + re-add idempotently.
  await pool.query(`ALTER TABLE fix_connections DROP CONSTRAINT IF EXISTS fix_connections_provider_check`);
  await pool.query(`ALTER TABLE fix_connections ADD CONSTRAINT fix_connections_provider_check
    CHECK (provider IN ('cms','gsc','connector','linear','jira','kwe','sheet'))`);

  // One-click connect handshake: short-lived, single-use authorization codes
  // exchanged by the Connector plugin for its token + HMAC secret (so the
  // secrets never travel through the browser). Rows are consumed on exchange
  // and expire after a few minutes.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fix_connector_handshakes (
      code_hash   TEXT PRIMARY KEY,
      brand_id    TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      payload     TEXT NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      used_at     TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fix_events (
      id          UUID PRIMARY KEY,
      fix_id      UUID,
      brand_id    TEXT NOT NULL,
      user_id     TEXT,
      event       TEXT NOT NULL,
      detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fix_events_fix
      ON fix_events (fix_id, created_at)
  `);

  schemaEnsured = true;
}

// ── row mapping ──────────────────────────────────────────────────

type DbRow = Record<string, unknown>;

export function mapFixRow(r: DbRow): FixRow {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    brandId: String(r.brand_id),
    moduleKey: String(r.module_key),
    channel: r.channel as FixChannel,
    targetUrl: (r.target_url as string | null) ?? null,
    status: r.status as FixStatus,
    severity: r.severity as FixSeverity,
    dedupeKey: String(r.dedupe_key),
    summary: String(r.summary ?? ''),
    detected: (r.detected as Record<string, unknown>) ?? {},
    generated: (r.generated as Record<string, unknown> | null) ?? null,
    beforeSnapshot: (r.before_snapshot as Record<string, unknown> | null) ?? null,
    afterSnapshot: (r.after_snapshot as Record<string, unknown> | null) ?? null,
    shipResult: (r.ship_result as Record<string, unknown> | null) ?? null,
    scoreBefore: r.score_before == null ? null : Number(r.score_before),
    scoreAfter: r.score_after == null ? null : Number(r.score_after),
    aiBefore: (r.ai_before as Record<string, unknown> | null) ?? null,
    aiAfter: (r.ai_after as Record<string, unknown> | null) ?? null,
    note: (r.note as string | null) ?? null,
    assignee: (r.assignee as string | null) ?? null,
    shipMode: (r.ship_mode as 'live' | 'draft' | null) ?? 'live',
    previewUrl: (r.preview_url as string | null) ?? null,
    gscBefore: (r.gsc_before as Record<string, unknown> | null) ?? null,
    gscAfter: (r.gsc_after as Record<string, unknown> | null) ?? null,
    error: (r.error as string | null) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapBatchRow(r: DbRow): FixBatchRow {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    brandId: String(r.brand_id),
    status: r.status as FixBatchRow['status'],
    modules: (r.modules as string[]) ?? [],
    totalExpected: Number(r.total_expected) || 0,
    received: Number(r.received) || 0,
    error: (r.error as string | null) ?? null,
    createdAt: String(r.created_at),
    startedAt: (r.started_at as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
  };
}

// ── batch helpers ────────────────────────────────────────────────

export async function createBatch(
  userId: string,
  brandId: string,
  modules: string[],
): Promise<string> {
  await ensureFixEngineSchema();
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO fix_batches (id, user_id, brand_id, modules, status)
     VALUES ($1, $2, $3, $4, 'queued')`,
    [id, userId, brandId, modules],
  );
  return id;
}

export async function claimBatchForRunning(batchId: string): Promise<boolean> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `UPDATE fix_batches SET status = 'running', started_at = NOW()
      WHERE id = $1 AND status = 'queued' RETURNING id`,
    [batchId],
  );
  return (res.rowCount || 0) > 0;
}

export async function finalizeBatch(
  batchId: string,
  outcome: 'done' | 'failed',
  received: number,
  totalExpected: number,
  error: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE fix_batches
        SET status = $2, received = $3, total_expected = $4,
            error = $5, completed_at = NOW()
      WHERE id = $1`,
    [batchId, outcome, received, totalExpected, error],
  );
}

export async function getBatch(batchId: string): Promise<FixBatchRow | null> {
  await ensureFixEngineSchema();
  const res = await pool.query(`SELECT * FROM fix_batches WHERE id = $1`, [batchId]);
  return res.rows[0] ? mapBatchRow(res.rows[0]) : null;
}

export async function findStuckQueuedBatches(olderThanSeconds: number): Promise<string[]> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT id FROM fix_batches
      WHERE status = 'queued'
        AND created_at < NOW() - ($1 || ' seconds')::interval
      ORDER BY created_at ASC`,
    [String(olderThanSeconds)],
  );
  return res.rows.map((r: DbRow) => String(r.id));
}

// ── fix row helpers ──────────────────────────────────────────────

export async function getFix(fixId: string, brandId: string): Promise<FixRow | null> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT * FROM fixes WHERE id = $1 AND brand_id = $2`,
    [fixId, brandId],
  );
  return res.rows[0] ? mapFixRow(res.rows[0]) : null;
}

export async function listFixes(
  brandId: string,
  filters: { status?: string; moduleKey?: string; channel?: string } = {},
): Promise<FixRow[]> {
  await ensureFixEngineSchema();
  const values: unknown[] = [brandId];
  let q = `SELECT * FROM fixes WHERE brand_id = $1`;
  let i = 2;
  if (filters.status) { q += ` AND status = $${i++}`; values.push(filters.status); }
  if (filters.moduleKey) { q += ` AND module_key = $${i++}`; values.push(filters.moduleKey); }
  if (filters.channel) { q += ` AND channel = $${i++}`; values.push(filters.channel); }
  q += ` ORDER BY created_at DESC LIMIT 500`;
  const res = await pool.query(q, values);
  return res.rows.map(mapFixRow);
}

/**
 * Upsert a detected issue. New issues insert as 'detected'. A re-scan
 * that finds the same (brand, module, dedupe_key) refreshes the evidence
 * and summary ONLY while the fix is still untouched ('detected') - once a
 * human has generated/approved/shipped it, we leave it alone so a routine
 * re-scan can't clobber in-flight work.
 */
export async function upsertDetectedFix(args: {
  userId: string;
  brandId: string;
  batchId: string | null;
  moduleKey: string;
  channel: FixChannel;
  targetUrl: string | null;
  dedupeKey: string;
  severity: FixSeverity;
  summary: string;
  detected: Record<string, unknown>;
  before?: Record<string, unknown>;
}): Promise<string> {
  await ensureFixEngineSchema();
  const id = crypto.randomUUID();
  const res = await pool.query(
    `INSERT INTO fixes
       (id, user_id, brand_id, batch_id, module_key, channel, target_url,
        dedupe_key, severity, summary, detected, before_snapshot, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'detected')
     ON CONFLICT (brand_id, module_key, dedupe_key) DO UPDATE
       SET severity   = EXCLUDED.severity,
           summary    = EXCLUDED.summary,
           detected   = EXCLUDED.detected,
           before_snapshot = EXCLUDED.before_snapshot,
           batch_id   = EXCLUDED.batch_id,
           updated_at = NOW()
       WHERE fixes.status = 'detected'
     RETURNING id`,
    [
      id, args.userId, args.brandId, args.batchId, args.moduleKey,
      args.channel, args.targetUrl, args.dedupeKey, args.severity,
      args.summary, JSON.stringify(args.detected),
      args.before ? JSON.stringify(args.before) : null,
    ],
  );
  // RETURNING is empty when the WHERE on the DO UPDATE filtered the row
  // out (status != 'detected'); fall back to the existing id.
  if (res.rows[0]?.id) return String(res.rows[0].id);
  const existing = await pool.query(
    `SELECT id FROM fixes WHERE brand_id=$1 AND module_key=$2 AND dedupe_key=$3`,
    [args.brandId, args.moduleKey, args.dedupeKey],
  );
  return String(existing.rows[0]?.id ?? id);
}

/** Update a fix's status with optional column patches. */
export async function updateFix(
  fixId: string,
  patch: {
    status?: FixStatus;
    generated?: Record<string, unknown> | null;
    afterSnapshot?: Record<string, unknown> | null;
    shipResult?: Record<string, unknown> | null;
    scoreBefore?: number | null;
    scoreAfter?: number | null;
    aiBefore?: Record<string, unknown> | null;
    aiAfter?: Record<string, unknown> | null;
    note?: string | null;
    assignee?: string | null;
    shipMode?: 'live' | 'draft';
    previewUrl?: string | null;
    gscBefore?: Record<string, unknown> | null;
    gscAfter?: Record<string, unknown> | null;
    error?: string | null;
  },
): Promise<void> {
  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [fixId];
  let i = 2;
  if (patch.status !== undefined) { sets.push(`status = $${i++}`); values.push(patch.status); }
  if (patch.generated !== undefined) { sets.push(`generated = $${i++}`); values.push(patch.generated ? JSON.stringify(patch.generated) : null); }
  if (patch.afterSnapshot !== undefined) { sets.push(`after_snapshot = $${i++}`); values.push(patch.afterSnapshot ? JSON.stringify(patch.afterSnapshot) : null); }
  if (patch.shipResult !== undefined) { sets.push(`ship_result = $${i++}`); values.push(patch.shipResult ? JSON.stringify(patch.shipResult) : null); }
  if (patch.scoreBefore !== undefined) { sets.push(`score_before = $${i++}`); values.push(patch.scoreBefore); }
  if (patch.scoreAfter !== undefined) { sets.push(`score_after = $${i++}`); values.push(patch.scoreAfter); }
  if (patch.aiBefore !== undefined) { sets.push(`ai_before = $${i++}`); values.push(patch.aiBefore ? JSON.stringify(patch.aiBefore) : null); }
  if (patch.aiAfter !== undefined) { sets.push(`ai_after = $${i++}`); values.push(patch.aiAfter ? JSON.stringify(patch.aiAfter) : null); }
  if (patch.note !== undefined) { sets.push(`note = $${i++}`); values.push(patch.note); }
  if (patch.assignee !== undefined) { sets.push(`assignee = $${i++}`); values.push(patch.assignee); }
  if (patch.shipMode !== undefined) { sets.push(`ship_mode = $${i++}`); values.push(patch.shipMode); }
  if (patch.previewUrl !== undefined) { sets.push(`preview_url = $${i++}`); values.push(patch.previewUrl); }
  if (patch.gscBefore !== undefined) { sets.push(`gsc_before = $${i++}`); values.push(patch.gscBefore ? JSON.stringify(patch.gscBefore) : null); }
  if (patch.gscAfter !== undefined) { sets.push(`gsc_after = $${i++}`); values.push(patch.gscAfter ? JSON.stringify(patch.gscAfter) : null); }
  if (patch.error !== undefined) { sets.push(`error = $${i++}`); values.push(patch.error); }
  await pool.query(`UPDATE fixes SET ${sets.join(', ')} WHERE id = $1`, values);
}

/**
 * Bulk-restore dismissed ("ignored") fixes back to 'detected' in one query.
 * Restricted to the brand and to rows currently in 'dismissed' status, so it
 * can never touch in-flight or live fixes. Pass `ids` to restore a specific
 * selection; omit it to restore every dismissed fix for the brand. Returns
 * the ids actually restored (for audit logging).
 */
export async function restoreDismissedFixes(brandId: string, ids?: string[]): Promise<string[]> {
  await ensureFixEngineSchema();
  const scoped = Array.isArray(ids) && ids.length > 0;
  const res = await pool.query(
    `UPDATE fixes SET status = 'detected', error = NULL, updated_at = NOW()
      WHERE brand_id = $1 AND status = 'dismissed'${scoped ? ' AND id = ANY($2::uuid[])' : ''}
      RETURNING id`,
    scoped ? [brandId, ids] : [brandId],
  );
  return res.rows.map((r: DbRow) => String(r.id));
}

/**
 * Atomically claim a fix for a stage transition. Returns true only if the
 * row was in `from` status - prevents a double-ship / double-generate race
 * between after() and the cron safety net.
 */
export async function claimFixTransition(
  fixId: string,
  from: FixStatus,
  to: FixStatus,
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE fixes SET status = $3, updated_at = NOW()
      WHERE id = $1 AND status = $2 RETURNING id`,
    [fixId, from, to],
  );
  return (res.rowCount || 0) > 0;
}

// ── connector (Channel B) delivery queue ─────────────────────────

export interface ConnectorInstructionRow {
  id: string;
  moduleKey: string;
  op: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/**
 * Connector instructions awaiting pull + apply + ack. Two kinds:
 *   1. Classic Channel-B fixes (site-root files / head blocks): channel='B',
 *      status='shipped', op in ship_result.op, payload in after_snapshot.
 *   2. Staged page edits (ship-as-draft): status='staged' with op
 *      'stage_content' (create the draft revision) or 'publish_content'
 *      (promote it live). Set by stageFix / publishStagedFix.
 * In both cases connector_delivered_at IS NULL means "still pending".
 */
export async function listPendingConnectorInstructions(
  brandId: string,
  limit = 50,
): Promise<ConnectorInstructionRow[]> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT id, module_key, ship_result, after_snapshot, created_at
       FROM fixes
      WHERE brand_id = $1
        AND connector_delivered_at IS NULL
        AND ((channel = 'B' AND status = 'shipped') OR status = 'staged')
      ORDER BY created_at ASC
      LIMIT $2`,
    [brandId, limit],
  );
  return res.rows.map((r: DbRow) => ({
    id: String(r.id),
    moduleKey: String(r.module_key),
    op: String((r.ship_result as Record<string, unknown> | null)?.op ?? 'write_file'),
    payload: (r.after_snapshot as Record<string, unknown>) ?? {},
    createdAt: String(r.created_at),
  }));
}

/**
 * Latest "ready" content for a site-root file module (llms-txt /
 * robots-ai-access), for edge delivery (Cloudflare Worker / reverse proxy).
 * Returns the most recently updated fix's content, or null if none is ready.
 * `field` is where the module stores its text in `generated`.
 */
export async function getLatestRootFileContent(
  brandId: string,
  moduleKey: string,
  field: string,
): Promise<string | null> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT generated, after_snapshot FROM fixes
      WHERE brand_id = $1 AND module_key = $2
        AND status IN ('generated','approved','shipped','verified')
      ORDER BY updated_at DESC LIMIT 1`,
    [brandId, moduleKey],
  );
  const row = res.rows[0];
  if (!row) return null;
  const gen = (row.generated as Record<string, unknown> | null) ?? {};
  const after = (row.after_snapshot as Record<string, unknown> | null) ?? {};
  const content = (typeof gen[field] === 'string' ? gen[field] : undefined)
    ?? (typeof after.content === 'string' ? after.content : undefined);
  return typeof content === 'string' && content.length ? content : null;
}

/** Look up the fix backing a connector instruction, scoped to the brand. */
export async function getConnectorFix(fixId: string, brandId: string): Promise<FixRow | null> {
  return getFix(fixId, brandId);
}

// ── Edge SEO overrides (plugin-free publishing via CDN Worker) ────

/** Per-page SEO values the edge Worker applies while serving the page. */
export interface EdgeSeoOverride { title?: string; description?: string; canonical?: string }

/** module → which override field(s) its `generated` payload carries. */
const EDGE_SEO_MODULES: Record<string, Array<{ genField: string; overrideField: keyof EdgeSeoOverride }>> = {
  'title-rewrite': [{ genField: 'title', overrideField: 'title' }],
  'meta-rewrite': [{ genField: 'description', overrideField: 'description' }],
  'ctr-rescue': [{ genField: 'title', overrideField: 'title' }, { genField: 'description', overrideField: 'description' }],
  'canonical-fix': [{ genField: 'canonical', overrideField: 'canonical' }],
};

/** Normalise a page URL to the pathname key the Worker matches on
 *  (no trailing slash, except the root itself). Null for unparseable URLs. */
export function edgeSeoPathKey(targetUrl: string): string | null {
  try {
    const p = new URL(targetUrl).pathname;
    return p.length > 1 ? p.replace(/\/+$/, '') || '/' : '/';
  } catch { return null; }
}

/**
 * Pure builder: fold shipped-fix rows (oldest→newest) into the per-path
 * override map. Newer values win per field, so re-shipping a fix updates
 * the override, and a reverted fix simply falls out of the input set.
 */
export function buildEdgeSeoOverrides(
  rows: Array<{ moduleKey: string; targetUrl: string | null; generated: Record<string, unknown> | null }>,
): Record<string, EdgeSeoOverride> {
  const out: Record<string, EdgeSeoOverride> = {};
  for (const row of rows) {
    const fields = EDGE_SEO_MODULES[row.moduleKey];
    if (!fields || !row.targetUrl || !row.generated) continue;
    const key = edgeSeoPathKey(row.targetUrl);
    if (!key) continue;
    for (const { genField, overrideField } of fields) {
      const v = row.generated[genField];
      if (typeof v === 'string' && v.trim()) {
        (out[key] ??= {})[overrideField] = v.trim();
      }
    }
  }
  return out;
}

/**
 * The brand's live edge SEO overrides: every shipped/verified title, meta
 * description, and canonical fix, keyed by page path. Served to the CDN
 * Worker via /api/edge/serve?file=seo.json — reverting a fix removes it
 * from this set (status filter), so the origin value shows again.
 */
export async function getEdgeSeoOverrides(brandId: string): Promise<Record<string, EdgeSeoOverride>> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT module_key, target_url, generated FROM fixes
      WHERE brand_id = $1 AND module_key = ANY($2)
        AND status IN ('shipped','verified')
        AND target_url IS NOT NULL AND generated IS NOT NULL
      ORDER BY updated_at ASC`,
    [brandId, Object.keys(EDGE_SEO_MODULES)],
  );
  return buildEdgeSeoOverrides(res.rows.map((r: DbRow) => ({
    moduleKey: String(r.module_key),
    targetUrl: (r.target_url as string | null) ?? null,
    generated: (r.generated as Record<string, unknown> | null) ?? null,
  })));
}

export interface StuckInstruction { id: string; brandId: string; createdAt: string }

/**
 * Connector deliveries the plugin never applied after N minutes: classic
 * Channel-B shipped fixes, plus staged (ship-as-draft) fixes whose preview
 * was never built (connector_delivered_at still NULL). A staged fix that HAS
 * been applied keeps its delivered marker and is excluded — it's awaiting the
 * user's Publish, not stuck.
 */
export async function findStuckConnectorInstructions(olderThanMinutes: number, limit = 50): Promise<StuckInstruction[]> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT id, brand_id, created_at FROM fixes
      WHERE connector_delivered_at IS NULL
        AND ((channel = 'B' AND status = 'shipped') OR status = 'staged')
        AND created_at < NOW() - ($1 || ' minutes')::interval
      ORDER BY created_at ASC LIMIT $2`,
    [String(olderThanMinutes), limit],
  );
  return res.rows.map((r: DbRow) => ({ id: String(r.id), brandId: String(r.brand_id), createdAt: String(r.created_at) }));
}

/**
 * Operator attention summary for a brand: fixes that failed, and Connector
 * deliveries stuck undelivered past the grace window. Surfaced in the
 * dashboard so silent breakage (offline plugin, failed ship) is visible.
 */
export async function getAttentionSummary(
  brandId: string,
  stuckMinutes = 120,
): Promise<{ failed: number; stuckConnector: number; regressed: number }> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COUNT(*) FILTER (
          WHERE connector_delivered_at IS NULL
            AND ((channel = 'B' AND status = 'shipped') OR status = 'staged')
            AND created_at < NOW() - ($2 || ' minutes')::interval
        ) AS stuck
       FROM fixes WHERE brand_id = $1`,
    [brandId, String(stuckMinutes)],
  );
  // Regressions: previously-verified fixes the regression watch found undone
  // (event within 14d) that haven't been re-verified since.
  const reg = await pool.query(
    `SELECT COUNT(DISTINCT f.id) AS regressed
       FROM fixes f
       JOIN fix_events e ON e.fix_id = f.id AND e.event = 'regression.detected'
      WHERE f.brand_id = $1 AND f.status = 'shipped'
        AND e.created_at > NOW() - interval '14 days'`,
    [brandId],
  );
  const row = res.rows[0] || {};
  return {
    failed: Number(row.failed) || 0,
    stuckConnector: Number(row.stuck) || 0,
    regressed: Number(reg.rows[0]?.regressed) || 0,
  };
}

/**
 * Fixes whose post-ship outcome window has elapsed: shipped/verified, a
 * gsc_before snapshot exists, no gsc_after yet, and the snapshot is older
 * than `windowDays`. The outcome cron measures these.
 */
export async function findFixesDueOutcome(windowDays: number, limit = 20): Promise<FixRow[]> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT * FROM fixes
      WHERE status IN ('shipped','verified')
        AND gsc_before IS NOT NULL AND gsc_after IS NULL
        AND (gsc_before->>'at')::timestamptz < NOW() - ($1 || ' days')::interval
      ORDER BY updated_at ASC LIMIT $2`,
    [String(windowDays), limit],
  );
  return res.rows.map(mapFixRow);
}

/**
 * Verified fixes that haven't been re-confirmed recently — candidates for
 * the regression watch (a CMS edit or theme change may have wiped them).
 */
export async function findStaleVerifiedFixes(olderThanDays: number, limit = 10): Promise<FixRow[]> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT * FROM fixes
      WHERE status = 'verified' AND target_url IS NOT NULL
        AND updated_at < NOW() - ($1 || ' days')::interval
      ORDER BY updated_at ASC LIMIT $2`,
    [String(olderThanDays), limit],
  );
  return res.rows.map(mapFixRow);
}

/**
 * Shipped-but-not-yet-verified fixes whose live change may just be hiding
 * behind a CDN/page cache — candidates for the ship-verify retry pass.
 * Bounded three ways: only fixes shipped within `shippedWithinDays` (via
 * the 'shipped' event), untouched for `minAgeMinutes` (recheckFix bumps
 * updated_at, so this spaces retries), and `limit` per tick. Channel-B
 * fixes still waiting on the Connector are excluded — nothing is live to
 * verify yet, and the watchdog owns that case.
 */
export async function findUnverifiedShippedFixes(
  minAgeMinutes: number,
  shippedWithinDays: number,
  limit = 10,
): Promise<FixRow[]> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT * FROM fixes
      WHERE status = 'shipped' AND target_url IS NOT NULL AND generated IS NOT NULL
        AND (channel = 'A' OR connector_delivered_at IS NOT NULL)
        AND updated_at < NOW() - ($1 || ' minutes')::interval
        AND EXISTS (
          SELECT 1 FROM fix_events e
           WHERE e.fix_id = fixes.id AND e.event = 'shipped'
             AND e.created_at > NOW() - ($2 || ' days')::interval
        )
      ORDER BY updated_at ASC LIMIT $3`,
    [String(minAgeMinutes), String(shippedWithinDays), limit],
  );
  return res.rows.map(mapFixRow);
}

/** Recent activity for a brand (automation feed), newest first. */
export async function listBrandEvents(brandId: string, limit = 20): Promise<FixEventRow[]> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT id, event, detail, user_id, created_at
       FROM fix_events WHERE brand_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [brandId, limit],
  );
  return res.rows.map((r: DbRow) => ({
    id: String(r.id),
    event: String(r.event),
    detail: (r.detail as Record<string, unknown>) ?? {},
    userId: (r.user_id as string | null) ?? null,
    createdAt: String(r.created_at),
  }));
}

/** Whether a fix already has an event of the given type (dedupe watchdog alerts). */
export async function hasFixEvent(fixId: string, event: string): Promise<boolean> {
  const res = await pool.query(`SELECT 1 FROM fix_events WHERE fix_id = $1 AND event = $2 LIMIT 1`, [fixId, event]);
  return (res.rowCount || 0) > 0;
}

/** Mark a connector instruction applied (acked OK by the plugin). */
export async function markConnectorDelivered(fixId: string): Promise<void> {
  await pool.query(
    `UPDATE fixes SET connector_delivered_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND connector_delivered_at IS NULL`,
    [fixId],
  );
}

/**
 * Re-queue a fix for the Connector to pull again (used when promoting a
 * staged draft to live): clears the delivered marker + attempt counter so
 * the pull endpoint hands it out once more.
 */
export async function resetConnectorDelivery(fixId: string): Promise<void> {
  await pool.query(
    `UPDATE fixes SET connector_delivered_at = NULL, connector_attempts = 0, updated_at = NOW()
      WHERE id = $1`,
    [fixId],
  );
}

/** Record a failed apply attempt; returns the new attempt count. */
export async function recordConnectorAttempt(fixId: string): Promise<number> {
  const res = await pool.query(
    `UPDATE fixes SET connector_attempts = connector_attempts + 1, updated_at = NOW()
      WHERE id = $1 RETURNING connector_attempts`,
    [fixId],
  );
  return Number(res.rows[0]?.connector_attempts ?? 0);
}

export interface FixEventRow {
  id: string;
  event: string;
  detail: Record<string, unknown>;
  userId: string | null;
  createdAt: string;
}

/** Read the audit trail for a fix, newest first. */
export async function getFixEvents(fixId: string, limit = 50): Promise<FixEventRow[]> {
  await ensureFixEngineSchema();
  const res = await pool.query(
    `SELECT id, event, detail, user_id, created_at
       FROM fix_events WHERE fix_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [fixId, limit],
  );
  return res.rows.map((r: DbRow) => ({
    id: String(r.id),
    event: String(r.event),
    detail: (r.detail as Record<string, unknown>) ?? {},
    userId: (r.user_id as string | null) ?? null,
    createdAt: String(r.created_at),
  }));
}

export async function logFixEvent(
  fixId: string | null,
  brandId: string,
  userId: string | null,
  event: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO fix_events (id, fix_id, brand_id, user_id, event, detail)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [crypto.randomUUID(), fixId, brandId, userId, event, JSON.stringify(detail)],
    );
  } catch {
    // Audit trail is best-effort; never block the operation on it.
  }
}
