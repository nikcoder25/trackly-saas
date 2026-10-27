/**
 * Monthly cap on grounded Gemini calls per account.
 *
 * Grounding with Google Search is billed per prompt (GEMINI_GROUNDING_CALL_USD,
 * ~$0.035), roughly 100x a token-only call and the largest single cost in
 * the product (docs/UNIT-ECONOMICS.md). A credit counts one call whatever
 * it costs, so without a cap a Pro account running daily on Gemini could
 * spend its whole price on grounding alone. Past the cap, Gemini still
 * answers, just without grounding, until the month rolls over.
 *
 * Usage is read from the ledger: a Gemini row in tenant_cost_events whose
 * cost includes the grounding fee was a grounded call. Checked per call, so
 * parallel tasks can overshoot by at most the run's concurrency.
 */
import { pool } from './db';
import { GEMINI_GROUNDING_CALL_USD } from './cost-tracker';
import { geminiGroundingAllowedForPlan } from './plan-config';

/** Grounded Gemini calls a month, per plan. Plans not listed get none. */
export const GROUNDED_GEMINI_CALLS_PER_MONTH: Record<string, number> = {
  pro: 400,
  agency: 1200,
  enterprise: 10000,
  owner: Number.POSITIVE_INFINITY,
};

export function groundedGeminiCap(plan: string | null | undefined): number {
  return geminiGroundingAllowedForPlan(plan) ? GROUNDED_GEMINI_CALLS_PER_MONTH[(plan || '').toLowerCase()] ?? 0 : 0;
}

export async function groundedGeminiCallsThisMonth(tenantId: string, now: Date = new Date()): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM tenant_cost_events
      WHERE tenant_id = $1 AND platform = 'Gemini' AND usd_cost >= $2 AND created_at >= $3`,
    [tenantId, GEMINI_GROUNDING_CALL_USD, monthStart.toISOString()],
  );
  return Number(r.rows[0]?.n) || 0;
}

/**
 * Whether this account's next Gemini call may be grounded. Fails closed to
 * "ungrounded" on a DB error: an ungrounded answer is a degraded result, an
 * uncapped grounded one is an unbounded bill.
 */
export async function geminiGroundingWithinBudget(tenantId: string | null | undefined, plan: string | null | undefined): Promise<boolean> {
  const cap = groundedGeminiCap(plan);
  if (cap <= 0 || !tenantId) return false;
  if (!Number.isFinite(cap)) return true;
  try {
    return (await groundedGeminiCallsThisMonth(tenantId)) < cap;
  } catch {
    return false;
  }
}
