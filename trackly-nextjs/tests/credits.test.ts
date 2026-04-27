import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the Livesov v2 credit system.
 *
 * Strategy: stub out the pg pool so we can assert the SQL fragments
 * the module emits and control the rows it sees back. We don't test
 * Postgres semantics here — just the JS-side reservation, refund,
 * cooldown, and rollover logic.
 */

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: { query: (...args: Parameters<QueryFn>) => queryMock(...args) },
}));

import {
  reserveCredits,
  reserveManualWithCooldown,
  refundCredits,
  checkCooldown,
  setCooldown,
  getCreditStatus,
  currentMonthStart,
  nextMonthStart,
  currentDayUtc,
  tryClaimLowBalanceNotify,
} from '../src/lib/credits';

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
});
afterEach(() => { vi.clearAllMocks(); });

// Default mock: every CREATE TABLE is a no-op, the INSERT/UPSERT in
// readOrInitCounter returns a row with whatever defaults we've set.
function mockCounter(row: Partial<{
  monthly_used: number;
  manual_daily_used: number;
  period_month: string;
  daily_date: string;
  rolled_over_month: boolean;
}>) {
  const defaults = {
    user_id: 'u1',
    monthly_used: 0,
    manual_daily_used: 0,
    period_month: currentMonthStart().toISOString().slice(0, 10),
    daily_date: currentDayUtc(),
    last_low_balance_notify_at: null,
    last_reset_notify_at: null,
    rolled_over_month: false,
    ...row,
  };
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('CREATE TABLE')) return { rows: [] };
    if (sql.includes('INSERT INTO usage_counters')) return { rows: [defaults] };
    if (sql.startsWith('UPDATE usage_counters')) {
      // Conditional increment success path — caller asserts on the
      // params they passed. Default to "blocked" (zero rows) so each
      // test must opt-in to a successful update.
      return { rows: [] };
    }
    return { rows: [] };
  });
}

describe('reserveCredits — manual', () => {
  it('reserves credits and returns remaining when under cap', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('INSERT INTO usage_counters')) {
        return { rows: [{
          user_id: 'u1',
          monthly_used: 100,
          manual_daily_used: 5,
          period_month: currentMonthStart().toISOString().slice(0, 10),
          daily_date: currentDayUtc(),
          last_low_balance_notify_at: null,
          last_reset_notify_at: null,
          rolled_over_month: false,
        }] };
      }
      if (sql.startsWith('UPDATE usage_counters')) {
        // Simulate the conditional increment landing.
        return { rows: [{ monthly_used: 110, manual_daily_used: 15 }] };
      }
      return { rows: [] };
    });
    const res = await reserveCredits('u1', 'pro', 10, 'manual');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.reserved).toBe(10);
      expect(res.remaining).toBe(2500 - 110);
      expect(res.manualRemainingToday).toBe(50 - 15);
      expect(res.monthlyCap).toBe(2500);
      expect(res.manualDailyCap).toBe(50);
    }
  });

  it('blocks when monthly cap would be exceeded', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('INSERT INTO usage_counters')) {
        return { rows: [{
          user_id: 'u1', monthly_used: 2495, manual_daily_used: 5,
          period_month: currentMonthStart().toISOString().slice(0, 10),
          daily_date: currentDayUtc(),
          last_low_balance_notify_at: null, last_reset_notify_at: null,
          rolled_over_month: false,
        }] };
      }
      if (sql.startsWith('UPDATE usage_counters')) return { rows: [] };
      return { rows: [] };
    });
    // Pro plan has monthlyCredits=2500; 2495 + 10 = 2505 > 2500.
    const res = await reserveCredits('u1', 'pro', 10, 'manual');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('monthly_exhausted');
      expect(res.remaining).toBe(2500 - 2495);
    }
  });

  it('blocks when daily manual cap would be exceeded', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('INSERT INTO usage_counters')) {
        return { rows: [{
          user_id: 'u1', monthly_used: 100, manual_daily_used: 49,
          period_month: currentMonthStart().toISOString().slice(0, 10),
          daily_date: currentDayUtc(),
          last_low_balance_notify_at: null, last_reset_notify_at: null,
          rolled_over_month: false,
        }] };
      }
      if (sql.startsWith('UPDATE usage_counters')) return { rows: [] };
      return { rows: [] };
    });
    // Pro plan dailyCap=50; 49 + 5 = 54 > 50.
    const res = await reserveCredits('u1', 'pro', 5, 'manual');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('daily_cap_reached');
      expect(res.manualRemainingToday).toBe(50 - 49);
    }
  });

  it('refuses an auto reservation on a plan that disallows scheduled runs', async () => {
    // Free plan has scheduledRuns=false. Note no DB call should be made.
    const res = await reserveCredits('u1', 'free', 5, 'auto');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('plan_disallows_auto');
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('reserveCredits — auto kind ignores daily cap', () => {
  it('does not bump the manual daily counter', async () => {
    let updateParams: unknown[] | undefined;
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('INSERT INTO usage_counters')) {
        return { rows: [{
          user_id: 'u1', monthly_used: 0, manual_daily_used: 49,
          period_month: currentMonthStart().toISOString().slice(0, 10),
          daily_date: currentDayUtc(),
          last_low_balance_notify_at: null, last_reset_notify_at: null,
          rolled_over_month: false,
        }] };
      }
      if (sql.startsWith('UPDATE usage_counters')) {
        updateParams = params;
        return { rows: [{ monthly_used: 100, manual_daily_used: 49 }] };
      }
      return { rows: [] };
    });
    // Pro: daily 49/50 is right at the line, but auto runs aren't gated
    // by daily so 100 credits go through.
    const res = await reserveCredits('u1', 'pro', 100, 'auto');
    expect(res.ok).toBe(true);
    expect(updateParams).toBeDefined();
    // Param[3] is the daily increment, which must be 0 for auto.
    expect(updateParams![2]).toBe(0);
  });
});

