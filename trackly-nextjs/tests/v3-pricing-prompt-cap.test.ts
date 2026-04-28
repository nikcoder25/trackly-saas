import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * v3 pricing — account-wide tracked-prompt cap (and brand cap)
 * enforcement coverage.
 *
 * The full Next.js route handlers pull in Postgres, Redis, AI, mail,
 * etc., so we test the contract by exercising:
 *   - PLAN_CREDITS / PLAN_LIMITS values per tier
 *   - the prompt-quota helper math against a stubbed Pool
 *   - the migration's plan-picker function
 *
 * Drift between any of these and the route handlers is a code-review
 * concern. The point of this suite is to make every public number in
 * the v3 spec one-line greppable.
 */

import { PLAN_CREDITS } from '../src/lib/plan-config';
import { PLAN_LIMITS } from '../src/lib/constants';

describe('v3 spec — plan tier numbers', () => {
  it('exposes account-wide tracked prompt caps in both configs', () => {
    expect(PLAN_CREDITS.free.trackedPromptsPerAccount).toBe(5);
    expect(PLAN_CREDITS.starter.trackedPromptsPerAccount).toBe(15);
    expect(PLAN_CREDITS.pro.trackedPromptsPerAccount).toBe(25);
    expect(PLAN_CREDITS.agency.trackedPromptsPerAccount).toBe(100);

    expect(PLAN_LIMITS.free.trackedPromptsPerAccount).toBe(5);
    expect(PLAN_LIMITS.starter.trackedPromptsPerAccount).toBe(15);
    expect(PLAN_LIMITS.pro.trackedPromptsPerAccount).toBe(25);
    expect(PLAN_LIMITS.agency.trackedPromptsPerAccount).toBe(100);
  });

  it('codifies the brand cap per tier (Free=1, Starter=3, Pro/Agency=Unlimited)', () => {
    expect(PLAN_CREDITS.free.brandsCap).toBe(1);
    expect(PLAN_CREDITS.starter.brandsCap).toBe(3);
    expect(PLAN_CREDITS.pro.brandsCap).toBeGreaterThanOrEqual(9999);
    expect(PLAN_CREDITS.agency.brandsCap).toBeGreaterThanOrEqual(9999);
  });

  it('keeps the deprecated `queries` alias in lockstep with the new field', () => {
    for (const plan of ['free', 'starter', 'pro', 'agency'] as const) {
      expect(PLAN_LIMITS[plan].queries).toBe(PLAN_LIMITS[plan].trackedPromptsPerAccount);
    }
  });

  it('codifies cooldown / manual cap / credits / auto-run frequency', () => {
    // Manual run query cap
    expect(PLAN_CREDITS.free.manualDailyCap).toBe(5);
    expect(PLAN_CREDITS.starter.manualDailyCap).toBe(20);
    expect(PLAN_CREDITS.pro.manualDailyCap).toBe(50);
    expect(PLAN_CREDITS.agency.manualDailyCap).toBeGreaterThanOrEqual(9999);
    // Cooldown per prompt (5 min, 2 min, 60s, 30s)
    expect(PLAN_CREDITS.free.cooldownSeconds).toBe(300);
    expect(PLAN_CREDITS.starter.cooldownSeconds).toBe(120);
    expect(PLAN_CREDITS.pro.cooldownSeconds).toBe(60);
    expect(PLAN_CREDITS.agency.cooldownSeconds).toBe(30);
    // Monthly credits
    expect(PLAN_CREDITS.free.monthlyCredits).toBe(150);
    expect(PLAN_CREDITS.starter.monthlyCredits).toBe(750);
    expect(PLAN_CREDITS.pro.monthlyCredits).toBe(2500);
    expect(PLAN_CREDITS.agency.monthlyCredits).toBe(8000);
    // Competitors tracked
    expect(PLAN_LIMITS.free.competitors).toBe(0);
    expect(PLAN_LIMITS.starter.competitors).toBe(3);
    expect(PLAN_LIMITS.pro.competitors).toBe(8);
    expect(PLAN_LIMITS.agency.competitors).toBe(20);
    // AI platforms — Trackly supports exactly 5 (ChatGPT, Perplexity,
    // Claude, Gemini, Grok). Agency caps at 5 (all) post-PR
    // "chore(pre-launch): platform count copy"; the previous 6 was a
    // copy/config bug that surfaced as the dashboard "6 / ∞" tile.
    expect(PLAN_CREDITS.free.maxPlatforms).toBe(2);
    expect(PLAN_CREDITS.starter.maxPlatforms).toBe(2);
    expect(PLAN_CREDITS.pro.maxPlatforms).toBe(3);
    expect(PLAN_CREDITS.agency.maxPlatforms).toBe(5);
    // Auto-run frequency
    expect(PLAN_CREDITS.free.autoRunFrequency).toBe('weekly');
    expect(PLAN_CREDITS.starter.autoRunFrequency).toBe('every_2_days');
    expect(PLAN_CREDITS.pro.autoRunFrequency).toBe('daily');
    expect(PLAN_CREDITS.agency.autoRunFrequency).toBe('daily');
  });
});

