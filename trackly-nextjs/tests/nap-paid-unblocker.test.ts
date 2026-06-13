import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Paid pay-per-success unblockers (Zyte API + Bright Data Web Unlocker) sit at
 * the top of the Layer-3 chain: when the live fetch is blocked they re-fetch the
 * page through a residential-proxy + browser backend. They're tried before the
 * free archive/Jina chain, and only bill on success, so they fire only on the
 * residual blocked set.
 *
 * Env is set via vi.hoisted so it runs before the (hoisted) import below — the
 * lib reads these keys once at module init.
 */
vi.hoisted(() => {
  process.env.ZYTE_API_KEY = 'test-zyte-key';
  process.env.BRIGHTDATA_API_TOKEN = 'test-bd-token';
  process.env.BRIGHTDATA_UNLOCKER_ZONE = 'test_zone';
});

// safeFetch (the live, SSRF-hardened fetch) always reports the directory as
// blocked, forcing the Layer-3 path.
vi.mock('../src/lib/safe-fetch', () => ({
  SSRFError: class SSRFError extends Error {
    code = 'ssrf';
  },
  ssrfErrorToCopy: () => 'blocked',
  safeFetch: vi.fn(async () => new Response('forbidden', { status: 403 })),
}));

import { runNapCheck } from '../src/lib/nap-audit-run';

const origFetch = globalThis.fetch;

const CANONICAL = {
  name: 'Legend OZ Transportation',
  phone: '586-555-0100',
  street: '123 Main St',
  city: 'Shelby Township',
  postcode: '48315',
};

const HTML = `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Legend OZ Transportation',
  telephone: '586-555-0100',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '123 Main St',
    addressLocality: 'Shelby Township',
    postalCode: '48315',
  },
})}</script></head><body>Legend OZ Transportation</body></html>`;

const URL_UNDER_TEST = 'https://www.tripadvisor.com/Profile/legendoztransportati';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

describe('paid unblocker chain', () => {
  it('rescues a blocked citation via Zyte browserHtml (fresh, no archive date)', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('api.zyte.com')) {
        return new Response(JSON.stringify({ browserHtml: HTML }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as unknown as typeof fetch;

    const { results } = await runNapCheck(CANONICAL, [URL_UNDER_TEST]);
    const r = results[0];
    expect(r.reachable).toBe(true);
    expect(r.rendered).toBe(true);
    expect(r.archivedAt).toBeUndefined(); // live read, not an archive snapshot
    expect(r.matchScore).toBeGreaterThan(0);
    expect(r.tags).not.toContain('blocked');
  });

  it('falls back from Zyte to Bright Data Web Unlocker when Zyte fails', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('api.zyte.com')) {
        return new Response('err', { status: 500 }); // Zyte couldn't unblock
      }
      if (u.includes('api.brightdata.com')) {
        return new Response(HTML, { status: 200 }); // format: raw → HTML body
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as unknown as typeof fetch;

    const { results } = await runNapCheck(CANONICAL, [URL_UNDER_TEST]);
    const r = results[0];
    expect(r.reachable).toBe(true);
    expect(r.rendered).toBe(true);
    expect(r.matchScore).toBeGreaterThan(0);
    expect(r.tags).not.toContain('blocked');
  });

  it('does not touch the free archive chain when a paid backend succeeds', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('api.zyte.com')) {
        return new Response(JSON.stringify({ browserHtml: HTML }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await runNapCheck(CANONICAL, [URL_UNDER_TEST]);
    // Only Zyte should have been called — never archive.org / r.jina.ai.
    for (const call of fetchMock.mock.calls) {
      const u = String(call[0]);
      expect(u).not.toMatch(/archive\.org|web\.archive\.org|r\.jina\.ai/);
    }
  });
});
