import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for /api/credits/ledger.
 *
 * Covers the acceptance criteria from #455:
 *   - rows are scoped to the signed-in tenant_id
 *   - sum of credits across the visible window equals monthlyUsed
 *     (which getCreditStatus computes the same way: COUNT(*) of
 *     tenant_cost_events rows in the UTC-month window)
 *   - empty-state behavior
 *   - timezone handling (UTC bucketing of created_at)
 *
 * Plus the basic filter/pagination contract:
 *   - platform filter is forwarded to SQL
 *   - cursor pagination returns nextCursor + advances correctly
 */

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: { query: (...args: Parameters<QueryFn>) => queryMock(...args) },
}));

vi.mock('../src/lib/auth', () => ({
  requireVerifiedAuth: vi.fn(async () => ({ id: 'u1', email: 'a@b.com' })),
}));

// ensureCostEventsTable is best-effort and writes a migration on cold
// start; we don't want it touching the mocked pool.
vi.mock('../src/lib/cost-tracker', () => ({
  ensureCostEventsTable: vi.fn(async () => {}),
}));

import { GET } from '../src/app/api/credits/ledger/route';

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
});
afterEach(() => { vi.clearAllMocks(); });

function fakeRequest(qs = ''): Request {
  return new Request(`http://localhost/api/credits/ledger${qs}`, {
    headers: { cookie: 'livesov_token=fake' },
  });
}

interface PageRow {
  id: number | string;
  run_id: string | null;
  platform: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  usd_cost: string | number;
  created_at: string;
}

function makeRows(n: number, base: Date, runId = 'run_a'): PageRow[] {
  return Array.from({ length: n }).map((_, i) => ({
    id: 1000 - i,
    run_id: runId,
    platform: i % 2 === 0 ? 'ChatGPT' : 'Claude',
    model: 'gpt-4o-mini',
    tokens_in: 100 + i,
    tokens_out: 50 + i,
    usd_cost: '0.000123',
    created_at: new Date(base.getTime() - i * 60_000).toISOString(),
  }));
}

