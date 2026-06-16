import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for /api/api-logs after the #459 rewire.
 *
 * Acceptance criteria from the issue:
 *   - The API Call Logs tab is no longer empty: the endpoint reads from
 *     `tenant_cost_events` (the same source the Credit Ledger uses) so
 *     `logs.length` equals the COUNT(*) of `tenant_cost_events` rows in
 *     the same (tenant, from, to, platform) window.
 *   - Tenant scoping: rows are filtered by `tenant_id = user.id`.
 *   - Auth check: requires the same verified-auth as the ledger.
 *   - Filter shape: from/to/platform parameters mirror /api/credits/ledger.
 *   - Provider USD cost is NOT in the response (#459 scope 2).
 */

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: { query: (...args: Parameters<QueryFn>) => queryMock(...args) },
}));

const requireVerifiedAuthMock = vi.fn(async () => ({ id: 'u1', email: 'a@b.com' }));
vi.mock('../src/lib/auth', () => ({
  requireVerifiedAuth: (...args: unknown[]) => requireVerifiedAuthMock(...(args as [])),
  verifyRequestAuth: vi.fn(() => ({ id: 'u1', email: 'a@b.com' })),
}));

vi.mock('../src/lib/cost-tracker', () => ({
  ensureCostEventsTable: vi.fn(async () => {}),
}));

import { GET, DELETE } from '../src/app/api/api-logs/route';

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
  requireVerifiedAuthMock.mockReset();
  requireVerifiedAuthMock.mockImplementation(async () => ({ id: 'u1', email: 'a@b.com' }));
});
afterEach(() => { vi.clearAllMocks(); });

