/**
 * Fix Engine - content-freshness module + last-modified extraction.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixContext } from '@/lib/fix-engine/types';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const state = vi.hoisted(() => ({
  pages: {} as Record<string, { lastModified: string | null; title?: string; text?: string }>,
  targets: [] as string[],
  llm: { update: 'Acme Analytics now tracks 1.2M AI answers across 10 engines, up from 400k in 2025.', rationale: 'Stale pages lose AI citations.' },
  cmsWrites: [] as { html: string; mode: string }[],
}));

vi.mock('@/lib/fix-engine/crawl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fix-engine/crawl')>()),
  resolveCrawlTargets: vi.fn(async () => state.targets),
  crawlPage: vi.fn(async (url: string) => ({
    url, status: 200, title: state.pages[url]?.title ?? 'T', metaDescription: null,
    h1s: [], headings: [], text: state.pages[url]?.text ?? 'body text', jsonLd: [],
    wordCount: 100, hasFaqSchema: false, metaRobots: null, xRobotsTag: null,
    hasOgTags: false, externalLinkCount: 0, lastModified: state.pages[url]?.lastModified ?? null,
  })),
}));
vi.mock('@/lib/fix-engine/generate', () => ({
  generateJson: vi.fn(async () => ({ data: state.llm, creditsUsed: 1 })),
}));
vi.mock('@/lib/fix-engine/modules/_shared', () => ({
  resolveCmsForBrand: vi.fn(async () => ({
    adapter: { updateBody: vi.fn(async (_c: unknown, _t: unknown, html: string, mode: string) => { state.cmsWrites.push({ html, mode }); return { ok: true, resourceId: 1 }; }) },
    creds: {}, siteUrl: 'https://acme.test',
  })),
  clamp: (s: string) => s,
}));

import { contentFreshnessModule, STALE_DAYS } from '@/lib/fix-engine/modules/content-freshness';
import { extractLastModified } from '@/lib/fix-engine/crawl';

const ctx = { brand: { id: 'b1', userId: 'u1', name: 'Acme', website: 'https://acme.test' }, tenantId: 'u1', userKeysLegacy: {} } as unknown as FixContext;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

beforeEach(() => {
  state.targets = ['https://acme.test/old', 'https://acme.test/fresh', 'https://acme.test/unknown'];
  state.pages = {
    'https://acme.test/old': { lastModified: iso(400), text: 'old content' },
    'https://acme.test/fresh': { lastModified: iso(10) },
    'https://acme.test/unknown': { lastModified: null },
  };
  state.cmsWrites = [];
  vi.clearAllMocks();
});

describe('content-freshness detect', () => {
  it('flags stale pages, skips fresh AND unknown-date pages', async () => {
    const issues = await contentFreshnessModule.detect(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].targetUrl).toBe('https://acme.test/old');
    expect(issues[0].severity).toBe('high'); // 400d > 365d
    expect(issues[0].summary).toMatch(/Not updated in 400 days/);
  });

  it('uses medium severity between STALE_DAYS and a year', async () => {
    state.pages['https://acme.test/old'].lastModified = iso(STALE_DAYS + 10);
    const issues = await contentFreshnessModule.detect(ctx);
    expect(issues[0].severity).toBe('medium');
  });
});

describe('content-freshness generate/ship/recheck', () => {
  const issue = {
    key: 'https://acme.test/old', targetUrl: 'https://acme.test/old', severity: 'high' as const,
    summary: 's', detected: { url: 'https://acme.test/old', lastModified: iso(400), title: 'T', pageSummary: 'text' },
  };

  it('generates a dated update block and ships it as a body append', async () => {
    const draft = await contentFreshnessModule.generate(issue, ctx);
    expect(String(draft.generated.update)).toContain('1.2M');
    expect(String(draft.generated.html)).toMatch(/^<div class="lvx-fresh"><strong>Updated /);
    const res = await contentFreshnessModule.ship(issue, draft, ctx);
    expect(res.ok).toBe(true);
    expect(state.cmsWrites[0].mode).toBe('append');
    // Stageable too
    expect(contentFreshnessModule.contentPatch!(issue, draft)?.bodyAppend).toContain('lvx-fresh');
  });

  it('recheck verifies only when the update text is live', async () => {
    const draft = await contentFreshnessModule.generate(issue, ctx);
    state.pages['https://acme.test/old'].text = `intro ${state.llm.update} outro`;
    expect((await contentFreshnessModule.recheck(issue, draft, ctx)).verified).toBe(true);
    state.pages['https://acme.test/old'].text = 'no update here';
    expect((await contentFreshnessModule.recheck(issue, draft, ctx)).verified).toBe(false);
  });
});

describe('extractLastModified', () => {
  it('prefers article meta, then JSON-LD, then HTTP header', () => {
    const metaHtml = '<meta property="article:modified_time" content="2026-05-01T00:00:00Z">';
    expect(extractLastModified(metaHtml, [{ dateModified: '2026-01-01' }], 'Tue, 01 Feb 2026 00:00:00 GMT'))
      .toBe('2026-05-01T00:00:00.000Z');
    expect(extractLastModified('<html></html>', [{ '@graph': [{ datePublished: '2026-03-05' }] }], null))
      .toContain('2026-03-05');
    expect(extractLastModified('<html></html>', [], 'Tue, 03 Feb 2026 00:00:00 GMT')).toContain('2026-02-03');
  });

  it('returns null for garbage or missing dates', () => {
    expect(extractLastModified('<html></html>', [], null)).toBeNull();
    expect(extractLastModified('<meta property="article:modified_time" content="not-a-date">', [], 'also-junk')).toBeNull();
  });
});