// ── prompt-quota helper ──────────────────────────────────────────
// Drive the helper with an in-memory pool stub so we can assert the
// account-aggregate math (sum across brands, exclude one brand).
import { countTrackedPromptsForOwner, countTrackedPromptsForOwnerExcluding } from '../src/lib/prompt-quota';

interface QueryCall { sql: string; params: unknown[]; }

function makePool(brandQueriesByOwner: Record<string, Record<string, string[]>>) {
  const calls: QueryCall[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pool: any = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      const ownerId = String(params[0]);
      const brands = brandQueriesByOwner[ownerId] || {};
      let total = 0;
      const excludeId = sql.includes('id <> $2') ? String(params[1]) : null;
      for (const [bid, queries] of Object.entries(brands)) {
        if (excludeId && bid === excludeId) continue;
        total += queries.length;
      }
      return { rows: [{ n: total }] };
    },
  };
  return { pool, calls };
}

describe('prompt-quota helpers', () => {
  it('countTrackedPromptsForOwner sums queries across every brand', async () => {
    const { pool } = makePool({
      'u1': {
        'b1': ['q1', 'q2', 'q3'],
        'b2': ['q4', 'q5'],
      },
    });
    const total = await countTrackedPromptsForOwner('u1', { pool });
    expect(total).toBe(5);
  });

  it('countTrackedPromptsForOwnerExcluding skips the named brand', async () => {
    const { pool } = makePool({
      'u1': {
        'b1': ['q1', 'q2', 'q3'],
        'b2': ['q4', 'q5'],
        'b3': ['q6'],
      },
    });
    const total = await countTrackedPromptsForOwnerExcluding('u1', 'b1', { pool });
    expect(total).toBe(3); // b2 (2) + b3 (1)
  });

  it('returns 0 when the owner has no brands', async () => {
    const { pool } = makePool({});
    expect(await countTrackedPromptsForOwner('u1', { pool })).toBe(0);
  });
});

// ── Account-aggregate enforcement contract ──────────────────────
// Mirror of the math the API routes apply. Any drift between this
// table and api/brands/route.ts / api/brands/[id]/route.ts will
// surface in code review or via the helper unit tests above.
describe('account-wide tracked-prompt enforcement', () => {
  function wouldRejectCreate(plan: keyof typeof PLAN_CREDITS, existingTotal: number, newQueries: number): boolean {
    const cap = PLAN_CREDITS[plan].trackedPromptsPerAccount;
    if (cap >= 9999) return false;
    return existingTotal + newQueries > cap;
  }
  function wouldRejectUpdate(plan: keyof typeof PLAN_CREDITS, otherBrandsTotal: number, thisBrandQueries: number): boolean {
    const cap = PLAN_CREDITS[plan].trackedPromptsPerAccount;
    if (cap >= 9999) return false;
    return otherBrandsTotal + thisBrandQueries > cap;
  }

  it('Free: rejects the 6th account-wide prompt', () => {
    expect(wouldRejectCreate('free', 5, 1)).toBe(true);
    expect(wouldRejectCreate('free', 4, 1)).toBe(false);
    expect(wouldRejectCreate('free', 0, 6)).toBe(true);
  });

  it('Starter: rejects the 16th account-wide prompt across brands', () => {
    expect(wouldRejectUpdate('starter', 10, 6)).toBe(true);  // 16 total
    expect(wouldRejectUpdate('starter', 10, 5)).toBe(false); // 15 total — at cap
    expect(wouldRejectUpdate('starter', 14, 1)).toBe(false); // 15 total — at cap
    expect(wouldRejectUpdate('starter', 14, 2)).toBe(true);  // 16 total
  });

  it('Pro: rejects the 26th account-wide prompt', () => {
    expect(wouldRejectUpdate('pro', 20, 6)).toBe(true);
    expect(wouldRejectUpdate('pro', 20, 5)).toBe(false);
  });

  it('Agency: rejects the 101st account-wide prompt', () => {
    expect(wouldRejectUpdate('agency', 60, 41)).toBe(true);
    expect(wouldRejectUpdate('agency', 60, 40)).toBe(false);
  });

  it('Owner: never rejects (treated as unlimited)', () => {
    expect(wouldRejectUpdate('owner', 9000, 100000)).toBe(false);
  });
});

