/**
 * Fix Engine - edge delivery (/api/edge/serve): plugin-free serving of the
 * latest llms.txt / robots.txt content, gated by the Connector token.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true })),
  rateLimitResponse: () => new Response('rate', { status: 429 }),
  getClientIp: () => '127.0.0.1',
}));

const state = vi.hoisted(() => ({
  brandId: 'b1' as string | null,
  content: { 'llms-txt:content': 'User-agent: *\nAllow: /', 'robots-ai-access:directives': 'User-agent: GPTBot\nAllow: /' } as Record<string, string | null>,
  seoOverrides: { '/pricing': { title: 'New Title', description: 'New description' } } as Record<string, unknown>,
}));

vi.mock('@/lib/fix-engine/connections', () => ({
  getConnectorByToken: vi.fn(async (t: string) => (t && state.brandId ? { brandId: state.brandId, userId: 'u1', hmacSecret: null } : null)),
}));
vi.mock('@/lib/fix-engine/schema', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/fix-engine/schema')>();
  return {
    getLatestRootFileContent: vi.fn(async (_b: string, moduleKey: string, field: string) => state.content[`${moduleKey}:${field}`] ?? null),
    getEdgeSeoOverrides: vi.fn(async () => state.seoOverrides),
    // Use the real normaliser so the route's trailing-slash handling is exercised.
    normalizeEdgeOverrideKeys: actual.normalizeEdgeOverrideKeys,
  };
});

import { GET } from '@/app/api/edge/serve/route';

function req(qs: string) { return new Request(`https://livesov.com/api/edge/serve?${qs}`); }

beforeEach(() => { state.brandId = 'b1'; vi.clearAllMocks(); });

describe('edge serve', () => {
  it('serves llms.txt for a valid token', async () => {
    const res = await GET(req('token=tok&file=llms.txt'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(res.headers.get('Cache-Control')).toContain('private');
    expect(res.headers.get('Vary')).toBe('Authorization');
    expect(await res.text()).toContain('Allow: /');
  });

  it('accepts the token via Authorization header (kept out of the URL)', async () => {
    const res = await GET(new Request('https://livesov.com/api/edge/serve?file=llms.txt', { headers: { authorization: 'Bearer tok' } }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Allow: /');
  });

  it('serves robots.txt AI directives', async () => {
    const res = await GET(req('token=tok&file=robots.txt'));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('GPTBot');
  });

  it('404s an unknown file (no token leak path)', async () => {
    expect((await GET(req('token=tok&file=wp-config.php'))).status).toBe(404);
    expect((await GET(req('file=llms.txt'))).status).toBe(404); // missing token
  });

  it('401s an invalid/revoked token', async () => {
    state.brandId = null; // token resolves to nothing
    expect((await GET(req('token=bad&file=llms.txt'))).status).toBe(401);
  });

  it('404s when there is no ready content yet', async () => {
    state.content = {};
    expect((await GET(req('token=tok&file=llms.txt'))).status).toBe(404);
  });

  it('serves seo.json overrides for the Worker with a short PRIVATE cache', async () => {
    const res = await GET(req('token=tok&file=seo.json'));
    expect(res.status).toBe(200);
    // private + Vary: the URL is identical for every brand while the body is
    // per-brand (keyed by the bearer token) — a shared cache keyed only on
    // the URL would serve brand A's overrides onto brand B's pages.
    expect(res.headers.get('Cache-Control')).toContain('max-age=300');
    expect(res.headers.get('Cache-Control')).toContain('private');
    expect(res.headers.get('Cache-Control')).not.toContain('public');
    expect(res.headers.get('Vary')).toBe('Authorization');
    const body = await res.json();
    expect(body.v).toBe(1);
    expect(body.count).toBe(1);
    expect(body.overrides['/pricing']).toEqual({ title: 'New Title', description: 'New description' });
  });

  it('serves an empty seo.json map as a valid 200 (Worker passes pages through)', async () => {
    state.seoOverrides = {};
    const res = await GET(req('token=tok&file=seo.json'));
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(0);
  });

  it('normalises trailing-slash keys so /p and /p/ resolve to one override', async () => {
    state.seoOverrides = { '/peptides/cagrilintide/': { title: 'Cagrilintide' } };
    const res = await GET(req('token=tok&file=seo.json'));
    const body = await res.json();
    expect(body.overrides['/peptides/cagrilintide']).toEqual({ title: 'Cagrilintide' });
    expect(body.overrides['/peptides/cagrilintide/']).toBeUndefined();
  });

  it('still requires a valid token for seo.json', async () => {
    state.brandId = null;
    expect((await GET(req('token=bad&file=seo.json'))).status).toBe(401);
    expect((await GET(req('file=seo.json'))).status).toBe(404); // no token
  });
});
