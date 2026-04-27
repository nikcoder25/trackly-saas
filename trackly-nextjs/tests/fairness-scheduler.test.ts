import { describe, it, expect, beforeEach } from 'vitest';
import {
  acquirePlatformSlotFair,
  setTenantFairness,
  getTenantFairness,
  getPlatformFairnessMetrics,
  getAllFairnessMetrics,
  _resetFairnessForTests,
  type FairnessError,
} from '../src/lib/fairness-scheduler';

// Helper: deterministic acquire-then-do-nothing that returns the
// release function once the scheduler has actually granted the slot.
// `enqueuedAt` separates "added to the waiter queue" from "granted",
// which is what most fairness assertions need to reason about.
async function acquire(opts: { platform: string; tenantId?: string; weight?: number; maxConcurrent: number; maxQueueDepth?: number; signal?: AbortSignal }) {
  return acquirePlatformSlotFair(opts);
}

describe('fairness-scheduler', () => {
  beforeEach(() => {
    _resetFairnessForTests();
  });

  it('grants the slot immediately when capacity is free', async () => {
    const release = await acquire({ platform: 'P', tenantId: 't1', maxConcurrent: 2 });
    const m = getPlatformFairnessMetrics('P');
    expect(m.inFlight).toBe(1);
    expect(m.tenants).toHaveLength(1);
    expect(m.tenants[0]).toMatchObject({ tenantId: 't1', active: 1, queued: 0 });
    release();
    const after = getPlatformFairnessMetrics('P');
    expect(after.inFlight).toBe(0);
  });

  it('queues additional waiters once cap is reached and grants on release', async () => {
    const r1 = await acquire({ platform: 'P', tenantId: 't1', maxConcurrent: 1 });
    let r2: (() => void) | null = null;
    const p2 = acquire({ platform: 'P', tenantId: 't1', maxConcurrent: 1 }).then(r => { r2 = r; });

    // Yield the microtask queue so the second acquire enters the
    // waiter list before we check metrics.
    await Promise.resolve();
    const queued = getPlatformFairnessMetrics('P');
    expect(queued.inFlight).toBe(1);
    expect(queued.tenants[0].queued).toBe(1);

    r1();
    await p2;
    expect(r2).not.toBeNull();
    const after = getPlatformFairnessMetrics('P');
    expect(after.inFlight).toBe(1);
    expect(after.tenants[0].queued).toBe(0);
    (r2 as unknown as () => void)();
  });

  it('round-robins between tenants instead of FIFO', async () => {
    // Acceptance criterion from issue #410: tenant A submits 30
    // tasks; tenant B submits 1 task at t+ε; B's task must complete
    // before A's 30th task starts.
    const grantOrder: string[] = [];
    const releases: Array<() => void> = [];

    const occupy = await acquire({ platform: 'P', tenantId: 'occupy', maxConcurrent: 1 });
    // Now tenant 'occupy' holds the only slot. Queue 30 from A then 1 from B.
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 30; i++) {
      promises.push(
        acquire({ platform: 'P', tenantId: 'A', maxConcurrent: 1 }).then(rel => {
          grantOrder.push(`A${i}`);
          releases.push(rel);
        }),
      );
    }
    await new Promise(r => setImmediate(r));
    promises.push(
      acquire({ platform: 'P', tenantId: 'B', maxConcurrent: 1 }).then(rel => {
        grantOrder.push('B0');
        releases.push(rel);
      }),
    );

    await Promise.resolve();
    // Drain by releasing slots one at a time (simulates work
    // completing in real time).
    occupy();
    // Drive the dispatcher until everything has been granted.
    for (let step = 0; step < 35; step++) {
      await new Promise(r => setImmediate(r));
      const next = releases.shift();
      if (next) next();
      else break;
    }
    await Promise.all(promises);

    expect(grantOrder.length).toBe(31);
    const bIndex = grantOrder.indexOf('B0');
    // B should be granted on round 2 of the round-robin (after A0),
    // never after the 30th A grant.
    expect(bIndex).toBeLessThan(grantOrder.length - 1);
    expect(bIndex).toBeLessThanOrEqual(2);
  });

  it('honours per-tenant weight in dispatch order', async () => {
    // Tenant 'big' has weight 3, tenant 'small' has weight 1. Over a
    // round we expect ~3 grants to big for every 1 to small.
    const grants: string[] = [];
    const rels: Array<() => void> = [];

    const hold = await acquire({ platform: 'W', tenantId: 'hold', maxConcurrent: 1 });
    const ps: Promise<void>[] = [];
    for (let i = 0; i < 8; i++) {
      ps.push(acquire({ platform: 'W', tenantId: 'big', weight: 3, maxConcurrent: 1 })
        .then(r => { grants.push('big'); rels.push(r); }));
    }
    for (let i = 0; i < 8; i++) {
      ps.push(acquire({ platform: 'W', tenantId: 'small', weight: 1, maxConcurrent: 1 })
        .then(r => { grants.push('small'); rels.push(r); }));
    }
    await Promise.resolve();
    hold();
    for (let step = 0; step < 20; step++) {
      await new Promise(r => setImmediate(r));
      const next = rels.shift();
      if (next) next();
      else break;
    }
    await Promise.all(ps);

    // Within the first 4 grants we expect 3 big and 1 small (weight ratio).
    const firstFour = grants.slice(0, 4);
    const bigCount = firstFour.filter(g => g === 'big').length;
    const smallCount = firstFour.filter(g => g === 'small').length;
    expect(bigCount).toBe(3);
    expect(smallCount).toBe(1);
  });

  it('rejects with isQueueOverflow when per-tenant queue is full', async () => {
    const hold = await acquire({ platform: 'O', tenantId: 'big', maxConcurrent: 1 });
    // Queue depth of 2 - third queued request should overflow.
    const _w1 = acquire({ platform: 'O', tenantId: 'big', maxConcurrent: 1, maxQueueDepth: 2 });
    const _w2 = acquire({ platform: 'O', tenantId: 'big', maxConcurrent: 1, maxQueueDepth: 2 });
    // Don't await the queued acquires; they sit in the queue.
    await Promise.resolve();

    let caught: FairnessError | null = null;
    try {
      await acquire({ platform: 'O', tenantId: 'big', maxConcurrent: 1, maxQueueDepth: 2 });
    } catch (e) {
      caught = e as FairnessError;
    }
    expect(caught).not.toBeNull();
    expect(caught?.isQueueOverflow).toBe(true);
    expect(caught?.statusHint).toBe(429);
    expect(caught?.tenantId).toBe('big');

    const m = getPlatformFairnessMetrics('O');
    const big = m.tenants.find(t => t.tenantId === 'big')!;
    expect(big.totalRejected).toBe(1);
    expect(big.queued).toBe(2);

    hold();
    // Drain so the test doesn't leave dangling promises.
    const r1 = await _w1; r1();
    const r2 = await _w2; r2();
    // Suppress unused-locals so vitest runs in strict mode are happy.
    void _w1; void _w2;
  });

  it('aborts queued waiters cleanly when the signal fires', async () => {
    const hold = await acquire({ platform: 'A', tenantId: 't', maxConcurrent: 1 });
    const ctrl = new AbortController();
    const wait = acquire({ platform: 'A', tenantId: 't', maxConcurrent: 1, signal: ctrl.signal });
    await Promise.resolve();
    expect(getPlatformFairnessMetrics('A').tenants[0].queued).toBe(1);

    ctrl.abort();
    let err: Error | null = null;
    try { await wait; } catch (e) { err = e as Error; }
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/aborted/i);
    expect(getPlatformFairnessMetrics('A').tenants[0]?.queued ?? 0).toBe(0);

    hold();
  });

  it('exposes per-tenant active + queued metrics', async () => {
    const r1 = await acquire({ platform: 'M', tenantId: 'a', maxConcurrent: 2 });
    const r2 = await acquire({ platform: 'M', tenantId: 'b', maxConcurrent: 2 });
    // c is queued because the cap is 2.
    const cP = acquire({ platform: 'M', tenantId: 'c', maxConcurrent: 2 });
    await Promise.resolve();

    const m = getPlatformFairnessMetrics('M');
    expect(m.inFlight).toBe(2);
    expect(m.totalQueued).toBe(1);
    const tenants = Object.fromEntries(m.tenants.map(t => [t.tenantId, t]));
    expect(tenants.a.active).toBe(1);
    expect(tenants.b.active).toBe(1);
    expect(tenants.c.queued).toBe(1);

    const all = getAllFairnessMetrics();
    expect(all.find(p => p.platform === 'M')).toBeTruthy();

    r1();
    const r3 = await cP;
    r2();
    r3();
  });

  it('uses cached tenant settings when explicit opts are not provided', async () => {
    setTenantFairness('cached', { weight: 5, maxQueueDepth: 7 });
    expect(getTenantFairness('cached')).toEqual({ weight: 5, maxQueueDepth: 7 });
    const r = await acquire({ platform: 'C', tenantId: 'cached', maxConcurrent: 1 });
    // The tenant queue should have been created with the cached weight.
    const m = getPlatformFairnessMetrics('C');
    expect(m.tenants[0].weight).toBe(5);
    r();
  });

  it('does not regress raw throughput when only one tenant is active', async () => {
    // Single tenant submitting N tasks against a cap of 4 must still
    // saturate the cap - fairness should not artificially serialize a
    // single tenant.
    const tasks: Array<Promise<() => void>> = [];
    for (let i = 0; i < 8; i++) {
      tasks.push(acquire({ platform: 'T', tenantId: 'solo', maxConcurrent: 4 }));
    }
    // First 4 should already be granted on the next microtask tick.
    await Promise.resolve();
    const m = getPlatformFairnessMetrics('T');
    expect(m.inFlight).toBe(4);
    // Drain.
    for (const p of tasks) {
      const r = await Promise.race([p, Promise.resolve(null as unknown as () => void)]);
      if (typeof r === 'function') r();
      else break;
    }
    // Drain remaining queued tasks.
    for (let step = 0; step < 8; step++) {
      await new Promise(r => setImmediate(r));
    }
    for (const p of tasks) {
      const r = await Promise.race([p, Promise.resolve(null as unknown as () => void)]);
      if (typeof r === 'function') r();
    }
  });

  it('isolates platforms - tenant queue on one does not block another', async () => {
    const _ = await acquire({ platform: 'X', tenantId: 'a', maxConcurrent: 1 });
    void _;
    // Different platform Y should be totally independent.
    const r = await acquire({ platform: 'Y', tenantId: 'a', maxConcurrent: 1 });
    expect(getPlatformFairnessMetrics('X').inFlight).toBe(1);
    expect(getPlatformFairnessMetrics('Y').inFlight).toBe(1);
    r();
  });
});
