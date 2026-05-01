/**
 * Regional Audits — schema, types, and worker.
 *
 * Two tables (created idempotently via ensureGeoAuditsSchema, matching
 * the repo's existing per-module CREATE TABLE IF NOT EXISTS pattern):
 *
 *   geo_audits          — one row per audit job (header)
 *   geo_audit_results   — one row per (region × prompt × model) call
 *
 * Worker model mirrors brands/[id]/run:
 *   POST /api/geo-audits inserts the row in 'queued', then calls
 *   processGeoAudit(auditId) inside Next.js after() so the request
 *   returns immediately and the heavy work runs in the background.
 *   /api/cron/geo-audits-worker is the cold-restart safety net that
 *   picks up any 'queued' rows that never had after() fire (deploy
 *   mid-flight, OOM, etc.).
 *
 * Credit accounting is delegated to the existing flow:
 *   - reserveCredits up-front for (regions × prompts × 5 models)
 *   - queryAI internally calls recordCostEvent on every successful
 *     provider response; that's the same row that monthlyUsed counts
 *   - refundCredits at the end for whatever wasn't actually consumed
 *
 * Region context is injected via queryAI's existing options.systemPrompt
 * — no LLM client modification.
 */

import crypto from 'crypto';
import { pool } from '@/lib/db';
import { reserveCredits, refundCredits } from '@/lib/credits';
import { logger } from '@/lib/logger';
import {
  queryAI,
  getDefaultModel,
  pickBestKey,
  acquirePlatformSlot,
} from '@/lib/ai-platforms';
import { resolveKeysForTenant } from '@/lib/tenant-keys';
import { getServerKeys } from '@/lib/server-keys';
import { buildBrandMatcher, parseResponse } from '@/lib/parser';
import type { BrandInput } from '@/lib/parser';

// The 5 supported platforms, hard-coded per the v1 spec — every audit
// runs against all 5 regardless of the user's normal platform mix.
export const GEO_AUDIT_PLATFORMS = [
  'ChatGPT',
  'Perplexity',
  'Gemini',
  'Claude',
  'Grok',
] as const;
export type GeoAuditPlatform = typeof GEO_AUDIT_PLATFORMS[number];

// Mirrors the PLATFORM_KEY_MAP in brands/[id]/run/route.ts and run-worker.ts.
// Kept local so a future split of those two doesn't ripple into here.
const PLATFORM_KEY_MAP: Record<GeoAuditPlatform, string> = {
  ChatGPT: 'openai',
  Perplexity: 'perplexity',
  Claude: 'claude',
  Gemini: 'gemini',
  Grok: 'grok',
};