function fakeRequest(qs = ''): Request {
  return new Request(`http://localhost/api/api-logs${qs}`, {
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
  created_at: string;
}

function makeRows(n: number, base: Date, runId: string | null = 'run_a'): PageRow[] {
  return Array.from({ length: n }).map((_, i) => ({
    id: 9000 - i,
    run_id: runId,
    platform: i % 2 === 0 ? 'ChatGPT' : 'Claude',
    model: 'gpt-4o-mini',
    tokens_in: 100 + i,
    tokens_out: 50 + i,
    created_at: new Date(base.getTime() - i * 60_000).toISOString(),
  }));
}

describe('GET /api/api-logs', () => {
  it('requires verified auth (returns the auth response when not signed in)', async () => {
    requireVerifiedAuthMock.mockImplementationOnce(async () =>
      Response.json({ error: 'Authentication required' }, { status: 401 }),
    );
    const resp = await GET(fakeRequest());
    expect(resp.status).toBe(401);
  });

  it('scopes the SELECT to the authenticated tenant_id', async () => {
    let sawTenantParam: unknown = null;
    queryMock.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        sawTenantParam = (params as unknown[])[0];
        return { rows: [] };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 0, tokens: 0 }] };
      }
      return { rows: [] };
    });
    const resp = await GET(fakeRequest());
    expect(resp.status).toBe(200);
    expect(sawTenantParam).toBe('u1');
  });

  it('logs.length equals the tenant_cost_events COUNT(*) for the same window (#459 contract)', async () => {
    // The whole point of the rewire: the API Call Logs tab must show the
    // same number of rows as the Credit Ledger does for the same window.
    // We model that by having the endpoint's COUNT(*) and SELECT both
    // resolve against an in-memory fixture, then asserting the response's
    // visible logs match the totals count.
    const base = new Date('2026-04-29T18:00:00.000Z');
    const fixtureSize = 23;
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        return { rows: makeRows(fixtureSize, base) };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: fixtureSize, tokens: 100 }] };
      }
      if (sql.includes('FROM active_runs')) return { rows: [] };
      return { rows: [] };
    });
    const resp = await GET(fakeRequest());
    const body = await resp.json();
    expect(body.logs).toHaveLength(fixtureSize);
    expect(body.totals.count).toBe(fixtureSize);
    // logs.length === totals.count is the wire form of "API Call Logs
    // count equals tenant_cost_events count for the same window".
    expect(body.logs.length).toBe(body.totals.count);
  });

  it('defaults the window to the current UTC-month start (matches the ledger)', async () => {
    let sawFrom: string | null = null;
    queryMock.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM tenant_cost_events')) {
        sawFrom = String((params as unknown[])[1]);
        if (sql.includes('COUNT(*)')) return { rows: [{ count: 0, tokens: 0 }] };
        return { rows: [] };
      }
      return { rows: [] };
    });
    const resp = await GET(fakeRequest());
    const body = await resp.json();
    const now = new Date();
    const expectedFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    expect(body.window.from).toBe(expectedFrom);
    expect(sawFrom).toBe(expectedFrom);
  });

  it('forwards platform filter as case-insensitive ANY() (same shape as ledger)', async () => {
    let sawClause = '';
    let sawArrayParam: string[] | null = null;
    queryMock.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        sawClause = sql;
        const arr = (params as unknown[]).find((p) => Array.isArray(p)) as string[] | undefined;
        if (arr) sawArrayParam = arr;
        return { rows: [] };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 0, tokens: 0 }] };
      }
      return { rows: [] };
    });
    await GET(fakeRequest('?platform=ChatGPT&platform=Claude'));
    expect(sawClause).toMatch(/LOWER\(platform\) = ANY\(\$\d+::text\[\]\)/);
    expect(sawArrayParam).toEqual(['chatgpt', 'claude']);
  });

  it('does NOT expose provider USD cost on any log row or in totals (#459 scope 2)', async () => {
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        return { rows: makeRows(2, new Date()) };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 2, tokens: 300 }] };
      }
      return { rows: [] };
    });
    const resp = await GET(fakeRequest());
    const body = await resp.json();
    expect(body.totals).not.toHaveProperty('usdCost');
    expect(body.totals).not.toHaveProperty('cost');
    for (const row of body.logs) {
      expect(row).not.toHaveProperty('usdCost');
      expect(row).not.toHaveProperty('cost');
      expect(row).not.toHaveProperty('usd_cost');
    }
    // And the SELECT must not even fetch usd_cost - there is no reason
    // for the wire response to read it; the UI never needs it.
    const selectCalls = queryMock.mock.calls
      .map((c) => String(c[0] || ''))
      .filter((s) => s.includes('FROM tenant_cost_events') && s.includes('SELECT id, run_id'));
    expect(selectCalls.length).toBeGreaterThan(0);
    for (const sql of selectCalls) {
      expect(sql).not.toMatch(/usd_cost/);
    }
  });

  it('joins active_runs to attach the first prompt as the Query column', async () => {
    queryMock.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        return { rows: [{
          id: 1, run_id: 'run_x', platform: 'ChatGPT', model: 'gpt',
          tokens_in: 1, tokens_out: 1, created_at: '2026-04-29T10:00:00.000Z',
        }] };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 1, tokens: 2 }] };
      }
      if (sql.includes('FROM active_runs')) {
        expect((params as unknown[])[0]).toEqual(['run_x']);
        return { rows: [{ id: 'run_x', queries: ['best CRM tools'] }] };
      }
      return { rows: [] };
    });
    const resp = await GET(fakeRequest());
    const body = await resp.json();
    expect(body.logs[0].query).toBe('best CRM tools');
    expect(body.logs[0].runId).toBe('run_x');
  });

  it('forwards brandId as a run_id IN (SELECT ... FROM active_runs WHERE brand_id = $N) clause', async () => {
    // Without this filter the API Call Logs tab would render rows from
    // every brand the tenant owns, so switching brands in the Topbar
    // would not change the visible logs (the bug we're fixing).
    let sawClause = '';
    let sawBrandParam: unknown = null;
    queryMock.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        sawClause = sql;
        const arr = params as unknown[];
        sawBrandParam = arr[arr.length - 2]; // last is `limit`, brand sits before it
        return { rows: [] };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 0, tokens: 0 }] };
      }
      return { rows: [] };
    });
    await GET(fakeRequest('?brandId=brand_42'));
    expect(sawClause).toMatch(/run_id IN \(SELECT id FROM active_runs WHERE brand_id = \$\d+\)/);
    expect(sawBrandParam).toBe('brand_42');
  });

  it('does NOT add the brand filter when brandId is omitted (logs are tenant-wide)', async () => {
    let sawClause = '';
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        sawClause = sql;
        return { rows: [] };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 0, tokens: 0 }] };
      }
      return { rows: [] };
    });
    await GET(fakeRequest());
    expect(sawClause).not.toMatch(/active_runs/);
    expect(sawClause).not.toMatch(/brand_id/);
  });

  it('returns an empty-state response (logs:[], totals.count:0) when window has no events', async () => {
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) return { rows: [] };
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) return { rows: [{ count: 0, tokens: 0 }] };
      return { rows: [] };
    });
    const resp = await GET(fakeRequest());
    const body = await resp.json();
    expect(body.logs).toEqual([]);
    expect(body.totals.count).toBe(0);
    expect(body.totals.errors).toBe(0);
  });

  it('orders rows newest-first and sums tokens_in + tokens_out per row', async () => {
    const base = new Date('2026-04-29T12:00:00.000Z');
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes('FROM tenant_cost_events') && sql.includes('SELECT id, run_id')) {
        expect(sql).toMatch(/ORDER BY created_at DESC, id DESC/);
        return { rows: makeRows(3, base) };
      }
      if (sql.includes('FROM tenant_cost_events') && sql.includes('COUNT(*)')) {
        return { rows: [{ count: 3, tokens: 0 }] };
      }
      return { rows: [] };
    });
    const resp = await GET(fakeRequest());
    const body = await resp.json();
    // Each fixture row has tokens_in=100+i, tokens_out=50+i.
    expect(body.logs[0].tokens).toBe(150);
    expect(body.logs[1].tokens).toBe(152);
    expect(body.logs[2].tokens).toBe(154);
  });
});

describe('DELETE /api/api-logs', () => {
  it('returns 410 Gone - the new logs view is the immutable billing ledger', async () => {
    const resp = await DELETE(fakeRequest());
    expect(resp.status).toBe(410);
  });
});
