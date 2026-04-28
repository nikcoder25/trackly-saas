/**
 * GET /api/brands/[id]/run-status (no runId).
 *
 * Verifies:
 *   - returns the in-progress row when one exists (status='running'
 *     prioritized via the SQL ORDER BY)
 *   - falls back to most recent terminal row when nothing is running
 *   - returns { status: 'none' } when the brand has no rows at all
 *   - 404 when the caller lacks access to the brand (IDOR protection
 *     mirrors the rest of the brand-scoped routes)
 *   - 401 unauthenticated
 *   - response body includes last_attempt_at + progress fields so
 *     the user can tell stuck from slow without admin access
 *   - Cache-Control: no-store (defensively prevents an edge cache from
 *     pinning a stale 'running' row after it terminates)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long-abc';

const { queryFn } = vi.hoisted(() => ({ queryFn: vi.fn() }));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => queryFn(sql, params) },
  ensureColumns: vi.fn().mockResolvedValue(undefined),
  auditLog: vi.fn(),
}));

import jwt from 'jsonwebtoken';
import { GET as runStatusGet } from '@/app/api/brands/[id]/run-status/route';

const USER_A = 'user_A';
const USER_B = 'user_B';

function token(userId: string): string {
  return jwt.sign({ id: userId, email: `${userId}@test.com` }, process.env.JWT_SECRET!);
}

function request(url: string, opts: { userId?: string } = {}): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.userId) headers.set('authorization', `Bearer ${token(opts.userId)}`);
  return new Request(url, { method: 'GET', headers });
}

interface QueryRouter {
  brandsForOwner?: (brandId: string, userId: string) => unknown[];
  brandsForTeam?: (brandId: string, userId: string) => unknown[];
  activeRuns?: (brandId: string) => unknown[];
}

function defaultResponder(router: QueryRouter = {}) {
  return (sql: string, params: unknown[]) => {
    if (/SELECT email_verified FROM users/.test(sql)) {
      return { rows: [{ email_verified: true }] };
    }
    if (/SELECT \* FROM brands WHERE id = \$1 AND user_id = \$2/.test(sql)) {
      const rows = router.brandsForOwner?.(params[0] as string, params[1] as string) ?? [];
      return { rows };
    }
    if (/JOIN team_members tm/.test(sql)) {
      const rows = router.brandsForTeam?.(params[0] as string, params[1] as string) ?? [];
      return { rows };
    }
    if (/FROM active_runs[\s\S]*WHERE brand_id = \$1/.test(sql)) {
      const rows = router.activeRuns?.(params[0] as string) ?? [];
      return { rows };
    }
    return { rows: [] };
  };
}

beforeEach(() => {
  queryFn.mockReset();
});

describe('GET /api/brands/:id/run-status (no runId)', () => {
  it('rejects unauthenticated requests with 401', async () => {
    queryFn.mockImplementation(defaultResponder());
    const res = await runStatusGet(
      request('http://t/api/brands/brand_A/run-status'),
      { params: Promise.resolve({ id: 'brand_A' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on a malformed brand id (would otherwise flow into SQL)', async () => {
    queryFn.mockImplementation(defaultResponder());
    const res = await runStatusGet(
      request('http://t/api/brands/!!bad!!/run-status', { userId: USER_A }),
      { params: Promise.resolve({ id: '!!bad!!' }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when USER_A asks about USER_B's brand", async () => {
    queryFn.mockImplementation(defaultResponder({
      brandsForOwner: () => [],
      brandsForTeam: () => [],
    }));
    const res = await runStatusGet(
      request('http://t/api/brands/brand_B/run-status', { userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_B' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns the running row with progress + last_attempt_at when present', async () => {
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    const updatedAt = new Date(Date.now() - 5_000).toISOString();
    const lastAttempt = new Date(Date.now() - 2_000).toISOString();

    queryFn.mockImplementation(defaultResponder({
      brandsForOwner: () => [{ id: 'brand_A', user_id: USER_A, data: { name: 'Acme' } }],
      activeRuns: () => [{
        id: 'run_running',
        brand_id: 'brand_A',
        status: 'running',
        total_expected: 50,
        received: 12,
        found_count: 4,
        error_count: 1,
        platforms: ['ChatGPT', 'Claude'],
        queries: ['q1'],
        started_at: startedAt,
        updated_at: updatedAt,
        completed_at: null,
        last_attempt_at: lastAttempt,
        last_platform_attempted: 'Claude',
        last_query_attempted: 'q1',
      }],
    }));

    const res = await runStatusGet(
      request('http://t/api/brands/brand_A/run-status', { userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_A' }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.status).toBe('running');
    expect(body.runId).toBe('run_running');
    expect(body.received).toBe(12);
    expect(body.totalExpected).toBe(50);
    expect(body.lastAttemptAt).toBe(lastAttempt);
    expect(body.lastPlatformAttempted).toBe('Claude');
    expect(body.lastQueryAttempted).toBe('q1');
  });

  it('falls back to the most recent terminal row when no run is active', async () => {
    const completedAt = new Date(Date.now() - 60_000).toISOString();
    queryFn.mockImplementation(defaultResponder({
      brandsForOwner: () => [{ id: 'brand_A', user_id: USER_A, data: { name: 'Acme' } }],
      // The route's ORDER BY ((status='running') DESC, started_at DESC)
      // will pick the most recent terminal row when no running row
      // exists. Our mock just returns whatever the SQL would return —
      // here we hand back a single 'done' row.
      activeRuns: () => [{
        id: 'run_done',
        brand_id: 'brand_A',
        status: 'done',
        total_expected: 50,
        received: 50,
        found_count: 22,
        error_count: 0,
        platforms: ['ChatGPT'],
        queries: ['q1'],
        started_at: new Date(Date.now() - 90_000).toISOString(),
        updated_at: completedAt,
        completed_at: completedAt,
        last_attempt_at: null,
        last_platform_attempted: null,
        last_query_attempted: null,
      }],
    }));

    const res = await runStatusGet(
      request('http://t/api/brands/brand_A/run-status', { userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_A' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('done');
    expect(body.runId).toBe('run_done');
    expect(body.completedAt).toBe(completedAt);
  });

  it("returns { status: 'none' } when the brand has no runs at all", async () => {
    queryFn.mockImplementation(defaultResponder({
      brandsForOwner: () => [{ id: 'brand_A', user_id: USER_A, data: { name: 'Acme' } }],
      activeRuns: () => [],
    }));

    const res = await runStatusGet(
      request('http://t/api/brands/brand_A/run-status', { userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_A' }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.status).toBe('none');
    expect(body.brandId).toBe('brand_A');
  });
});