describe('refundCredits', () => {
  it('decrements monthly_used and (for manual) manual_daily_used', async () => {
    let params: unknown[] | undefined;
    queryMock.mockImplementation(async (sql: string, p?: unknown[]) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.startsWith('UPDATE usage_counters')) { params = p; return { rows: [] }; }
      return { rows: [] };
    });
    await refundCredits('u1', 7, 'manual');
    expect(params).toBeDefined();
    expect(params![0]).toBe('u1');
    expect(params![1]).toBe(7);
    expect(params![2]).toBe(7); // daily decrement matches for manual
  });

  it('only decrements monthly for auto-kind refunds', async () => {
    let params: unknown[] | undefined;
    queryMock.mockImplementation(async (sql: string, p?: unknown[]) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.startsWith('UPDATE usage_counters')) { params = p; return { rows: [] }; }
      return { rows: [] };
    });
    await refundCredits('u1', 12, 'auto');
    expect(params![1]).toBe(12);
    expect(params![2]).toBe(0);
  });

  it('is a no-op for zero or negative amounts', async () => {
    await refundCredits('u1', 0);
    await refundCredits('u1', -5);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('swallows DB errors (best-effort)', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      throw new Error('db down');
    });
    await expect(refundCredits('u1', 5, 'manual')).resolves.toBeUndefined();
  });
});

describe('checkCooldown / setCooldown', () => {
  it('returns inactive when cooldownSeconds=0 (Enterprise/Owner)', async () => {
    const res = await checkCooldown('u1', 'a query', 0);
    expect(res.active).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('reports remaining seconds when an entry exists', async () => {
    const future = new Date(Date.now() + 30_000).toISOString();
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('SELECT expires_at')) {
        return { rows: [{ expires_at: future }] };
      }
      return { rows: [] };
    });
    const res = await checkCooldown('u1', 'q', 30);
    expect(res.active).toBe(true);
    expect(res.remainingSeconds).toBeGreaterThan(20);
    expect(res.remainingSeconds).toBeLessThanOrEqual(30);
  });

  it('skips inserting when cooldownSeconds=0', async () => {
    await setCooldown('u1', 'q', 0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('issues an UPSERT with the right TTL', async () => {
    let params: unknown[] | undefined;
    queryMock.mockImplementation(async (sql: string, p?: unknown[]) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.startsWith('INSERT INTO prompt_cooldowns')) { params = p; return { rows: [] }; }
      return { rows: [] };
    });
    const fixedNow = new Date('2026-04-27T12:00:00Z');
    await setCooldown('u1', 'best plumbers', 30, fixedNow);
    expect(params).toBeDefined();
    expect(params![0]).toBe('u1');
    // hashed prompt is 32 hex chars
    expect(typeof params![1]).toBe('string');
    expect((params![1] as string).length).toBe(32);
    expect(params![2]).toBe('2026-04-27T12:00:30.000Z');
  });
});

