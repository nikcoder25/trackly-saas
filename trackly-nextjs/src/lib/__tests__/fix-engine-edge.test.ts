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
}));

vi.mock('@/lib/fix-engine/connections', () => ({
  getConnectorByToken: vi.fn(async (t: string) => (t && state.brandId ? { brandId: state.brandId, userId: 'u1', hmacSecret: null } : null)),
}));
vi.mock('@/lib/fix-engine/schema', () => ({
  getLatestRootFileContent: vi.fn(async (_b: string, moduleKey: string, field: string) => state.content[`${moduleKey}:${field}`] ?? null),
}));

import { GET } from '@/app/api/edge/serve/route';

function req(qs: string) { return new Request(`https://livesov.com/api/edge/serve?${qs}`); }

beforeEach(() => { state.brandId = 'b1'; vi.clearAllMocks(); });

describe('edge serve', () => {
  it('serves llms.txt for a valid token', async () => {
    const res = await GET(req('token=tok&file=llms.txt'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
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
});
