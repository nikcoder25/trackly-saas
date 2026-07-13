/**
 * Fix Engine - Cloudflare one-click deploy: API client (safeFetch mocked),
 * the shared Worker template, and the deploy route's orchestration.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: fetchMock }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { verifyCloudflareToken, findZoneForHost, deployEdgeWorker, workerScriptName } from '@/lib/fix-engine/cloudflare';
import { buildEdgeWorkerScript, EDGE_MARKER_HEADER } from '@/lib/fix-engine/edge-worker';

function res(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

beforeEach(() => { fetchMock.mockReset(); });

describe('worker template', () => {
  it('embeds the token, edge base, marker header, and all rewrite features', () => {
    const s = buildEdgeWorkerScript('tok123', 'https://livesov.com/api/edge/serve');
    expect(s).toContain('"tok123"');
    expect(s).toContain('https://livesov.com/api/edge/serve');
    expect(s).toContain(EDGE_MARKER_HEADER);
    expect(s).toContain('seo.json');
    expect(s).toContain('HTMLRewriter');
    expect(s).toContain('application/ld+json');   // schema injection
    expect(s).toContain("meta[name=\"robots\"]"); // noindex removal
    expect(s).toContain('o.head');                // OG/Twitter block
  });
});

describe('cloudflare client', () => {
  it('verifies an active token', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { success: true, result: { status: 'active' } }));
    expect(await verifyCloudflareToken('t')).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/user/tokens/verify');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t');
  });

  it('surfaces Cloudflare error messages on a bad token', async () => {
    fetchMock.mockResolvedValueOnce(res(400, { success: false, errors: [{ message: 'Invalid API Token' }] }));
    const r = await verifyCloudflareToken('bad');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Invalid API Token');
  });

  it('walks host labels up to find the registered zone', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { success: true, result: [] })); // blog.acme.com → no zone
    fetchMock.mockResolvedValueOnce(res(200, { success: true, result: [{ id: 'z1', name: 'acme.com', account: { id: 'a1' } }] }));
    const { zone } = await findZoneForHost('t', 'blog.acme.com');
    expect(zone).toEqual({ id: 'z1', name: 'acme.com', accountId: 'a1' });
    expect(fetchMock.mock.calls[0][0]).toContain('name=blog.acme.com');
    expect(fetchMock.mock.calls[1][0]).toContain('name=acme.com');
  });

  it('reports a clear error when no zone matches', async () => {
    fetchMock.mockResolvedValue(res(200, { success: true, result: [] }));
    const { zone, error } = await findZoneForHost('t', 'acme.dev');
    expect(zone).toBeUndefined();
    expect(error).toMatch(/No active Cloudflare zone/);
  });

  it('sanitises worker script names', () => {
    expect(workerScriptName('Acme.Co.UK')).toBe('livesov-edge-acme-co-uk');
  });

  it('uploads the script and creates both routes', async () => {
    const zone = { id: 'z1', name: 'acme.com', accountId: 'a1' };
    fetchMock.mockResolvedValueOnce(res(200, { success: true, result: {} }));   // script upload
    fetchMock.mockResolvedValueOnce(res(200, { success: true, result: [] }));   // list routes (none)
    fetchMock.mockResolvedValueOnce(res(200, { success: true, result: { id: 'r1' } })); // route acme.com/*
    fetchMock.mockResolvedValueOnce(res(200, { success: true, result: { id: 'r2' } })); // route *.acme.com/*
    const r = await deployEdgeWorker('t', zone, 'export default {}');
    expect(r.ok).toBe(true);
    expect(r.scriptName).toBe('livesov-edge-acme-com');
    expect(r.routes).toEqual(['acme.com/*', '*.acme.com/*']);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.cloudflare.com/client/v4/accounts/a1/workers/scripts/livesov-edge-acme-com');
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
  });

  it('updates an existing route that points at a different script and skips a correct one', async () => {
    const zone = { id: 'z1', name: 'acme.com', accountId: 'a1' };
    fetchMock.mockResolvedValueOnce(res(200, { success: true, result: {} })); // upload
    fetchMock.mockResolvedValueOnce(res(200, { success: true, result: [
      { id: 'r1', pattern: 'acme.com/*', script: 'old-worker' },
      { id: 'r2', pattern: '*.acme.com/*', script: 'livesov-edge-acme-com' },
    ] }));
    fetchMock.mockResolvedValueOnce(res(200, { success: true, result: { id: 'r1' } })); // PUT update r1
    const r = await deployEdgeWorker('t', zone, 'export default {}');
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[2][0]).toContain('/workers/routes/r1');
    expect(fetchMock.mock.calls[2][1].method).toBe('PUT');
    expect(fetchMock).toHaveBeenCalledTimes(3); // no extra POST for the already-correct route
  });

  it('fails truthfully when the upload is rejected', async () => {
    const zone = { id: 'z1', name: 'acme.com', accountId: 'a1' };
    fetchMock.mockResolvedValueOnce(res(403, { success: false, errors: [{ message: 'token lacks Workers Scripts:Edit' }] }));
    const r = await deployEdgeWorker('t', zone, 'export default {}');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Workers Scripts:Edit');
  });
});
