import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  acquireSlot,
  releaseSlot,
  recordRateLimit,
  isRateLimited,
  coalesceCall,
  distributedLimiterEnabled,
  __test__,
} from '../src/lib/redis-platform-state';
import { _setLimiterRedisForTests, type RedisLikeClient } from '../src/lib/redis';

/**
 * In-memory ioredis stand-in shared between simulated "pods". Implements
 * the subset of commands the limiter uses (zset ops, string set/get/del,
 * exists, pexpire, eval). The eval handler matches our two scripts by
 * substring and runs an equivalent JS implementation against the same
 * backing store, so two clients pointed at the same store really do see
 * each other's writes - which is the whole point of the cross-pod tests.
 */
interface ZSetEntry { member: string; score: number }
interface SharedStore {
  strings: Map<string, { value: string; expireAt: number | null }>;
  zsets: Map<string, ZSetEntry[]>;
  zsetExpireAt: Map<string, number>;
  // Exposed so tests can fast-forward "time" by manually expiring keys.
  expireKey(key: string): void;
}

function createSharedStore(): SharedStore {
  const strings = new Map<string, { value: string; expireAt: number | null }>();
  const zsets = new Map<string, ZSetEntry[]>();
  const zsetExpireAt = new Map<string, number>();
  return {
    strings, zsets, zsetExpireAt,
    expireKey(key: string) {
      strings.delete(key);
      zsets.delete(key);
      zsetExpireAt.delete(key);
    },
  };
}

function evictStringIfExpired(store: SharedStore, key: string): void {
  const entry = store.strings.get(key);
  if (entry?.expireAt != null && entry.expireAt <= Date.now()) {
    store.strings.delete(key);
  }
}

function evictZsetIfExpired(store: SharedStore, key: string): void {
  const ea = store.zsetExpireAt.get(key);
  if (ea != null && ea <= Date.now()) {
    store.zsets.delete(key);
    store.zsetExpireAt.delete(key);
  }
}

function getZ(store: SharedStore, key: string): ZSetEntry[] {
  evictZsetIfExpired(store, key);
  return store.zsets.get(key) ?? [];
}

function setZ(store: SharedStore, key: string, entries: ZSetEntry[]): void {
  store.zsets.set(key, entries);
}

// JS implementation of ACQUIRE_LUA. Mirrors the Lua semantics line-for-line
// against the in-memory store.
function evalAcquire(
  store: SharedStore,
  keys: string[],
  argv: string[],
): [number, string, number] {
  const [leasesK, rpmK] = keys;
  const maxConc = Number(argv[0]);
  const rpmLimit = Number(argv[1]);
  const windowMs = Number(argv[2]);
  const now = Number(argv[3]);
  const leaseId = argv[4];
  const expiry = Number(argv[5]);

  // Trim expired leases.
  let leases = getZ(store, leasesK);
  leases = leases.filter(e => e.score > now);
  setZ(store, leasesK, leases);

  if (leases.length >= maxConc) return [0, 'concurrency', 0];

  // Trim sliding window.
  const cutoff = now - windowMs;
  let rpm = getZ(store, rpmK);
  rpm = rpm.filter(e => e.score > cutoff);
  setZ(store, rpmK, rpm);

  if (rpm.length >= rpmLimit) {
    rpm.sort((a, b) => a.score - b.score);
    const oldest = rpm[0]?.score ?? now;
    const waitMs = Math.max(50, windowMs - (now - oldest) + 25);
    return [0, 'rpm', waitMs];
  }

  leases.push({ member: leaseId, score: expiry });
  setZ(store, leasesK, leases);
  rpm.push({ member: `${leaseId}:${now}`, score: now });
  setZ(store, rpmK, rpm);
  return [1, 'ok', 0];
}

function evalRecordRateLimit(
  store: SharedStore,
  keys: string[],
  argv: string[],
): [number, number] {
  const [failuresK, openK] = keys;
  const now = Number(argv[0]);
  const windowMs = Number(argv[1]);
  const threshold = Number(argv[2]);
  const cooldownMs = Number(argv[3]);
  const failureId = argv[4];
  const cutoff = now - windowMs;
  let failures = getZ(store, failuresK);
  failures = failures.filter(e => e.score > cutoff);
  failures.push({ member: failureId, score: now });
  setZ(store, failuresK, failures);
  const count = failures.length;
  evictStringIfExpired(store, openK);
  const alreadyOpen = store.strings.has(openK);
  let opened = 0;
  if (count >= threshold && !alreadyOpen) {
    store.strings.set(openK, { value: '1', expireAt: now + cooldownMs });
    opened = 1;
  }
  return [count, opened];
}

