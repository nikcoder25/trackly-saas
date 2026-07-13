/**
 * Fix Engine - state-machine tests.
 *
 * Drives the engine's generate → approve → ship → recheck transitions
 * against an in-memory schema store and a fake module, so we exercise
 * the orchestration (status transitions, credit reserve/refund, error
 * handling) without a database or live providers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixRow } from '@/lib/fix-engine/types';

// In-memory state shared between the mocks and the assertions.
const store = vi.hoisted(() => {
  return {
    fixes: new Map<string, Record<string, unknown>>(),
    reserveOk: true,
    refundCalls: [] as Array<{ amount: number }>,
    // Deferred after() callbacks, captured (not run) so tests can assert
    // scheduling and execute them explicitly.
    afterCalls: [] as Array<() => unknown>,
    moduleBehavior: {
      generateThrows: false,
      shipOk: true,
      // '' = ship resolves normally; 'unsupported' throws CmsUnsupportedError
      // (static-site case); 'generic' throws a plain Error.
      shipThrows: '' as '' | 'unsupported' | 'generic',
      recheckVerified: true,
      revertOk: true,
    },
  };
});

vi.mock('next/server', () => ({ after: (fn: () => unknown) => { store.afterCalls.push(fn); } }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM brands')) {
        return { rows: [{ id: 'brand1', user_id: 'owner1', data: { name: 'Acme', website: 'https://acme.test' } }] };
      }
      if (sql.includes('api_keys')) return { rows: [{ api_keys: {} }] };
      return { rows: [] };
    }),
  },
}));
vi.mock('@/lib/credits', () => ({
  reserveCredits: vi.fn(async () => (store.reserveOk
    ? { ok: true, reserved: 1 }
    : { ok: false, code: 'monthly_exhausted', message: 'Out of credits' })),
  refundCredits: vi.fn(async (_u: string, amount: number) => { store.refundCalls.push({ amount }); }),
}));
vi.mock('@/lib/helpers', () => ({ getUserEffectivePlan: vi.fn(async () => 'pro') }));

// Fake module covering the full contract.
vi.mock('@/lib/fix-engine/registry', () => {
  const fake = {
    key: 'fake', title: 'Fake', description: '', channel: 'A', trigger: 'crawl',
    minPlan: 'starter', phase: 1,
    detect: vi.fn(async () => []),
    generate: vi.fn(async () => {
      if (store.moduleBehavior.generateThrows) throw new Error('boom');
      return { generated: { value: 'NEW' }, creditsUsed: 1 };
    }),
    preview: vi.fn(() => ({ kind: 'text-diff', label: 'x', after: 'NEW' })),
    ship: vi.fn(async () => {
      if (store.moduleBehavior.shipThrows === 'unsupported') {
        // Real class (dynamic import: vi.mock factories can't close over
        // top-level imports) so engine's instanceof check matches.
        const { CmsUnsupportedError } = await import('@/lib/fix-engine/cms/types');
        throw new CmsUnsupportedError('update_body', 'custom');
      }
      if (store.moduleBehavior.shipThrows === 'generic') throw new Error('boom-ship');
      return store.moduleBehavior.shipOk
        ? { ok: true, detail: { wrote: true }, after: { value: 'NEW' } }
        : { ok: false, detail: {}, error: 'cms failed' };
    }),
    recheck: vi.fn(async () => ({ verified: store.moduleBehavior.recheckVerified, scoreAfter: 100 })),
    revert: vi.fn(async () => (store.moduleBehavior.revertOk
      ? { ok: true, detail: { restored: true }, after: { value: 'OLD' } }
      : { ok: false, detail: {}, error: 'revert failed' })),
  };
  return {
    getModule: (k: string) => (k === 'fake' ? fake : undefined),
    listModules: () => [fake],
    generateCost: () => 1,
  };
});

// In-memory schema layer.
vi.mock('@/lib/fix-engine/schema', () => ({
  ensureFixEngineSchema: vi.fn(async () => {}),
  getFix: vi.fn(async (id: string) => {
    const r = store.fixes.get(id);
    return r ? { ...r } : null;
  }),
  updateFix: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    const r = store.fixes.get(id);
    if (r) Object.assign(r, patch);
  }),
  claimFixTransition: vi.fn(async (id: string, from: string, to: string) => {
    const r = store.fixes.get(id);
    if (r && r.status === from) { r.status = to; return true; }
    return false;
  }),
  restoreDismissedFixes: vi.fn(async (_brandId: string, ids?: string[]) => {
    const restored: string[] = [];
    for (const [id, r] of store.fixes) {
      if (r.status !== 'dismissed') continue;
      if (ids && ids.length && !ids.includes(id)) continue;
      r.status = 'detected'; r.error = null; restored.push(id);
    }
    return restored;
  }),
  logFixEvent: vi.fn(async () => {}),
  // unused-by-these-tests batch helpers, present so the import resolves
  getBatch: vi.fn(async () => null),
  claimBatchForRunning: vi.fn(async () => true),
  finalizeBatch: vi.fn(async () => {}),
  upsertDetectedFix: vi.fn(async () => 'x'),
  createBatch: vi.fn(async () => 'batch1'),
  findStuckQueuedBatches: vi.fn(async () => []),
}));

import { generateFix, approveFix, shipFix, recheckFix, revertFix, dismissFix, restoreFix, restoreAllDismissed } from '@/lib/fix-engine/engine';
import { refundCredits } from '@/lib/credits';

function seedFix(over: Partial<FixRow> = {}): string {
  const id = 'fix1';
  store.fixes.set(id, {
    id, userId: 'owner1', brandId: 'brand1', moduleKey: 'fake', channel: 'A',
    targetUrl: 'https://acme.test/page', status: 'detected', severity: 'medium',
    dedupeKey: 'https://acme.test/page', summary: 's', detected: { foo: 1 },
    generated: null, beforeSnapshot: null, afterSnapshot: null, shipResult: null,
    scoreBefore: null, scoreAfter: null, error: null,
    createdAt: 'now', updatedAt: 'now', ...over,
  });
  return id;
}

beforeEach(() => {
  store.fixes.clear();
  store.reserveOk = true;
  store.refundCalls = [];
  store.afterCalls = [];
  store.moduleBehavior = { generateThrows: false, shipOk: true, shipThrows: '', recheckVerified: true, revertOk: true };
  vi.clearAllMocks();
});
afterEach(() => vi.clearAllMocks());

describe('generateFix', () => {
  it('detected → generated and stores the draft', async () => {
    const id = seedFix();
    const fix = await generateFix(id, 'brand1');
    expect(fix.status).toBe('generated');
    expect((fix.generated as Record<string, unknown>).value).toBe('NEW');
    expect(store.refundCalls).toHaveLength(0);
  });

  it('refunds credits and marks failed when generate throws', async () => {
    store.moduleBehavior.generateThrows = true;
    const id = seedFix();
    await expect(generateFix(id, 'brand1')).rejects.toThrow('boom');
    expect(refundCredits).toHaveBeenCalledWith('owner1', 1, 'manual');
    expect(store.fixes.get(id)!.status).toBe('failed');
  });

  it('rolls back to detected and signals paymentRequired when credits are exhausted', async () => {
    store.reserveOk = false;
    const id = seedFix();
    await expect(generateFix(id, 'brand1')).rejects.toMatchObject({ paymentRequired: true });
    expect(store.fixes.get(id)!.status).toBe('detected');
  });
});

describe('approve + ship + recheck', () => {
  it('runs the full lifecycle to verified', async () => {
    const id = seedFix({ status: 'generated', generated: { value: 'NEW' } });
    const approved = await approveFix(id, 'brand1', 'owner1');
    expect(approved.status).toBe('approved');

    const shipped = await shipFix(id, 'brand1', 'owner1');
    expect(shipped.status).toBe('shipped');
    expect((shipped.shipResult as Record<string, unknown>).wrote).toBe(true);

    const rechecked = await recheckFix(id, 'brand1', 'owner1');
    expect(rechecked.status).toBe('verified');
    expect(rechecked.scoreAfter).toBe(100);
  });

  it('auto-verifies a Channel-A ship: schedules a recheck that confirms the change is live', async () => {
    const id = seedFix({ status: 'approved', generated: { value: 'NEW' } });
    await shipFix(id, 'brand1', 'owner1');
    expect(store.afterCalls).toHaveLength(1);
    // Run the deferred verification: the fake module's recheck reports
    // verified, so the fix is promoted without any user action.
    await store.afterCalls[0]();
    expect(store.fixes.get(id)!.status).toBe('verified');
  });

  it('auto-recheck leaves the fix at shipped when the live page does not match', async () => {
    store.moduleBehavior.recheckVerified = false;
    const id = seedFix({ status: 'approved', generated: { value: 'NEW' } });
    await shipFix(id, 'brand1', 'owner1');
    await store.afterCalls[0]();
    expect(store.fixes.get(id)!.status).toBe('shipped'); // not falsely verified
  });

  it('does not schedule an auto-recheck when the ship fails', async () => {
    store.moduleBehavior.shipOk = false;
    const id = seedFix({ status: 'approved', generated: { value: 'NEW' } });
    await shipFix(id, 'brand1', 'owner1');
    expect(store.afterCalls).toHaveLength(0);
  });

  it('marks failed when ship reports not-ok', async () => {
    store.moduleBehavior.shipOk = false;
    const id = seedFix({ status: 'approved', generated: { value: 'NEW' } });
    const shipped = await shipFix(id, 'brand1', 'owner1');
    expect(shipped.status).toBe('failed');
    expect(shipped.error).toContain('cms failed');
  });

  it('keeps status shipped when recheck cannot verify', async () => {
    store.moduleBehavior.recheckVerified = false;
    const id = seedFix({ status: 'shipped', generated: { value: 'NEW' } });
    const rechecked = await recheckFix(id, 'brand1', 'owner1');
    expect(rechecked.status).toBe('shipped');
  });

  it('refuses to approve a non-generated fix', async () => {
    const id = seedFix({ status: 'detected' });
    await expect(approveFix(id, 'brand1', 'owner1')).rejects.toThrow();
  });

  it('refuses to ship a non-approved fix', async () => {
    const id = seedFix({ status: 'generated', generated: { value: 'NEW' } });
    await expect(shipFix(id, 'brand1', 'owner1')).rejects.toThrow();
  });
});

describe('verify-by-fetch on unsupported CMS ops (static/custom sites)', () => {
  it('unsupported op + content already live → verified with verify_by_fetch delivery', async () => {
    store.moduleBehavior.shipThrows = 'unsupported';
    store.moduleBehavior.recheckVerified = true;
    const id = seedFix({ status: 'approved', generated: { value: 'NEW' } });
    const fix = await shipFix(id, 'brand1', 'owner1'); // resolves, no throw
    expect(fix.status).toBe('verified');
    expect((fix.shipResult as Record<string, unknown>).delivery).toBe('verify_by_fetch');
    expect((fix.shipResult as Record<string, unknown>).unsupportedOp).toContain('update_body');
    expect(fix.error).toBeNull();
  });

  it('unsupported op + content not live → failed with manual-publish instructions', async () => {
    store.moduleBehavior.shipThrows = 'unsupported';
    store.moduleBehavior.recheckVerified = false;
    const id = seedFix({ status: 'approved', generated: { value: 'NEW' } });
    const fix = await shipFix(id, 'brand1', 'owner1'); // resolves, no throw
    expect(fix.status).toBe('failed');
    expect(fix.error).toContain("does not support operation 'update_body'");
    expect(fix.error).toMatch(/manually.*Re-check/i);
  });

  it('a generic ship throw still hard-fails and rethrows (regression pin)', async () => {
    store.moduleBehavior.shipThrows = 'generic';
    const id = seedFix({ status: 'approved', generated: { value: 'NEW' } });
    await expect(shipFix(id, 'brand1', 'owner1')).rejects.toThrow('boom-ship');
    expect(store.fixes.get(id)!.status).toBe('failed');
  });
});

describe('recheck from failed (manual resolution path)', () => {
  it('failed + content now live → verified, stale error cleared', async () => {
    const id = seedFix({ status: 'failed', generated: { value: 'NEW' }, error: 'CMS write failed' });
    const fix = await recheckFix(id, 'brand1', 'owner1');
    expect(fix.status).toBe('verified');
    expect(fix.error).toBeNull();
  });

  it('failed + content not live → stays failed (never promoted to shipped)', async () => {
    store.moduleBehavior.recheckVerified = false;
    const id = seedFix({ status: 'failed', generated: { value: 'NEW' }, error: 'CMS write failed' });
    const fix = await recheckFix(id, 'brand1', 'owner1');
    expect(fix.status).toBe('failed');
    expect(fix.error).toBe('CMS write failed'); // untouched — still actionable
  });
});

describe('revert', () => {
  it('reverts a shipped fix to reverted', async () => {
    const id = seedFix({ status: 'shipped', generated: { value: 'NEW' } });
    const fix = await revertFix(id, 'brand1', 'owner1');
    expect(fix.status).toBe('reverted');
  });
  it('puts the fix back to shipped when revert reports not-ok', async () => {
    store.moduleBehavior.revertOk = false;
    const id = seedFix({ status: 'verified', generated: { value: 'NEW' } });
    const fix = await revertFix(id, 'brand1', 'owner1');
    expect(fix.status).toBe('shipped');
    expect(fix.error).toContain('revert failed');
  });
  it('refuses to revert a fix that has not shipped', async () => {
    const id = seedFix({ status: 'generated', generated: { value: 'NEW' } });
    await expect(revertFix(id, 'brand1', 'owner1')).rejects.toThrow();
  });
});

describe('dismiss / restore', () => {
  it('dismisses a detected fix (kept, not deleted)', async () => {
    const id = seedFix({ status: 'detected' });
    const fix = await dismissFix(id, 'brand1', 'owner1');
    expect(fix.status).toBe('dismissed');
    expect(store.fixes.get(id)).toBeTruthy(); // still there, just hidden
  });
  it('dismisses a generated (in-review) fix and preserves its draft', async () => {
    const id = seedFix({ status: 'generated', generated: { value: 'NEW' } });
    const fix = await dismissFix(id, 'brand1', 'owner1');
    expect(fix.status).toBe('dismissed');
    expect(fix.generated).toEqual({ value: 'NEW' });
  });
  it('refuses to dismiss a fix already applied to the site', async () => {
    for (const status of ['shipped', 'verified', 'staged', 'shipping'] as const) {
      const id = seedFix({ status });
      await expect(dismissFix(id, 'brand1', 'owner1')).rejects.toThrow(/already applied|Undo|revert/i);
      store.fixes.clear();
    }
  });
  it('dismiss is idempotent', async () => {
    const id = seedFix({ status: 'dismissed' });
    const fix = await dismissFix(id, 'brand1', 'owner1');
    expect(fix.status).toBe('dismissed');
  });
  it('restores a dismissed fix back to detected', async () => {
    const id = seedFix({ status: 'dismissed', generated: { value: 'KEEP' } });
    const fix = await restoreFix(id, 'brand1', 'owner1');
    expect(fix.status).toBe('detected');
    expect(fix.generated).toEqual({ value: 'KEEP' }); // draft preserved
  });
  it('restore is a no-op on a non-dismissed fix', async () => {
    const id = seedFix({ status: 'approved' });
    const fix = await restoreFix(id, 'brand1', 'owner1');
    expect(fix.status).toBe('approved');
  });

  it('restoreAllDismissed brings every dismissed fix back and returns the count', async () => {
    store.fixes.set('a', { id: 'a', brandId: 'brand1', status: 'dismissed' });
    store.fixes.set('b', { id: 'b', brandId: 'brand1', status: 'dismissed' });
    store.fixes.set('c', { id: 'c', brandId: 'brand1', status: 'detected' }); // untouched
    const n = await restoreAllDismissed('brand1', 'owner1');
    expect(n).toBe(2);
    expect(store.fixes.get('a')!.status).toBe('detected');
    expect(store.fixes.get('b')!.status).toBe('detected');
    expect(store.fixes.get('c')!.status).toBe('detected');
  });

  it('restoreAllDismissed can restore just a selection', async () => {
    store.fixes.set('a', { id: 'a', brandId: 'brand1', status: 'dismissed' });
    store.fixes.set('b', { id: 'b', brandId: 'brand1', status: 'dismissed' });
    const n = await restoreAllDismissed('brand1', 'owner1', ['a']);
    expect(n).toBe(1);
    expect(store.fixes.get('a')!.status).toBe('detected');
    expect(store.fixes.get('b')!.status).toBe('dismissed');
  });
});
