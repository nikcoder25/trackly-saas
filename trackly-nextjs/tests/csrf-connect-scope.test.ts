import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

// The /api/connect/ prefix used to be blanket CSRF-exempt, which also
// disabled the Origin + double-submit checks on the cookie-authenticated
// POST /api/connect/connector/approve (it creates/rotates a brand's
// connector pairing). The exemption is now scoped to the two genuinely
// cookieless endpoints: the snippet's cross-origin heartbeat beacon and the
// plugin's server-to-server code exchange.

const ORIGIN = 'http://localhost:3000';
const CUSTOMER_SITE = 'https://customer-site.example.com';

function post(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('CSRF middleware - /api/connect scope', () => {
  it('allows the cross-origin heartbeat beacon from a customer site', async () => {
    const res = await middleware(post('/api/connect/lvx_abc123/heartbeat', { origin: CUSTOMER_SITE }));
    expect(res.status).not.toBe(403);
  });

  it('allows the connector code exchange from a foreign origin (plugin server-to-server)', async () => {
    const res = await middleware(post('/api/connect/connector/exchange', { origin: CUSTOMER_SITE }));
    expect(res.status).not.toBe(403);
  });

  it('blocks a cross-origin POST to connector/approve (cookie-authenticated mutation)', async () => {
    const res = await middleware(post('/api/connect/connector/approve', { origin: 'https://evil.example.com' }));
    expect(res.status).toBe(403);
  });

  it('requires the double-submit CSRF token on same-origin connector/approve', async () => {
    const res = await middleware(post('/api/connect/connector/approve', { origin: ORIGIN }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/csrf/i);
  });

  it('does not exempt arbitrary deeper paths that merely contain "heartbeat"', async () => {
    const res = await middleware(post('/api/connect/a/b/heartbeat', { origin: 'https://evil.example.com' }));
    expect(res.status).toBe(403);
  });
});
