/**
 * Tests for GET /api/cron/reap-stale-runs.
 *
 * Verifies:
 *   - 401 when CRON_SECRET is missing or wrong
 *   - 500 when CRON_SECRET is unset (configuration check)
 *   - acquires a `reap_stale_runs` cron lock; on contention returns
 *     { skipped: true, reason: 'locked' }
 *   - on success delegates to reconcileStaleRuns and includes the
 *     reconciled count + brand_ids + run_ids in the JSON response
 *   - releases the lock in the finally block (no leaks even when
 *     the reconciler throws)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { acquireFn, releaseFn, reconcileFn } = vi.hoisted(() => ({
  acquireFn: vi.fn(),
  releaseFn: vi.fn(),
  reconcileFn: vi.fn(),
}));

vi.mock('@/lib/cron-lock', () => ({
  acquireCronLock: (...args: unknown[]) => acquireFn(...args),
}));

vi.mock('@/lib/run-reconciler', () => ({
  reconcileStaleRuns: (opts: unknown) => reconcileFn(opts),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET as reapCron } from '@/app/api/cron/reap-stale-runs/route';

function request(secret?: string): Request {
  const headers = new Headers();
  if (secret !== undefined) headers.set('authorization', `Bearer ${secret}`);
  return new Request('http://t/api/cron/reap-stale-runs', { method: 'GET', headers });
}

beforeEach(() => {
  acquireFn.mockReset();
  releaseFn.mockReset();
  reconcileFn.mockReset();
  process.env.CRON_SECRET = 'super-secret-test-token-32-chars!';
  acquireFn.mockResolvedValue({ instanceId: 'inst_1', release: releaseFn });
});

describe('GET /api/cron/reap-stale-runs — auth', () => {
  it('500 when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET;
    const res = await reapCron(request('any'));
    expect(res.status).toBe(500);
  });

  it('401 with no Authorization header', async () => {
    const res = await reapCron(request());
    expect(res.status).toBe(401);
  });

  it('401 with the wrong bearer token', async () => {
    const res = await reapCron(request('this-is-wrong-token-of-correct-len'));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/cron/reap-stale-runs — locking', () => {
  it("returns { skipped: true, reason: 'locked' } when acquire returns null", async () => {
    acquireFn.mockResolvedValueOnce(null);
    const res = await reapCron(request(process.env.CRON_SECRET!));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe('locked');
    expect(reconcileFn).not.toHaveBeenCalled();
    expect(releaseFn).not.toHaveBeenCalled();
  });

  it("acquires the 'reap_stale_runs' lock with a 10-min stale window", async () => {
    reconcileFn.mockResolvedValue({ count: 0, brandIds: [], runIds: [] });
    await reapCron(request(process.env.CRON_SECRET!));
    expect(acquireFn).toHaveBeenCalledWith('reap_stale_runs', 10);
  });
});

describe('GET /api/cron/reap-stale-runs — reconcile', () => {
  it('returns the reconciled count + brand/run ids + duration on success', async () => {
    reconcileFn.mockResolvedValue({
      count: 3,
      brandIds: ['b1', 'b2', 'b3'],
      runIds: ['r1', 'r2', 'r3'],
    });
    const res = await reapCron(request(process.env.CRON_SECRET!));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.reconciled).toBe(3);
    expect(body.brandIds).toEqual(['b1', 'b2', 'b3']);
    expect(body.runIds).toEqual(['r1', 'r2', 'r3']);
    expect(typeof body.durationMs).toBe('number');
    expect(typeof body.timestamp).toBe('string');
    expect(releaseFn).toHaveBeenCalledTimes(1);
  });

  it('500 when the reconciler throws — but releases the lock', async () => {
    reconcileFn.mockRejectedValue(new Error('db blew up'));
    const res = await reapCron(request(process.env.CRON_SECRET!));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('db blew up');
    // Lock must be released in the finally block.
    expect(releaseFn).toHaveBeenCalledTimes(1);
  });
});