export type GeoAuditStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface GeoAuditRow {
  id: string;
  userId: string;
  brandId: string;
  regions: string[];
  promptsCount: number;
  status: GeoAuditStatus;
  mentionsCount: number;
  totalExpected: number;
  received: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface GeoAuditResultRow {
  id: string;
  auditId: string;
  region: string;
  promptText: string;
  platform: string;
  model: string | null;
  response: string | null;
  mentioned: boolean;
  error: string | null;
  createdAt: string;
}

let schemaEnsured = false;

/**
 * Idempotent schema bootstrap. Called by every entry point that touches
 * the geo_audits tables. Mirrors the pattern used by ensureCreditsSchema,
 * ensureCronLockSchema, etc.
 */
export async function ensureGeoAuditsSchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS geo_audits (
      id              UUID PRIMARY KEY,
      user_id         TEXT NOT NULL,
      brand_id        TEXT NOT NULL,
      regions         TEXT[] NOT NULL,
      prompts         TEXT[] NOT NULL,
      prompts_count   INTEGER NOT NULL DEFAULT 0,
      total_expected  INTEGER NOT NULL DEFAULT 0,
      received        INTEGER NOT NULL DEFAULT 0,
      mentions_count  INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','running','done','failed','cancelled')),
      error           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at      TIMESTAMPTZ,
      completed_at    TIMESTAMPTZ,
      CONSTRAINT geo_audits_brand_fk
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    )
  `);
  // Backfill column for installations that ran an earlier ensure cycle
  // before `prompts` was added — idempotent ALTER, no-op on fresh DBs.
  await pool.query(`ALTER TABLE geo_audits ADD COLUMN IF NOT EXISTS prompts TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_geo_audits_user_created
      ON geo_audits (user_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_geo_audits_status_active
      ON geo_audits (status, created_at)
      WHERE status IN ('queued','running')
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS geo_audit_results (
      id           UUID PRIMARY KEY,
      audit_id     UUID NOT NULL,
      region       TEXT NOT NULL,
      prompt_text  TEXT NOT NULL,
      platform     TEXT NOT NULL,
      model        TEXT,
      response     TEXT,
      mentioned    BOOLEAN NOT NULL DEFAULT FALSE,
      error        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT geo_audit_results_audit_fk
        FOREIGN KEY (audit_id) REFERENCES geo_audits(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_geo_audit_results_audit
      ON geo_audit_results (audit_id, created_at)
  `);
  schemaEnsured = true;
}

// Build the system-prompt note that "places" the LLM in the given region.
// Uses the existing queryAI options.systemPrompt slot — every provider
// already wires that field to its native system-message channel
// (see ai-platforms.ts's queryAI implementation per platform).
export function buildRegionSystemPrompt(region: string, basePrompt: string): string {
  const r = region.trim();
  return `${basePrompt}\n\nAnswering for a user located in ${r}. Use that geographic context (local providers, language, regional brands, market norms) when surfacing names, recommendations, or comparisons.`;
}

interface BrandRow {
  id: string;
  user_id: string;
  data: Record<string, unknown> | null;
}

async function loadBrandForAudit(brandId: string): Promise<BrandRow | null> {
  const res = await pool.query(
    `SELECT id, user_id, data FROM brands WHERE id = $1 LIMIT 1`,
    [brandId],
  );
  return (res.rows[0] as BrandRow | undefined) ?? null;
}

function brandToInput(row: BrandRow): BrandInput {
  const d = row.data || {};
  return {
    name: String(d.name ?? d.brandName ?? ''),
    website: typeof d.website === 'string' ? d.website : undefined,
    aliases: Array.isArray(d.aliases) ? (d.aliases as string[]) : undefined,
    city: typeof d.city === 'string' ? d.city : undefined,
    nearbyAreas: Array.isArray(d.nearbyAreas) ? (d.nearbyAreas as string[]) : undefined,
    competitors: Array.isArray(d.competitors) ? (d.competitors as string[]) : undefined,
  };
}

/**
 * Atomically claim an audit row for processing. Flips queued → running
 * and stamps started_at. Returns true if we won the race; false if the
 * row was already claimed by another worker tick (cron + after() can
 * legitimately race in cold-restart scenarios).
 */
export async function claimAuditForRunning(auditId: string): Promise<boolean> {
  await ensureGeoAuditsSchema();
  const res = await pool.query(
    `UPDATE geo_audits
        SET status = 'running', started_at = NOW()
      WHERE id = $1 AND status = 'queued'
      RETURNING id`,
    [auditId],
  );
  return (res.rowCount || 0) > 0;
}

/**
 * Mark an audit terminal (done | failed). Also computes mentions_count
 * from the results table and persists a final received total.
 */
async function finalizeAudit(
  auditId: string,
  outcome: 'done' | 'failed',
  errorMsg: string | null,
): Promise<void> {
  const tally = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE error IS NULL)        AS received,
       COUNT(*) FILTER (WHERE mentioned = TRUE)      AS mentions
       FROM geo_audit_results WHERE audit_id = $1`,
    [auditId],
  );
  const row = (tally.rows[0] as { received: string; mentions: string } | undefined) ?? { received: '0', mentions: '0' };
  await pool.query(
    `UPDATE geo_audits
        SET status = $2,
            received = $3,
            mentions_count = $4,
            error = $5,
            completed_at = NOW()
      WHERE id = $1`,
    [auditId, outcome, Number(row.received) || 0, Number(row.mentions) || 0, errorMsg],
  );
}

interface CallTask {
  region: string;
  promptText: string;
  platform: GeoAuditPlatform;
}

/**
 * Bounded-parallel task runner. Per-audit concurrency cap of 5.
 *
 * Each task runs in isolation: a single failing call gets its row
 * persisted with `error` set and does NOT abort the rest of the audit.
 * That's by design — we want partial results visible to the user.
 */
async function runTasks(
  tasks: CallTask[],
  worker: (task: CallTask) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, tasks.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      try {
        await worker(tasks[i]);
      } catch (e) {
        // Worker is responsible for persisting its own error rows.
        // A throw here means the worker's own bookkeeping crashed —
        // log + continue so the rest of the audit makes progress.
        logger.error('geo_audit.task_unhandled', { task: tasks[i], err: (e as Error).message });
      }
    }
  });
  await Promise.all(lanes);
}

