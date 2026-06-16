/**
 * Tests for `sweepUsageCounterDrift` - the defensive layer that
 * reconciles `usage_counters.monthly_used` toward the ledger when
 * the per-run refund paths leak (host kill mid-run, refund DB hiccup,
 * pre-migration rows with no `kind`).
 *
 * Contract pinned here:
 *
 *   - Only decrements; never increases monthly_used.
 *   - Expected counter = ledger count + sum(total_expected for
 *     active 'running' rows that started this month).
 *   - Tolerance window (default 5) absorbs mid-flight reservations
 *     whose ledger row is mid-INSERT.
 *   - UPDATE is guarded by the pre-read value so a concurrent
 *     reservation that landed between SELECT and UPDATE doesn't get
 *     clobbered (the WHERE filter drops the row instead).
 *   - dryRun never writes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryFn } = vi.hoisted(() => ({
  queryFn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  pool: {
    query: (sql: string, params: unknown[] = []) => queryFn(sql, params),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { sweepUsageCounterDrift } from '@/lib/credits-sweeper';

beforeEach(() => {
  queryFn.mockReset();
});

/**
 * Stage the two SQL phases the sweeper issues:
 *   1) the CTE-driven SELECT that surfaces drift candidates
 *   2) the per-user guarded UPDATE
 */
function stage(
  candidates: Array<{
    user_id: string;
    monthly_used: number;
    ledger_used: number;
    inflight: number;
  }>,
  updateBehavior: 'ok' | 'raced' | 'throw' = 'ok',
) {
  queryFn.mockImplementation((sql: string) => {
    if (/WITH ledger AS/.test(sql)) {
      return Promise.resolve({ rows: candidates });
    }
    if (/UPDATE usage_counters[\s\S]*SET monthly_used/.test(sql)) {
      if (updateBehavior === 'throw') {
        return Promise.reject(new Error('db boom'));
      }
      return Promise.resolve({
        rows: [],
        rowCount: updateBehavior === 'ok' ? 1 : 0,
      });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

describe('sweepUsageCounterDrift - decrement only', () => {
  it('reconciles a single user with phantom-reserved credits down to the ledger', async () => {
    stage([{
      user_id: 'u_kingdom',
      monthly_used: 7999,
      ledger_used: 5324,
      inflight: 0,
    }]);

    const out = await sweepUsageCounterDrift();

    expect(out.scanned).toBe(1);
    expect(out.reconciled).toBe(1);
    expect(out.totalDecremented).toBe(2675);
    expect(out.details[0]).toEqual({
      user_id: 'u_kingdom',
      before: 7999,
      after: 5324,
      decremented: 2675,
    });
  });

  it('preserves inflight reservations - expected counter accounts for active runs', async () => {
    // 500 credits sit in an active 'running' row that hasn't yet
    // written ledger entries. The sweeper must NOT treat those as
    // drift, because reserveCredits() correctly debited the counter
    // and refundCredits() will rebalance whatever isn't dispatched.
    stage([{
      user_id: 'u_inflight',
      monthly_used: 6000,
      ledger_used: 5500,
      inflight: 500,
    }]);

    const out = await sweepUsageCounterDrift();

    // before(6000) == ledger(5500) + inflight(500) - no drift to fix.
    expect(out.reconciled).toBe(0);
    expect(out.totalDecremented).toBe(0);
  });

  it('skips users where monthly_used <= expected - never bumps the counter up', async () => {
    // The candidate query filters these out at the SQL level, so the
    // sweeper's loop should see nothing. We assert defensively that
    // even if a manually-crafted candidate row slipped through (e.g.
    // a future caller bypassed the query), the in-memory check still
    // refuses to write.
    stage([{
      user_id: 'u_clean',
      monthly_used: 3000,
      ledger_used: 4000,  // ledger > counter (impossible-in-theory)
      inflight: 0,
    }]);

    const out = await sweepUsageCounterDrift();

    expect(out.reconciled).toBe(0);
    expect(out.totalDecremented).toBe(0);
  });
});

describe('sweepUsageCounterDrift - concurrency guard', () => {
  it('treats a 0-row UPDATE result as a race and skips it without throwing', async () => {
    stage(
      [{ user_id: 'u_race', monthly_used: 8000, ledger_used: 5000, inflight: 0 }],
      'raced',
    );

    const out = await sweepUsageCounterDrift();

    // Candidate was seen but the guarded UPDATE didn't match - a
    // concurrent reservation landed between SELECT and UPDATE.
    expect(out.scanned).toBe(1);
    expect(out.reconciled).toBe(0);
    expect(out.totalDecremented).toBe(0);
  });

  it('keeps processing remaining candidates when one UPDATE throws', async () => {
    let nthUpdate = 0;
    queryFn.mockImplementation((sql: string) => {
      if (/WITH ledger AS/.test(sql)) {
        return Promise.resolve({
          rows: [
            { user_id: 'u_a', monthly_used: 7000, ledger_used: 5000, inflight: 0 },
            { user_id: 'u_b', monthly_used: 6500, ledger_used: 4500, inflight: 0 },
          ],
        });
      }
      if (/UPDATE usage_counters[\s\S]*SET monthly_used/.test(sql)) {
        nthUpdate++;
        if (nthUpdate === 1) return Promise.reject(new Error('db boom'));
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const out = await sweepUsageCounterDrift();

    expect(out.scanned).toBe(2);
    // First user threw; second user reconciled.
    expect(out.reconciled).toBe(1);
    expect(out.totalDecremented).toBe(2000); // 6500 - 4500
  });
});

describe('sweepUsageCounterDrift - dry run', () => {
  it('reports what would happen without issuing any UPDATE', async () => {
    let updateCount = 0;
    queryFn.mockImplementation((sql: string) => {
      if (/WITH ledger AS/.test(sql)) {
        return Promise.resolve({
          rows: [{ user_id: 'u_dry', monthly_used: 7999, ledger_used: 5324, inflight: 0 }],
        });
      }
      if (/UPDATE usage_counters/.test(sql)) {
        updateCount++;
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const out = await sweepUsageCounterDrift({ dryRun: true });

    expect(updateCount).toBe(0);
    expect(out.reconciled).toBe(1);
    expect(out.totalDecremented).toBe(2675);
    expect(out.details).toHaveLength(1);
  });
});

describe('sweepUsageCounterDrift - scoping', () => {
  it('passes userId into the SELECT params when scoped', async () => {
    let capturedParams: unknown[] | null = null;
    queryFn.mockImplementation((sql: string, params: unknown[]) => {
      if (/WITH ledger AS/.test(sql)) {
        capturedParams = params;
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    await sweepUsageCounterDrift({ userId: 'u_target' });

    expect(capturedParams).toBeTruthy();
    // [periodMonth, monthStart, userId]
    expect(capturedParams![2]).toBe('u_target');
  });
});

describe('sweepUsageCounterDrift - DB failure resilience', () => {
  it('returns an empty result if the candidate query throws', async () => {
    queryFn.mockImplementation((sql: string) => {
      if (/WITH ledger AS/.test(sql)) {
        return Promise.reject(new Error('connection lost'));
      }
      return Promise.resolve({ rows: [] });
    });

    const out = await sweepUsageCounterDrift();

    expect(out).toEqual({
      scanned: 0,
      reconciled: 0,
      totalDecremented: 0,
      details: [],
    });
  });
});
