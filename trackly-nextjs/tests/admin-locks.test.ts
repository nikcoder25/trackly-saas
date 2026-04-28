/**
 * Tests for GET /api/admin/locks and POST /api/admin/locks/[name]/release.
 *
 * Verifies:
 *   - GET 401 unauthenticated, 404 non-admin, snapshot for admin
 *     including per-backend availability + error fields
 *   - POST 400 for lock names outside the allowlist (operator can't
 *     accidentally DEL arbitrary cron:lock:* keys)
 *   - POST 200 for an allowlisted name; calls forceReleaseCronLock
 *     and audit-logs with the prior state from the per-backend
 *     result.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long-abc';

const { queryFn, listFn, releaseFn, auditFn } = vi.hoisted(() => ({
  queryFn: vi.fn(),
  listFn: vi.fn(),
  releaseFn: vi.fn(),
  auditFn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => queryFn(sql, params) },
  auditLog: (...args: unknown[]) => auditFn(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  rateLimitResponse: vi.fn(() => new Response('rate-limited', { status: 429 })),
}));

vi.mock('@/lib/cron-lock', () => ({
  listCronLocks: () => listFn(),
  forceReleaseCronLock: (name: string) => releaseFn(name),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import jwt from 'jsonwebtoken';
import { GET as adminLocksGet } from '@/app/api/admin/locks/route';
import { POST as adminLocksReleasePost } from '@/app/api/admin/locks/[name]/release/route';

function token(userId: string): string {
  return jwt.sign({ id: userId, email: `${userId}@test.com` }, process.env.JWT_SECRET!);
}

function request(url: string, opts: { userId?: string; method?: string } = {}): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.userId) headers.set('authorization', `Bearer ${token(opts.userId)}`);
  return new Request(url, { method: opts.method || 'GET', headers });
}

beforeEach(() => {
  queryFn.mockReset();
  listFn.mockReset();
  releaseFn.mockReset();
  auditFn.mockReset();
  // Default admin
  queryFn.mockImplementation((sql: string) => {
    if (/SELECT role FROM users/.test(sql)) {
      return Promise.resolve({ rows: [{ role: 'admin' }] });
    }
    return Promise.resolve({ rows: [] });
  });
});

describe('GET /api/admin/locks', () => {
  it('401 unauthenticated', async () => {
    const res = await adminLocksGet(request('http://t/api/admin/locks'));
    expect(res.status).toBe(401);
  });

  it('404 for non-admin', async () => {
    queryFn.mockImplementation((sql: string) => {
      if (/SELECT role FROM users/.test(sql)) {
        return Promise.resolve({ rows: [{ role: 'user' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await adminLocksGet(
      request('http://t/api/admin/locks', { userId: 'u_normal' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns the merged snapshot from listCronLocks for admin', async () => {
    listFn.mockResolvedValue({
      locks: [
        { name: 'scheduler', source: 'redis', lockedAt: null, ageSeconds: null, instanceId: 'i1', ttlMs: 540_000 },
      ],
      redis: { available: true, error: null },
      postgres: { error: null },
    });
    const res = await adminLocksGet(
      request('http://t/api/admin/locks', { userId: 'u_admin' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.locks).toHaveLength(1);
    expect(body.locks[0].name).toBe('scheduler');
    expect(body.redis.available).toBe(true);
    expect(body.postgres.error).toBeNull();
  });
});

describe('POST /api/admin/locks/[name]/release', () => {
  it('401 unauthenticated', async () => {
    const res = await adminLocksReleasePost(
      request('http://t/api/admin/locks/scheduler/release', { method: 'POST' }),
      { params: Promise.resolve({ name: 'scheduler' }) },
    );
    expect(res.status).toBe(401);
  });

  it('400 for a lock name outside the allowlist', async () => {
    const res = await adminLocksReleasePost(
      request('http://t/api/admin/locks/something_else/release', { method: 'POST', userId: 'u_admin' }),
      { params: Promise.resolve({ name: 'something_else' }) },
    );
    expect(res.status).toBe(400);
    expect(releaseFn).not.toHaveBeenCalled();
  });

  it('200 for an allowlisted name; delegates + audit-logs', async () => {
    releaseFn.mockResolvedValue({
      redis: { available: true, deleted: 1, error: null },
      postgres: { deleted: 1, priorLockedAt: '2026-04-28T11:00:00.000Z', priorInstanceId: 'inst_42', error: null },
    });

    const res = await adminLocksReleasePost(
      request('http://t/api/admin/locks/scheduler/release', { method: 'POST', userId: 'u_admin' }),
      { params: Promise.resolve({ name: 'scheduler' }) },
    );
    expect(res.status).toBe(200);
    expect(releaseFn).toHaveBeenCalledWith('scheduler');

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.name).toBe('scheduler');
    expect(body.redis.deleted).toBe(1);
    expect(body.postgres.priorInstanceId).toBe('inst_42');

    expect(auditFn).toHaveBeenCalledWith(
      'u_admin', 'cron_locks.force_release', 'cron_lock', 'scheduler',
      expect.objectContaining({
        redis_available: true,
        redis_deleted: 1,
        postgres_deleted: 1,
        prior_instance_id: 'inst_42',
      }),
    );
  });

  it('accepts every name in the allowlist (smoke)', async () => {
    releaseFn.mockResolvedValue({
      redis: { available: false, deleted: 0, error: null },
      postgres: { deleted: 0, priorLockedAt: null, priorInstanceId: null, error: null },
    });
    for (const name of ['scheduler', 'scheduler_daily', 'reconcile-payments', 'reports:weekly', 'reports:monthly', 'reap_stale_runs']) {
      const res = await adminLocksReleasePost(
        request(`http://t/api/admin/locks/${encodeURIComponent(name)}/release`, { method: 'POST', userId: 'u_admin' }),
        { params: Promise.resolve({ name }) },
      );
      expect(res.status).toBe(200);
    }
  });
});
