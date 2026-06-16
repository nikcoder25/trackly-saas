/**
 * Tests for POST /api/admin/runs/reap.
 *
 * The route has three mutually-exclusive call shapes; this test
 * pins the validation + dispatch + audit-log contract for each.
 *
 *   { runId } → force=true delegated to reconcileStaleRuns
 *   { brandId } → force=false (gate enforced)
 *   { scope: 'stale', minAgeMinutes } → force=false; minAgeMinutes
 *     hard-floored by env-default; rejected when < floor
 *
 * Cross-mode shape requests (e.g. runId + scope) must 400 - we
 * don't want a misclick to silently pick one. Audit log emission
 * is verified to keep the forensics path honest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long-abc';

const { queryFn, reconcileFn, auditFn } = vi.hoisted(() => ({
  queryFn: vi.fn(),
  reconcileFn: vi.fn(),
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

vi.mock('@/lib/run-reconciler', async () => {
  const actual = await vi.importActual<typeof import('@/lib/run-reconciler')>('@/lib/run-reconciler');
  return {
    ...actual,
    reconcileStaleRuns: (opts: unknown) => reconcileFn(opts),
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import jwt from 'jsonwebtoken';
import { POST as reapPost } from '@/app/api/admin/runs/reap/route';

function token(userId: string): string {
  return jwt.sign({ id: userId, email: `${userId}@test.com` }, process.env.JWT_SECRET!);
}

function request(body: unknown, userId = 'u_admin'): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.set('authorization', `Bearer ${token(userId)}`);
  return new Request('http://t/api/admin/runs/reap', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  queryFn.mockReset();
  reconcileFn.mockReset();
  auditFn.mockReset();
  // Default: caller is admin.
  queryFn.mockImplementation((sql: string) => {
    if (/SELECT role FROM users/.test(sql)) {
      return Promise.resolve({ rows: [{ role: 'admin' }] });
    }
    return Promise.resolve({ rows: [] });
  });
  reconcileFn.mockResolvedValue({ count: 1, brandIds: ['brand_X'], runIds: ['run_001'] });
});

describe('POST /api/admin/runs/reap - auth', () => {
  it('401 unauthenticated', async () => {
    const req = new Request('http://t/api/admin/runs/reap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'run_001' }),
    });
    const res = await reapPost(req);
    expect(res.status).toBe(401);
  });

  it('404 for non-admin', async () => {
    queryFn.mockImplementation((sql: string) => {
      if (/SELECT role FROM users/.test(sql)) {
        return Promise.resolve({ rows: [{ role: 'user' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await reapPost(request({ runId: 'run_001' }, 'u_normal'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/runs/reap - shape validation', () => {
  it('400 when no mode is specified', async () => {
    const res = await reapPost(request({}));
    expect(res.status).toBe(400);
  });

  it('400 when more than one mode is specified', async () => {
    const res = await reapPost(request({ runId: 'run_001', brandId: 'brand_X' }));
    expect(res.status).toBe(400);
    const res2 = await reapPost(request({ runId: 'run_001', scope: 'stale' }));
    expect(res2.status).toBe(400);
  });

  it('400 on a malformed runId', async () => {
    const res = await reapPost(request({ runId: '!!bad!!' }));
    expect(res.status).toBe(400);
  });

  it('400 on a malformed brandId', async () => {
    const res = await reapPost(request({ brandId: '!!bad!!' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/runs/reap - { runId } surgical', () => {
  it('delegates to reconcileStaleRuns with force=true and audit-logs', async () => {
    const res = await reapPost(request({ runId: 'run_001' }));
    expect(res.status).toBe(200);
    expect(reconcileFn).toHaveBeenCalledTimes(1);
    const opts = reconcileFn.mock.calls[0][0];
    expect(opts.runId).toBe('run_001');
    expect(opts.force).toBe(true);
    // No bulk knobs.
    expect(opts.brandId).toBeUndefined();
    expect(opts.minAgeMinutes).toBeUndefined();

    const body = await res.json();
    expect(body.mode).toBe('runId');
    expect(body.forced).toBe(true);

    expect(auditFn).toHaveBeenCalledWith(
      'u_admin', 'runs.reap.manual', 'active_run', 'run_001',
      expect.objectContaining({ mode: 'runId', forced: true }),
    );
  });
});

describe('POST /api/admin/runs/reap - { brandId } gated', () => {
  it('delegates to reconcileStaleRuns WITHOUT force flag', async () => {
    const res = await reapPost(request({ brandId: 'brand_X' }));
    expect(res.status).toBe(200);
    const opts = reconcileFn.mock.calls[0][0];
    expect(opts.brandId).toBe('brand_X');
    expect(opts.force).toBeUndefined();
    expect(opts.runId).toBeUndefined();

    const body = await res.json();
    expect(body.mode).toBe('brandId');
    expect(body.forced).toBe(false);
  });
});

describe('POST /api/admin/runs/reap - { scope: "stale" } bulk', () => {
  it("400 when minAgeMinutes is missing", async () => {
    const res = await reapPost(request({ scope: 'stale' }));
    expect(res.status).toBe(400);
    expect(reconcileFn).not.toHaveBeenCalled();
  });

  it('400 when minAgeMinutes < env floor', async () => {
    // env floor is 10 by default (RUN_WATCHDOG_STALE_MINUTES unset)
    const res = await reapPost(request({ scope: 'stale', minAgeMinutes: 1 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.envFloor).toBeGreaterThanOrEqual(10);
    expect(reconcileFn).not.toHaveBeenCalled();
  });

  it('accepts minAgeMinutes >= env floor and delegates without force', async () => {
    const res = await reapPost(request({ scope: 'stale', minAgeMinutes: 30 }));
    expect(res.status).toBe(200);
    const opts = reconcileFn.mock.calls[0][0];
    expect(opts.minAgeMinutes).toBe(30);
    expect(opts.force).toBeUndefined();
    expect(opts.runId).toBeUndefined();
    expect(opts.brandId).toBeUndefined();

    const body = await res.json();
    expect(body.mode).toBe('stale');
    expect(body.forced).toBe(false);
    expect(body.minAgeMinutes).toBe(30);
  });
});
