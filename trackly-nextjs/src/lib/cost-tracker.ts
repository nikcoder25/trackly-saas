/**
 * Per-tenant LLM cost tracking and cap enforcement.
 *
 * Banks (and cost-sensitive tenants generally) need a hard ceiling on what
 * each tenant can spend on LLM calls per UTC day and per UTC month. This
 * module owns:
 *
 *   1. USD estimation per call from platform/model + provider-reported
 *      token counts (estimateCostUsd).
 *   2. The `tenant_cost_events` ledger - one row per LLM call, the
 *      authoritative source of truth for tenant spend.
 *   3. Per-tenant cap configuration with defaults ($10/day, $200/month)
 *      and JSONB overrides on `users.settings.cost_caps`.
 *   4. Pre-flight enforcement (`enforceCostCap`) that throws a
 *      `CostCapExceededError` (HTTP 402-shaped) when a tenant has already
 *      crossed its cap for the current UTC window.
 *
 * Reset windows align to UTC day and UTC month boundaries. We do not store
 * a snapshot row per window; we aggregate from `tenant_cost_events` so
 * back-dated corrections / replays remain consistent.
 */
import { pool } from './db';
import { MODEL_PRICING } from './ai-platforms';
import { logger } from './logger';

export const DEFAULT_DAILY_CAP_USD = (() => {
  const raw = parseFloat(process.env.TENANT_DAILY_COST_CAP_USD || '');
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
})();

export const DEFAULT_MONTHLY_CAP_USD = (() => {
  const raw = parseFloat(process.env.TENANT_MONTHLY_COST_CAP_USD || '');
  return Number.isFinite(raw) && raw > 0 ? raw : 200;
})();

// OpenAI bills web-search tool calls on the *-search-preview models as a
// flat per-call surcharge on top of token cost. $0.030/call is the public
// rate at time of writing (https://openai.com/pricing). If OpenAI changes
// the published rate, update this constant; we deliberately do NOT read it
// from env so the recorded ledger remains auditable from source code alone.
export const CHATGPT_WEB_SEARCH_CALL_USD = 0.030;

// Per-platform daily cost-alarm threshold (USD). When today's cost_usd_total
// for any single platform crosses this number, we WARN once per UTC day per
// platform. Default $3.00 keeps alarm noise low for the dev workload while
// still flaring well below the per-tenant daily cap.
export const COST_DAILY_ALARM_USD = (() => {
  const raw = parseFloat(process.env.COST_DAILY_ALARM_USD || '');
  return Number.isFinite(raw) && raw > 0 ? raw : 3.00;
})();

export interface CostCaps {
  dailyUsd: number;
  monthlyUsd: number;
}

export interface CostTotals {
  dailyUsd: number;
  monthlyUsd: number;
}

export type CostCapWindow = 'daily' | 'monthly';

export class CostCapExceededError extends Error {
  paymentRequired = true;
  window: CostCapWindow;
  capUsd: number;
  spentUsd: number;
  resetAt: string;
  tenantId: string;

  constructor(params: {
    tenantId: string;
    window: CostCapWindow;
    capUsd: number;
    spentUsd: number;
    resetAt: Date;
  }) {
    super(
      `Tenant ${params.tenantId} ${params.window} cost cap reached ` +
      `($${params.spentUsd.toFixed(4)}/$${params.capUsd.toFixed(2)}). ` +
      `Window resets ${params.resetAt.toISOString()}.`
    );
    this.name = 'CostCapExceededError';
    this.tenantId = params.tenantId;
    this.window = params.window;
    this.capUsd = params.capUsd;
    this.spentUsd = params.spentUsd;
    this.resetAt = params.resetAt.toISOString();
  }
}

/**
 * Estimate USD cost of a single LLM call from platform/model + provider-
 * reported token counts. Returns 0 when we don't know how to price the
 * model (so the ledger still records the call) - the cap check then
 * trusts the recorded number rather than silently erasing usage.
 *
 * Prices live in `ai-platforms.ts` MODEL_PRICING ($/1M tokens).
 */
