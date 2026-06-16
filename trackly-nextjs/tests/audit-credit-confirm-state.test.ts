import { describe, expect, it } from 'vitest';
import {
  AUDIT_PER_UNIT_COST,
  AUDIT_PLATFORMS_COUNT,
  computeAuditCost,
  computeAuditCreditState,
  formatAuditMathLine,
} from '../src/components/dashboard/geo-audits/audit-credit-confirm-state';
import type { CreditStatus } from '../src/contexts/CreditsContext';

/**
 * Unit tests for the AuditCreditConfirmModal's pure state helpers.
 *
 * The modal is a thin presentational shell over these helpers, so
 * exercising the helpers directly covers the modal's three required
 * behaviours: math, open/close (state object lifecycle), and the
 * insufficient-credits state transition.
 */

function makeStatus(overrides: Partial<CreditStatus> = {}): CreditStatus {
  return {
    plan: 'pro',
    label: 'Pro',
    remaining: 1_000,
    monthlyCap: 2_500,
    monthlyUsed: 1_500,
    reservedCredits: 0,
    // Daily cap is effectively unlimited by default so tests targeting
    // the *monthly* gate aren't tripped by the daily one. Tests that
    // need to exercise the daily-cap block override these fields.
    manualRemainingToday: 9999,
    manualDailyCap: 9999,
    cooldownSeconds: 0,
    modelTier: 'economy',
    scheduledRuns: true,
    nextResetAt: '2026-06-01T00:00:00Z',
    nextDailyResetAt: '2026-05-02T00:00:00Z',
    lowBalance: false,
    ...overrides,
  };
}

describe('computeAuditCost - math', () => {
  it('multiplies regions × prompts × platforms × per-unit', () => {
    expect(computeAuditCost({
      regionsCount: 2, promptsCount: 24,
      platformsCount: 5, perUnitCost: 1,
    })).toBe(240);
  });

  it('defaults match the brand-run "Run query" popup contract: 1 credit per LLM call, 5 platforms', () => {
    // 1 region × 10 prompts × default (5 platforms × 1 credit) = 50.
    expect(AUDIT_PER_UNIT_COST).toBe(1);
    expect(AUDIT_PLATFORMS_COUNT).toBe(5);
    expect(computeAuditCost({ regionsCount: 1, promptsCount: 10 })).toBe(50);
  });

  it('clamps non-finite or negative inputs to zero', () => {
    expect(computeAuditCost({ regionsCount: -1, promptsCount: 5 })).toBe(0);
    expect(computeAuditCost({ regionsCount: NaN, promptsCount: 5 })).toBe(0);
    expect(computeAuditCost({ regionsCount: 1, promptsCount: 0 })).toBe(0);
  });
});

describe('formatAuditMathLine - popup copy', () => {
  it('renders the exact "{cost} credits ({regions} regions × {prompts} prompts × 5 models)" pattern', () => {
    expect(formatAuditMathLine({ regionsCount: 2, promptsCount: 24 }))
      .toBe('240 credits (2 regions × 24 prompts × 5 models)');
  });

  it('uses singular forms when counts are 1', () => {
    expect(formatAuditMathLine({ regionsCount: 1, promptsCount: 1 }))
      .toBe('5 credits (1 region × 1 prompt × 5 models)');
  });

  it('formats large numbers with thousands separators', () => {
    expect(formatAuditMathLine({ regionsCount: 5, promptsCount: 100 }))
      .toBe('2,500 credits (5 regions × 100 prompts × 5 models)');
  });
});

