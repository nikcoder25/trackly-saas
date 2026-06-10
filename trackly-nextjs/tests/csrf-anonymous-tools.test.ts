import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

// Regression tests for the anonymous free-tools CSRF bug: the CSRF cookie is
// only issued at login/register/refresh, so the public tool endpoints must be
// in CSRF_BOOTSTRAP_PATHS or every signed-out visitor's submit fails with
// 403 "Invalid or missing CSRF token". The Origin check still applies to
// bootstrap paths, so cross-site POST abuse stays blocked.

const ORIGIN = 'http://localhost:3000';

const ANONYMOUS_TOOL_ENDPOINTS = [
  '/api/geo-audit',
  '/api/tools/llms-txt-generator',
  '/api/tools/ai-crawler-checker',
  '/api/tools/chatgpt-mention-checker',
  '/api/tools/citation-finder',
  '/api/tools/competitor-finder',
  // Pre-existing anonymous endpoints, locked down to the same contract.
  '/api/contact',
  '/api/newsletter',
  '/api/free-check',
];

function post(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('CSRF middleware - anonymous free-tool endpoints', () => {
  it.each(ANONYMOUS_TOOL_ENDPOINTS)(
    'allows a same-origin POST to %s with no CSRF cookie (anonymous visitor)',
    async (path) => {
      const res = await middleware(post(path, { origin: ORIGIN }));
      expect(res.status, `${path} should not be blocked for anonymous visitors`).not.toBe(403);
    },
  );

  it.each(ANONYMOUS_TOOL_ENDPOINTS)(
    'still blocks a cross-origin POST to %s',
    async (path) => {
      const res = await middleware(post(path, { origin: 'https://evil.example.com' }));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/cross-origin/i);
    },
  );

  it('still enforces the double-submit token on non-bootstrap API mutations', async () => {
    const res = await middleware(post('/api/settings', { origin: ORIGIN }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/csrf/i);
  });

  it('accepts a non-bootstrap mutation when the double-submit pair matches', async () => {
    const res = await middleware(
      post('/api/settings', {
        origin: ORIGIN,
        'x-csrf-token': 'token-value',
        cookie: 'livesov_csrf=token-value',
      }),
    );
    expect(res.status).not.toBe(403);
  });
});
