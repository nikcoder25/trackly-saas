/**
 * Tests for GET /api/admin/runs/active.
 *
 * Verifies:
 *   - 401 unauthenticated
 *   - 404 (not 403) for non-admin — matches requireAdmin's
 *     enumeration-resistant convention used everywhere else in
 *     /api/admin/*
 *   - admin gets the fleet view with progress + age + stale flag
 *   - response shape includes brand name + owner email so the
 *     operator can decide whose run is safe to reap
 *   - `tableMissing: true` (not 500) when active_runs doesn't exist
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

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  rateLimitResponse: vi.fn(() => new Response('rate-limited', { status: 429 })),
}));

import jwt from 'jsonwebtoken';
import { GET as adminRunsActiveGet } from '@/app/api/admin/runs/active/route';

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

describe('GET /api/admin/runs/active', () => {
  it('401 unauthenticated', async () => {
    queryFn.mockImplementation(() => Promise.resolve({ rows: [] }));
    const res = await adminRunsActiveGet(request('http://t/api/admin/runs/active'));
    expect(res.status).toBe(401);
  });

  it('404 for non-admin (enumeration-resistant)', async () => {
    queryFn.mockImplementation((sql: string) => {
      if (/SELECT role FROM users/.test(sql)) {
        return Promise.resolve({ rows: [{ role: 'user' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await adminRunsActiveGet(
      request('http://t/api/admin/runs/active', { userId: 'u_normal' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns fleet view with progress + stale flag for admin', async () => {
    const startedAt = new Date(Date.now() - 4 * 60_000).toISOString();
    const updatedAt = new Date(Date.now() - 1 * 60_000).toISOString();
    queryFn.mockImplementation((sql: string) => {
      if (/SELECT role FROM users/.test(sql)) {
        return Promise.resolve({ rows: [{ role: 'admin' }] });
      }
      if (/FROM active_runs ar[\s\S]*LEFT JOIN brands b/.test(sql)) {
        return Promise.resolve({
          rows: [{
            id: 'run_1',
            brand_id: 'brand_A',
            user_id: 'owner_A',
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
            owner_email: 'a@example.com',
            age_seconds: 240,
            no_progress_seconds: 60,
            stale: false,
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await adminRunsActiveGet(
      request('http://t/api/admin/runs/active', { userId: 'u_admin' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].brandName).toBe('Acme');
    expect(body.runs[0].ownerEmail).toBe('a@example.com');
    expect(body.runs[0].received).toBe(30);
    expect(body.runs[0].totalExpected).toBe(100);
    expect(body.runs[0].stale).toBe(false);
    expect(typeof body.staleThresholdMinutes).toBe('number');
    expect(typeof body.timestamp).toBe('string');
  });

  it("returns tableMissing: true when active_runs doesn't exist", async () => {
    queryFn.mockImplementation((sql: string) => {
      if (/SELECT role FROM users/.test(sql)) {
        return Promise.resolve({ rows: [{ role: 'admin' }] });
      }
      if (/FROM active_runs/.test(sql)) {
        const e: Error & { code?: string } = new Error('relation "active_runs" does not exist');
        e.code = '42P01';
        throw e;
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await adminRunsActiveGet(
      request('http://t/api/admin/runs/active', { userId: 'u_admin' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tableMissing).toBe(true);
    expect(body.runs).toEqual([]);
  });
});
