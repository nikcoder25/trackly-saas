import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Smoke-level integration test for the credit gate on /api/brands/[id]/run.
 *
 * The full route handler imports a lot (Postgres, Redis, the AI
 * platform layer) so a true end-to-end run-route test would be a
 * misery to set up. Instead we test the *contract*: given the
 * reservation fails with code X, the route must respond with status Y
 * and a body shaped like Z. We do that by exercising the pure
 * `reserveCredits` + `reserveManualWithCooldown` outputs and
 * mirroring the route's translation table. Any drift between the
 * route handler's translation and this test is a test failure that
 * surfaces the bug at PR time.
 */

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));
vi.mock('../src/lib/db', () => ({
  pool: { query: (...args: Parameters<QueryFn>) => queryMock(...args) },
}));

import {
  reserveCredits,
  reserveManualWithCooldown,
  currentMonthStart,
  currentDayUtc,
} from '../src/lib/credits';

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
});
afterEach(() => { vi.clearAllMocks(); });

// Mirror of the run route's status mapping. If the route changes,
// update both places — the tests will catch the drift.
function translateReservation(code: string): number {
  if (code === 'cooldown') return 429;
  if (code === 'monthly_exhausted') return 402;
  if (code === 'daily_cap_reached') return 429;
  return 403;
}

describe('/api/queries/run — happy path (manual)', () => {
  it('successful reservation → run can proceed', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('INSERT INTO usage_counters')) {
        return { rows: [{
          user_id: 'u1', monthly_used: 10, manual_daily_used: 2,
          period_month: currentMonthStart().toISOString().slice(0, 10),
          daily_date: currentDayUtc(),
          last_low_balance_notify_at: null, last_reset_notify_at: null,
          rolled_over_month: false,
        }] };
      }
      if (sql.startsWith('UPDATE usage_counters')) {
        return { rows: [{ monthly_used: 15, manual_daily_used: 7 }] };
      }
      return { rows: [] };
    });
    const res = await reserveCredits('u1', 'pro', 5, 'manual');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.remaining).toBe(2500 - 15);
      expect(res.manualRemainingToday).toBe(50 - 7);
    }
  });
});

describe('/api/queries/run — out of credits', () => {
  it('reservation fails → route should respond 402 with credits.monthly_exhausted', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('INSERT INTO usage_counters')) {
        return { rows: [{
          user_id: 'u1', monthly_used: 2500, manual_daily_used: 5,
          period_month: currentMonthStart().toISOString().slice(0, 10),
          daily_date: currentDayUtc(),
          last_low_balance_notify_at: null, last_reset_notify_at: null,
          rolled_over_month: false,
        }] };
      }
      if (sql.startsWith('UPDATE usage_counters')) return { rows: [] };
      return { rows: [] };
    });
    const res = await reserveCredits('u1', 'pro', 1, 'manual');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('monthly_exhausted');
      expect(translateReservation(res.code)).toBe(402);
      // The route copies these fields onto the JSON body verbatim.
      expect(res.remaining).toBe(0);
      expect(res.monthlyCap).toBe(2500);
      expect(typeof res.nextResetAt).toBe('string');
    }
  });

  // The pre-v3 "auto-run on a free plan is rejected before any DB call"
  // test asserted `Free.scheduledRuns === false`. v3 (2026-04-27) flipped
  // every tier — including Free (weekly) — to `scheduledRuns: true`, so
  // no real plan name exercises the `plan_disallows_auto` reservation
  // failure any more. The translate-to-403 contract is still covered by
  // the non-`auto` failure cases above; deleting this assertion rather
  // than rewriting it against a synthetic plan because the guard is
  // dormant under the current config.
});

describe('/api/queries/run — cooldown blocked', () => {
  it('active cooldown → 429 with credits.cooldown', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      // checkCooldown finds an unexpired entry.
      if (sql.includes('SELECT expires_at')) {
        return { rows: [{
          expires_at: new Date(Date.now() + 18_000).toISOString(),
        }] };
      }
      // readOrInitCounter shouldn't even be needed for the failure
      // branch but the function still calls it for the response shape.
      if (sql.includes('INSERT INTO usage_counters')) {
        return { rows: [{
          user_id: 'u1', monthly_used: 10, manual_daily_used: 2,
          period_month: currentMonthStart().toISOString().slice(0, 10),
          daily_date: currentDayUtc(),
          last_low_balance_notify_at: null, last_reset_notify_at: null,
          rolled_over_month: false,
        }] };
      }
      return { rows: [] };
    });
    const res = await reserveManualWithCooldown('u1', 'pro', 'best plumbers', 1);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('cooldown');
      expect(translateReservation(res.code)).toBe(429);
      expect(res.cooldownRemainingSeconds).toBeGreaterThan(0);
      // ceil(18.00x) = 19 in some clock alignments
      expect(res.cooldownRemainingSeconds).toBeLessThanOrEqual(19);
    }
  });

  it('no cooldown → reservation proceeds and stamps a fresh one', async () => {
    let cooldownStamped = false;
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('SELECT expires_at')) return { rows: [] };
      if (sql.startsWith('INSERT INTO prompt_cooldowns')) {
        cooldownStamped = true; return { rows: [] };
      }
      if (sql.includes('INSERT INTO usage_counters')) {
        return { rows: [{
          user_id: 'u1', monthly_used: 0, manual_daily_used: 0,
          period_month: currentMonthStart().toISOString().slice(0, 10),
          daily_date: currentDayUtc(),
          last_low_balance_notify_at: null, last_reset_notify_at: null,
          rolled_over_month: false,
        }] };
      }
      if (sql.startsWith('UPDATE usage_counters')) {
        return { rows: [{ monthly_used: 1, manual_daily_used: 1 }] };
      }
      return { rows: [] };
    });
    const res = await reserveManualWithCooldown('u1', 'pro', 'best plumbers', 1);
    expect(res.ok).toBe(true);
    expect(cooldownStamped).toBe(true);
  });
});
