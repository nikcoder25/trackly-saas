/**
 * Self-Serve Connect — public serve + heartbeat routes.
 *
 * The serve route resolves a public key → brand and returns the PUBLIC per-path
 * override (excluding non-public fields), with CORS + a null result for unknown
 * keys. The heartbeat route flips the connection and always 204s.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  conn: null as { publicKey: string; brandId: string } | null,
  overrides: {} as Record<string, Record<string, unknown>>,
  heartbeats: [] as string[],
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, retryAfter: 0 })),
  rateLimitResponse: (ra: number) => new Response('rate limited', { status: 429, headers: { 'Retry-After': String(ra) } }),
  getClientIp: () => '1.2.3.4',
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/connect/schema', () => ({
  getSiteConnectionByKey: vi.fn(async (key: string) => (state.conn && state.conn.publicKey === key ? state.conn : null)),
  recordHeartbeat: vi.fn(async (key: string) => { state.heartbeats.push(key); return null; }),
}));
vi.mock('@/lib/fix-engine/schema', () => ({
  getEdgeSeoOverrides: vi.fn(async () => state.overrides),
  normalizeEdgeOverrideKeys: (m: Record<string, unknown>) => m, // keys already canonical here
}));

import { GET, OPTIONS } from '@/app/api/connect/serve/route';
import { POST as HEARTBEAT } from '@/app/api/connect/[key]/heartbeat/route';

beforeEach(() => {
  state.conn = null;
  state.overrides = {};
  state.heartbeats = [];
  vi.clearAllMocks();
});

function serveReq(key: string, path: string) {
  return new Request(`https://livesov.com/api/connect/serve?key=${encodeURIComponent(key)}&path=${encodeURIComponent(path)}`);
}

describe('GET /api/connect/serve', () => {
  it('returns the public override for a path and excludes non-public fields', async () => {
    state.conn = { publicKey: 'lvx_abc', brandId: 'brand1' };
    state.overrides = {
      '/about': {
        title: 'About Acme',
        description: 'Meta',
        head: '<meta property="og:title" content="x">', // non-public
        indexable: true, // non-public
        citations: [{ anchor: 'FDA', href: 'https://fda.gov/x' }],
      },
    };
    const res = await GET(serveReq('lvx_abc', '/about'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = await res.json();
    expect(body.override).toEqual({
      title: 'About Acme',
      metaDescription: 'Meta',
      citations: [{ anchor: 'FDA', href: 'https://fda.gov/x' }],
    });
    expect(body.override.head).toBeUndefined();
    expect(body.override.indexable).toBeUndefined();
  });

  it('returns null override for a path with no shipped fixes', async () => {
    state.conn = { publicKey: 'lvx_abc', brandId: 'brand1' };
    state.overrides = { '/about': { title: 'About' } };
    const res = await GET(serveReq('lvx_abc', '/other'));
    const body = await res.json();
    expect(body.override).toBeNull();
  });

  it('returns 200 + null for an unknown key (no existence disclosure)', async () => {
    const res = await GET(serveReq('lvx_missing', '/about'));
    expect(res.status).toBe(200);
    expect((await res.json()).override).toBeNull();
  });

  it('400s when the key is missing', async () => {
    const res = await GET(new Request('https://livesov.com/api/connect/serve?path=/about'));
    expect(res.status).toBe(400);
  });

  it('OPTIONS preflight returns 204 with CORS', () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('POST /api/connect/[key]/heartbeat', () => {
  it('records the heartbeat and returns 204 with CORS', async () => {
    const res = await HEARTBEAT(new Request('https://livesov.com/api/connect/lvx_abc/heartbeat', { method: 'POST' }), { params: Promise.resolve({ key: 'lvx_abc' }) });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(state.heartbeats).toEqual(['lvx_abc']);
  });

  it('still 204s for an unknown key (no probing)', async () => {
    const res = await HEARTBEAT(new Request('https://livesov.com/api/connect/lvx_x/heartbeat', { method: 'POST' }), { params: Promise.resolve({ key: 'lvx_x' }) });
    expect(res.status).toBe(204);
  });
});
