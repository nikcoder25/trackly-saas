/**
 * Billing identity for brand runs.
 *
 * Credits are reserved against the brand owner, so everything that feeds
 * the credit ledger, the cost cap and the grounded-Gemini budget must use
 * the owner too. The caller (a team member or an admin running someone
 * else's brand) is only kept for audit / "triggered by" fields. Writing
 * ledger rows under the caller let the credits sweeper hand the owner's
 * reserved credits back, making those scans free.
 */
import { recordCostEvent } from './cost-tracker';

/** The account that pays for a run: the brand owner, else the caller. */
export function billingTenantId(
  brand: { userId?: string | null } | null | undefined,
  callerId: string,
): string {
  return (brand && brand.userId) || callerId;
}

/**
 * A run-path cache hit still consumes a reserved credit (the run's
 * terminal refund only gives back unused and failed sub-tasks), but no
 * provider call happened, so queryAI wrote no ledger row. Without one the
 * sweeper sees the credit as drift and refunds it. Record a zero-cost row
 * so the ledger matches what was charged; usd_cost 0 keeps it out of the
 * cost cap and the grounded-Gemini count.
 */
export async function recordCacheHitCredit(input: {
  tenantId: string;
  runId: string;
  platform: string;
  model: string;
}): Promise<void> {
  await recordCostEvent({
    tenantId: input.tenantId,
    runId: input.runId,
    platform: input.platform,
    model: input.model,
    tokensIn: 0,
    tokensOut: 0,
    usdCost: 0,
  });
}
