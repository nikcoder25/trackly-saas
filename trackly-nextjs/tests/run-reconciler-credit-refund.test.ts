/**
 * Tests for the credit-refund pass in `finalizeStaleRow`.
 *
 * The watchdog reaper used to flip stale `active_runs` rows to
 * 'error' without refunding the credits that `reserveCredits()`
 * had committed against the user's reservation counter. Every reaped
 * run permanently inflated `usage_counters.monthly_used` until the
 * monthly reset, which on high-volume Agency-plan accounts (500
 * credits reserved per cron tick) pinned the cap gate to "out of
 * credits" within days while the ledger still showed plenty of
 * headroom — the contractor-kingdom freeze, May 2026.
 *
 * Contract pinned here:
 *
 *   - When `total_expected - received > 0` and a brand owner can be
 *     resolved, the reaper calls `refundCredits(ownerId, unused, kind)`
 *     against the brand owner (not active_runs.user_id, which for
 *     shared brands is the team-member who clicked Run).
 *   - When `received >= total_expected` there is no refund call.
 *   - When the kind column is NULL on the row (pre-migration), the
 *     refund uses 'auto' so it never over-refunds manual_daily_used
 *     for runs whose kind wasn't recorded.
 *   - When `refundCredits` throws, the reaper still appends the brand
 *     entry — the dashboard "Last Run" must advance regardless.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryFn, connectFn, refundFn } = vi.hoisted(() => ({
  queryFn: vi.fn(),
  connectFn: vi.fn(),
  refundFn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  pool: {
    query: (sql: string, params: unknown[] = []) => queryFn(sql, params),
    connect: () => connectFn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/credits', () => ({
  refundCredits: (userId: string, amount: number, kind: 'auto' | 'manual') =>
    refundFn(userId, amount, kind),
}));

import { reconcileStaleRuns } from '@/lib/run-reconciler';

beforeEach(() => {
  queryFn.mockReset();
  connectFn.mockReset();
  refundFn.mockReset();
  refundFn.mockResolvedValue(undefined);
});

interface MockSetup {
  staleRow: Record<string, unknown>;
  brandOwnerId?: string | null;
  /** Set hasKindCol=false to simulate the pre-migration schema. */
  hasKindCol?: boolean;
}

function setupMocks(opts: MockSetup) {
  const baseCols = [
    { column_name: 'status' },
    { column_name: 'started_at' },
    { column_name: 'brand_id' },
    { column_name: 'updated_at' },
    { column_name: 'completed_at' },
    { column_name: 'error' },
  ];
  if (opts.hasKindCol !== false) baseCols.push({ column_name: 'kind' });

  queryFn.mockImplementation((sql: string, params: unknown[] = []) => {
    if (/FROM information_schema\.columns/.test(sql)) {
      return Promise.resolve({ rows: baseCols });
    }
    if (/UPDATE active_runs SET[\s\S]*WHERE id = \$1 AND status = 'running'/.test(sql)) {
      return Promise.resolve({ rows: [{ id: opts.staleRow.id }], rowCount: 1 });
    }
    if (/SELECT user_id FROM brands WHERE id = \$1/.test(sql)) {
      const id = params[0];
      const owner = opts.brandOwnerId === null ? null : (opts.brandOwnerId ?? 'owner_default');
      return Promise.resolve({
        rows: owner !== null && id === opts.staleRow.brand_id
          ? [{ user_id: owner }]
          : [],
      });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });

  const client = {
    query: vi.fn((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      if (/FROM active_runs[\s\S]*FOR UPDATE SKIP LOCKED/.test(sql)) {
        return Promise.resolve({ rows: [opts.staleRow] });
      }
      if (/SELECT data FROM brands WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return Promise.resolve({ rows: [{ data: { runs: [] } }] });
      }
      if (/^UPDATE brands SET data/.test(sql)) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [] });
    }),
    release: vi.fn(),
  };
  connectFn.mockResolvedValue(client);
  return { client };
}

const fiveMinAgo = () => new Date(Date.now() - 5 * 60_000).toISOString();

