import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cost-tracker unit tests (issue #411).
 *
 * The DB pool is mocked: each test wires `pool.query` to either return
 * canned rows (settings, totals) or throw, so we can exercise the cap
 * enforcement logic without touching Postgres. The mock is keyed off the
 * SQL fragment so we don't have to hand-track call ordering between the
 * concurrent settings/totals reads.
 */
type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: { query: (...args: Parameters<QueryFn>) => queryMock(...args) },
}));

import {
  estimateCostUsd,
  currentDayBoundaryUtc,
  currentMonthBoundaryUtc,
  nextDayBoundaryUtc,
  nextMonthBoundaryUtc,
  getTenantCostCaps,
  getTenantCostTotals,
  checkCostCap,
  enforceCostCap,
  recordCostEvent,
  costCapExceededBody,
  CostCapExceededError,
  DEFAULT_DAILY_CAP_USD,
  DEFAULT_MONTHLY_CAP_USD,
} from '../src/lib/cost-tracker';

beforeEach(() => {
  queryMock.mockReset();
  // Default: every query returns no rows (table-create / no-event tenant).
  queryMock.mockImplementation(async () => ({ rows: [] }));
});

afterEach(() => { vi.clearAllMocks(); });

// ── estimateCostUsd ─────────────────────────────────────────────
describe('estimateCostUsd', () => {
  it('prices a known model from MODEL_PRICING', () => {
    // gpt-4o: $2.50 / 1M input, $10.00 / 1M output
    const cost = estimateCostUsd('gpt-4o', 1_000_000, 500_000);
    // 1M * 2.50 + 0.5M * 10 = 2.50 + 5.00 = 7.50
    expect(cost).toBeCloseTo(7.5, 6);
  });

  it('prices Claude Haiku at the documented rate', () => {
    // claude-haiku-4-5-20251001: $1.00 / 1M input, $5.00 / 1M output
    const cost = estimateCostUsd('claude-haiku-4-5-20251001', 100_000, 50_000);
    // 0.1M * 1.00 + 0.05M * 5.00 = 0.10 + 0.25 = 0.35
    expect(cost).toBeCloseTo(0.35, 6);
  });

  it('falls back to a startsWith match for versioned model ids', () => {
    // 'gpt-4o-2024-08-06' should match 'gpt-4o' pricing.
    const cost = estimateCostUsd('gpt-4o-2024-08-06', 1_000_000, 0);
    expect(cost).toBeCloseTo(2.5, 6);
  });

  it('returns 0 for an unknown model rather than throwing', () => {
    expect(estimateCostUsd('made-up-model-xyz', 1000, 1000)).toBe(0);
  });

  it('treats negative or non-finite token counts as zero', () => {
    expect(estimateCostUsd('gpt-4o', -100, 0)).toBe(0);
    expect(estimateCostUsd('gpt-4o', Number.NaN, Number.NaN)).toBe(0);
    expect(estimateCostUsd('gpt-4o', Number.POSITIVE_INFINITY, 0)).toBe(0);
  });

  it('returns 0 when both token counts are zero', () => {
    expect(estimateCostUsd('gpt-4o', 0, 0)).toBe(0);
  });
});

