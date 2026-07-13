/**
 * Fix Engine - createTargetedFix (the shared builder behind the "Ask for a
 * fix" assistant and the targeted route). Verifies each supported module gets
 * the `detected` payload its generate() expects, that the free-text
 * instruction is threaded through, and that missing inputs are rejected with a
 * user-facing error the caller can turn into a clarifying question.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));

vi.mock('@/lib/fix-engine/schema', () => ({
  upsertDetectedFix: vi.fn(async (args: Record<string, unknown>) => { store.last = args; return 'fix1'; }),
}));
vi.mock('@/lib/fix-engine/registry', () => ({
  getModule: (k: string) => ({ key: k, channel: 'A', title: k, minPlan: 'starter' }),
}));
vi.mock('@/lib/fix-engine/crawl', () => ({
  crawlPage: vi.fn(async () => ({
    url: 'u', status: 200, title: 'Current Title', metaDescription: 'old meta',
    h1s: ['H1'], headings: [{ level: 2, text: 'Sec' }], text: 'page body text',
    jsonLd: [], wordCount: 3, hasFaqSchema: false, metaRobots: null, xRobotsTag: null, hasOgTags: false,
  })),
  resolveCrawlTargets: vi.fn(async () => ['https://acme.test/a', 'https://acme.test/b', 'https://acme.test/p']),
}));

import { createTargetedFix } from '@/lib/fix-engine/targeted';

const base = { brandId: 'b1', ownerId: 'o1', website: 'https://acme.test' };
const url = 'https://acme.test/p';

beforeEach(() => { store.last = null; vi.clearAllMocks(); });

describe('createTargetedFix — payload shapes', () => {
  it('passage-rewrite carries the pasted passage + instruction', async () => {
    await createTargetedFix({ ...base, moduleKey: 'passage-rewrite', url, passage: 'the exact paragraph here', instruction: 'make it concise' });
    const d = store.last!.detected as Record<string, unknown>;
    expect(d).toMatchObject({ url, passage: 'the exact paragraph here', instruction: 'make it concise' });
    expect(store.last!.moduleKey).toBe('passage-rewrite');
  });

  it('title-rewrite crawls and captures the current title + instruction', async () => {
    await createTargetedFix({ ...base, moduleKey: 'title-rewrite', url, instruction: 'punchier' });
    const d = store.last!.detected as Record<string, unknown>;
    expect(d.currentTitle).toBe('Current Title');
    expect(d.instruction).toBe('punchier');
  });

  it('meta-rewrite captures the current meta description', async () => {
    await createTargetedFix({ ...base, moduleKey: 'meta-rewrite', url });
    expect((store.last!.detected as Record<string, unknown>).currentMeta).toBe('old meta');
  });

  it('keyword-opportunities carries the keyword and instruction', async () => {
    await createTargetedFix({ ...base, moduleKey: 'keyword-opportunities', url, keyword: 'best crm', instruction: 'comparison shoppers' });
    const d = store.last!.detected as Record<string, unknown>;
    expect(d).toMatchObject({ query: 'best crm', page: url, instruction: 'comparison shoppers' });
  });

  it('internal-linking builds candidate pages (excluding the source)', async () => {
    await createTargetedFix({ ...base, moduleKey: 'internal-linking', url, instruction: 'link to /a' });
    const d = store.last!.detected as { candidates: { url: string }[] };
    expect(d.candidates.length).toBe(2); // /a and /b, not /p
    expect(d.candidates.some((c) => c.url === url)).toBe(false);
  });

  it('faq-schema seeds known brand queries', async () => {
    await createTargetedFix({ ...base, moduleKey: 'faq-schema', url, brandQueries: ['is acme good?'] });
    expect((store.last!.detected as Record<string, unknown>).queries).toEqual(['is acme good?']);
  });
});

describe('createTargetedFix — validation → clarifying errors', () => {
  it('requires a URL', async () => {
    await expect(createTargetedFix({ ...base, moduleKey: 'title-rewrite', url: '' })).rejects.toThrow(/page URL/i);
  });
  it('requires a real passage for passage-rewrite', async () => {
    await expect(createTargetedFix({ ...base, moduleKey: 'passage-rewrite', url, passage: 'short' })).rejects.toThrow(/paragraph/i);
  });
  it('requires a keyword for keyword-opportunities', async () => {
    await expect(createTargetedFix({ ...base, moduleKey: 'keyword-opportunities', url, keyword: '' })).rejects.toThrow(/keyword/i);
  });
});
