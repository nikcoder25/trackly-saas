/**
 * Fix Engine - Connector watchdog: flags stuck-undelivered Channel-B
 * fixes once each, recording whether the connector looks offline.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const state = vi.hoisted(() => ({
  stuck: [] as { id: string; brandId: string; createdAt: string }[],
  flaggedAlready: new Set<string>(),
  lastSeenAt: null as string | null,
  events: [] as { fixId: string; event: string; detail: any }[],
}));

vi.mock('@/lib/fix-engine/schema', () => ({
  findStuckConnectorInstructions: vi.fn(async () => state.stuck),
  hasFixEvent: vi.fn(async (fixId: string) => state.flaggedAlready.has(fixId)),
  logFixEvent: vi.fn(async (fixId: string, _b: string, _u: unknown, event: string, detail: any) => { state.events.push({ fixId, event, detail }); }),
}));
vi.mock('@/lib/fix-engine/connections', () => ({
  getConnection: vi.fn(async () => ({ status: 'active', lastSeenAt: state.lastSeenAt })),
}));

import { runConnectorWatchdog } from '@/lib/fix-engine/connector-watchdog';

beforeEach(() => {
  const old = new Date(Date.now() - 3 * 3_600_000).toISOString();
  state.stuck = [{ id: 'f1', brandId: 'b1', createdAt: old }, { id: 'f2', brandId: 'b1', createdAt: old }];
  state.flaggedAlready = new Set();
  state.lastSeenAt = null; // offline
  state.events = [];
  vi.clearAllMocks();
});

describe('connector watchdog', () => {
  it('flags each stuck fix once with connectorOnline=false when offline', async () => {
    const r = await runConnectorWatchdog();
    expect(r).toEqual({ stuck: 2, flagged: 2 });
    expect(state.events.map((e) => e.event)).toEqual(['connector.stuck', 'connector.stuck']);
    expect(state.events[0].detail.connectorOnline).toBe(false);
    expect(state.events[0].detail.hoursStuck).toBeGreaterThanOrEqual(2);
  });

  it('does not re-flag a fix already flagged', async () => {
    state.flaggedAlready = new Set(['f1']);
    const r = await runConnectorWatchdog();
    expect(r.flagged).toBe(1);
    expect(state.events.map((e) => e.fixId)).toEqual(['f2']);
  });

  it('reports connectorOnline=true when the connector polled recently', async () => {
    state.lastSeenAt = new Date(Date.now() - 60_000).toISOString();
    await runConnectorWatchdog();
    expect(state.events[0].detail.connectorOnline).toBe(true);
  });
});
