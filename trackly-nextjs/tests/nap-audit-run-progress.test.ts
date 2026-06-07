import { describe, expect, it, vi } from 'vitest';

/**
 * Locks in the runNapCheck progress callback: every URL completion must
 * fire onProgress with the running done-count, so processNapAudit can
 * persist a live counter the dashboard polls into a progress bar. The
 * concrete fetch path is mocked because we only care about the
 * orchestration here, not the HTML extractor.
 */

vi.mock('../src/lib/safe-fetch', () => ({
  SSRFError: class SSRFError extends Error {
    code = 'ssrf';
  },
  ssrfErrorToCopy: () => 'blocked',
  // Each call resolves to a tiny OK response — runNapCheck will run the
  // extractor against an empty body, which is fine for counting fires.
  safeFetch: vi.fn(async () => new Response('<html><body></body></html>', { status: 200 })),
}));

import { runNapCheck, NAP_MAX_URLS } from '../src/lib/nap-audit-run';

describe('runNapCheck onProgress', () => {
  it('exposes a 500-URL cap (raised from the original 50)', () => {
    expect(NAP_MAX_URLS).toBe(500);
  });

  it('fires onProgress once per URL with a monotonically increasing done count', async () => {
    const urls = Array.from({ length: 24 }, (_, i) => `https://example.com/${i}`);
    const observed: Array<{ done: number; total: number }> = [];

    await runNapCheck(
      { name: 'Acme' },
      urls,
      { onProgress: (done, total) => observed.push({ done, total }) },
    );

    expect(observed.length).toBe(urls.length);
    expect(observed[observed.length - 1]).toEqual({ done: urls.length, total: urls.length });
    // done is non-decreasing
    for (let i = 1; i < observed.length; i++) {
      expect(observed[i].done).toBeGreaterThanOrEqual(observed[i - 1].done);
      expect(observed[i].total).toBe(urls.length);
    }
  });

  it('skips the callback for an empty URL list', async () => {
    const observed: number[] = [];
    const result = await runNapCheck(
      { name: 'Acme' },
      [],
      { onProgress: (done) => observed.push(done) },
    );
    expect(observed).toEqual([]);
    expect(result.results).toEqual([]);
  });
});