function createStubClient(store: SharedStore): RedisLikeClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = {
    status: 'ready',
    on() { return client; },
    off() { return client; },
    once() { return client; },
    async eval(script: string, _numKeys: number, ...rest: string[]) {
      // _numKeys tells us the keys/argv split; our scripts pass 2 keys.
      const keys = rest.slice(0, _numKeys);
      const argv = rest.slice(_numKeys);
      if (script.includes("'concurrency'") && script.includes('ZREMRANGEBYSCORE')) {
        return evalAcquire(store, keys, argv);
      }
      if (script.includes('threshold') && script.includes('cooldownMs')) {
        return evalRecordRateLimit(store, keys, argv);
      }
      throw new Error('stub: unrecognised lua script');
    },
    async zrem(key: string, member: string) {
      const entries = getZ(store, key);
      const next = entries.filter(e => e.member !== member);
      const removed = entries.length - next.length;
      setZ(store, key, next);
      return removed;
    },
    async exists(key: string) {
      evictStringIfExpired(store, key);
      return store.strings.has(key) ? 1 : 0;
    },
    async set(key: string, value: string, ...flags: (string | number)[]) {
      evictStringIfExpired(store, key);
      let nx = false;
      let pxMs: number | null = null;
      for (let i = 0; i < flags.length; i++) {
        const f = flags[i];
        if (f === 'NX') nx = true;
        else if (f === 'PX') {
          pxMs = Number(flags[i + 1]);
          i++;
        }
      }
      if (nx && store.strings.has(key)) return null;
      store.strings.set(key, {
        value,
        expireAt: pxMs != null ? Date.now() + pxMs : null,
      });
      return 'OK';
    },
    async get(key: string) {
      evictStringIfExpired(store, key);
      return store.strings.get(key)?.value ?? null;
    },
    async del(key: string) {
      const had = store.strings.delete(key) ? 1 : 0;
      return had;
    },
    async pexpire(key: string, ms: number) {
      const entry = store.strings.get(key);
      if (entry) {
        entry.expireAt = Date.now() + ms;
        return 1;
      }
      if (store.zsets.has(key)) {
        store.zsetExpireAt.set(key, Date.now() + ms);
        return 1;
      }
      return 0;
    },
    async pttl(key: string) {
      const entry = store.strings.get(key);
      if (entry?.expireAt) return entry.expireAt - Date.now();
      const ea = store.zsetExpireAt.get(key);
      if (ea) return ea - Date.now();
      return -1;
    },
  };
  return client as RedisLikeClient;
}

