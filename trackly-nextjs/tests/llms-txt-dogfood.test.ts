import { describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/llms.txt/route';

/**
 * Dogfood guard: our own /llms.txt must pass our own free validator.
 *
 * Before this test, livesov.com/llms.txt scored 79 and came back INVALID from
 * the tool we publish at /tools/llms-txt-generator - it had five headed
 * sections and zero markdown links, which the spec (and our own checker) call
 * out as the one thing that makes a file useless to a retrieval stack. For a
 * GEO product, any prospect could paste our domain into our own tool and watch
 * it fail us.
 *
 * The two files are edited independently, so this pins them together: change
 * the manifest and break the spec, or tighten the validator past our own
 * manifest, and this goes red.
 */

vi.mock('../src/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, retryAfter: 0 })),
  rateLimitResponse: () => Response.json({ error: 'rate limited' }, { status: 429 }),
}));

vi.mock('../src/lib/safe-fetch', () => {
  class SSRFError extends Error {}
  // The manifest is passed in as `content`, so no network call should happen.
  return { SSRFError, safeFetch: () => { throw new Error('unexpected network call'); } };
});

const { POST } = await import('@/app/api/tools/llms-txt-validator/route');

interface Check { id: string; label: string; level: 'pass' | 'warn' | 'fail'; detail: string }

async function validateOwnManifest() {
  const content = await (await GET()).text();
  const req = new Request('https://livesov.com/api/tools/llms-txt-validator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await POST(req as any);
  return {
    content,
    body: (await res.json()) as {
      valid: boolean;
      score: number;
      checks: Check[];
      stats: { sections: number; links: number; bytes: number };
    },
  };
}

describe('our own llms.txt, judged by our own validator', () => {
  it('is valid with no failing checks', async () => {
    const { body } = await validateOwnManifest();
    const failures = body.checks.filter((c) => c.level === 'fail');
    expect(
      failures.map((f) => `${f.label}: ${f.detail}`),
      'our published llms.txt must not fail our own spec checks',
    ).toEqual([]);
    expect(body.valid).toBe(true);
  });

  it('scores 100 - no warnings either', async () => {
    // Warnings are the difference between "parses" and "earns citations".
    // We publish the tool that reports them, so we hold ourselves to a clean
    // sheet rather than merely a valid one.
    const { body } = await validateOwnManifest();
    const warnings = body.checks.filter((c) => c.level === 'warn');
    expect(warnings.map((w) => `${w.label}: ${w.detail}`)).toEqual([]);
    expect(body.score).toBe(100);
  });

  it('actually contains link sections, not just headings', async () => {
    const { body } = await validateOwnManifest();
    expect(body.stats.links).toBeGreaterThanOrEqual(10);
    expect(body.stats.sections).toBeGreaterThanOrEqual(3);
  });

  it('keeps every link absolute and pointing at our own origin', async () => {
    const { content } = await validateOwnManifest();
    const urls = [...content.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThanOrEqual(10);
    for (const u of urls) {
      expect(u, `${u} should be an absolute https URL`).toMatch(/^https?:\/\//);
    }
  });
});
