/**
 * Fix Engine - automation tests. Focus on the auto-pilot safety rule:
 * auto-ship is limited to deterministic (cost-0) fixes and only when a
 * ship channel is connected.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/db', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));

const state = vi.hoisted(() => ({
  detected: [] as any[],
  generated: [] as any[],
  canShip: true,
  shipped: [] as string[],
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
  shipFix: vi.fn(async (id: string) => { state.shipped.push(id); return { id, status: 'shipped' }; }),
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
  autopilotGenerate: false, autopilotShipDeterministic: false, lastScanAt: null, nextScanAt: null,
};

beforeEach(() => {
  state.detected = [{ id: 'd1', moduleKey: 'free-a' }, { id: 'd2', moduleKey: 'paid-b' }];
  state.generated = [{ id: 'g-free', moduleKey: 'free-a' }, { id: 'g-paid', moduleKey: 'paid-b' }];
  state.canShip = true; state.shipped = []; state.generatedCalls = []; state.approvedCalls = [];
  vi.clearAllMocks();
});

describe('auto-pilot', () => {
  it('auto-generates all detected fixes when enabled', async () => {
    await applyAutopilot('b1', { ...baseAuto, autopilotGenerate: true });
    expect(state.generatedCalls).toEqual(['d1', 'd2']);
  });

  it('auto-ships ONLY deterministic (cost-0) generated fixes', async () => {
    const r = await applyAutopilot('b1', { ...baseAuto, autopilotShipDeterministic: true });
    expect(state.shipped).toEqual(['g-free']); // paid (LLM-content) is never auto-shipped
    expect(r.shipped).toBe(1);
  });

  it('ships nothing when no channel is connected', async () => {
    state.canShip = false;
    await applyAutopilot('b1', { ...baseAuto, autopilotShipDeterministic: true });
    expect(state.shipped).toEqual([]);
  });

  it('does nothing when both auto-pilot toggles are off', async () => {
    await applyAutopilot('b1', baseAuto);
    expect(state.generatedCalls).toEqual([]);
    expect(state.shipped).toEqual([]);
  });
});
