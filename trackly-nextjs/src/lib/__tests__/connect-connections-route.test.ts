/**
 * Self-Serve Connect — POST /api/brands/[id]/connections `{ method }` branch.
 *
 * Both 'snippet' and 'wordpress' create/return a site_connection + the same
 * one-line snippet (WordPress needs no plugin — method just records the flow).
 * Unsupported methods 400. The provider-based fix_connections path is untouched.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ role: 'owner' as string, created: [] as Array<{ brandId: string; method: string }> }));

vi.mock('@/lib/db', () => ({ pool: {} }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/auth', () => ({ requireVerifiedAuth: vi.fn(async () => ({ id: 'user1' })) }));
vi.mock('@/lib/helpers', () => ({
  getBrandWithAccess: vi.fn(async () => ({ role: state.role, brand: { id: 'brand1', userId: 'user1', website: 'https://acme.test' } })),
}));
vi.mock('@/lib/connect/schema', () => ({
  createOrGetSiteConnection: vi.fn(async (brandId: string, method: string) => {
    state.created.push({ brandId, method });
    return { id: 'conn1', brandId, method, publicKey: 'lvx_key', status: 'pending', firstSeenAt: null, lastSeenAt: null, createdAt: 'now' };
  }),
}));
// Keep the provider-path imports cheap/hermetic (unused by the method branch).
vi.mock('@/lib/fix-engine/connections', () => ({ listConnections: vi.fn(), upsertConnection: vi.fn() }));
vi.mock('@/lib/fix-engine/cms', () => ({ getCmsAdapter: vi.fn(), listSupportedCms: () => [] }));
vi.mock('@/lib/fix-engine/trackers', () => ({ getTracker: vi.fn() }));
vi.mock('@/lib/fix-engine/keywords', () => ({ verifyKeywordsEverywhere: vi.fn() }));

import { POST } from '@/app/api/brands/[id]/connections/route';

function post(body: unknown) {
  return POST(
    new Request('https://livesov.com/api/brands/brand1/connections', { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: 'brand1' }) },
  );
}

beforeEach(() => { state.role = 'owner'; state.created = []; vi.clearAllMocks(); });

describe('connect method branch', () => {
  it('creates a wordpress connection with the same snippet', async () => {
    const res = await post({ method: 'wordpress' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connection.method).toBe('wordpress');
    expect(body.snippet).toBe('<script async src="https://livesov.com/c.js" data-livesov="lvx_key"></script>');
    expect(state.created).toEqual([{ brandId: 'brand1', method: 'wordpress' }]);
  });

  it('creates a snippet connection', async () => {
    const res = await post({ method: 'snippet' });
    expect(res.status).toBe(200);
    expect((await res.json()).connection.method).toBe('snippet');
    expect(state.created).toEqual([{ brandId: 'brand1', method: 'snippet' }]);
  });

  it('400s an unsupported method (and does not create anything)', async () => {
    const res = await post({ method: 'edge' });
    expect(res.status).toBe(400);
    expect(state.created).toEqual([]);
  });

  it('403s a viewer', async () => {
    state.role = 'viewer';
    const res = await post({ method: 'wordpress' });
    expect(res.status).toBe(403);
  });
});