describe('finalizeStaleRow refund — happy path', () => {
  it('refunds (total_expected - received) credits to the brand owner with the row kind', async () => {
    setupMocks({
      brandOwnerId: 'owner_1',
      staleRow: {
        id: 'run_1',
        brand_id: 'brand_A',
        received: 12,
        found_count: 10,
        error_count: 1,
        total_expected: 100,
        results: [],
        started_at: fiveMinAgo(),
        last_progress_at: fiveMinAgo(),
        queries: [],
        platforms: [],
        kind: 'auto',
      },
    });

    const out = await reconcileStaleRuns({});

    expect(out.count).toBe(1);
    expect(refundFn).toHaveBeenCalledTimes(1);
    expect(refundFn).toHaveBeenCalledWith('owner_1', 88, 'auto');
  });

  it('passes kind=manual through when the row was a user-triggered run', async () => {
    setupMocks({
      brandOwnerId: 'owner_2',
      staleRow: {
        id: 'run_manual',
        brand_id: 'brand_B',
        received: 0,
        found_count: 0,
        error_count: 0,
        total_expected: 25,
        results: [],
        started_at: fiveMinAgo(),
        last_progress_at: fiveMinAgo(),
        queries: [],
        platforms: [],
        kind: 'manual',
      },
    });

    await reconcileStaleRuns({});

    expect(refundFn).toHaveBeenCalledWith('owner_2', 25, 'manual');
  });
});

describe('finalizeStaleRow refund — no-op cases', () => {
  it('skips refund when received >= total_expected (fully spent run)', async () => {
    setupMocks({
      brandOwnerId: 'owner_3',
      staleRow: {
        id: 'run_full',
        brand_id: 'brand_C',
        received: 100,
        found_count: 100,
        error_count: 0,
        total_expected: 100,
        results: [],
        started_at: fiveMinAgo(),
        last_progress_at: fiveMinAgo(),
        queries: [],
        platforms: [],
        kind: 'auto',
      },
    });

    await reconcileStaleRuns({});

    expect(refundFn).not.toHaveBeenCalled();
  });

  it('skips refund when total_expected is 0 (no reservation to refund)', async () => {
    setupMocks({
      brandOwnerId: 'owner_4',
      staleRow: {
        id: 'run_zero',
        brand_id: 'brand_D',
        received: 0,
        found_count: 0,
        error_count: 0,
        total_expected: 0,
        results: [],
        started_at: fiveMinAgo(),
        last_progress_at: fiveMinAgo(),
        queries: [],
        platforms: [],
        kind: 'auto',
      },
    });

    await reconcileStaleRuns({});

    expect(refundFn).not.toHaveBeenCalled();
  });

  it('skips refund when the brand row is gone (orphaned active_run)', async () => {
    setupMocks({
      brandOwnerId: null,
      staleRow: {
        id: 'run_orphan',
        brand_id: 'brand_missing',
        received: 5,
        found_count: 0,
        error_count: 0,
        total_expected: 50,
        results: [],
        started_at: fiveMinAgo(),
        last_progress_at: fiveMinAgo(),
        queries: [],
        platforms: [],
        kind: 'auto',
      },
    });

    await reconcileStaleRuns({});

    expect(refundFn).not.toHaveBeenCalled();
  });
});

describe('finalizeStaleRow refund — pre-migration schema', () => {
  it('defaults kind to auto when the row has no kind column', async () => {
    setupMocks({
      brandOwnerId: 'owner_5',
      hasKindCol: false,
      staleRow: {
        id: 'run_premigration',
        brand_id: 'brand_E',
        received: 10,
        found_count: 5,
        error_count: 0,
        total_expected: 50,
        results: [],
        started_at: fiveMinAgo(),
        last_progress_at: fiveMinAgo(),
        queries: [],
        platforms: [],
        // SELECT returns kind=null because the column doesn't exist
        // and the query uses NULL::text fallback.
        kind: null,
      },
    });

    await reconcileStaleRuns({});

    expect(refundFn).toHaveBeenCalledWith('owner_5', 40, 'auto');
  });
});

describe('finalizeStaleRow refund — error resilience', () => {
  it('still appends the brand entry when refundCredits throws', async () => {
    refundFn.mockRejectedValueOnce(new Error('db boom'));
    const { client } = setupMocks({
      brandOwnerId: 'owner_6',
      staleRow: {
        id: 'run_refund_fail',
        brand_id: 'brand_F',
        received: 5,
        found_count: 5,
        error_count: 0,
        total_expected: 50,
        results: [],
        started_at: fiveMinAgo(),
        last_progress_at: fiveMinAgo(),
        queries: [],
        platforms: [],
        kind: 'auto',
      },
    });

    const out = await reconcileStaleRuns({});
    expect(out.count).toBe(1);

    // The brand UPDATE (which advances "Last Run") must still have
    // happened despite the refund failing.
    const brandUpdateCalls = client.query.mock.calls.filter(([sql]: [string]) =>
      /^UPDATE brands SET data/.test(sql),
    );
    expect(brandUpdateCalls.length).toBe(1);
  });
});
