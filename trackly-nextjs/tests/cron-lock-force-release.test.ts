/**
 * Tests for `forceReleaseCronLock` + `listCronLocks` (PR-B additions).
 *
 * forceReleaseCronLock contract:
 *   - Bypasses Lua-CAS: a plain DEL on the Redis key, regardless of
 *     whether the holder is alive. Idempotent — DEL of a missing key
 *     returns 0, never throws.
 *   - DELETEs the Postgres `cron_locks` row and reports the prior
 *     locked_at + instance_id so the audit log can capture who was
 *     holding the lock at force-release time.
 *   - Both backends are best-effort: failures on one side don't
 *     abort the other, and the result object surfaces per-backend
 *     status separately.
 *
 * listCronLocks contract:
 *   - Reads BOTH backends and merges into a single CronLockSnapshot[]
 *   - Reports per-backend availability + error so the operator can
 *     tell "Redis is down" from "no locks held"
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { queryFn } = vi.hoisted(() => ({ queryFn: vi.fn() }));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => queryFn(sql, params) },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  forceReleaseCronLock,
  listCronLocks,
  _setRedisClientForTests,
} from '@/lib/cron-lock';

interface RedisStub {
  del: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  scan: ReturnType<typeof vi.fn>;
  pttl: ReturnType<typeof vi.fn>;
  on: () => unknown;
  off: () => unknown;
  status: 'ready';
  once: () => unknown;
}

function makeRedisStub(opts: {
  delResult?: number;
  failDel?: boolean;
  scanKeys?: string[];
  failScan?: boolean;
  values?: Record<string, string>;
  pttls?: Record<string, number>;
} = {}): RedisStub {
  return {
    del: vi.fn(async () => {
      if (opts.failDel) throw new Error('boom-del');
      return opts.delResult ?? 0;
    }),
    get: vi.fn(async (key: string) => opts.values?.[key] ?? null),
    scan: vi.fn(async () => {
      if (opts.failScan) throw new Error('boom-scan');
      return ['0', opts.scanKeys ?? []];
    }),
    pttl: vi.fn(async (key: string) => opts.pttls?.[key] ?? -2),
    on() { return this; },
    off() { return this; },
    status: 'ready',
    once() { return this; },
  };
}

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  queryFn.mockReset();
});
afterEach(() => {
  _setRedisClientForTests(null);
});

describe('forceReleaseCronLock', () => {
  it('issues a plain DEL on Redis and DELETE on Postgres', async () => {
    const redis = makeRedisStub({ delResult: 1 });
    _setRedisClientForTests(redis as never);

    queryFn.mockImplementation((sql: string) => {
      if (/CREATE TABLE IF NOT EXISTS cron_locks/.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      if (/SELECT locked_at, instance_id FROM cron_locks WHERE name/.test(sql)) {
        return Promise.resolve({
          rows: [{ locked_at: new Date('2026-04-28T11:00:00Z'), instance_id: 'inst_42' }],
        });
      }
      if (/DELETE FROM cron_locks WHERE name = \$1/.test(sql)) {
        return Promise.resolve({ rowCount: 1, rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const out = await forceReleaseCronLock('scheduler');

    // Redis path: plain DEL, NOT eval (no Lua-CAS).
    expect(redis.del).toHaveBeenCalledWith('cron:lock:scheduler');
    expect(out.redis.available).toBe(true);
    expect(out.redis.deleted).toBe(1);
    expect(out.redis.error).toBeNull();

    // Postgres path: prior state captured for the audit log.
    expect(out.postgres.deleted).toBe(1);
    expect(out.postgres.priorLockedAt).toBe('2026-04-28T11:00:00.000Z');
    expect(out.postgres.priorInstanceId).toBe('inst_42');
    expect(out.postgres.error).toBeNull();
  });

  it('idempotent: returns deleted=0 instead of throwing when the key is missing', async () => {
    const redis = makeRedisStub({ delResult: 0 });
    _setRedisClientForTests(redis as never);

    queryFn.mockImplementation((sql: string) => {
      if (/CREATE TABLE IF NOT EXISTS cron_locks/.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      if (/SELECT locked_at, instance_id FROM cron_locks WHERE name/.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      if (/DELETE FROM cron_locks WHERE name = \$1/.test(sql)) {
        return Promise.resolve({ rowCount: 0, rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const out = await forceReleaseCronLock('scheduler_daily');
    expect(out.redis.deleted).toBe(0);
    expect(out.redis.error).toBeNull();
    expect(out.postgres.deleted).toBe(0);
    expect(out.postgres.priorLockedAt).toBeNull();
    expect(out.postgres.priorInstanceId).toBeNull();
  });

  it('best-effort: surfaces per-backend errors without throwing', async () => {
    const redis = makeRedisStub({ failDel: true });
    _setRedisClientForTests(redis as never);

    queryFn.mockImplementation((sql: string) => {
      if (/CREATE TABLE IF NOT EXISTS cron_locks/.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      if (/SELECT locked_at, instance_id FROM cron_locks WHERE name/.test(sql)) {
        throw new Error('pg-down');
      }
      if (/DELETE FROM cron_locks WHERE name = \$1/.test(sql)) {
        throw new Error('pg-down');
      }
      return Promise.resolve({ rows: [] });
    });

    const out = await forceReleaseCronLock('reap_stale_runs');
    expect(out.redis.error).toContain('boom-del');
    expect(out.postgres.error).toBeTruthy();
    // Postgres error short-circuits before DELETE; deleted stays 0.
    expect(out.postgres.deleted).toBe(0);
  });

  it('returns redis.available=false when Redis is not configured', async () => {
    _setRedisClientForTests(null);
    const prevUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;

    queryFn.mockImplementation((sql: string) => {
      if (/CREATE TABLE IF NOT EXISTS cron_locks/.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      if (/SELECT locked_at, instance_id FROM cron_locks WHERE name/.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      if (/DELETE FROM cron_locks WHERE name = \$1/.test(sql)) {
        return Promise.resolve({ rowCount: 0, rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const out = await forceReleaseCronLock('scheduler');
    expect(out.redis.available).toBe(false);
    expect(out.redis.deleted).toBe(0);

    if (prevUrl !== undefined) process.env.REDIS_URL = prevUrl;
  });
});

describe('listCronLocks', () => {
  it('merges Redis SCAN + Postgres rows into a single snapshot', async () => {
    const redis = makeRedisStub({
      scanKeys: ['cron:lock:scheduler', 'cron:lock:reports:weekly'],
      values: {
        'cron:lock:scheduler': 'inst_1',
        'cron:lock:reports:weekly': 'inst_2',
      },
      pttls: {
        'cron:lock:scheduler': 540_000,
        'cron:lock:reports:weekly': 800_000,
      },
    });
    _setRedisClientForTests(redis as never);

    queryFn.mockImplementation((sql: string) => {
      if (/CREATE TABLE IF NOT EXISTS cron_locks/.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      if (/SELECT name, locked_at, instance_id[\s\S]*FROM cron_locks/.test(sql)) {
        return Promise.resolve({
          rows: [{
            name: 'scheduler_daily',
            locked_at: new Date('2026-04-28T10:00:00Z'),
            instance_id: 'inst_pg',
            age_seconds: 600,
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const out = await listCronLocks();
    expect(out.redis.available).toBe(true);
    expect(out.redis.error).toBeNull();
    expect(out.postgres.error).toBeNull();
    expect(out.locks.map(l => `${l.source}:${l.name}`).sort()).toEqual([
      'postgres:scheduler_daily',
      'redis:reports:weekly',
      'redis:scheduler',
    ]);
    const sched = out.locks.find(l => l.source === 'redis' && l.name === 'scheduler')!;
    expect(sched.instanceId).toBe('inst_1');
    expect(sched.ttlMs).toBe(540_000);
    const daily = out.locks.find(l => l.source === 'postgres')!;
    expect(daily.instanceId).toBe('inst_pg');
    expect(daily.ageSeconds).toBe(600);
  });

  it('reports redis.error and continues with Postgres when SCAN fails', async () => {
    const redis = makeRedisStub({ failScan: true });
    _setRedisClientForTests(redis as never);

    queryFn.mockImplementation((sql: string) => {
      if (/CREATE TABLE IF NOT EXISTS cron_locks/.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      if (/SELECT name, locked_at, instance_id[\s\S]*FROM cron_locks/.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const out = await listCronLocks();
    expect(out.redis.error).toContain('boom-scan');
    expect(out.postgres.error).toBeNull();
    expect(out.locks).toEqual([]);
  });
});