export function estimateCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  if (!model) return 0;
  const pricing =
    MODEL_PRICING[model] ||
    Object.entries(MODEL_PRICING).find(([k]) => model.startsWith(k))?.[1];
  if (!pricing) return 0;
  const inTok = Number.isFinite(tokensIn) && tokensIn > 0 ? tokensIn : 0;
  const outTok = Number.isFinite(tokensOut) && tokensOut > 0 ? tokensOut : 0;
  return (inTok * pricing.input + outTok * pricing.output) / 1_000_000;
}

/** Start of the current UTC day, as a Date. */
export function currentDayBoundaryUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
  ));
}

/** Start of the current UTC month, as a Date. */
export function currentMonthBoundaryUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Start of the next UTC day. */
export function nextDayBoundaryUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
  ));
}

/** Start of the next UTC month. */
export function nextMonthBoundaryUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

let _tableReady = false;
let _tablePromise: Promise<void> | null = null;

/**
 * Idempotently create the `tenant_cost_events` ledger. Cached per process
 * so the migration runs once at first use, not on every cap check.
 */
export async function ensureCostEventsTable(): Promise<void> {
  if (_tableReady) return;
  if (_tablePromise) return _tablePromise;
  _tablePromise = (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tenant_cost_events (
          id BIGSERIAL PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          run_id TEXT,
          platform TEXT NOT NULL,
          model TEXT NOT NULL,
          tokens_in INT NOT NULL DEFAULT 0,
          tokens_out INT NOT NULL DEFAULT 0,
          usd_cost NUMERIC(12, 6) NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS tenant_cost_events_tenant_time_idx
          ON tenant_cost_events(tenant_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS tenant_cost_events_run_idx
          ON tenant_cost_events(run_id) WHERE run_id IS NOT NULL;

        -- Per-(UTC-day, platform, model) rollup for the admin dashboard
        -- and for the daily threshold alarm. We deliberately do NOT
        -- backfill historical rows from tenant_cost_events / api_logs:
        -- those rows were written before we parsed real OpenAI usage and
        -- web-search tool calls, so summing them would mix real and
        -- estimated numbers. New calls after this migration record real
        -- numbers; older windows simply stay empty.
        CREATE TABLE IF NOT EXISTS daily_cost_tracker (
          day DATE NOT NULL,
          platform TEXT NOT NULL,
          model TEXT NOT NULL,
          tokens_in_total BIGINT NOT NULL DEFAULT 0,
          tokens_out_total BIGINT NOT NULL DEFAULT 0,
          web_search_calls_total INTEGER NOT NULL DEFAULT 0,
          cost_usd_total NUMERIC(10, 4) NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (day, platform, model)
        );
        -- Forward-compat ALTERs. PR #518 deployed against an environment
        -- where a pre-existing daily_cost_tracker table was missing the
        -- day column. CREATE TABLE IF NOT EXISTS is a no-op when the
        -- table already exists, so the missing column survived, and the
        -- CREATE INDEX ... ON daily_cost_tracker(day DESC) below failed
        -- with ERROR: column "day" does not exist. The thrown error
        -- escaped ensureCostEventsTable -> recordCall -> queryAI and
        -- surfaced as the per-platform errorMessage on every brand run
        -- (recordCall is on the success path of every provider). Adding
        -- the day column as nullable is safe even on a populated legacy
        -- table; recordCalls INSERT always supplies a non-null value,
        -- and getTodayPlatformTotals filters WHERE day = $1 so legacy
        -- rows with NULL day simply don not appear in the rollup.
        ALTER TABLE daily_cost_tracker
          ADD COLUMN IF NOT EXISTS day DATE;
        ALTER TABLE daily_cost_tracker
          ADD COLUMN IF NOT EXISTS tokens_in_total BIGINT NOT NULL DEFAULT 0;
        ALTER TABLE daily_cost_tracker
          ADD COLUMN IF NOT EXISTS tokens_out_total BIGINT NOT NULL DEFAULT 0;
        ALTER TABLE daily_cost_tracker
          ADD COLUMN IF NOT EXISTS web_search_calls_total INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE daily_cost_tracker
          ADD COLUMN IF NOT EXISTS cost_usd_total NUMERIC(10, 4) NOT NULL DEFAULT 0;
        CREATE INDEX IF NOT EXISTS daily_cost_tracker_day_idx
          ON daily_cost_tracker(day DESC);
      `);
      _tableReady = true;
    } catch (e) {
      _tablePromise = null;
      throw e;
    }
  })();
  return _tablePromise;
}

/**
 * Look up per-tenant caps. Caps live on `users.settings.cost_caps` as
 * `{ dailyUsd: number, monthlyUsd: number }`; a missing/invalid value
 * falls back to the platform default. Treating defaults this way means
 * the operator can change the global cap via env without touching every
 * tenant row.
 */
export async function getTenantCostCaps(tenantId: string): Promise<CostCaps> {
  if (!tenantId) {
    return { dailyUsd: DEFAULT_DAILY_CAP_USD, monthlyUsd: DEFAULT_MONTHLY_CAP_USD };
  }
  try {
    const res = await pool.query(
      `SELECT settings FROM users WHERE id = $1 LIMIT 1`,
      [tenantId],
    );
    const settings = res.rows[0]?.settings;
    const caps = settings && typeof settings === 'object'
      ? (settings as { cost_caps?: { dailyUsd?: unknown; monthlyUsd?: unknown } }).cost_caps
      : undefined;
    const daily = caps && Number.isFinite(Number(caps.dailyUsd)) && Number(caps.dailyUsd) > 0
      ? Number(caps.dailyUsd) : DEFAULT_DAILY_CAP_USD;
    const monthly = caps && Number.isFinite(Number(caps.monthlyUsd)) && Number(caps.monthlyUsd) > 0
      ? Number(caps.monthlyUsd) : DEFAULT_MONTHLY_CAP_USD;
    return { dailyUsd: daily, monthlyUsd: monthly };
  } catch {
    // DB unreachable: fall back to defaults rather than failing open AND
    // failing closed. We trust the post-call insert path to surface real
    // DB outages elsewhere.
    return { dailyUsd: DEFAULT_DAILY_CAP_USD, monthlyUsd: DEFAULT_MONTHLY_CAP_USD };
  }
}

/**
 * Sum costs for the current UTC day and UTC month for a tenant. Boundaries
 * are computed in JS and passed as parameters so a daylight-savings or
 * server-tz drift cannot widen / narrow the window.
 */
export async function getTenantCostTotals(
  tenantId: string,
  now: Date = new Date(),
): Promise<CostTotals> {
  if (!tenantId) return { dailyUsd: 0, monthlyUsd: 0 };
  await ensureCostEventsTable();
  const dayStart = currentDayBoundaryUtc(now);
  const monthStart = currentMonthBoundaryUtc(now);
  const res = await pool.query(
    `SELECT
        COALESCE(SUM(CASE WHEN created_at >= $2 THEN usd_cost ELSE 0 END), 0) AS daily,
        COALESCE(SUM(CASE WHEN created_at >= $3 THEN usd_cost ELSE 0 END), 0) AS monthly
       FROM tenant_cost_events
      WHERE tenant_id = $1 AND created_at >= $3`,
    [tenantId, dayStart.toISOString(), monthStart.toISOString()],
  );
  const row = res.rows[0] || {};
  return {
    dailyUsd: parseFloat(row.daily) || 0,
    monthlyUsd: parseFloat(row.monthly) || 0,
  };
}

export interface CostCapStatus {
  ok: boolean;
  tenantId: string;
  caps: CostCaps;
  totals: CostTotals;
  window?: CostCapWindow;
  resetAt?: string;
}

/**
 * Inspect a tenant's current spend vs caps without throwing. Used by the
 * admin endpoint and by `enforceCostCap` to share one DB round-trip.
 */
export async function checkCostCap(
  tenantId: string,
  now: Date = new Date(),
): Promise<CostCapStatus> {
  const [caps, totals] = await Promise.all([
    getTenantCostCaps(tenantId),
    getTenantCostTotals(tenantId, now),
  ]);
  if (totals.dailyUsd >= caps.dailyUsd) {
    return {
      ok: false, tenantId, caps, totals,
      window: 'daily',
      resetAt: nextDayBoundaryUtc(now).toISOString(),
    };
  }
  if (totals.monthlyUsd >= caps.monthlyUsd) {
    return {
      ok: false, tenantId, caps, totals,
      window: 'monthly',
      resetAt: nextMonthBoundaryUtc(now).toISOString(),
    };
  }
  return { ok: true, tenantId, caps, totals };
}

/**
 * Pre-flight cap gate. Throws `CostCapExceededError` (HTTP 402-shaped)
 * when a tenant is at or above its current daily/monthly cap. Caller is
 * responsible for translating to a 402 response (admin endpoint and the
 * /run handler do this; queryAI lets it propagate).
 */
export async function enforceCostCap(
  tenantId: string,
  now: Date = new Date(),
): Promise<CostCapStatus> {
  const status = await checkCostCap(tenantId, now);
  if (!status.ok && status.window) {
    const cap = status.window === 'daily'
      ? status.caps.dailyUsd
      : status.caps.monthlyUsd;
    const spent = status.window === 'daily'
      ? status.totals.dailyUsd
      : status.totals.monthlyUsd;
    throw new CostCapExceededError({
      tenantId, window: status.window,
      capUsd: cap, spentUsd: spent,
      resetAt: new Date(status.resetAt as string),
    });
  }
  return status;
}

export interface CostEventInput {
  tenantId: string;
  platform: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  usdCost?: number;
  runId?: string | null;
  at?: Date;
}

/**
 * Append a row to `tenant_cost_events`. Best-effort: a DB hiccup must not
 * fail the in-flight LLM call (the caller has already paid for the
 * provider response). The cap check on the next call will simply see a
 * smaller spend, which is the safer direction.
 */
export async function recordCostEvent(input: CostEventInput): Promise<void> {
  if (!input.tenantId) return;
  await ensureCostEventsTable();
  const cost = typeof input.usdCost === 'number' && Number.isFinite(input.usdCost)
    ? input.usdCost
    : estimateCostUsd(input.model, input.tokensIn, input.tokensOut);
  try {
    await pool.query(
      `INSERT INTO tenant_cost_events
         (tenant_id, run_id, platform, model, tokens_in, tokens_out, usd_cost, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.tenantId,
        input.runId || null,
        input.platform || 'unknown',
        input.model || 'unknown',
        Math.max(0, Math.floor(input.tokensIn || 0)),
        Math.max(0, Math.floor(input.tokensOut || 0)),
        cost,
        (input.at || new Date()).toISOString(),
      ],
    );
  } catch {
    // Swallow: see contract above.
  }
}

export interface RecordCallInput {
  platform: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Number of web_search tool invocations the provider charged for. */
  webSearchCalls?: number;
  /**
   * Caller-computed USD cost for this call. Should already include any
   * per-web-search-call surcharge (CHATGPT_WEB_SEARCH_CALL_USD * calls).
   * Falls back to estimateCostUsd(model, tokensIn, tokensOut) when omitted
   * - that fallback does NOT know about web-search surcharges.
   */
  costUsd?: number;
  at?: Date;
}

// Module-scoped alarm de-dup key set: "<UTC-day>|<platform>". Reset on
// process restart, which is acceptable - a redeploy at most re-fires one
// warning per platform that's already over threshold today.
const _alarmFiredKeys = new Set<string>();

/** Test-only: clear the in-process alarm de-dup set. */
export function __resetAlarmStateForTests(): void {
  _alarmFiredKeys.clear();
}

/**
 * Upsert today's (platform, model) row in `daily_cost_tracker` with the
 * just-observed numbers, then check the per-platform daily alarm.
 *
 * Called by ai-platforms.ts on the success path of every provider call.
 * Retry/failure paths must NOT call this - we only count what the provider
 * actually billed for. Best-effort: a DB hiccup must not fail the LLM call
 * (the caller has already paid for the response).
 */
export async function recordCall(input: RecordCallInput): Promise<void> {
  if (!input.platform || !input.model) return;
  const tokensIn = Math.max(0, Math.floor(input.tokensIn || 0));
  const tokensOut = Math.max(0, Math.floor(input.tokensOut || 0));
  const webSearchCalls = Math.max(0, Math.floor(input.webSearchCalls || 0));
  const costUsd = typeof input.costUsd === 'number' && Number.isFinite(input.costUsd) && input.costUsd >= 0
    ? input.costUsd
    : estimateCostUsd(input.model, tokensIn, tokensOut);
  const now = input.at || new Date();
  const day = currentDayBoundaryUtc(now);

  // Defense-in-depth: `ensureCostEventsTable` was previously awaited
  // outside this try/catch, which let a migration failure (e.g. PR #518's
  // `column "day" does not exist` against a partial-state legacy table)
  // escape into `queryAI`'s happy path and surface as the per-platform
  // errorMessage on every brand run. recordCall is best-effort by
  // contract - the caller has already paid for the provider response -
  // so any failure here, including table-readiness, must be swallowed.
  let costToday: number | null = null;
  try {
    await ensureCostEventsTable();
    const res = await pool.query(
      `INSERT INTO daily_cost_tracker
         (day, platform, model, tokens_in_total, tokens_out_total,
          web_search_calls_total, cost_usd_total, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (day, platform, model) DO UPDATE SET
         tokens_in_total = daily_cost_tracker.tokens_in_total + EXCLUDED.tokens_in_total,
         tokens_out_total = daily_cost_tracker.tokens_out_total + EXCLUDED.tokens_out_total,
         web_search_calls_total = daily_cost_tracker.web_search_calls_total + EXCLUDED.web_search_calls_total,
         cost_usd_total = daily_cost_tracker.cost_usd_total + EXCLUDED.cost_usd_total,
         updated_at = NOW()
       RETURNING cost_usd_total`,
      [
        day.toISOString().slice(0, 10),
        input.platform,
        input.model,
        tokensIn, tokensOut, webSearchCalls, costUsd,
      ],
    );
    costToday = parseFloat(res.rows[0]?.cost_usd_total) || costUsd;
  } catch (e) {
    // Best-effort. Log once at warn so we still see migration / DB
    // problems in Sentry without breaking the LLM call success path.
    logger.warn('cost_tracker.record_call_failed', {
      platform: input.platform,
      model: input.model,
      errorMessage: (e as Error).message,
    });
  }

  if (costToday !== null) {
    maybeFireDailyAlarm(input.platform, costToday, day);
  }
}

/**
 * Per-platform aggregate of today's cost row. Returns 0s when the row
 * doesn't exist yet. Used by the admin /system endpoint widget.
 */
export async function getTodayPlatformTotals(now: Date = new Date()): Promise<Array<{
  platform: string;
  tokens_in_total: number;
  tokens_out_total: number;
  web_search_calls_total: number;
  cost_usd_total: number;
}>> {
  const day = currentDayBoundaryUtc(now).toISOString().slice(0, 10);
  try {
    await ensureCostEventsTable();
    const res = await pool.query(
      `SELECT platform,
         SUM(tokens_in_total)::bigint AS tokens_in_total,
         SUM(tokens_out_total)::bigint AS tokens_out_total,
         SUM(web_search_calls_total)::int AS web_search_calls_total,
         SUM(cost_usd_total)::numeric AS cost_usd_total
       FROM daily_cost_tracker
       WHERE day = $1
       GROUP BY platform
       ORDER BY cost_usd_total DESC`,
      [day],
    );
    return res.rows.map(r => ({
      platform: r.platform,
      tokens_in_total: Number(r.tokens_in_total) || 0,
      tokens_out_total: Number(r.tokens_out_total) || 0,
      web_search_calls_total: Number(r.web_search_calls_total) || 0,
      cost_usd_total: parseFloat(r.cost_usd_total) || 0,
    }));
  } catch {
    return [];
  }
}

function maybeFireDailyAlarm(platform: string, costToday: number, day: Date): void {
  if (costToday < COST_DAILY_ALARM_USD) return;
  const key = `${day.toISOString().slice(0, 10)}|${platform}`;
  if (_alarmFiredKeys.has(key)) return;
  _alarmFiredKeys.add(key);
  console.warn('[cost.alarm]', {
    platform,
    costToday: Number(costToday.toFixed(4)),
    threshold: COST_DAILY_ALARM_USD,
  });
}

/** 402-shaped JSON body for `CostCapExceededError`, ready for `Response.json`. */
export function costCapExceededBody(err: CostCapExceededError): {
  error: string;
  code: 'cost_cap.exceeded';
  window: CostCapWindow;
  capUsd: number;
  spentUsd: number;
  resetAt: string;
} {
  return {
    error: `Tenant cost cap reached for the current UTC ${err.window}. ` +
      `Spent $${err.spentUsd.toFixed(4)} of $${err.capUsd.toFixed(2)}. ` +
      `Window resets ${err.resetAt}.`,
    code: 'cost_cap.exceeded',
    window: err.window,
    capUsd: err.capUsd,
    spentUsd: err.spentUsd,
    resetAt: err.resetAt,
  };
}
