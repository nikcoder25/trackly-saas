/**
 * Pure state helpers for AuditCreditConfirmModal.
 *
 * Lives outside the React component so the cost math + blocked-state
 * decision can be unit-tested in node without spinning up a DOM. The
 * component imports these and renders the result; tests import them
 * and assert directly. Same pattern as src/components/dashboard/billing/usage-state.ts.
 */

import type { CreditStatus } from '@/contexts/CreditsContext';

/** Per-unit cost — same constant the brand-run "Run query" popup
 *  uses (1 credit per LLM call). */
export const AUDIT_PER_UNIT_COST = 1;

/** Number of platforms hit per audit. v1 spec: all 5 always. */
export const AUDIT_PLATFORMS_COUNT = 5;

export interface ComputeAuditCostInput {
  regionsCount: number;
  promptsCount: number;
  perUnitCost?: number;
  platformsCount?: number;
}

/**
 * Audit cost = regions × prompts × platforms × perUnit. Clamps each
 * factor at zero so a negative or NaN input still yields a sane 0.
 */
export function computeAuditCost(input: ComputeAuditCostInput): number {
  const r = Math.max(0, Number.isFinite(input.regionsCount) ? input.regionsCount : 0);
  const p = Math.max(0, Number.isFinite(input.promptsCount) ? input.promptsCount : 0);
  const m = Math.max(0, input.platformsCount ?? AUDIT_PLATFORMS_COUNT);
  const u = Math.max(0, input.perUnitCost ?? AUDIT_PER_UNIT_COST);
  return r * p * m * u;
}

export type AuditCreditBlockReason =
  | 'no_status'
  | 'monthly_exhausted'
  | 'daily_cap_reached'
  | null;

export interface AuditCreditState {
  cost: number;
  /** Credits the user has right now (across the period). */
  remaining: number;
  /** Account-wide monthly cap (0 when status is missing). */
  monthlyCap: number;
  /**
   * Credits left after this audit lands. Infinity for owner / unlimited
   * plans so the UI can render `∞` without a special-case branch.
   */
  remainingAfter: number;
  isUnlimited: boolean;
  /** True iff Confirm should be replaced with the Upgrade-Plan CTA. */
  blocked: boolean;
  /** Machine-friendly reason — useful for tests + future telemetry. */
  blockReason: AuditCreditBlockReason;
  /** Human-friendly copy displayed inside the red error block. */
  blockMessage: string;
}

/**
 * Compute the modal's full display state from a credit snapshot and
 * the audit shape. Mirrors the brand-run PreflightModal's blocking
 * rules:
 *
 *   - status missing      → block (can't verify)
 *   - monthly remaining < cost → block (insufficient)
 *   - daily-manual-cap   → block (only when cap is finite, i.e. < 9999;
 *                          unlimited plans report 9999+ here)
 *
 * Owner / unlimited plans (monthlyCap >= 99999 OR plan === 'owner')
 * never block. Brand-run uses the same threshold; we mirror it here
 * so the two modals stay in sync.
 */
export function computeAuditCreditState(
  status: CreditStatus | null | undefined,
  costInput: ComputeAuditCostInput,
): AuditCreditState {
  const cost = computeAuditCost(costInput);
  const remaining = status?.remaining ?? 0;
  const monthlyCap = status?.monthlyCap ?? 0;
  const dailyRemaining = status?.manualRemainingToday ?? 0;
  const dailyCap = status?.manualDailyCap ?? 0;
  const isUnlimited = (status?.monthlyCap ?? 0) >= 99_999 || status?.plan === 'owner';
  const remainingAfter = isUnlimited
    ? Infinity
    : Math.max(0, remaining - cost);

  if (isUnlimited) {
    return {
      cost, remaining, monthlyCap, remainingAfter, isUnlimited,
      blocked: false, blockReason: null, blockMessage: '',
    };
  }

  if (!status) {
    return {
      cost, remaining, monthlyCap, remainingAfter, isUnlimited,
      blocked: true, blockReason: 'no_status',
      blockMessage: 'Could not verify your credit balance — try again in a moment.',
    };
  }

  if (remaining < cost) {
    return {
      cost, remaining, monthlyCap, remainingAfter, isUnlimited,
      blocked: true, blockReason: 'monthly_exhausted',
      blockMessage:
        `Not enough monthly credits (${remaining.toLocaleString()} remaining, ` +
        `this audit needs ${cost.toLocaleString()}).`,
    };
  }

  if (dailyCap > 0 && dailyCap < 9999 && dailyRemaining < cost) {
    return {
      cost, remaining, monthlyCap, remainingAfter, isUnlimited,
      blocked: true, blockReason: 'daily_cap_reached',
      blockMessage:
        `Daily manual cap reached (${dailyRemaining}/${dailyCap}). ` +
        `Resets at midnight UTC.`,
    };
  }

  return {
    cost, remaining, monthlyCap, remainingAfter, isUnlimited,
    blocked: false, blockReason: null, blockMessage: '',
  };
}

/**
 * Pre-formatted math breakdown copy:
 *   "{cost} credits ({regions} regions × {prompts} prompts × 5 models)"
 *
 * Pulled out so tests can assert the exact wording the popup renders.
 */
export function formatAuditMathLine(input: ComputeAuditCostInput): string {
  const cost = computeAuditCost(input);
  const r = Math.max(0, input.regionsCount);
  const p = Math.max(0, input.promptsCount);
  const m = input.platformsCount ?? AUDIT_PLATFORMS_COUNT;
  return (
    `${cost.toLocaleString()} credit${cost === 1 ? '' : 's'} ` +
    `(${r.toLocaleString()} region${r === 1 ? '' : 's'} ` +
    `× ${p.toLocaleString()} prompt${p === 1 ? '' : 's'} ` +
    `× ${m} models)`
  );
}