describe('redis-platform-state', () => {
  let store: SharedStore;
  let client: RedisLikeClient;

  beforeEach(() => {
    store = createSharedStore();
    client = createStubClient(store);
    _setLimiterRedisForTests(client);
    process.env.AI_DISTRIBUTED_LIMITER = 'true';
  });

  afterEach(() => {
    _setLimiterRedisForTests(null);
    delete process.env.AI_DISTRIBUTED_LIMITER;
    delete process.env.AI_REDIS_REQUIRED;
  });

  it('flag helper reflects env + client availability', () => {
    expect(distributedLimiterEnabled()).toBe(true);
    process.env.AI_DISTRIBUTED_LIMITER = 'false';
    expect(distributedLimiterEnabled()).toBe(false);
    process.env.AI_DISTRIBUTED_LIMITER = 'true';
    _setLimiterRedisForTests(null);
    expect(distributedLimiterEnabled()).toBe(false);
    _setLimiterRedisForTests(client);
  });

  describe('acquireSlot - concurrency cap', () => {
    it('honours maxConcurrent across two simulated pods sharing one Redis', async () => {
      // Both "pods" point at the same backing store; only one should get
      // the second slot at a time when maxConcurrent=2.
      const podA = createStubClient(store);
      const podB = createStubClient(store);
      _setLimiterRedisForTests(podA);
      const a1 = await acquireSlot('TestPlatform', undefined, { maxConcurrent: 2, rpm: 1000, windowMs: 60000 });
      _setLimiterRedisForTests(podB);
      const b1 = await acquireSlot('TestPlatform', undefined, { maxConcurrent: 2, rpm: 1000, windowMs: 60000 });

      // Third acquire MUST block. Race it against a 200ms timer; the
      // timer wins iff acquire is correctly waiting.
      _setLimiterRedisForTests(podA);
      const ctrl = new AbortController();
      const blocked = acquireSlot('TestPlatform', ctrl.signal, { maxConcurrent: 2, rpm: 1000, windowMs: 60000 });
      const winner = await Promise.race([
        blocked.then(() => 'acquired').catch(() => 'aborted'),
        new Promise<string>(r => setTimeout(() => r('timeout'), 200)),
      ]);
      expect(winner).toBe('timeout');

      // Release one slot from pod B - the blocked acquire on pod A
      // should now succeed.
      _setLimiterRedisForTests(podB);
      await b1.release();
      _setLimiterRedisForTests(podA);
      const a2 = await blocked;
      expect(a2.leaseId).toBeTruthy();

      await a1.release();
      await a2.release();
    });

    it('aborts the waiter cleanly on signal', async () => {
      const ctrl = new AbortController();
      // Saturate the slot.
      const a = await acquireSlot('AbortPlatform', undefined, { maxConcurrent: 1, rpm: 1000, windowMs: 60000 });
      const blocked = acquireSlot('AbortPlatform', ctrl.signal, { maxConcurrent: 1, rpm: 1000, windowMs: 60000 });
      // Give the waiter a moment to enter the poll loop, then abort.
      setTimeout(() => ctrl.abort(new Error('caller-cancel')), 50);
      await expect(blocked).rejects.toMatchObject({ name: 'AbortError' });
      await a.release();
    });

    it('honours the RPM window', async () => {
      // RPM=2 in a 60s window. Three rapid acquires from the same pod
      // should leave the third blocked behind the window reset hint.
      const a = await acquireSlot('RpmPlatform', undefined, { maxConcurrent: 5, rpm: 2, windowMs: 60000 });
      const b = await acquireSlot('RpmPlatform', undefined, { maxConcurrent: 5, rpm: 2, windowMs: 60000 });
      await a.release();
      await b.release();
      // Even though both slots are released, the RPM window still has 2
      // hits in it - the third should NOT acquire within 200ms.
      const ctrl = new AbortController();
      const third = acquireSlot('RpmPlatform', ctrl.signal, { maxConcurrent: 5, rpm: 2, windowMs: 60000 });
      const winner = await Promise.race([
        third.then(() => 'acquired').catch(() => 'aborted'),
        new Promise<string>(r => setTimeout(() => r('timeout'), 200)),
      ]);
      expect(winner).toBe('timeout');
      ctrl.abort(new Error('done'));
      await expect(third).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('recovers from a leaked slot when the lease TTL expires', async () => {
      // Simulate a crashed pod: it acquired a slot but never released.
      // The lease TTL is the recovery signal - once it expires (forced
      // here by zapping the key) the next acquire on a fresh pod can
      // claim the slot.
      const leaked = await acquireSlot('CrashPlatform', undefined, {
        maxConcurrent: 1, rpm: 1000, windowMs: 60000, leaseTtlMs: 100,
      });
      expect(leaked.leaseId).toBeTruthy();
      // Without TTL recovery, a second acquire is blocked.
      const ctrl = new AbortController();
      const blocked = acquireSlot('CrashPlatform', ctrl.signal, { maxConcurrent: 1, rpm: 1000, windowMs: 60000 });
      const a = await Promise.race([
        blocked.then(() => 'acquired').catch(() => 'aborted'),
        new Promise<string>(r => setTimeout(() => r('timeout'), 50)),
      ]);
      expect(a).toBe('timeout');
      // Forcibly expire the leases zset (simulates wall-clock advancing
      // past the lease's expiry score).
      store.expireKey(__test__.leasesKey('CrashPlatform'));
      // Next poll iteration sees an empty leases zset and acquires.
      const recovered = await blocked;
      expect(recovered.leaseId).toBeTruthy();
      expect(recovered.leaseId).not.toBe(leaked.leaseId);
      await recovered.release();
    });
  });

  describe('platform breaker', () => {
    it('opens after threshold failures and isRateLimited reports it across pods', async () => {
      const podA = createStubClient(store);
      const podB = createStubClient(store);
      _setLimiterRedisForTests(podA);
      const threshold = __test__.PLATFORM_CB_THRESHOLD;
      // Pod A absorbs threshold-1 429s.
      for (let i = 0; i < threshold - 1; i++) {
        const opened = await recordRateLimit('OpenMe');
        expect(opened).toBe(false);
      }
      // The threshold-th 429 opens the breaker.
      const opened = await recordRateLimit('OpenMe');
      expect(opened).toBe(true);
      // Pod B sees it.
      _setLimiterRedisForTests(podB);
      expect(await isRateLimited('OpenMe')).toBe(true);
    });

    it('isRateLimited returns false when no breaker key exists', async () => {
      expect(await isRateLimited('Healthy')).toBe(false);
    });
  });

  describe('coalesceCall', () => {
    it('dedups two concurrent callers to one fn execution across pods', async () => {
      const podA = createStubClient(store);
      const podB = createStubClient(store);
      let calls = 0;
      const fn = async () => {
        calls++;
        // Hold the call open long enough for the loser to enter its poll
        // loop on the same key.
        await new Promise(r => setTimeout(r, 80));
        return { text: 'ok', n: calls };
      };
      _setLimiterRedisForTests(podA);
      const aP = coalesceCall<{ text: string; n: number }>('Plat', 'q1::m1', fn, { ttlMs: 10000, pollMs: 20, budgetMs: 5000 });
      // Tiny delay so podA's SET NX wins.
      await new Promise(r => setTimeout(r, 5));
      _setLimiterRedisForTests(podB);
      const bP = coalesceCall<{ text: string; n: number }>('Plat', 'q1::m1', fn, { ttlMs: 10000, pollMs: 20, budgetMs: 5000 });

      const [a, b] = await Promise.all([aP, bP]);
      expect(calls).toBe(1);
      expect(a).toEqual({ text: 'ok', n: 1 });
      expect(b).toEqual({ text: 'ok', n: 1 });
    });

    it('falls back to direct fn() when the winner errors', async () => {
      const podA = createStubClient(store);
      const podB = createStubClient(store);
      let podACalls = 0;
      let podBCalls = 0;
      const winnerFn = async () => {
        podACalls++;
        await new Promise(r => setTimeout(r, 30));
        throw new Error('winner-boom');
      };
      const loserFn = async () => {
        podBCalls++;
        return 'loser-ran-direct';
      };
      _setLimiterRedisForTests(podA);
      const aP = coalesceCall('Plat', 'errkey', winnerFn, { ttlMs: 10000, pollMs: 10, budgetMs: 5000 });
      await new Promise(r => setTimeout(r, 5));
      _setLimiterRedisForTests(podB);
      const bP = coalesceCall<string>('Plat', 'errkey', loserFn, { ttlMs: 10000, pollMs: 10, budgetMs: 5000 });

      await expect(aP).rejects.toThrow('winner-boom');
      const b = await bP;
      expect(b).toBe('loser-ran-direct');
      expect(podACalls).toBe(1);
      expect(podBCalls).toBe(1);
    });
  });

  describe('fail-open behaviour', () => {
    it('returns a no-op release when no Redis client and AI_REDIS_REQUIRED unset', async () => {
      _setLimiterRedisForTests(null);
      const acq = await acquireSlot('NoRedis', undefined, { maxConcurrent: 1, rpm: 1, windowMs: 60000 });
      expect(acq.leaseId).toBe('');
      await expect(acq.release()).resolves.toBeUndefined();
    });

    it('throws when AI_REDIS_REQUIRED=true and no Redis client', async () => {
      _setLimiterRedisForTests(null);
      process.env.AI_REDIS_REQUIRED = 'true';
      await expect(
        acquireSlot('NoRedis', undefined, { maxConcurrent: 1, rpm: 1, windowMs: 60000 }),
      ).rejects.toThrow(/Redis required/);
    });
  });
});
