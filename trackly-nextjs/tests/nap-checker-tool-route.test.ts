import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The anonymous free NAP checker (/api/tools/nap-checker): validates input,
 * caps the URL list at 5, runs the engine with the unblocker disabled
 * (noRender - a signed-out visitor must never spend paid render credits),
 * and swallows honeypot submissions.
 */

const rateLimitMock = vi.fn(async () => ({ allowed: true, retryAfter: 0 }));
vi.mock('../src/lib/rate-limit', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/rate-limit')>('../src/lib/rate-limit');
  return { ...actual, rateLimit: (...args: unknown[]) => rateLimitMock(...(args as [])) };
});

const runNapCheckMock = vi.fn(async () => ({
  results: [],
  score: 100,
  summary: { total: 0, clean: 0, withIssues: 0, deadLinks: 0, blocked: 0, duplicateListings: 0 },
  duplicates: [],
}));
vi.mock('../src/lib/nap-audit-run', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/nap-audit-run')>('../src/lib/nap-audit-run');
  return { ...actual, runNapCheck: (...args: unknown[]) => runNapCheckMock(...(args as [])) };
});

import { POST } from '../src/app/api/tools/nap-checker/route';

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/tools/nap-checker', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  rateLimitMock.mockClear();
  rateLimitMock.mockResolvedValue({ allowed: true, retryAfter: 0 });
  runNapCheckMock.mockClear();
});

describe('POST /api/tools/nap-checker', () => {
  it('runs the engine with the unblocker disabled and returns the scored result', async () => {
    const res = await POST(post({
      canonical: { name: 'Acme Dental', website: 'https://acme.example' },
      urls: 'https://yelp.com/biz/acme\nhttps://yell.com/acme',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(100);
    expect(runNapCheckMock).toHaveBeenCalledTimes(1);
    const [canonical, urls, options] = runNapCheckMock.mock.calls[0] as unknown as [
      { name: string; website?: string }, string[], { noRender?: boolean },
    ];
    expect(canonical.name).toBe('Acme Dental');
    expect(canonical.website).toBe('https://acme.example');
    expect(urls).toHaveLength(2);
    expect(options.noRender).toBe(true);
  });

  it('caps the URL list at 5', async () => {
    const urls = Array.from({ length: 9 }, (_, i) => `https://dir${i}.example/listing`).join('\n');
    const res = await POST(post({ canonical: { name: 'Acme' }, urls }));
    expect(res.status).toBe(200);
    const [, passedUrls] = runNapCheckMock.mock.calls[0] as unknown as [unknown, string[]];
    expect(passedUrls).toHaveLength(5);
  });

  it('400s without a business name or without URLs', async () => {
    expect((await POST(post({ urls: 'https://a.example' }))).status).toBe(400);
    expect((await POST(post({ canonical: { name: 'Acme' }, urls: '' }))).status).toBe(400);
    expect(runNapCheckMock).not.toHaveBeenCalled();
  });

  it('returns a fake empty success for honeypot submissions without running fetches', async () => {
    const res = await POST(post({
      canonical: { name: 'Acme' }, urls: 'https://a.example', company: 'bot-filled',
    }));
    expect(res.status).toBe(200);
    expect(runNapCheckMock).not.toHaveBeenCalled();
  });

  it('429s when the per-IP daily limit is exhausted', async () => {
    rateLimitMock.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await POST(post({ canonical: { name: 'Acme' }, urls: 'https://a.example' }));
    expect(res.status).toBe(429);
    expect(runNapCheckMock).not.toHaveBeenCalled();
  });
});