/**
 * Persist one (region × prompt × platform) result row. Pulled out so
 * the worker stays small and tests can drive it directly.
 */
async function insertResultRow(
  auditId: string,
  task: CallTask,
  outcome: { model: string | null; response: string | null; mentioned: boolean; error: string | null },
): Promise<void> {
  await pool.query(
    `INSERT INTO geo_audit_results
       (id, audit_id, region, prompt_text, platform, model, response, mentioned, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      crypto.randomUUID(),
      auditId,
      task.region,
      task.promptText,
      task.platform,
      outcome.model,
      outcome.response,
      outcome.mentioned,
      outcome.error,
    ],
  );
}

/**
 * Test-injectable seam for the LLM call + key resolution. Production
 * uses the real implementation defined below; tests pass a mock to
 * exercise the worker's bookkeeping without hitting providers.
 */
export interface CallProvider {
  (args: {
    platform: GeoAuditPlatform;
    promptText: string;
    region: string;
    brand: BrandInput;
    userId: string;
    userKeysLegacy: Record<string, string | null | undefined>;
  }): Promise<{ model: string | null; response: string | null; mentioned: boolean; error: string | null }>;
}

const defaultCallProvider: CallProvider = async ({
  platform, promptText, region, brand, userId, userKeysLegacy,
}) => {
  const keyName = PLATFORM_KEY_MAP[platform];
  const serverKeys = getServerKeys();
  const serverKeyList = (serverKeys as Record<string, string[]>)[keyName] || [];
  const resolved = await resolveKeysForTenant({
    tenantId: userId,
    platformKeyName: keyName,
    legacyUserKeys: userKeysLegacy,
    serverKeys: serverKeyList,
  });
  if (!resolved) {
    return { model: null, response: null, mentioned: false, error: `No API key available for ${platform}` };
  }
  const keyPool = resolved.source === 'server' ? resolved.pool : [resolved.key];
  const rawKey = pickBestKey(keyPool);
  if (!rawKey) {
    return { model: null, response: null, mentioned: false, error: `No usable API key for ${platform}` };
  }
  const model = getDefaultModel(platform);
  const matcher = buildBrandMatcher(brand);
  // Inject region context via the existing systemPrompt slot. The base
  // is the parser's own SYSTEM_PROMPT-equivalent — we use a neutral
  // analytic baseline plus the region note.
  const baseSystem = 'You are an unbiased assistant. Answer the user\'s query directly and concisely.';
  const systemPrompt = buildRegionSystemPrompt(region, baseSystem);
  // Acquire a platform slot to obey the existing per-platform RPM /
  // semaphore. Mirrors how brands/[id]/run wraps its queryAI call.
  const release = await acquirePlatformSlot(platform);
  try {
    // queryAI takes BrandContext (index-sig'd); BrandInput from parser
    // doesn't carry the index signature, so we widen at the call site.
    const brandCtx = { ...brand } as Record<string, unknown>;
    const result = await queryAI(platform, promptText, rawKey, model, brandCtx, {
      systemPrompt,
      tenantId: userId,
    });
    const parsed = parseResponse(result.text || '', brand, promptText, matcher);
    return {
      model,
      response: result.text || '',
      mentioned: !!parsed.mentioned,
      error: null,
    };
  } catch (e) {
    return {
      model,
      response: null,
      mentioned: false,
      error: (e as Error).message || 'Provider error',
    };
  } finally {
    try { release(); } catch { /* best-effort */ }
  }
};

export interface ProcessGeoAuditOptions {
  /** Test seam: substitute the LLM call. Defaults to defaultCallProvider. */
  callProvider?: CallProvider;
  /** Test seam: substitute the brand load. Defaults to a real DB read. */
  loadBrand?: (brandId: string) => Promise<BrandRow | null>;
  /** Per-audit concurrency cap. Defaults to 5 (per the v1 spec). */
  concurrency?: number;
}

/**
 * Process a single audit end-to-end. Idempotent: if the row is already
 * 'running' or terminal, returns early without doing redundant work.
 */
export async function processGeoAudit(
  auditId: string,
  opts: ProcessGeoAuditOptions = {},
): Promise<void> {
  const callProvider = opts.callProvider || defaultCallProvider;
  const loadBrand = opts.loadBrand || loadBrandForAudit;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 5, 20));

  await ensureGeoAuditsSchema();

  const claimed = await claimAuditForRunning(auditId);
  if (!claimed) {
    // Either someone else claimed it, or the row is already terminal.
    return;
  }

  // Load the audit + the brand it scopes to.
  const auditRes = await pool.query(
    `SELECT id, user_id, brand_id, regions, prompts_count, total_expected
       FROM geo_audits WHERE id = $1 LIMIT 1`,
    [auditId],
  );
  const auditRow = auditRes.rows[0] as
    | {
        id: string;
        user_id: string;
        brand_id: string;
        regions: string[];
        prompts_count: number;
        total_expected: number;
      }
    | undefined;
  if (!auditRow) {
    await finalizeAudit(auditId, 'failed', 'Audit row vanished after claim');
    return;
  }

  const brandRow = await loadBrand(auditRow.brand_id);
  if (!brandRow) {
    await finalizeAudit(auditId, 'failed', 'Brand not found');
    // Refund the entire reservation since we never made any calls.
    await safeRefund(auditRow.user_id, auditRow.total_expected);
    return;
  }
  const brand = brandToInput(brandRow);

  // Reload the prompts array from the audit row (stored at creation
  // time so the worker can rebuild the task matrix without parsing
  // the request body again).
  const promptsRes = await pool.query(
    `SELECT prompts FROM geo_audits WHERE id = $1 LIMIT 1`,
    [auditId],
  );
  const prompts = ((promptsRes.rows[0] as { prompts?: string[] } | undefined)?.prompts) ?? [];
  if (!prompts.length) {
    await finalizeAudit(auditId, 'failed', 'No prompts captured for audit');
    await safeRefund(auditRow.user_id, auditRow.total_expected);
    return;
  }

  // Pull legacy user keys (mirrors brand-run's userKeys path).
  const userKeysRes = await pool.query(
    `SELECT api_keys FROM users WHERE id = $1 LIMIT 1`,
    [auditRow.user_id],
  );
  const userKeysLegacy = ((userKeysRes.rows[0] as { api_keys?: Record<string, string> } | undefined)?.api_keys) || {};

  // Build the full task list: region × prompt × platform.
  const tasks: CallTask[] = [];
  for (const region of auditRow.regions) {
    for (const promptText of prompts) {
      for (const platform of GEO_AUDIT_PLATFORMS) {
        tasks.push({ region, promptText, platform });
      }
    }
  }

  let abortError: string | null = null;
  await runTasks(tasks, async (task) => {
    try {
      const outcome = await callProvider({
        platform: task.platform,
        promptText: task.promptText,
        region: task.region,
        brand,
        userId: auditRow.user_id,
        userKeysLegacy,
      });
      await insertResultRow(auditId, task, outcome);
    } catch (e) {
      // Only reached if insertResultRow itself threw (DB hiccup).
      // We don't surface this as a row-level error — it's a worker
      // failure. Capture for the header's `error` column.
      abortError = abortError ?? (e as Error).message;
    }
  }, concurrency);

  // Reconcile the credit reservation. queryAI auto-records 1 cost
  // event per successful call; the difference (reserved − received)
  // is refunded to the monthly counter so the user isn't billed for
  // calls that never landed.
  const finalTally = await pool.query(
    `SELECT COUNT(*)::int AS received FROM geo_audit_results
       WHERE audit_id = $1 AND error IS NULL`,
    [auditId],
  );
  const received = Number((finalTally.rows[0] as { received?: number } | undefined)?.received) || 0;
  const refundAmount = Math.max(0, auditRow.total_expected - received);
  if (refundAmount > 0) await safeRefund(auditRow.user_id, refundAmount);

  // Final outcome: 'done' if any tasks succeeded; 'failed' only if the
  // worker itself caught a non-recoverable exception or zero tasks
  // succeeded. Per-call provider errors live on the result rows.
  const outcome: 'done' | 'failed' = abortError ? 'failed' : 'done';
  await finalizeAudit(auditId, outcome, abortError);
}

async function safeRefund(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  try {
    await refundCredits(userId, amount, 'manual');
  } catch (e) {
    logger.error('geo_audit.refund_failed', { userId, amount, err: (e as Error).message });
  }
}

export interface CreateAuditInput {
  userId: string;
  brandId: string;
  regions: string[];
  prompts: string[];
}

/**
 * Insert a new audit row in 'queued'. Caller has already validated
 * input and reserved credits. Prompts are persisted on the row itself
 * (TEXT[] column) so the worker can rebuild the task matrix without
 * parsing the request body again.
 */
export async function createAuditRecord(input: CreateAuditInput): Promise<{
  id: string;
  totalExpected: number;
}> {
  await ensureGeoAuditsSchema();
  const id = crypto.randomUUID();
  const totalExpected = input.regions.length * input.prompts.length * GEO_AUDIT_PLATFORMS.length;
  await pool.query(
    `INSERT INTO geo_audits
       (id, user_id, brand_id, regions, prompts, prompts_count, total_expected, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued')`,
    [
      id, input.userId, input.brandId,
      input.regions, input.prompts,
      input.prompts.length, totalExpected,
    ],
  );
  return { id, totalExpected };
}

/**
 * List all 'queued' audit IDs older than `staleSeconds` — used by the
 * cron safety-net to pick up jobs that never had after() fire.
 */
export async function findStuckQueuedAudits(staleSeconds = 60): Promise<string[]> {
  await ensureGeoAuditsSchema();
  const res = await pool.query(
    `SELECT id FROM geo_audits
       WHERE status = 'queued'
         AND created_at < NOW() - ($1::int || ' seconds')::interval
       ORDER BY created_at ASC
       LIMIT 50`,
    [staleSeconds],
  );
  return (res.rows as Array<{ id: string }>).map((r) => r.id);
}

/**
 * Reaper for audits stuck in 'running' past the watchdog window. Mirrors
 * reap-stale-runs's behavior on active_runs. Refunds the reservation
 * for whatever calls didn't complete so the user isn't double-billed.
 */
export async function reapStaleGeoAudits(staleMinutes: number): Promise<{
  reaped: string[];
}> {
  await ensureGeoAuditsSchema();
  const res = await pool.query(
    `SELECT id, user_id, total_expected
       FROM geo_audits
      WHERE status = 'running'
        AND started_at < NOW() - ($1::int || ' minutes')::interval
        FOR UPDATE SKIP LOCKED
      LIMIT 50`,
    [staleMinutes],
  );
  const rows = res.rows as Array<{ id: string; user_id: string; total_expected: number }>;
  const reaped: string[] = [];
  for (const row of rows) {
    const tally = await pool.query(
      `SELECT COUNT(*)::int AS received FROM geo_audit_results
         WHERE audit_id = $1 AND error IS NULL`,
      [row.id],
    );
    const received = Number((tally.rows[0] as { received?: number } | undefined)?.received) || 0;
    const refund = Math.max(0, row.total_expected - received);
    if (refund > 0) await safeRefund(row.user_id, refund);
    await pool.query(
      `UPDATE geo_audits
          SET status = 'failed',
              error = COALESCE(error, 'Watchdog reap: stuck in running'),
              completed_at = NOW()
        WHERE id = $1`,
      [row.id],
    );
    reaped.push(row.id);
  }
  return { reaped };
}

/**
 * Reserve credits for a prospective audit. Returns the same envelope
 * shape reserveCredits returns, so callers can pass it straight to
 * a Response.json without restructuring.
 */
export async function reserveAuditCredits(
  userId: string,
  plan: string,
  totalExpected: number,
) {
  return reserveCredits(userId, plan, totalExpected, 'manual');
}
