import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Tests for the llms.txt validator that backs the "Validate / check" tab on
 * /tools/llms-txt-generator.
 *
 * The validator is the part of that page that has to be *correct* rather than
 * merely present: it tells people their file is fine or broken, so a wrong
 * verdict is worse than no tool. These cases pin the spec rules (exactly one
 * H1, first in the file; links must parse) apart from the quality warnings
 * (relative URLs, duplicates, missing descriptions), because the distinction
 * between "invalid" and "valid but useless" is the whole point of the output.
 *
 * safeFetch and rateLimit are mocked so the suite stays hermetic - no network,
 * no shared rate-limit state between cases.
 */

const safeFetchMock = vi.fn();

vi.mock('../src/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, retryAfter: 0 })),
  rateLimitResponse: () => Response.json({ error: 'rate limited' }, { status: 429 }),
}));

vi.mock('../src/lib/safe-fetch', () => {
  class SSRFError extends Error {}
  return {
    SSRFError,
    safeFetch: (...args: unknown[]) => safeFetchMock(...args),
  };
});

const { POST } = await import('@/app/api/tools/llms-txt-validator/route');

function post(body: unknown): Request {
  return new Request('https://livesov.com/api/tools/llms-txt-validator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface Check { id: string; level: 'pass' | 'warn' | 'fail'; detail: string }
interface Body {
  valid: boolean;
  score: number;
  checks: Check[];
  stats: { sections: number; links: number; bytes: number };
  error?: string;
}

async function validate(content: string): Promise<Body> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await POST(post({ content }) as any);
  return (await res.json()) as Body;
}

const level = (b: Body, id: string) => b.checks.find((c) => c.id === id)?.level;

const GOOD = `# Acme Docs

> Acme is a project management tool for engineering teams.

## Product
- [Overview](https://acme.com/product): What Acme does and who it is for.
- [Pricing](https://acme.com/pricing): Plans and per-seat costs.

## Docs
- [Getting started](https://acme.com/docs/start): Install and first project.
- [API reference](https://acme.com/docs/api): Endpoints and auth.
`;

beforeEach(() => {
  safeFetchMock.mockReset();
});

describe('llms.txt validator - spec rules', () => {
  it('accepts a well-formed file and reports its shape', async () => {
    const b = await validate(GOOD);
    expect(b.valid).toBe(true);
    expect(level(b, 'h1')).toBe('pass');
    expect(level(b, 'summary')).toBe('pass');
    expect(level(b, 'sections')).toBe('pass');
    expect(level(b, 'links')).toBe('pass');
    expect(b.stats.sections).toBe(2);
    expect(b.stats.links).toBe(4);
    expect(b.score).toBeGreaterThanOrEqual(90);
  });

  it('fails a file with no H1', async () => {
    const b = await validate('## Docs\n- [A](https://a.com)\n');
    expect(b.valid).toBe(false);
    expect(level(b, 'h1')).toBe('fail');
  });

  it('fails a file with more than one H1', async () => {
    const b = await validate('# One\n\n# Two\n\n## S\n- [A](https://a.com)\n');
    expect(b.valid).toBe(false);
    expect(level(b, 'h1')).toBe('fail');
    expect(b.checks.find((c) => c.id === 'h1')?.detail).toContain('2');
  });

  it('warns when the H1 is present but is not the first content', async () => {
    const b = await validate('Some preamble.\n\n# Acme\n\n## S\n- [A](https://a.com)\n');
    expect(level(b, 'h1')).toBe('warn');
    // Ordering is a quality problem, not a parse failure.
    expect(b.valid).toBe(true);
  });

  it('fails a file with no links at all', async () => {
    const b = await validate('# Acme\n\n> Summary.\n\n## Docs\n');
    expect(b.valid).toBe(false);
    expect(level(b, 'links')).toBe('fail');
  });

  it('fails bullets that look like links but do not parse', async () => {
    const b = await validate('# Acme\n\n## Docs\n- [Broken](https://a.com\n- [Good](https://b.com)\n');
    expect(b.valid).toBe(false);
    expect(level(b, 'malformed')).toBe('fail');
  });
});

describe('llms.txt validator - quality warnings (valid but weak)', () => {
  it('warns on a missing blockquote summary without failing the file', async () => {
    const b = await validate('# Acme\n\n## Docs\n- [A](https://a.com): One.\n');
    expect(b.valid).toBe(true);
    expect(level(b, 'summary')).toBe('warn');
  });

  it('warns on relative URLs', async () => {
    const b = await validate('# Acme\n\n> S.\n\n## Docs\n- [A](/docs/a): One.\n');
    expect(b.valid).toBe(true);
    expect(level(b, 'absolute')).toBe('warn');
  });

  it('flags duplicate URLs, ignoring a trailing slash', async () => {
    const b = await validate('# Acme\n\n> S.\n\n## Docs\n- [A](https://a.com/x): One.\n- [B](https://a.com/x/): Two.\n');
    expect(level(b, 'duplicates')).toBe('warn');
  });

  it('warns when most links carry no description', async () => {
    const b = await validate('# Acme\n\n> S.\n\n## Docs\n- [A](https://a.com)\n- [B](https://b.com)\n- [C](https://c.com)\n');
    expect(level(b, 'descriptions')).toBe('warn');
  });

  it('flags empty sections', async () => {
    const b = await validate('# Acme\n\n> S.\n\n## Docs\n- [A](https://a.com): One.\n\n## Blog\n');
    expect(level(b, 'empty-sections')).toBe('warn');
  });

  it('warns when a single section is oversized', async () => {
    const links = Array.from({ length: 60 }, (_, i) => `- [P${i}](https://a.com/${i}): Page ${i}.`).join('\n');
    const b = await validate(`# Acme\n\n> S.\n\n## Docs\n${links}\n`);
    expect(level(b, 'sections')).toBe('warn');
    expect(b.valid).toBe(true);
  });
});

describe('llms.txt validator - input handling', () => {
  it('rejects an empty request', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(post({}) as any);
    expect(res.status).toBe(400);
  });

  it('rejects an empty file', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(post({ content: '   \n  ' }) as any);
    expect(res.status).toBe(400);
  });

  it('resolves a bare domain to /llms.txt before fetching', async () => {
    safeFetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => GOOD });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(post({ url: 'acme.com' }) as any);
    const b = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(safeFetchMock.mock.calls[0][0]).toBe('https://acme.com/llms.txt');
    expect(b.valid).toBe(true);
  });

  it('keeps an explicit llms.txt path rather than re-appending it', async () => {
    safeFetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => GOOD });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await POST(post({ url: 'https://acme.com/llms-full.txt' }) as any);
    expect(safeFetchMock.mock.calls[0][0]).toBe('https://acme.com/llms-full.txt');
  });

  it('returns 404 when the file is not there', async () => {
    safeFetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => '' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(post({ url: 'acme.com' }) as any);
    expect(res.status).toBe(404);
  });

  it('prefers pasted content over a URL and makes no network call', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(post({ url: 'acme.com', content: GOOD }) as any);
    const b = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(safeFetchMock).not.toHaveBeenCalled();
    expect(b.valid).toBe(true);
  });
});
