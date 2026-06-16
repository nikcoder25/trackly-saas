import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Smoke tests for /api/credits/usage. We mock pg.pool query-by-query
 * so we can assert (a) the SQL fragments emitted and (b) the response
 * shape - particularly the 14-day zero-fill and the projection math.
 *
 * The auth wrapper is mocked to a verified user so we don't have to
 * stand up JWT verification just to reach the data layer.
 */

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: { query: (...args: Parameters<QueryFn>) => queryMock(...args) },
}));

vi.mock('../src/lib/auth', () => ({
  requireVerifiedAuth: vi.fn(async () => ({ id: 'u1', email: 'a@b.com' })),
}));

import { GET } from '../src/app/api/credits/usage/route';

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
});
afterEach(() => { vi.clearAllMocks(); });

function fakeRequest(): Request {
  return new Request('http://localhost/api/credits/usage', {
    headers: { cookie: 'livesov_token=fake' },
  });
}

describe('GET /api/credits/usage', () => {
  it('returns a 14-entry daily series with missing days zero-filled', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM users')) {
        return { rows: [{ plan: 'pro', trial_ends_at: null }] };
      }
      if (sql.includes("date_trunc('day'")) {
        // 3 days have data, the rest must zero-fill.
        const today = new Date().toISOString().slice(0, 10);
        const yest = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        const week = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
        return { rows: [
          { day: week, credits: 5 },
          { day: yest, credits: 12 },
          { day: today, credits: 3 },
        ] };
      }
      if (sql.includes('FROM tenant_cost_events')) {
        // last-7-day total + month-to-date - both are SUM/COUNT queries.
        return { rows: [{ c: 35 }] };
      }
      if (sql.includes('FROM active_runs')) {
        return { rows: [{
          id: 'r1', started_at: '2026-04-26T08:00:00Z',
          completed_at: '2026-04-26T08:05:00Z',
          received: 12, platforms: ['ChatGPT', 'Claude'],
        }] };
      }
      if (sql.includes('FROM brands')) {
        return { rows: [
          { id: 'b1', data: { queries: ['a', 'b', 'c'], platforms: ['ChatGPT', 'Claude'], schedule: 24, runs: [{ time: new Date(Date.now() - 3 * 86_400_000).toISOString() }] } },
          { id: 'b2', data: { queries: ['d', 'e'], platforms: ['Claude', 'Gemini'], schedule: 48, runs: [] } },
        ] };
      }
      if (sql.includes('FROM rate_limits')) {
        return { rows: [{ count: 7, reset_at: Date.now() + 14 * 86_400_000 }] };
      }
      return { rows: [] };
    });

    const resp = await GET(fakeRequest());
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.dailyUsageLast14Days).toHaveLength(14);
    // Most recent (today) should carry the 3 we returned.
    expect(body.dailyUsageLast14Days[13].credits).toBe(3);
    // Days with no rows are zero-filled.
    const zeroes = body.dailyUsageLast14Days.filter((p: { credits: number }) => p.credits === 0);
    expect(zeroes.length).toBeGreaterThanOrEqual(11);
  });

  it('computes avgDailyCredits as last-7-day total / 7', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM users')) return { rows: [{ plan: 'pro', trial_ends_at: null }] };
      if (sql.includes("date_trunc('day'")) return { rows: [] };
      if (sql.includes('FROM tenant_cost_events')) return { rows: [{ c: 70 }] };
      if (sql.includes('FROM active_runs')) return { rows: [] };
      if (sql.includes('FROM brands')) return { rows: [] };
      if (sql.includes('FROM rate_limits')) return { rows: [] };
      return { rows: [] };
    });
    const resp = await GET(fakeRequest());
    const body = await resp.json();
    expect(body.avgDailyCredits).toBe(10);
  });

  it('aggregates configuredPrompts, numActiveBrands, and activePlatforms from brands', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM users')) return { rows: [{ plan: 'pro', trial_ends_at: null }] };
      if (sql.includes("date_trunc('day'")) return { rows: [] };
      if (sql.includes('FROM tenant_cost_events')) return { rows: [{ c: 0 }] };
      if (sql.includes('FROM active_runs')) return { rows: [] };
      if (sql.includes('FROM brands')) {
        return { rows: [
          { id: 'b1', data: {
            queries: ['x', 'y', 'z'],
            platforms: ['ChatGPT', 'Claude'],
            runs: [{ time: new Date().toISOString() }],
          } },
          { id: 'b2', data: {
            queries: ['p'],
            platforms: ['Claude', 'Gemini'],
            runs: [{ time: new Date(Date.now() - 60 * 86_400_000).toISOString() }], // outside 30d
          } },
        ] };
      }
      if (sql.includes('FROM rate_limits')) return { rows: [] };
      return { rows: [] };
    });
    const resp = await GET(fakeRequest());
    const body = await resp.json();
    expect(body.configuredPrompts).toBe(4);
    expect(body.numBrands).toBe(2);
    expect(body.numActiveBrands).toBe(1); // only b1 has a recent run
    expect(body.activePlatforms.sort()).toEqual(['ChatGPT', 'Claude', 'Gemini']);
  });

  it('returns lastRun summary with platforms parsed from JSON', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM users')) return { rows: [{ plan: 'pro', trial_ends_at: null }] };
      if (sql.includes("date_trunc('day'")) return { rows: [] };
      if (sql.includes('FROM tenant_cost_events')) return { rows: [{ c: 0 }] };
      if (sql.includes('FROM active_runs')) {
        return { rows: [{
          id: 'r1', started_at: '2026-04-26T08:00:00Z',
          completed_at: '2026-04-26T08:05:00Z',
          received: 24,
          platforms: '["ChatGPT","Claude"]',
        }] };
      }
      if (sql.includes('FROM brands')) return { rows: [] };
      if (sql.includes('FROM rate_limits')) return { rows: [] };
      return { rows: [] };
    });
    const resp = await GET(fakeRequest());
    const body = await resp.json();
    expect(body.lastRun.credits).toBe(24);
    expect(body.lastRun.platforms).toEqual(['ChatGPT', 'Claude']);
    expect(body.lastRun.at).toBe('2026-04-26T08:05:00Z');
  });

  it('reads geoAuditsThisMonth from COUNT(*) of geo_audits in the current period', async () => {
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM users')) return { rows: [{ plan: 'pro', trial_ends_at: null }] };
      if (sql.includes("date_trunc('day'")) return { rows: [] };
      if (sql.includes('FROM tenant_cost_events')) return { rows: [{ c: 0 }] };
      if (sql.includes('FROM active_runs')) return { rows: [] };
      if (sql.includes('FROM brands')) return { rows: [] };
      if (sql.includes('FROM geo_audits')) {
        // Sanity: scoped to the right user + a created_at lower bound.
        expect(params).toBeDefined();
        expect(params![0]).toBe('u1');
        expect(typeof params![1]).toBe('string');
        return { rows: [{ c: 12 }] };
      }
      return { rows: [] };
    });
    const resp = await GET(fakeRequest());
    const body = await resp.json();
    expect(body.geoAuditsThisMonth).toBe(12);
    // Reset is now derived from the billing period boundary (monthEnd),
    // so it's a valid ISO 8601 timestamp rather than a rate-limit row's
    // `reset_at`. We just assert it parses.
    expect(typeof body.geoAuditsResetAt).toBe('string');
    expect(Number.isFinite(new Date(body.geoAuditsResetAt as string).getTime())).toBe(true);
  });

  it('returns 401 when the user has no row', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM users')) return { rows: [] };
      return { rows: [] };
    });
    const resp = await GET(fakeRequest());
    expect(resp.status).toBe(401);
  });
});