// ── UTC boundary helpers ────────────────────────────────────────
describe('UTC boundary helpers', () => {
  it('snaps to the start of the current UTC day, regardless of clock time', () => {
    const noon = new Date('2026-04-27T12:34:56.789Z');
    expect(currentDayBoundaryUtc(noon).toISOString()).toBe('2026-04-27T00:00:00.000Z');
  });

  it('rolls into the next UTC day correctly across month-end', () => {
    const lastDayOfMonth = new Date('2026-04-30T23:59:59.000Z');
    expect(nextDayBoundaryUtc(lastDayOfMonth).toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('snaps to the first of the current UTC month', () => {
    const mid = new Date('2026-04-15T08:00:00.000Z');
    expect(currentMonthBoundaryUtc(mid).toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('rolls into the next UTC month across year-end', () => {
    const dec31 = new Date('2026-12-31T23:00:00.000Z');
    expect(nextMonthBoundaryUtc(dec31).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

// ── getTenantCostCaps ───────────────────────────────────────────
describe('getTenantCostCaps', () => {
  it('returns defaults when the tenant has no override', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ settings: {} }] });
    const caps = await getTenantCostCaps('t1');
    expect(caps).toEqual({
      dailyUsd: DEFAULT_DAILY_CAP_USD,
      monthlyUsd: DEFAULT_MONTHLY_CAP_USD,
    });
  });

  it('reads explicit dailyUsd / monthlyUsd from users.settings.cost_caps', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ settings: { cost_caps: { dailyUsd: 25, monthlyUsd: 500 } } }],
    });
    const caps = await getTenantCostCaps('t2');
    expect(caps).toEqual({ dailyUsd: 25, monthlyUsd: 500 });
  });

  it('falls back to defaults for invalid override values', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ settings: { cost_caps: { dailyUsd: -1, monthlyUsd: 'oops' } } }],
    });
    const caps = await getTenantCostCaps('t3');
    expect(caps.dailyUsd).toBe(DEFAULT_DAILY_CAP_USD);
    expect(caps.monthlyUsd).toBe(DEFAULT_MONTHLY_CAP_USD);
  });

  it('returns defaults when the DB read throws', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));
    const caps = await getTenantCostCaps('t4');
    expect(caps.dailyUsd).toBe(DEFAULT_DAILY_CAP_USD);
    expect(caps.monthlyUsd).toBe(DEFAULT_MONTHLY_CAP_USD);
  });

  it('returns defaults for an empty tenantId without hitting the DB', async () => {
    const caps = await getTenantCostCaps('');
    expect(caps.dailyUsd).toBe(DEFAULT_DAILY_CAP_USD);
    expect(caps.monthlyUsd).toBe(DEFAULT_MONTHLY_CAP_USD);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

// ── getTenantCostTotals ─────────────────────────────────────────
describe('getTenantCostTotals', () => {
  it('passes UTC day + month boundaries to the SQL aggregate', async () => {
    // Mock sequence: ensureCostEventsTable's CREATE TABLE, then the SUM query.
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('SUM')) return { rows: [{ daily: '1.234', monthly: '12.345' }] };
      return { rows: [] };
    });
    const now = new Date('2026-04-27T15:00:00.000Z');
    const totals = await getTenantCostTotals('t1', now);
    expect(totals).toEqual({ dailyUsd: 1.234, monthlyUsd: 12.345 });
    // Locate the aggregate call and verify the boundaries it received.
    const aggCall = queryMock.mock.calls.find(([sql]) => (sql as string).includes('SUM'));
    expect(aggCall).toBeDefined();
    const params = aggCall![1] as unknown[];
    expect(params[0]).toBe('t1');
    expect(params[1]).toBe('2026-04-27T00:00:00.000Z'); // day boundary
    expect(params[2]).toBe('2026-04-01T00:00:00.000Z'); // month boundary
  });

  it('returns zeros for an empty tenantId', async () => {
    const totals = await getTenantCostTotals('');
    expect(totals).toEqual({ dailyUsd: 0, monthlyUsd: 0 });
  });
});

// ── checkCostCap / enforceCostCap ───────────────────────────────
describe('checkCostCap', () => {
  function mockSettingsAndTotals(opts: {
    caps?: { dailyUsd?: number; monthlyUsd?: number };
    daily: number;
    monthly: number;
  }) {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT settings')) {
        return { rows: [{ settings: opts.caps ? { cost_caps: opts.caps } : {} }] };
      }
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('SUM')) {
        return { rows: [{ daily: String(opts.daily), monthly: String(opts.monthly) }] };
      }
      return { rows: [] };
    });
  }

  it('reports ok when both windows are under cap', async () => {
    mockSettingsAndTotals({ daily: 1.0, monthly: 5.0 });
    const status = await checkCostCap('t1', new Date('2026-04-27T12:00:00.000Z'));
    expect(status.ok).toBe(true);
    expect(status.window).toBeUndefined();
  });

  it('flags the daily window when dailyUsd >= dailyCap', async () => {
    mockSettingsAndTotals({
      caps: { dailyUsd: 10, monthlyUsd: 200 },
      daily: 10.0,
      monthly: 50.0,
    });
    const now = new Date('2026-04-27T12:00:00.000Z');
    const status = await checkCostCap('t1', now);
    expect(status.ok).toBe(false);
    expect(status.window).toBe('daily');
    expect(status.resetAt).toBe('2026-04-28T00:00:00.000Z');
  });

  it('flags the monthly window when monthlyUsd >= monthlyCap (and daily is fine)', async () => {
    mockSettingsAndTotals({
      caps: { dailyUsd: 10, monthlyUsd: 200 },
      daily: 1.0,
      monthly: 200.0,
    });
    const now = new Date('2026-04-15T08:00:00.000Z');
    const status = await checkCostCap('t1', now);
    expect(status.ok).toBe(false);
    expect(status.window).toBe('monthly');
    expect(status.resetAt).toBe('2026-05-01T00:00:00.000Z');
  });

  it('treats daily as the dominant signal when both caps are exceeded', async () => {
    // If both windows are over, the daily one resets first - prefer it
    // so the user gets the soonest-recovery message.
    mockSettingsAndTotals({
      caps: { dailyUsd: 10, monthlyUsd: 200 },
      daily: 50,
      monthly: 500,
    });
    const status = await checkCostCap('t1', new Date('2026-04-27T12:00:00.000Z'));
    expect(status.ok).toBe(false);
    expect(status.window).toBe('daily');
  });
});