describe('GET /api/credits/ledger', () => {
  it('scopes the SELECT to the authenticated tenant_id', async () => {
    let sawTenantParam: unknown = null;
    queryMock.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        sawTenantParam = (params as unknown[])[0];
        return { rows: [] };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 0, usd_cost: '0' }] };
      }
      return { rows: [] };
    });

    const resp = await GET(fakeRequest());
    expect(resp.status).toBe(200);
    expect(sawTenantParam).toBe('u1');
  });

  it('totals.credits equals the COUNT(*) of tenant_cost_events in the window (matches monthlyUsed)', async () => {
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        return { rows: makeRows(3, new Date()) };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        // The endpoint's COUNT here mirrors what getCreditStatus uses
        // for monthlyUsed. We assert the returned `credits` exposes
        // that value directly.
        return { rows: [{ count: 47, usd_cost: '0.0577' }] };
      }
      if (sql.includes('FROM active_runs')) return { rows: [] };
      if (sql.includes('FROM brands')) return { rows: [] };
      return { rows: [] };
    });

    const resp = await GET(fakeRequest());
    const body = await resp.json();
    expect(body.totals.credits).toBe(47);
    expect(body.totals.count).toBe(47);
    expect(body.totals.usdCost).toBeCloseTo(0.0577, 4);
  });

  it('defaults the from window to the current UTC-month start', async () => {
    let sawFrom: string | null = null;
    queryMock.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM tenant_cost_events')) {
        sawFrom = String((params as unknown[])[1]);
        if (sql.includes('COUNT(*)')) return { rows: [{ count: 0, usd_cost: '0' }] };
        return { rows: [] };
      }
      return { rows: [] };
    });

    const resp = await GET(fakeRequest());
    expect(resp.status).toBe(200);
    const body = await resp.json();
    // window.from must be the UTC month start
    const now = new Date();
    const expectedFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    expect(body.window.from).toBe(expectedFrom);
    expect(sawFrom).toBe(expectedFrom);
  });

  it('forwards the platform filter to SQL with case-insensitive matching', async () => {
    let sawClause = '';
    let sawParams: unknown[] = [];
    queryMock.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        sawClause = sql;
        sawParams = (params as unknown[]).slice();
        return { rows: [] };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 0, usd_cost: '0' }] };
      }
      return { rows: [] };
    });

    await GET(fakeRequest('?platform=Perplexity'));
    expect(sawClause).toMatch(/LOWER\(platform\) = LOWER\(\$\d+\)/);
    expect(sawParams).toContain('Perplexity');
  });

  it('returns nextCursor when more rows are available and decodes back to the boundary', async () => {
    const base = new Date('2026-04-29T12:00:00.000Z');
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        // limit=2, return 3 to signal "more"
        return { rows: makeRows(3, base) };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 100, usd_cost: '0' }] };
      }
      return { rows: [] };
    });

    const resp = await GET(fakeRequest('?limit=2'));
    const body = await resp.json();
    expect(body.rows).toHaveLength(2);
    expect(body.nextCursor).toBeTruthy();

    const decoded = Buffer.from(body.nextCursor as string, 'base64url').toString('utf8');
    const [iso, id] = decoded.split('|');
    // boundary is the *last* row of the page (index 1, since we sliced
    // off the over-fetched 3rd row).
    expect(iso).toBe(new Date(base.getTime() - 60_000).toISOString());
    expect(id).toBe('999');
  });

  it('applies the cursor as a (created_at, id) keyset filter', async () => {
    let sawClause = '';
    let sawParams: unknown[] = [];
    queryMock.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        sawClause = sql;
        sawParams = (params as unknown[]).slice();
        return { rows: [] };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 0, usd_cost: '0' }] };
      }
      return { rows: [] };
    });

    const cursor = Buffer.from('2026-04-29T11:00:00.000Z|987', 'utf8').toString('base64url');
    await GET(fakeRequest(`?cursor=${cursor}`));
    expect(sawClause).toMatch(/\(created_at, id\) <[^)]*::timestamptz[^)]*::bigint/);
    expect(sawParams).toContain('2026-04-29T11:00:00.000Z');
    expect(sawParams).toContain('987');
  });

  it('caps limit at 200 and treats invalid limit as the default', async () => {
    let sawLimitParam: unknown = null;
    queryMock.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        const arr = params as unknown[];
        sawLimitParam = arr[arr.length - 1];
        return { rows: [] };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 0, usd_cost: '0' }] };
      }
      return { rows: [] };
    });

    await GET(fakeRequest('?limit=999'));
    // limit + 1 over-fetch sentinel
    expect(sawLimitParam).toBe(201);

    await GET(fakeRequest('?limit=not-a-number'));
    expect(sawLimitParam).toBe(51);
  });

  it('returns an empty-state response when the window has no events', async () => {
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        return { rows: [] };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 0, usd_cost: '0' }] };
      }
      return { rows: [] };
    });
    const resp = await GET(fakeRequest());
    const body = await resp.json();
    expect(body.rows).toEqual([]);
    expect(body.totals.credits).toBe(0);
    expect(body.nextCursor).toBeNull();
  });

  it('preserves UTC bucketing on created_at (no DST drift across the boundary)', async () => {
    // A row at 23:30 UTC on the last day of March should still fall in
    // the UTC-month window even though some local timezones are
    // already on the next day.
    const utcLateMarch = new Date('2026-03-31T23:30:00.000Z');
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        return { rows: makeRows(1, utcLateMarch) };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 1, usd_cost: '0.0001' }] };
      }
      return { rows: [] };
    });

    const resp = await GET(fakeRequest('?from=2026-03-01T00:00:00.000Z&to=2026-04-01T00:00:00.000Z'));
    const body = await resp.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].createdAt).toBe(utcLateMarch.toISOString());
    // window echoes UTC ISO
    expect(body.window.from).toBe('2026-03-01T00:00:00.000Z');
    expect(body.window.to).toBe('2026-04-01T00:00:00.000Z');
  });

  it('stamps every row as status=completed and credits=1 (the data layer #455 ships)', async () => {
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        return { rows: makeRows(2, new Date()) };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 2, usd_cost: '0' }] };
      }
      return { rows: [] };
    });
    const resp = await GET(fakeRequest());
    const body = await resp.json();
    for (const r of body.rows) {
      expect(r.status).toBe('completed');
      expect(r.credits).toBe(1);
    }
    // Sum of visible-row credits matches totals.credits → matches
    // monthlyUsed in the same window.
    const sum = body.rows.reduce((acc: number, r: { credits: number }) => acc + r.credits, 0);
    expect(sum).toBe(body.totals.credits);
  });

  it('joins active_runs to attach prompts + brand metadata to each row', async () => {
    queryMock.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        return { rows: [{
          id: 1, run_id: 'run_x', platform: 'ChatGPT', model: 'm',
          tokens_in: 0, tokens_out: 0, usd_cost: '0',
          created_at: '2026-04-29T10:00:00.000Z',
        }] };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 1, usd_cost: '0' }] };
      }
      if (sql.includes('FROM active_runs')) {
        expect((params as unknown[])[0]).toEqual(['run_x']);
        return { rows: [{ id: 'run_x', brand_id: 'b1', queries: ['best CRM', 'top CRM tools'] }] };
      }
      if (sql.includes('FROM brands')) {
        expect((params as unknown[])[0]).toEqual(['b1']);
        return { rows: [{ id: 'b1', name: 'Acme' }] };
      }
      return { rows: [] };
    });

    const resp = await GET(fakeRequest());
    const body = await resp.json();
    expect(body.rows[0].prompts).toEqual(['best CRM', 'top CRM tools']);
    expect(body.rows[0].brandId).toBe('b1');
    expect(body.rows[0].brandName).toBe('Acme');
  });
});