describe('reserveManualWithCooldown', () => {
  it('blocks on active cooldown without consuming credits', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('SELECT expires_at')) {
        return { rows: [{ expires_at: new Date(Date.now() + 25_000).toISOString() }] };
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
      return { rows: [] };
    });
    const res = await reserveManualWithCooldown('u1', 'pro', 'q', 1);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('cooldown');
      expect(res.cooldownRemainingSeconds).toBeGreaterThan(0);
    }
  });

  it('proceeds when no cooldown is active and stamps a new one on success', async () => {
    let cooldownInsertCalled = false;
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('SELECT expires_at')) return { rows: [] };
      if (sql.startsWith('INSERT INTO prompt_cooldowns')) {
        cooldownInsertCalled = true;
        return { rows: [] };
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
    const res = await reserveManualWithCooldown('u1', 'pro', 'q', 1);
    expect(res.ok).toBe(true);
    expect(cooldownInsertCalled).toBe(true);
  });
});

describe('rollover boundaries', () => {
  it('currentMonthStart snaps to the 1st of the UTC month', () => {
    const d = new Date('2026-04-27T15:00:00Z');
    expect(currentMonthStart(d).toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('nextMonthStart advances across year-end', () => {
    const d = new Date('2026-12-15T08:00:00Z');
    expect(nextMonthStart(d).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('currentDayUtc returns YYYY-MM-DD', () => {
    expect(currentDayUtc(new Date('2026-04-27T23:59:59Z'))).toBe('2026-04-27');
  });
});

describe('getCreditStatus', () => {
  it('combines counter row with plan config', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('INSERT INTO usage_counters')) {
        return { rows: [{
          user_id: 'u1', monthly_used: 2400, manual_daily_used: 40,
          period_month: currentMonthStart().toISOString().slice(0, 10),
          daily_date: currentDayUtc(),
          last_low_balance_notify_at: null, last_reset_notify_at: null,
          rolled_over_month: false,
        }] };
      }
      return { rows: [] };
    });
    const status = await getCreditStatus('u1', 'pro');
    expect(status.plan).toBe('pro');
    expect(status.label).toBe('Pro');
    expect(status.monthlyCap).toBe(2500);
    expect(status.remaining).toBe(100);
    expect(status.manualRemainingToday).toBe(10);
    expect(status.manualDailyCap).toBe(50);
    expect(status.modelTier).toBe('economy');
    // 100/2500 = 4% < 20% => low.
    expect(status.lowBalance).toBe(true);
  });

  it('reports lowBalance=false when above the 20% threshold', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('INSERT INTO usage_counters')) {
        return { rows: [{
          user_id: 'u1', monthly_used: 500, manual_daily_used: 5,
          period_month: currentMonthStart().toISOString().slice(0, 10),
          daily_date: currentDayUtc(),
          last_low_balance_notify_at: null, last_reset_notify_at: null,
          rolled_over_month: false,
        }] };
      }
      return { rows: [] };
    });
    const status = await getCreditStatus('u1', 'pro');
    // 2000/2500 remaining = 80% — not low.
    expect(status.lowBalance).toBe(false);
    expect(status.remaining).toBe(2000);
  });
});

describe('tryClaimLowBalanceNotify', () => {
  it('claims via UPDATE … RETURNING, true if a row was matched', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.startsWith('UPDATE usage_counters')) {
        return { rows: [{ user_id: 'u1' }] };
      }
      return { rows: [] };
    });
    expect(await tryClaimLowBalanceNotify('u1')).toBe(true);
  });

  it('returns false when the row was already claimed this month', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.startsWith('UPDATE usage_counters')) return { rows: [] };
      return { rows: [] };
    });
    expect(await tryClaimLowBalanceNotify('u1')).toBe(false);
  });
});