// ── Brand-cap enforcement contract ──────────────────────────────
describe('brand-cap enforcement', () => {
  function wouldRejectBrandCreate(plan: keyof typeof PLAN_CREDITS, existingBrandCount: number): boolean {
    const cap = PLAN_CREDITS[plan].brandsCap;
    return existingBrandCount + 1 > cap;
  }

  it('Free (cap 1): rejects creating a 2nd brand', () => {
    expect(wouldRejectBrandCreate('free', 0)).toBe(false);
    expect(wouldRejectBrandCreate('free', 1)).toBe(true);
  });

  it('Starter (cap 3): rejects creating a 4th brand', () => {
    expect(wouldRejectBrandCreate('starter', 2)).toBe(false);
    expect(wouldRejectBrandCreate('starter', 3)).toBe(true);
  });

  it('Pro / Agency (Unlimited): never rejects', () => {
    expect(wouldRejectBrandCreate('pro', 50)).toBe(false);
    expect(wouldRejectBrandCreate('agency', 500)).toBe(false);
  });
});

// ── Migration plan-picker ───────────────────────────────────────
// Re-implementation of the `pickFittingPlan` logic in
// scripts/migrate-v3-pricing.ts so we can exercise it without
// shelling out to tsx + a real DB. The picker logic is small and
// self-contained, and the test guards against accidentally promoting
// users to enterprise/owner tiers.
describe('v3 pricing migration — plan picker', () => {
  const LADDER = ['free', 'starter', 'pro', 'agency'] as const;

  function pickFittingPlan(
    promptCount: number,
    brandCount: number,
    currentPlan: string,
  ): string | null {
    if (currentPlan === 'owner' || currentPlan === 'enterprise' || currentPlan === 'trial') return null;
    const currentIdx = LADDER.indexOf(currentPlan as typeof LADDER[number]);
    const startIdx = currentIdx >= 0 ? currentIdx + 1 : 0;
    for (let i = startIdx; i < LADDER.length; i++) {
      const candidate = LADDER[i];
      const cfg = PLAN_CREDITS[candidate];
      if (promptCount <= cfg.trackedPromptsPerAccount && brandCount <= cfg.brandsCap) {
        return candidate;
      }
    }
    return null;
  }

  it('Free user with 8 prompts and 1 brand → starter', () => {
    expect(pickFittingPlan(8, 1, 'free')).toBe('starter');
  });

  it('Free user with 16 prompts and 1 brand → pro (starter only allows 15)', () => {
    expect(pickFittingPlan(16, 1, 'free')).toBe('pro');
  });

  it('Free user with 30 prompts and 5 brands → agency', () => {
    expect(pickFittingPlan(30, 5, 'free')).toBe('agency');
  });

  it('Starter user with 4 brands → pro (starter caps at 3 brands)', () => {
    expect(pickFittingPlan(10, 4, 'starter')).toBe('pro');
  });

  it('Pro user with 200 prompts and 50 brands → null (exceeds Agency cap)', () => {
    expect(pickFittingPlan(200, 50, 'pro')).toBe(null);
  });

  it('owner / enterprise / trial accounts are never auto-changed', () => {
    expect(pickFittingPlan(10000, 1000, 'owner')).toBe(null);
    expect(pickFittingPlan(10000, 1000, 'enterprise')).toBe(null);
    expect(pickFittingPlan(50, 10, 'trial')).toBe(null);
  });

  it('never auto-promotes to enterprise', () => {
    // Even if every paid tier is exceeded, picker returns null —
    // operator must hand-promote to enterprise/owner.
    expect(pickFittingPlan(99999, 1, 'pro')).toBe(null);
  });
});

// keep linter happy if vi/beforeEach unused in some build
void vi; void beforeEach; void afterEach;
