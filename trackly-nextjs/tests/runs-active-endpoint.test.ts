/**
 * GET /api/runs/active (user-scoped fleet view of in-progress runs).
 *
 * Verifies:
 *   - 401 unauthenticated
 *   - returns ONLY the running rows the caller can access (the SQL
 *     filters via brands.user_id OR a team_members row); the test
 *     proves the caller's id is interpolated into the params slot
 *     so a future regression that hardcodes a fixed user fails here
 *   - response shape includes last_attempt_at + progress + a `stale`
 *     boolean computed against RUN_WATCHDOG_STALE_MINUTES so the
 *     frontend can colour rows without its own threshold
 *   - empty fleet when active_runs table is absent (42P01) instead
 *     of 500 — defensive against fresh deploys where no run has been
 *     triggered yet
 *   - Cache-Control: no-store
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
import { GET as runsActiveGet } from '@/app/api/runs/active/route';

const USER_A = 'user_A';

function token(userId: string): string {
  return jwt.sign({ id: userId, email: `${userId}@test.com` }, process.env.JWT_SECRET!);
}

function request(url: string, opts: { userId?: string } = {}): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.userId) headers.set('authorization', `Bearer ${token(opts.userId)}`);
  return new Request(url, { method: 'GET', headers });
}

beforeEach(() => {
  queryFn.mockReset();
});

describe('GET /api/runs/active', () => {
  it('rejects unauthenticated requests with 401', async () => {
    queryFn.mockImplementation((sql: string) => {
      if (/SELECT email_verified FROM users/.test(sql)) {
        return { rows: [{ email_verified: true }] };
      }
      return { rows: [] };
    });
    const res = await runsActiveGet(request('http://t/api/runs/active'));
    expect(res.status).toBe(401);
  });

  it("returns the caller's running runs with progress + stale flag", async () => {
    const startedAt = new Date(Date.now() - 4 * 60_000).toISOString();
    const updatedAt = new Date(Date.now() - 1 * 60_000).toISOString();
    queryFn.mockImplementation((sql: string, params: unknown[]) => {
      if (/SELECT email_verified FROM users/.test(sql)) {
        return { rows: [{ email_verified: true }] };
      }
      if (/FROM active_runs ar[\s\S]*JOIN brands b/.test(sql)) {
        // Verify the caller's id is bound to the parameter slot used
        // in BOTH the owner branch and the team_members EXISTS clause.
        // The route binds it once (param $2) and references it twice;
        // assert at least the owner-branch param matches.
        expect(params).toContain(USER_A);
        return {
          rows: [{
            id: 'run_1',
            brand_id: 'brand_A',
            status: 'running',
            total_expected: 100,
            received: 30,
            found_count: 10,
            error_count: 2,
            platforms: ['ChatGPT'],
            started_at: startedAt,
            updated_at: updatedAt,
            last_attempt_at: updatedAt,
            last_platform_attempted: 'ChatGPT',
            last_query_attempted: 'q1',
            brand_name: 'Acme',
            stale: false,
          }],
        };
      }
      return { rows: [] };
    });

    const res = await runsActiveGet(request('http://t/api/runs/active', { userId: USER_A }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(Array.isArray(body.runs)).toBe(true);
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].runId).toBe('run_1');
    expect(body.runs[0].brandName).toBe('Acme');
    expect(body.runs[0].received).toBe(30);
    expect(body.runs[0].totalExpected).toBe(100);
    expect(body.runs[0].lastAttemptAt).toBe(updatedAt);
    expect(body.runs[0].stale).toBe(false);
    expect(typeof body.staleThresholdMinutes).toBe('number');
  });

  it('returns an empty list when the caller has no running runs', async () => {
    queryFn.mockImplementation((sql: string) => {
      if (/SELECT email_verified FROM users/.test(sql)) {
        return { rows: [{ email_verified: true }] };
      }
      if (/FROM active_runs/.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const res = await runsActiveGet(request('http://t/api/runs/active', { userId: USER_A }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runs).toEqual([]);
  });

  it('returns empty fleet (not 500) when active_runs table is missing', async () => {
    queryFn.mockImplementation((sql: string) => {
      if (/SELECT email_verified FROM users/.test(sql)) {
        return { rows: [{ email_verified: true }] };
      }
      if (/FROM active_runs/.test(sql)) {
        const e: Error & { code?: string } = new Error('relation "active_runs" does not exist');
        e.code = '42P01';
        throw e;
      }
      return { rows: [] };
    });
    const res = await runsActiveGet(request('http://t/api/runs/active', { userId: USER_A }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runs).toEqual([]);
  });
});
