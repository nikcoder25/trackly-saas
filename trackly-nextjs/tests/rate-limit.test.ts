import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The rate limiter falls back to an in-process Map when the DB call
// rejects, so we can exercise the full user+IP logic without a real
// Postgres by forcing every pool.query to throw. That path is
// documented in src/lib/rate-limit.ts:94.
vi.mock('../src/lib/db', () => ({
  pool: {
    query: vi.fn(async () => { throw new Error('no db in test'); }),
  },
}));

import { checkUserIpRateLimit, getClientIp } from '../src/lib/rate-limit';

describe('getClientIp', () => {
  it('takes the first entry of X-Forwarded-For', () => {
    const req = new Request('http://localhost/x', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    });
    expect(getClientIp(req)).toBe('203.0.113.5');
  });

  it('falls back to X-Real-IP', () => {
    const req = new Request('http://localhost/x', {
      headers: { 'x-real-ip': '198.51.100.7' },
    });
    expect(getClientIp(req)).toBe('198.51.100.7');
  });

  it('returns "unknown" when nothing is present', () => {
    const req = new Request('http://localhost/x');
    expect(getClientIp(req)).toBe('unknown');
  });
});

describe('checkUserIpRateLimit', () => {
  // Each test uses a distinct bucket so counters from a previous test
  // don't bleed in via the in-process Map fallback.
  let bucket: string;
  beforeEach(() => { bucket = `test-${Math.random().toString(36).slice(2)}`; });
  afterEach(() => { vi.clearAllMocks(); });

  it('allows requests under the per-user limit, blocks on the one that exceeds it', async () => {
    const userId = 'u-' + bucket;
    const ip = '203.0.113.10';
    const limits = { user: { max: 3, windowMs: 60_000 } };

    for (let i = 0; i < 3; i++) {
      const r = await checkUserIpRateLimit(bucket, userId, ip, limits);
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkUserIpRateLimit(bucket, userId, ip, limits);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('enforces a separate IP bucket when both limits are configured', async () => {
    const ip = '198.51.100.20';
    const limits = {
      user: { max: 100, windowMs: 60_000 },
      ip: { max: 2, windowMs: 60_000 },
    };

    // Different users, same IP - the IP bucket should trip on the third.
    expect((await checkUserIpRateLimit(bucket, 'user-a', ip, limits)).allowed).toBe(true);
    expect((await checkUserIpRateLimit(bucket, 'user-b', ip, limits)).allowed).toBe(true);
    const blocked = await checkUserIpRateLimit(bucket, 'user-c', ip, limits);
    expect(blocked.allowed).toBe(false);
  });

  it('skips the user check when userId is falsy', async () => {
    // Unauthenticated caller: only the IP bucket should be consulted.
    const limits = { user: { max: 1, windowMs: 60_000 }, ip: { max: 5, windowMs: 60_000 } };
    for (let i = 0; i < 5; i++) {
      const r = await checkUserIpRateLimit(bucket, null, '192.0.2.1', limits);
      expect(r.allowed).toBe(true);
    }
  });

  it('keeps buckets isolated by namespace', async () => {
    const limits = { user: { max: 1, windowMs: 60_000 } };
    const userId = 'shared-user';
    // Burn the budget in bucket A.
    expect((await checkUserIpRateLimit(bucket + '-a', userId, null, limits)).allowed).toBe(true);
    expect((await checkUserIpRateLimit(bucket + '-a', userId, null, limits)).allowed).toBe(false);
    // Bucket B must start fresh for the same user.
    expect((await checkUserIpRateLimit(bucket + '-b', userId, null, limits)).allowed).toBe(true);
  });
});
