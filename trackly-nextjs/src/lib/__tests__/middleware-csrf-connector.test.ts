/**
 * CSRF exemption for the Connector plugin's runtime API.
 *
 * The WordPress plugin acks instructions server-to-server with only a Bearer
 * connector token: no Origin, no Referer, no cookies. In production the
 * same-origin check refuses such requests, so without the exemption every ack
 * was a 403, connector_delivered_at stayed NULL and the instruction was
 * re-served (and re-applied) on every poll.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Middleware = (req: NextRequest) => Promise<Response>;
let middleware: Middleware;

beforeAll(async () => {
  // PROD is read at module load, so stub before importing.
  vi.stubEnv('NODE_ENV', 'production');
  vi.resetModules();
  ({ middleware } = (await import('@/middleware')) as unknown as { middleware: Middleware });
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function post(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://livesov.com${path}`, { method: 'POST', headers, body: '{}' });
}

describe('middleware CSRF: connector plugin routes', () => {
  it('lets a server-to-server ack with only a Bearer token through in production', async () => {
    const res = await middleware(post('/api/connector/instructions/abc-123/ack', {
      authorization: 'Bearer conn_token',
      'content-type': 'application/json',
      'x-real-ip': '203.0.113.10',
    }));
    expect(res.status).not.toBe(403);
  });

  it('still blocks an originless POST to a cookie-authenticated route in production', async () => {
    const res = await middleware(post('/api/brands/b1/run', { 'x-real-ip': '203.0.113.11' }));
    expect(res.status).toBe(403);
  });

  it('does not exempt look-alike paths outside /api/connector/', async () => {
    const res = await middleware(post('/api/connectorx/instructions/abc/ack', {
      authorization: 'Bearer conn_token',
      'x-real-ip': '203.0.113.12',
    }));
    expect(res.status).toBe(403);
  });

  it('keeps the cookie-authenticated connect/connector approve route under CSRF', async () => {
    const res = await middleware(post('/api/connect/connector/approve', { 'x-real-ip': '203.0.113.13' }));
    expect(res.status).toBe(403);
  });
});