describe('computeAuditCreditState - three numbers + open lifecycle', () => {
  it('returns cost, remaining, and remainingAfter - the three numbers the spec requires', () => {
    const state = computeAuditCreditState(
      makeStatus({ remaining: 1000, monthlyCap: 2500 }),
      { regionsCount: 2, promptsCount: 24 },
    );
    // Three numbers wired to the same credit hook the rest of the
    // dashboard uses - no fabricated values.
    expect(state.cost).toBe(240);
    expect(state.remaining).toBe(1000);
    expect(state.remainingAfter).toBe(760);
    expect(state.monthlyCap).toBe(2500);
    expect(state.blocked).toBe(false);
    expect(state.blockReason).toBe(null);
  });

  it('renders ∞ semantics for owner / unlimited plans (remainingAfter is Infinity)', () => {
    const ownerState = computeAuditCreditState(
      makeStatus({ plan: 'owner', remaining: 1, monthlyCap: 99_999 }),
      { regionsCount: 5, promptsCount: 100 },
    );
    expect(ownerState.isUnlimited).toBe(true);
    expect(ownerState.remainingAfter).toBe(Infinity);
    expect(ownerState.blocked).toBe(false);
  });

  it('treats a missing status (backend down) as blocked, not silently allowed', () => {
    const state = computeAuditCreditState(null, { regionsCount: 1, promptsCount: 1 });
    expect(state.blocked).toBe(true);
    expect(state.blockReason).toBe('no_status');
    expect(state.blockMessage).toMatch(/credit balance/i);
  });

  it('clamps remainingAfter at 0 when cost exceeds remaining (no negative display)', () => {
    const state = computeAuditCreditState(
      makeStatus({ remaining: 10, monthlyCap: 2500 }),
      { regionsCount: 2, promptsCount: 24 },
    );
    expect(state.cost).toBe(240);
    expect(state.remainingAfter).toBe(0);
  });
});

describe('computeAuditCreditState - insufficient-credits state', () => {
  it('blocks when monthly remaining < cost (matches Run query popup blocked state)', () => {
    const state = computeAuditCreditState(
      makeStatus({ remaining: 50, monthlyCap: 2500 }),
      { regionsCount: 1, promptsCount: 24 }, // = 120 credits
    );
    expect(state.blocked).toBe(true);
    expect(state.blockReason).toBe('monthly_exhausted');
    expect(state.blockMessage).toMatch(/Not enough monthly credits.*120/);
  });

  it('blocks when the daily manual cap is finite and exceeded', () => {
    const state = computeAuditCreditState(
      makeStatus({ remaining: 5_000, manualDailyCap: 10, manualRemainingToday: 5 }),
      { regionsCount: 2, promptsCount: 24 }, // = 240 credits
    );
    expect(state.blocked).toBe(true);
    expect(state.blockReason).toBe('daily_cap_reached');
    expect(state.blockMessage).toMatch(/Daily manual cap reached \(5\/10\)/);
  });

  it('does NOT block on daily cap when the cap is unlimited (>= 9999)', () => {
    const state = computeAuditCreditState(
      makeStatus({ remaining: 5_000, manualDailyCap: 9999, manualRemainingToday: 0 }),
      { regionsCount: 1, promptsCount: 1 },
    );
    expect(state.blocked).toBe(false);
    expect(state.blockReason).toBe(null);
  });

  it('does NOT block when the user has exactly enough credits (boundary)', () => {
    const state = computeAuditCreditState(
      makeStatus({ remaining: 240, monthlyCap: 1000 }),
      { regionsCount: 2, promptsCount: 24 },
    );
    expect(state.cost).toBe(240);
    expect(state.remaining).toBe(240);
    expect(state.remainingAfter).toBe(0);
    expect(state.blocked).toBe(false);
  });
});

describe('open/close lifecycle - state is recomputed cheaply for the same inputs', () => {
  it('is referentially independent and idempotent for identical inputs (safe to call from render)', () => {
    const status = makeStatus({ remaining: 500, monthlyCap: 2500 });
    const a = computeAuditCreditState(status, { regionsCount: 2, promptsCount: 24 });
    const b = computeAuditCreditState(status, { regionsCount: 2, promptsCount: 24 });
    expect(a).toEqual(b);
    // No shared references that would let one caller mutate the other.
    expect(a).not.toBe(b);
  });

  it('flips from allowed → blocked when the user re-opens the popup after a balance drop', () => {
    // Open #1: user has plenty.
    const openOne = computeAuditCreditState(
      makeStatus({ remaining: 1_000 }),
      { regionsCount: 2, promptsCount: 24 },
    );
    expect(openOne.blocked).toBe(false);

    // User cancels, runs other things, balance falls. Re-open with
    // same audit shape - modal should now show the blocked state.
    const openTwo = computeAuditCreditState(
      makeStatus({ remaining: 100 }),
      { regionsCount: 2, promptsCount: 24 },
    );
    expect(openTwo.blocked).toBe(true);
    expect(openTwo.blockReason).toBe('monthly_exhausted');
  });
});
