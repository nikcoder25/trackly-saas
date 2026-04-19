import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  acquireRedisLock,
  _setRedisClientForTests,
} from '../src/lib/cron-lock';

// Minimal in-memory ioredis stand-in. Only implements the commands our lock
// uses (SET with NX/PX, and EVAL for the CAS release script) plus the async
// client hygiene bits the module expects (`on`).
interface StubStorage {
  map: Map<string, string>;
  expireAt: Map<string, number>;
}

function createStubClient(options: { failSet?: boolean; failEval?: boolean } = {}) {
  const storage: StubStorage = { map: new Map(), expireAt: new Map() };

  const evictIfExpired = (key: string) => {
    const ea = storage.expireAt.get(key);
    if (ea !== undefined && ea <= Date.now()) {
      storage.map.delete(key);
      storage.expireAt.delete(key);
    }
  };

  const calls = {
    set: [] as Array<{ key: string; value: string; ttlMs: number }>,
    eval: [] as Array<{ key: string; argv: string }>,
  };

  const client = {
    on: () => client,
    off: () => client,
    // cron-lock reads `.status` and waits for a 'ready' event when the
    // client isn't ready yet (boot-race guard). The stub is always ready,
    // so `once` is a no-op and the module proceeds straight to SET.
    status: 'ready' as const,
    once: (_event: string, _cb: () => void) => client,
    set: vi.fn(async (key: string, value: string, pxFlag: string, ttlMs: number, nxFlag: string) => {
      if (options.failSet) throw new Error('boom-set');
      expect(pxFlag).toBe('PX');
      expect(nxFlag).toBe('NX');
      calls.set.push({ key, value, ttlMs });
      evictIfExpired(key);
      if (storage.map.has(key)) return null;
      storage.map.set(key, value);
      storage.expireAt.set(key, Date.now() + ttlMs);
      return 'OK';
    }),
    eval: vi.fn(async (_script: string, _numKeys: number, key: string, argv: string) => {
      if (options.failEval) throw new Error('boom-eval');
      calls.eval.push({ key, argv });
      evictIfExpired(key);
      if (storage.map.get(key) === argv) {
        storage.map.delete(key);
        storage.expireAt.delete(key);
        return 1;
      }
      return 0;
    }),
    storage,
    calls,
  };
  return client;
}

describe('acquireRedisLock', () => {
  beforeEach(() => {
    // The module reads process.env.REDIS_URL at client-init time, but the
    // test hook injects a client directly so the env value is irrelevant.
    process.env.NODE_ENV = 'test';
  });
  afterEach(() => {
    _setRedisClientForTests(null);
  });

  it('acquires when the key is free (SET NX PX returns OK)', async () => {
    const stub = createStubClient();
    _setRedisClientForTests(stub as never);

    const result = await acquireRedisLock('jobA', 10_000);
    expect(result.status).toBe('acquired');
    if (result.status !== 'acquired') return;
    expect(result.lock.instanceId).toMatch(/^[0-9a-f-]{36}$/);

    expect(stub.calls.set).toHaveLength(1);
    expect(stub.calls.set[0].key).toBe('cron:lock:jobA');
    expect(stub.calls.set[0].ttlMs).toBe(10_000);
    expect(stub.calls.set[0].value).toBe(result.lock.instanceId);
  });

  it('skips on contention (SET NX returns null)', async () => {
    const stub = createStubClient();
    _setRedisClientForTests(stub as never);

    const first = await acquireRedisLock('jobB', 10_000);
    expect(first.status).toBe('acquired');

    const second = await acquireRedisLock('jobB', 10_000);
    expect(second.status).toBe('contended');
  });

  it('reports unavailable when SET throws (falls back to Postgres in caller)', async () => {
    const stub = createStubClient({ failSet: true });
    _setRedisClientForTests(stub as never);

    const result = await acquireRedisLock('jobC', 10_000);
    expect(result.status).toBe('unavailable');
  });

  it('release-on-finish: Lua CAS deletes the key and a new owner can acquire', async () => {
    const stub = createStubClient();
    _setRedisClientForTests(stub as never);

    const first = await acquireRedisLock('jobD', 10_000);
    expect(first.status).toBe('acquired');
    if (first.status !== 'acquired') return;

    await first.lock.release();
    expect(stub.calls.eval).toHaveLength(1);
    expect(stub.calls.eval[0].key).toBe('cron:lock:jobD');
    expect(stub.calls.eval[0].argv).toBe(first.lock.instanceId);
    expect(stub.storage.map.has('cron:lock:jobD')).toBe(false);

    const second = await acquireRedisLock('jobD', 10_000);
    expect(second.status).toBe('acquired');
  });

  it('release-on-throw: finally block still releases the lock when handler errors', async () => {
    const stub = createStubClient();
    _setRedisClientForTests(stub as never);

    const first = await acquireRedisLock('jobE', 10_000);
    expect(first.status).toBe('acquired');
    if (first.status !== 'acquired') return;

    await expect(
      (async () => {
        try {
          throw new Error('handler blew up');
        } finally {
          await first.lock.release();
        }
      })()
    ).rejects.toThrow('handler blew up');

    // Even though the handler threw, the lock was released, so the key is gone
    // and the next acquire succeeds. This is the contract the cron routes
    // depend on - otherwise a thrown cron handler would poison the lock for
    // up to TTL minutes.
    expect(stub.storage.map.has('cron:lock:jobE')).toBe(false);
    const second = await acquireRedisLock('jobE', 10_000);
    expect(second.status).toBe('acquired');
  });

  it('CAS release is a no-op when the lock has been taken over (TTL expired + new owner)', async () => {
    const stub = createStubClient();
    _setRedisClientForTests(stub as never);

    // Owner A acquires.
    const a = await acquireRedisLock('jobF', 10_000);
    expect(a.status).toBe('acquired');
    if (a.status !== 'acquired') return;

    // Simulate A's TTL expiring by directly deleting the key from the stub.
    stub.storage.map.delete('cron:lock:jobF');
    stub.storage.expireAt.delete('cron:lock:jobF');

    // Owner B acquires the same name.
    const b = await acquireRedisLock('jobF', 10_000);
    expect(b.status).toBe('acquired');
    if (b.status !== 'acquired') return;
    expect(b.lock.instanceId).not.toBe(a.lock.instanceId);

    // A belatedly releases - this must NOT delete B's lock.
    await a.lock.release();
    expect(stub.storage.map.get('cron:lock:jobF')).toBe(b.lock.instanceId);
  });

  it('release swallows Redis errors (best-effort)', async () => {
    const stub = createStubClient({ failEval: true });
    _setRedisClientForTests(stub as never);

    const result = await acquireRedisLock('jobG', 10_000);
    expect(result.status).toBe('acquired');
    if (result.status !== 'acquired') return;
    // Must not throw even though the eval rejects.
    await expect(result.lock.release()).resolves.toBeUndefined();
  });
});
