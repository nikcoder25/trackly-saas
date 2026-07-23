/**
 * Fix Engine - createTargetedFix (the shared builder behind the "Ask for a
 * fix" assistant and the targeted route). Verifies each supported module gets
 * the `detected` payload its generate() expects, that the free-text
 * instruction is threaded through, that site-level modules work without a
 * page URL, and that missing inputs are rejected with a user-facing error the
 * caller can turn into a clarifying question.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));
const crawled = vi.hoisted(() => ({
  page: {
    url: 'u', status: 200, title: 'Current Title', metaDescription: 'old meta',
    h1s: ['H1'], headings: [{ level: 2, text: 'Sec' }], text: 'page body text',
    jsonLd: [], wordCount: 3, hasFaqSchema: false,
    metaRobots: null as string | null, xRobotsTag: null as string | null,
    hasOgTags: false, externalLinkCount: 0,
    lastModified: null as string | null, imagesMissingAlt: [] as string[],
  },
}));
const robots = vi.hoisted(() => ({ status: 200, text: 'User-agent: *\nAllow: /' }));

vi.mock('@/lib/fix-engine/schema', () => ({
  upsertDetectedFix: vi.fn(async (args: Record<string, unknown>) => { store.last = args; return 'fix1'; }),
}));
vi.mock('@/lib/fix-engine/registry', () => ({
  getModule: (k: string) => ({ key: k, channel: 'A', title: k, minPlan: 'starter' }),
}));
vi.mock('@/lib/fix-engine/crawl', () => ({
  crawlPage: vi.fn(async () => ({ ...crawled.page })),
  resolveCrawlTargets: vi.fn(async () => ['https://acme.test/a', 'https://acme.test/b', 'https://acme.test/p']),
}));
vi.mock('@/lib/safe-fetch', () => ({
  safeFetch: vi.fn(async () => ({ ok: robots.status === 200, status: robots.status, text: async () => robots.text })),
}));

import { createTargetedFix } from '@/lib/fix-engine/targeted';

const base = { brandId: 'b1', ownerId: 'o1', website: 'https://acme.test' };
const url = 'https://acme.test/p';

beforeEach(() => {
  store.last = null;
  crawled.page.metaRobots = null;
  crawled.page.xRobotsTag = null;
  crawled.page.imagesMissingAlt = [];
  crawled.page.lastModified = null;
  crawled.page.hasOgTags = false;
  robots.status = 200;
  vi.clearAllMocks();
});

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

  it('schema-markup honours a type named in the instruction', async () => {
    await createTargetedFix({ ...base, moduleKey: 'schema-markup', url, instruction: 'add Product schema' });
    expect(store.last!.detected).toMatchObject({ url, schemaType: 'Product', title: 'Current Title' });
    expect(store.last!.dedupeKey).toBe(`${url}#Product`);
  });

  it('schema-markup falls back to the path heuristic (homepage → Organization)', async () => {
    await createTargetedFix({ ...base, moduleKey: 'schema-markup', url: 'https://acme.test/', instruction: 'add structured data' });
    expect((store.last!.detected as { schemaType: string }).schemaType).toBe('Organization');
  });

  it.each(['citable-passages', 'external-citations'] as const)('%s stores url/title/pageText', async (moduleKey) => {
    await createTargetedFix({ ...base, moduleKey, url });
    expect(store.last!.detected).toMatchObject({ url, title: 'Current Title', pageText: 'page body text' });
  });

  it('content-freshness records the page date when known', async () => {
    crawled.page.lastModified = '2024-01-01T00:00:00.000Z';
    await createTargetedFix({ ...base, moduleKey: 'content-freshness', url });
    expect(store.last!.detected).toMatchObject({ lastModified: '2024-01-01T00:00:00.000Z' });
    expect((store.last!.detected as { daysOld: number }).daysOld).toBeGreaterThan(0);
  });

  it('image-alt builds the missing-alt image list', async () => {
    crawled.page.imagesMissingAlt = ['/a.jpg', '/b.jpg'];
    await createTargetedFix({ ...base, moduleKey: 'image-alt', url });
    expect(store.last!.detected).toMatchObject({ url, images: ['/a.jpg', '/b.jpg'] });
  });

  it('noindex-removal creates a critical fix when a noindex is present', async () => {
    crawled.page.metaRobots = 'noindex,follow';
    await createTargetedFix({ ...base, moduleKey: 'noindex-removal', url });
    expect(store.last!.severity).toBe('critical');
    expect(store.last!.detected).toMatchObject({ metaRobots: 'noindex,follow' });
  });
});

describe('createTargetedFix — site-level modules need no page URL', () => {
  it('llms-txt derives the origin from the brand website', async () => {
    await createTargetedFix({ ...base, moduleKey: 'llms-txt', url: '' });
    expect(store.last!.targetUrl).toBe('https://acme.test/llms.txt');
    expect(store.last!.detected).toMatchObject({ origin: 'https://acme.test' });
  });

  it('robots-ai-access captures the current robots.txt state', async () => {
    await createTargetedFix({ ...base, moduleKey: 'robots-ai-access', url: '' });
    expect(store.last!.targetUrl).toBe('https://acme.test/robots.txt');
    expect(store.last!.detected).toMatchObject({ origin: 'https://acme.test', currentStatus: 200 });
    expect((store.last!.before as { robots: string }).robots).toContain('User-agent');
  });

  it('og-cards defaults to the homepage', async () => {
    await createTargetedFix({ ...base, moduleKey: 'og-cards', url: '' });
    expect((store.last!.detected as { url: string }).url).toBe('https://acme.test/');
  });

  it('comparison-pages is keyed to the competitor', async () => {
    await createTargetedFix({ ...base, moduleKey: 'comparison-pages', url: '', competitor: 'Rival Inc' });
    expect(store.last!.dedupeKey).toBe('vs:rival-inc');
    expect(store.last!.targetUrl).toBeNull();
    expect(store.last!.detected).toMatchObject({ competitor: 'Rival Inc' });
  });

  it('hallucination-correction builds the fact payload, targeting the homepage', async () => {
    await createTargetedFix({
      ...base, moduleKey: 'hallucination-correction', url: '',
      falseClaim: 'Acme has no free plan', correctFact: 'Acme has a free plan', factTopic: 'pricing',
    });
    expect(store.last!.targetUrl).toBe('https://acme.test/');
    expect(store.last!.detected).toMatchObject({ factKey: 'pricing', expected: 'Acme has a free plan', found: 'Acme has no free plan' });
  });
});

describe('createTargetedFix — validation → clarifying errors', () => {
  it('requires a URL for page-level modules', async () => {
    await expect(createTargetedFix({ ...base, moduleKey: 'title-rewrite', url: '' })).rejects.toThrow(/page URL/i);
  });
  it('requires a real passage for passage-rewrite', async () => {
    await expect(createTargetedFix({ ...base, moduleKey: 'passage-rewrite', url, passage: 'short' })).rejects.toThrow(/paragraph/i);
  });
  it('requires a keyword for keyword-opportunities', async () => {
    await expect(createTargetedFix({ ...base, moduleKey: 'keyword-opportunities', url, keyword: '' })).rejects.toThrow(/keyword/i);
  });
  it('requires a competitor for comparison-pages', async () => {
    await expect(createTargetedFix({ ...base, moduleKey: 'comparison-pages', url: '' })).rejects.toThrow(/competitor/i);
  });
  it('requires both claim and fact for hallucination-correction', async () => {
    await expect(createTargetedFix({ ...base, moduleKey: 'hallucination-correction', url: '', falseClaim: 'no free plan' })).rejects.toThrow(/correct fact/i);
  });
  it('requires a site URL for site-level modules when the brand has no website', async () => {
    await expect(createTargetedFix({ ...base, website: undefined, moduleKey: 'llms-txt', url: '' })).rejects.toThrow(/site URL/i);
  });
  it('rejects image-alt when every image already has alt text', async () => {
    await expect(createTargetedFix({ ...base, moduleKey: 'image-alt', url })).rejects.toThrow(/already has alt text/i);
  });
  it('rejects noindex-removal when the page is not blocked', async () => {
    await expect(createTargetedFix({ ...base, moduleKey: 'noindex-removal', url })).rejects.toThrow(/no noindex/i);
  });
});
