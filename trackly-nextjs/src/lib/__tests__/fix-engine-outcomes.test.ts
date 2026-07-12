/**
 * Fix Engine - outcome pass + regression watch (schema/engine/GSC mocked).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const state = vi.hoisted(() => ({
  due: [] as any[],
  stale: [] as any[],
  liveMetrics: { clicks: 60, impressions: 1200, ctr: 0.05, position: 8 } as any,
  recheckResult: 'verified' as string,
  measuredRevert: false,
  revertable: true,
  revertCalls: [] as string[],
  updates: [] as { id: string; patch: any }[],
  events: [] as { fixId: string | null; event: string; detail: any }[],
}));

vi.mock('@/lib/fix-engine/schema', () => ({
  findFixesDueOutcome: vi.fn(async () => state.due),
  findStaleVerifiedFixes: vi.fn(async () => state.stale),
  updateFix: vi.fn(async (id: string, patch: any) => { state.updates.push({ id, patch }); }),
  logFixEvent: vi.fn(async (fixId: string | null, _b: string, _u: unknown, event: string, detail: any) => { state.events.push({ fixId, event, detail }); }),
}));
vi.mock('@/lib/fix-engine/engine', () => ({
  getOwnerId: vi.fn(async () => 'owner1'),
  recheckFix: vi.fn(async (id: string) => ({ id, status: state.recheckResult })),
  revertFix: vi.fn(async (id: string) => { state.revertCalls.push(id); return { id, status: 'reverted' }; }),
}));
vi.mock('@/lib/fix-engine/registry', () => ({
  getModule: vi.fn(() => ({ key: 'm', revert: state.revertable ? async () => ({ ok: true, detail: {} }) : undefined })),
}));
vi.mock('@/lib/fix-engine/automation', () => ({
  getAutomation: vi.fn(async () => ({ measuredRevert: state.measuredRevert })),
}));
vi.mock('@/lib/fix-engine/notify', () => ({ notifyBrand: vi.fn(async () => ({ ok: true, channel: 'webhook' })) }));
vi.mock('@/lib/fix-engine/page-metrics', () => ({
  PAGE_METRICS_WINDOW_DAYS: 28,
  fetchUrlMetricsLive: vi.fn(async () => (state.liveMetrics ? { url: 'u', ...state.liveMetrics, fetchedAt: 'now' } : null)),
}));

import { runOutcomePass, runRegressionWatch } from '@/lib/fix-engine/outcomes';

beforeEach(() => {
  state.due = [{ id: 'f1', brandId: 'b1', moduleKey: 'title-rewrite', targetUrl: 'https://a.com/p', gscBefore: { ctr: 0.04, impressions: 1000, at: '2026-06-01' } }];
  state.stale = [{ id: 'v1', brandId: 'b1', moduleKey: 'title-rewrite', targetUrl: 'https://a.com/p', status: 'verified' }];
  state.liveMetrics = { clicks: 60, impressions: 1200, ctr: 0.05, position: 8 };
  state.recheckResult = 'verified';
  state.measuredRevert = false; state.revertable = true; state.revertCalls = [];
  state.updates = []; state.events = [];
  vi.clearAllMocks();
});

describe('runOutcomePass', () => {
  it('stores gscAfter and logs the CTR delta', async () => {
    const r = await runOutcomePass();
    expect(r.measured).toBe(1);
    expect(r.improved).toBe(1);
    expect(state.updates[0].patch.gscAfter.ctr).toBe(0.05);
    const ev = state.events.find((e) => e.event === 'outcome.measured')!;
    expect(ev.detail.ctrDelta).toBeCloseTo(0.25);
  });

  it('records unavailable when GSC has no data for the URL', async () => {
    state.liveMetrics = null;
    const r = await runOutcomePass();
    expect(r.measured).toBe(1);
    expect(state.updates[0].patch.gscAfter.unavailable).toBe(true);
    expect(state.events.find((e) => e.event === 'outcome.measured')!.detail.ctrDelta).toBeNull();
  });
});

describe('measured auto-revert', () => {
  const bigDrop = { clicks: 20, impressions: 1100, ctr: 0.025, position: 9 }; // 0.04 → 0.025 = -37%

  it('auto-reverts a big, well-fed CTR drop when Measured mode is on', async () => {
    state.measuredRevert = true;
    state.liveMetrics = bigDrop;
    const r = await runOutcomePass();
    expect(r.reverted).toBe(1);
    expect(state.revertCalls).toEqual(['f1']);
    expect(state.events.map((e) => e.event)).toContain('outcome.autoreverted');
  });

  it('does nothing when Measured mode is off (default)', async () => {
    state.liveMetrics = bigDrop;
    const r = await runOutcomePass();
    expect(r.reverted).toBe(0);
    expect(state.revertCalls).toEqual([]);
  });

  it('never reverts on a small drop, a non-revertable module, or thin traffic', async () => {
    state.measuredRevert = true;
    // Small drop (-12%, above the -20% threshold)
    state.liveMetrics = { clicks: 40, impressions: 1100, ctr: 0.035, position: 9 };
    expect((await runOutcomePass()).reverted).toBe(0);
    // Non-revertable module
    state.liveMetrics = bigDrop; state.revertable = false;
    expect((await runOutcomePass()).reverted).toBe(0);
    // Thin traffic in the after window (< 300 impressions)
    state.revertable = true;
    state.liveMetrics = { clicks: 5, impressions: 150, ctr: 0.025, position: 9 };
    expect((await runOutcomePass()).reverted).toBe(0);
    expect(state.revertCalls).toEqual([]);
  });
});

describe('runRegressionWatch', () => {
  it('does not flag fixes that re-verify', async () => {
    const r = await runRegressionWatch();
    expect(r).toEqual({ checked: 1, regressed: 0 });
    expect(state.events.filter((e) => e.event === 'regression.detected')).toHaveLength(0);
  });

  it('flags fixes whose recheck comes back un-verified', async () => {
    state.recheckResult = 'shipped';
    const r = await runRegressionWatch();
    expect(r).toEqual({ checked: 1, regressed: 1 });
    const ev = state.events.find((e) => e.event === 'regression.detected')!;
    expect(ev.fixId).toBe('v1');
    expect(ev.detail.module).toBe('title-rewrite');
  });
});
