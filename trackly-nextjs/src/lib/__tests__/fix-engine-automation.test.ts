/**
 * Fix Engine - automation tests. Focus on the auto-pilot safety rule:
 * automation may detect, generate, and STAGE a preview, but it never
 * publishes to a live site. Publishing requires a person.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/db', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));

const state = vi.hoisted(() => ({
  detected: [] as any[],
  generated: [] as any[],
  canShip: true,
  shipped: [] as string[],
  staged: [] as string[],
  generatedCalls: [] as string[],
  approvedCalls: [] as string[],
}));

vi.mock('@/lib/fix-engine/schema', () => ({
  listFixes: vi.fn(async (_brand: string, f: { status?: string }) => (f.status === 'detected' ? state.detected : f.status === 'generated' ? state.generated : [])),
  createBatch: vi.fn(async () => 'batch1'),
}));
vi.mock('@/lib/fix-engine/engine', () => ({
  runScan: vi.fn(async () => {}),
  generateFix: vi.fn(async (id: string) => { state.generatedCalls.push(id); return { id }; }),
  approveFix: vi.fn(async (id: string) => { state.approvedCalls.push(id); return { id }; }),
  // Present but never expected to be called: automation has no user id to
  // pass, and engine.shipFix rejects a null one.
  shipFix: vi.fn(async (id: string) => { state.shipped.push(id); return { id, status: 'shipped' }; }),
  stageFix: vi.fn(async (id: string) => { state.staged.push(id); return { id, status: 'staged' }; }),
}));
vi.mock('@/lib/fix-engine/registry', () => ({
  // free-* modules are deterministic (cost 0), paid-* cost 1
  generateCost: (key: string) => (key.startsWith('free') ? 0 : 1),
  listModules: () => [{ key: 'free-a' }, { key: 'paid-b' }],
}));
vi.mock('@/lib/fix-engine/connections', () => ({
  getConnection: vi.fn(async (_b: string, provider: string) => (provider === 'cms' && state.canShip ? { status: 'active' } : null)),
}));

import { applyAutopilot } from '@/lib/fix-engine/automation';

const baseAuto = {
  brandId: 'b1', scanEnabled: true, scanFrequency: 'weekly' as const, scanModules: [],
  autopilotGenerate: false, autopilotStage: false, lastScanAt: null, nextScanAt: null,
};

beforeEach(() => {
  state.detected = [{ id: 'd1', moduleKey: 'free-a' }, { id: 'd2', moduleKey: 'paid-b' }];
  state.generated = [{ id: 'g-free', moduleKey: 'free-a' }, { id: 'g-paid', moduleKey: 'paid-b' }];
  state.canShip = true; state.shipped = []; state.staged = []; state.generatedCalls = []; state.approvedCalls = [];
  vi.clearAllMocks();
});

describe('auto-pilot', () => {
  it('auto-generates all detected fixes when enabled', async () => {
    await applyAutopilot('b1', { ...baseAuto, autopilotGenerate: true });
    expect(state.generatedCalls).toEqual(['d1', 'd2']);
  });

  it('stages generated fixes as previews and ships nothing', async () => {
    const r = await applyAutopilot('b1', { ...baseAuto, autopilotStage: true });
    expect(state.staged).toEqual(['g-free', 'g-paid']);
    expect(r.staged).toBe(2);
    // The rule this file exists to protect: no live write, ever, from a
    // scheduled run — including for cheap deterministic fixes, which the
    // old behaviour did auto-publish.
    expect(state.shipped).toEqual([]);
  });

  it('stages LLM-written fixes too, because staging is not publishing', async () => {
    // The old auto-ship path had to exclude paid/LLM modules, since shipping
    // them put unreviewed generated copy on a live page. A preview carries
    // no such risk, so the distinction is no longer needed.
    await applyAutopilot('b1', { ...baseAuto, autopilotStage: true });
    expect(state.staged).toContain('g-paid');
    expect(state.shipped).toEqual([]);
  });

  it('does nothing when both auto-pilot toggles are off', async () => {
    await applyAutopilot('b1', baseAuto);
    expect(state.generatedCalls).toEqual([]);
    expect(state.staged).toEqual([]);
    expect(state.shipped).toEqual([]);
  });
});
