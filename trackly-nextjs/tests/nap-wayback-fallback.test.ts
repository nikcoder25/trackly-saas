import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Free anti-bot fallback: when a directory blocks our server (403), the runner
 * reads the page's most recent Internet Archive snapshot instead. archive.org
 * isn't behind the live site's anti-bot wall and serves the original HTML, so
 * the NAP extracts normally — and the result is flagged with the snapshot date
 * so stale data is never silently trusted.
 */

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

// A realistic archived page carrying a LocalBusiness JSON-LD block.
const ARCHIVED_HTML = `<!doctype html><html><head>
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

describe('Wayback Machine fallback', () => {
  it('rescues a blocked citation from the latest archive snapshot and flags the date', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('archive.org/wayback/available')) {
        return new Response(
          JSON.stringify({
            archived_snapshots: {
              closest: {
                available: true,
                url: 'http://web.archive.org/web/20240115120000/https://www.tripadvisor.com/Profile/legendoztransportati',
                timestamp: '20240115120000',
                status: '200',
              },
            },
          }),
          { status: 200 },
        );
      }
      if (u.includes('web.archive.org/web/')) {
        // Assert we asked for the raw/original document, not the rewritten one.
        expect(u).toContain('id_/');
        return new Response(ARCHIVED_HTML, { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as unknown as typeof fetch;

    const { results } = await runNapCheck(CANONICAL, [
      'https://www.tripadvisor.com/Profile/legendoztransportati',
    ]);

    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.reachable).toBe(true);
    expect(r.rendered).toBe(true);
    expect(r.archivedAt).toBe('2024-01-15');
    // The archived NAP matched the canonical, so it scores rather than showing
    // as a blocked dead link.
    expect(r.matchScore).toBeGreaterThan(0);
    expect(r.tags).not.toContain('blocked');
  });

  it('captures a fresh snapshot via Save Page Now when none is archived yet', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('archive.org/wayback/available')) {
        return new Response(JSON.stringify({ archived_snapshots: {} }), { status: 200 });
      }
      if (u.includes('web.archive.org/save/')) {
        // SPN captured it and points us at the new snapshot via Content-Location.
        return new Response('', {
          status: 200,
          headers: {
            'content-location':
              '/web/20260613120000/https://www.tripadvisor.com/Profile/legendoztransportati',
          },
        });
      }
      if (u.includes('web.archive.org/web/')) {
        expect(u).toContain('id_/');
        return new Response(ARCHIVED_HTML, { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as unknown as typeof fetch;

    const { results } = await runNapCheck(CANONICAL, [
      'https://www.tripadvisor.com/Profile/legendoztransportati',
    ]);

    const r = results[0];
    expect(r.reachable).toBe(true);
    expect(r.rendered).toBe(true);
    // Fresh capture → today-ish snapshot date, not a stale one.
    expect(r.archivedAt).toBe('2026-06-13');
    expect(r.tags).not.toContain('blocked');
  });

  it('falls back to Jina Reader (fresh, no archive date) when the archive cannot help', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('archive.org/wayback/available')) {
        return new Response(JSON.stringify({ archived_snapshots: {} }), { status: 200 });
      }
      if (u.includes('web.archive.org/save/')) {
        return new Response('nope', { status: 503 }); // SPN couldn't capture it
      }
      if (u.startsWith('https://r.jina.ai/')) {
        return new Response(ARCHIVED_HTML, { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as unknown as typeof fetch;

    const { results } = await runNapCheck(CANONICAL, [
      'https://www.tripadvisor.com/Profile/legendoztransportati',
    ]);

    const r = results[0];
    expect(r.reachable).toBe(true);
    expect(r.rendered).toBe(true);
    // Jina is a live read, so there is no archive date to show.
    expect(r.archivedAt).toBeUndefined();
    expect(r.matchScore).toBeGreaterThan(0);
    expect(r.tags).not.toContain('blocked');
  });

  it('keeps the blocked result when every free backend fails', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('archive.org/wayback/available')) {
        return new Response(JSON.stringify({ archived_snapshots: {} }), { status: 200 });
      }
      if (u.includes('web.archive.org/save/')) return new Response('', { status: 503 });
      if (u.startsWith('https://r.jina.ai/')) return new Response('', { status: 503 });
      throw new Error(`unexpected fetch: ${u}`);
    }) as unknown as typeof fetch;

    const { results, summary } = await runNapCheck(CANONICAL, [
      'https://www.tripadvisor.com/Profile/legendoztransportati',
    ]);

    const r = results[0];
    expect(r.reachable).toBe(false);
    expect(r.archivedAt).toBeUndefined();
    expect(r.tags).toContain('blocked');
    expect(summary.blocked).toBe(1);
  });
});
