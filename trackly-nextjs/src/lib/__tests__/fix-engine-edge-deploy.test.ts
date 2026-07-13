/**
 * Fix Engine - edge deploy orchestration + zero-click auto-connect
 * (cloudflare/connections/cms/schema mocked).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const state = vi.hoisted(() => ({
  zone: { id: 'z1', name: 'acme.com', accountId: 'a1' } as { id: string; name: string; accountId: string } | undefined,
  zoneError: undefined as string | undefined,
  deployOk: true,
  markerLive: true,
  storedToken: 'cf-token' as string | null,
  candidates: [] as Array<{ brandId: string; userId: string; website: string }>,
  upserts: [] as Array<Record<string, unknown>>,
  events: [] as Array<{ brandId: string; event: string; detail: Record<string, unknown> }>,
  pairings: 0,
}));

vi.mock('@/lib/fix-engine/cloudflare', () => ({
  findZoneForHost: vi.fn(async () => (state.zone ? { zone: state.zone } : { error: state.zoneError ?? 'no zone' })),
  deployEdgeWorker: vi.fn(async () => (state.deployOk
    ? { ok: true, scriptName: 'livesov-edge-acme-com', routes: ['acme.com/*', '*.acme.com/*'] }
    : { ok: false, scriptName: 'livesov-edge-acme-com', routes: [], error: 'upload rejected' })),
}));
vi.mock('@/lib/fix-engine/connections', () => ({
  createConnectorPairing: vi.fn(async () => { state.pairings++; return { token: 'raw-token', hmacSecret: 's' }; }),
  getLatestUserConnection: vi.fn(async () => (state.storedToken ? { creds: { apiToken: state.storedToken } } : null)),
  upsertConnection: vi.fn(async (args: Record<string, unknown>) => { state.upserts.push(args); return {}; }),
}));
vi.mock('@/lib/fix-engine/cms', () => ({
  getCmsAdapter: vi.fn(() => ({ verify: vi.fn(async () => ({ ok: state.markerLive })) })),
}));
vi.mock('@/lib/fix-engine/edge-worker', () => ({
  buildEdgeWorkerScript: vi.fn(() => 'export default {}'),
}));
vi.mock('@/lib/fix-engine/schema', () => ({
  findEdgeAutoConnectCandidates: vi.fn(async () => state.candidates),
  logFixEvent: vi.fn(async (_f: string | null, brandId: string, _u: string | null, event: string, detail: Record<string, unknown>) => {
    state.events.push({ brandId, event, detail });
  }),
}));

import { provisionEdgeForBrand, runEdgeAutoConnect } from '@/lib/fix-engine/edge-deploy';
import { findZoneForHost } from '@/lib/fix-engine/cloudflare';

beforeEach(() => {
  state.zone = { id: 'z1', name: 'acme.com', accountId: 'a1' };
  state.zoneError = undefined;
  state.deployOk = true;
  state.markerLive = true;
  state.storedToken = 'cf-token';
  state.candidates = [];
  state.upserts = [];
  state.events = [];
  state.pairings = 0;
  vi.clearAllMocks();
});

describe('provisionEdgeForBrand', () => {
  it('deploys, verifies the marker, and activates the edge connection', async () => {
    const r = await provisionEdgeForBrand('cf-token', 'b1', 'u1', 'https://acme.com');
    expect(r).toMatchObject({ ok: true, zone: 'acme.com', connected: true, routes: ['acme.com/*', '*.acme.com/*'] });
    expect(state.pairings).toBe(1);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0]).toMatchObject({ provider: 'cms', cmsType: 'edge', brandId: 'b1', siteUrl: 'https://acme.com' });
  });

  it('reports deployed-but-not-connected when the marker never shows (no cms upsert)', async () => {
    state.markerLive = false;
    const r = await provisionEdgeForBrand('cf-token', 'b1', 'u1', 'https://acme.com');
    expect(r.ok).toBe(true);
    expect(r.connected).toBe(false);
    expect(state.upserts).toHaveLength(0);
  }, 15_000); // 3 marker probes with 2s spacing

  it('fails cleanly when no zone matches and does not rotate the pairing', async () => {
    state.zone = undefined;
    state.zoneError = 'No active Cloudflare zone found for acme.com';
    const r = await provisionEdgeForBrand('cf-token', 'b1', 'u1', 'https://acme.com');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('No active Cloudflare zone');
    expect(state.pairings).toBe(0);
  });

  it('surfaces an upload failure', async () => {
    state.deployOk = false;
    const r = await provisionEdgeForBrand('cf-token', 'b1', 'u1', 'https://acme.com');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('upload rejected');
  });

  it('rejects an unparseable website', async () => {
    const r = await provisionEdgeForBrand('cf-token', 'b1', 'u1', 'not a url at all //');
    expect(r.ok).toBe(false);
    expect(findZoneForHost).not.toHaveBeenCalled();
  });
});

describe('runEdgeAutoConnect (zero-click for new websites)', () => {
  it('provisions each candidate with the stored token and logs the gating event', async () => {
    state.candidates = [{ brandId: 'b1', userId: 'u1', website: 'https://acme.com' }];
    const r = await runEdgeAutoConnect();
    expect(r).toEqual({ attempted: 1, connected: 1 });
    expect(state.upserts.some((u) => u.cmsType === 'edge' && u.brandId === 'b1')).toBe(true);
    const ev = state.events.find((e) => e.event === 'edge.autodeploy')!;
    expect(ev.brandId).toBe('b1');
    expect(ev.detail).toMatchObject({ ok: true, connected: true, website: 'https://acme.com' });
  });

  it('still logs the event when provisioning fails, so the brand is not retried forever', async () => {
    state.candidates = [{ brandId: 'b2', userId: 'u1', website: 'https://not-on-cf.dev' }];
    state.zone = undefined;
    state.zoneError = 'No active Cloudflare zone found for not-on-cf.dev';
    const r = await runEdgeAutoConnect();
    expect(r).toEqual({ attempted: 1, connected: 0 });
    const ev = state.events.find((e) => e.event === 'edge.autodeploy')!;
    expect(ev.detail.ok).toBe(false);
    expect(String(ev.detail.error)).toContain('No active Cloudflare zone');
  });

  it('skips a candidate whose token was revoked since the query', async () => {
    state.candidates = [{ brandId: 'b3', userId: 'u1', website: 'https://acme.com' }];
    state.storedToken = null;
    const r = await runEdgeAutoConnect();
    expect(r).toEqual({ attempted: 0, connected: 0 });
    expect(state.events).toHaveLength(0);
  });

  it('does nothing when there are no candidates', async () => {
    const r = await runEdgeAutoConnect();
    expect(r).toEqual({ attempted: 0, connected: 0 });
  });
});