describe('enforceCostCap', () => {
  function mockOver(windowOver: 'daily' | 'monthly') {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT settings')) {
        return { rows: [{ settings: { cost_caps: { dailyUsd: 10, monthlyUsd: 200 } } }] };
      }
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('SUM')) {
        return windowOver === 'daily'
          ? { rows: [{ daily: '15', monthly: '50' }] }
          : { rows: [{ daily: '5', monthly: '210' }] };
      }
      return { rows: [] };
    });
  }

  it('throws CostCapExceededError when the daily cap is reached', async () => {
    mockOver('daily');
    await expect(enforceCostCap('t1', new Date('2026-04-27T12:00:00.000Z')))
      .rejects.toBeInstanceOf(CostCapExceededError);
  });

  it('CostCapExceededError carries the spent / cap / window / resetAt fields', async () => {
    mockOver('monthly');
    try {
      await enforceCostCap('t1', new Date('2026-04-27T12:00:00.000Z'));
      throw new Error('expected enforceCostCap to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(CostCapExceededError);
      const err = e as CostCapExceededError;
      expect(err.window).toBe('monthly');
      expect(err.capUsd).toBe(200);
      expect(err.spentUsd).toBe(210);
      expect(err.resetAt).toBe('2026-05-01T00:00:00.000Z');
      expect(err.paymentRequired).toBe(true);
    }
  });

  it('returns the status quietly when both windows are under cap', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT settings')) {
        return { rows: [{ settings: { cost_caps: { dailyUsd: 10, monthlyUsd: 200 } } }] };
      }
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('SUM')) return { rows: [{ daily: '1', monthly: '2' }] };
      return { rows: [] };
    });
    const status = await enforceCostCap('t1', new Date('2026-04-27T12:00:00.000Z'));
    expect(status.ok).toBe(true);
  });
});

// ── recordCostEvent ─────────────────────────────────────────────
describe('recordCostEvent', () => {
  it('inserts into tenant_cost_events with the computed usd_cost', async () => {
    let insertParams: unknown[] | undefined;
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('INSERT INTO tenant_cost_events')) {
        insertParams = params;
        return { rows: [] };
      }
      return { rows: [] };
    });

    await recordCostEvent({
      tenantId: 'tenant-1',
      runId: 'run-9',
      platform: 'ChatGPT',
      model: 'gpt-4o',
      tokensIn: 1_000_000,
      tokensOut: 500_000,
    });

    expect(insertParams).toBeDefined();
    expect(insertParams![0]).toBe('tenant-1');
    expect(insertParams![1]).toBe('run-9');
    expect(insertParams![2]).toBe('ChatGPT');
    expect(insertParams![3]).toBe('gpt-4o');
    expect(insertParams![4]).toBe(1_000_000);
    expect(insertParams![5]).toBe(500_000);
    // Auto-derived from MODEL_PRICING: 1M*2.50 + 0.5M*10 = 7.50.
    expect(insertParams![6]).toBeCloseTo(7.5, 6);
  });

  it('respects an explicit usdCost override', async () => {
    let insertParams: unknown[] | undefined;
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('INSERT INTO tenant_cost_events')) {
        insertParams = params;
        return { rows: [] };
      }
      return { rows: [] };
    });

    await recordCostEvent({
      tenantId: 't', platform: 'Claude', model: 'claude-haiku-4-5-20251001',
      tokensIn: 100, tokensOut: 50, usdCost: 0.42, runId: null,
    });
    expect(insertParams![6]).toBe(0.42);
  });

  it('is best-effort: a DB error does not throw to the caller', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      throw new Error('insert failed');
    });
    await expect(recordCostEvent({
      tenantId: 't', platform: 'ChatGPT', model: 'gpt-4o',
      tokensIn: 10, tokensOut: 10,
    })).resolves.toBeUndefined();
  });

  it('skips entirely when tenantId is empty', async () => {
    await recordCostEvent({
      tenantId: '', platform: 'ChatGPT', model: 'gpt-4o',
      tokensIn: 10, tokensOut: 10,
    });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

// ── costCapExceededBody (HTTP 402 shape) ────────────────────────
describe('costCapExceededBody', () => {
  it('returns the canonical 402 body with code, window, cap, spent, resetAt', () => {
    const err = new CostCapExceededError({
      tenantId: 't1',
      window: 'daily',
      capUsd: 10,
      spentUsd: 11.234567,
      resetAt: new Date('2026-04-28T00:00:00.000Z'),
    });
    const body = costCapExceededBody(err);
    expect(body.code).toBe('cost_cap.exceeded');
    expect(body.window).toBe('daily');
    expect(body.capUsd).toBe(10);
    expect(body.spentUsd).toBeCloseTo(11.234567, 6);
    expect(body.resetAt).toBe('2026-04-28T00:00:00.000Z');
    // Error string is human-readable and mentions UTC window + reset time.
    expect(body.error).toMatch(/UTC daily/);
    expect(body.error).toMatch(/2026-04-28T00:00:00/);
  });
});
