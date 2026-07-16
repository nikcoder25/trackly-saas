/**
 * Edge Pro — provision / verify / disconnect orchestration (mock provider).
 *
 * Uses a spy provider + in-memory schema to cover: provision happy-path (+ that
 * a double-provision doesn't mint a second Custom Hostname), verify-live header
 * assertion, disconnect teardown, and the failure→retry branch.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  store: new Map<string, any>(),
  tokens: new Map<string, string>(),
  calls: { createCustomHostname: 0, dispatchWorker: 0, deleteWorker: 0, deleteCustomHostname: 0 },
  fail: { dispatch: false, createHostname: false, deleteWorker: false, deleteHostname: false },
  fetchRes: null as any,
}));

vi.mock('@/lib/connect/edge-provider', () => ({
  getEdgeProvider: () => ({
    mode: 'mock',
    provider: {
      async createCustomHostname(hostname: string) {
        state.calls.createCustomHostname++;
        if (state.fail.createHostname) throw new Error('hostname failed');
        return { id: 'ch-' + hostname, cnameTarget: 'edge.livesov.com', dcvRecord: null };
      },
      async deleteCustomHostname() { state.calls.deleteCustomHostname++; return { ok: !state.fail.deleteHostname }; },
      async dispatchWorker() { state.calls.dispatchWorker++; return { ok: !state.fail.dispatch, error: state.fail.dispatch ? 'dispatch failed' : undefined }; },
      async deleteWorker() { state.calls.deleteWorker++; return { ok: !state.fail.deleteWorker }; },
    },
  }),
}));

vi.mock('@/lib/connect/schema', () => ({
  getSiteConnection: async (id: string) => (state.store.has(id) ? { ...state.store.get(id) } : null),
  getEdgeTokenById: async (id: string) => state.tokens.get(id) ?? null,
  updateEdgeConnection: async (id: string, patch: any) => {
    const cur = state.store.get(id);
    if (!cur) throw new Error('Connection not found');
    const next = { ...cur };
    for (const k of ['status', 'cfCustomHostnameId', 'cfScriptName', 'edgeCnameTarget', 'error'] as const) {
      if (patch[k] !== undefined) next[k] = patch[k];
    }
    if (patch.edgeTokenPlain !== undefined) {
      if (patch.edgeTokenPlain) state.tokens.set(id, patch.edgeTokenPlain);
      else state.tokens.delete(id);
    }
    state.store.set(id, next);
    return { ...next };
  },
}));

vi.mock('@/lib/safe-fetch', () => ({ safeFetch: vi.fn(async () => state.fetchRes), SSRFError: class extends Error {} }));

import { provisionEdge, verifyEdgeLive, disconnectEdge } from '@/lib/connect/edge-flow';

function seed() {
  state.store.set('conn1', {
    id: 'conn1', brandId: 'b1', method: 'edge', publicKey: 'lvx_x', status: 'pending',
    firstSeenAt: null, lastSeenAt: null, createdAt: 'now',
    cfCustomHostnameId: null, cfScriptName: null, edgeCnameTarget: null, error: null,
  });
}
function fetchRes(headers: Record<string, string>, body = '') {
  return { status: 200, ok: true, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, text: async () => body };
}

beforeEach(() => {
  state.store.clear(); state.tokens.clear();
  state.calls = { createCustomHostname: 0, dispatchWorker: 0, deleteWorker: 0, deleteCustomHostname: 0 };
  state.fail = { dispatch: false, createHostname: false, deleteWorker: false, deleteHostname: false };
  state.fetchRes = null;
  vi.clearAllMocks();
  seed();
});

describe('provisionEdge', () => {
  it('dispatches the worker, mints the hostname, and persists cf ids + token', async () => {
    const r = await provisionEdge('conn1', 'acme.test');
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('mock');
    expect(r.cnameTarget).toBe('edge.livesov.com');
    expect(state.calls.dispatchWorker).toBe(1);
    expect(state.calls.createCustomHostname).toBe(1);
    expect(r.connection.cfScriptName).toBe('livesov-edge-acme-test');
    expect(r.connection.cfCustomHostnameId).toBe('ch-acme.test');
    expect(r.connection.edgeCnameTarget).toBe('edge.livesov.com');
    expect(r.connection.status).toBe('pending'); // not connected until verify
    expect(r.connection.error).toBeNull();
    expect(state.tokens.get('conn1')).toMatch(/^lvxedge_/);
  });

  it('is idempotent: a second provision does not mint a second Custom Hostname', async () => {
    await provisionEdge('conn1', 'acme.test');
    await provisionEdge('conn1', 'acme.test');
    expect(state.calls.createCustomHostname).toBe(1); // reused
    expect(state.calls.dispatchWorker).toBe(2); // re-dispatch is idempotent
  });

  it('records a retryable reason on provider failure, then succeeds on retry', async () => {
    state.fail.dispatch = true;
    const bad = await provisionEdge('conn1', 'acme.test');
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe('dispatch failed');
    expect(bad.connection.error).toBe('dispatch failed');
    expect(bad.connection.cfScriptName).toBeNull(); // nothing provisioned
    expect(state.calls.createCustomHostname).toBe(0);

    state.fail.dispatch = false;
    const good = await provisionEdge('conn1', 'acme.test');
    expect(good.ok).toBe(true);
    expect(good.connection.cfScriptName).toBe('livesov-edge-acme-test');
    expect(state.calls.createCustomHostname).toBe(1);
  });
});

describe('verifyEdgeLive', () => {
  it('flips to connected when the x-livesov-edge marker is present', async () => {
    state.fetchRes = fetchRes({ 'x-livesov-edge': 'v1' }, '<html><main data-livesov="citable">…</main></html>');
    const r = await verifyEdgeLive('conn1', 'https://acme.test/');
    expect(r.ok).toBe(true);
    expect(r.verified).toBe(true);
    expect(r.sawInject).toBe(true);
    expect(r.connection.status).toBe('connected');
    expect(r.connection.error).toBeNull();
  });

  it('stays pending with a reason when the marker is absent', async () => {
    state.fetchRes = fetchRes({}, '<html></html>');
    const r = await verifyEdgeLive('conn1', 'https://acme.test/');
    expect(r.verified).toBe(false);
    expect(r.reason).toBe('edge_worker_not_detected');
    expect(r.connection.status).toBe('pending');
    expect(r.connection.error).toBe('edge_worker_not_detected');
  });
});

describe('disconnectEdge', () => {
  it('tears down the worker + hostname and clears edge state', async () => {
    await provisionEdge('conn1', 'acme.test');
    const r = await disconnectEdge('conn1');
    expect(r.ok).toBe(true);
    expect(state.calls.deleteWorker).toBe(1);
    expect(state.calls.deleteCustomHostname).toBe(1);
    expect(r.connection.status).toBe('stale');
    expect(r.connection.cfScriptName).toBeNull();
    expect(r.connection.cfCustomHostnameId).toBeNull();
    expect(r.connection.edgeCnameTarget).toBeNull();
    expect(state.tokens.has('conn1')).toBe(false);
  });

  it('surfaces a partial teardown failure but still clears local state', async () => {
    await provisionEdge('conn1', 'acme.test');
    state.fail.deleteHostname = true;
    const r = await disconnectEdge('conn1');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/hostname/);
    expect(r.connection.status).toBe('stale');
    expect(r.connection.cfCustomHostnameId).toBeNull();
  });
});
