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

export const DEFAULT_DAILY_CAP_USD = (() => {
  const raw = parseFloat(process.env.TENANT_DAILY_COST_CAP_USD || '');
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
})();

export const DEFAULT_MONTHLY_CAP_USD = (() => {
  const raw = parseFloat(process.env.TENANT_MONTHLY_COST_CAP_USD || '');
  return Number.isFinite(raw) && raw > 0 ? raw : 200;
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
