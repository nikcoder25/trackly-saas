/**
 * Fix Engine - module + registry tests.
 *
 * Exercises real module detect/generate/preview logic with the crawler
 * and LLM generation mocked, plus registry/plan-gating invariants.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixContext } from '@/lib/fix-engine/types';

const crawlState = vi.hoisted(() => ({
  targets: [] as string[],
  pages: new Map<string, Record<string, unknown>>(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/fix-engine/crawl', () => ({
  resolveCrawlTargets: vi.fn(async () => crawlState.targets),
  crawlPage: vi.fn(async (url: string) => {
    const p = crawlState.pages.get(url);
    if (!p) throw new Error('unreachable');
    return { url, status: 200, h1s: [], headings: [], text: '', jsonLd: [], wordCount: 0, hasFaqSchema: false, title: null, metaDescription: null, ...p };
  }),
}));
vi.mock('@/lib/fix-engine/generate', () => ({
  generateJson: vi.fn(async () => ({ data: {
    title: 'Acme Plumbing | Fast Local Repairs in Austin',
    description: 'Acme Plumbing offers fast, licensed plumbing repairs across Austin. Book same-day service online and get a free upfront quote today.',
    rationale: 'tightened for SEO+GEO',
    faqs: [{ question: 'Do you offer same-day service?', answer: 'Yes, across Austin.' }],
    lede: 'Acme Plumbing provides licensed plumbing repairs in Austin.',
    sections: [{ heading: 'What areas do you serve?', body: 'All of Austin.' }],
  }, platform: 'Claude', model: 'x' })),
  generateContent: vi.fn(async () => ({ text: '# Acme\n> Plumbing', platform: 'Claude', model: 'x' })),
}));

import { titleRewriteModule } from '@/lib/fix-engine/modules/title-rewrite';
import { metaRewriteModule } from '@/lib/fix-engine/modules/meta-rewrite';
import { faqSchemaModule } from '@/lib/fix-engine/modules/faq-schema';
import { listModules, getModule, meetsPlan, planRank, moduleCatalog } from '@/lib/fix-engine/registry';

const ctx = {
  brand: { id: 'b1', userId: 'u1', name: 'Acme', website: 'https://acme.test', queries: [] },
  tenantId: 'u1', userKeysLegacy: {},
} as unknown as FixContext;

beforeEach(() => {
  crawlState.targets = [];
  crawlState.pages.clear();
  vi.clearAllMocks();
});

describe('registry + plan gating', () => {
  it('registers exactly the 5 Phase-1 modules with unique keys', () => {
    const mods = listModules();
    expect(mods).toHaveLength(5);
    const keys = mods.map((m) => m.key);
    expect(new Set(keys).size).toBe(5);
    expect(keys).toEqual(expect.arrayContaining([
      'title-rewrite', 'meta-rewrite', 'geo-page-rewrite', 'faq-schema', 'llms-txt',
    ]));
  });

  it('every module implements the full contract', () => {
    for (const m of listModules()) {
      for (const fn of ['detect', 'generate', 'preview', 'ship', 'recheck'] as const) {
        expect(typeof m[fn]).toBe('function');
      }
    }
  });

  it('catalog items expose no functions', () => {
    for (const item of moduleCatalog()) {
      expect(typeof (item as Record<string, unknown>).detect).toBe('undefined');
    }
  });

  it('ranks and gates plans correctly', () => {
    expect(planRank('pro')).toBeGreaterThan(planRank('starter'));
    expect(meetsPlan('pro', 'starter')).toBe(true);
    expect(meetsPlan('free', 'starter')).toBe(false);
    expect(meetsPlan('starter', 'pro')).toBe(false);
    expect(meetsPlan('trial', 'pro')).toBe(true);
  });
});

describe('title-rewrite', () => {
  it('flags a too-long title and skips a healthy one', async () => {
    crawlState.targets = ['https://acme.test/ok', 'https://acme.test/long'];
    crawlState.pages.set('https://acme.test/ok', { title: 'Acme Plumbing | Austin Repairs Done Right' });
    crawlState.pages.set('https://acme.test/long', { title: 'x'.repeat(80) });
    const issues = await titleRewriteModule.detect(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].targetUrl).toBe('https://acme.test/long');
    expect(issues[0].summary).toMatch(/too long/);
  });

  it('flags a missing title as high severity', async () => {
    crawlState.targets = ['https://acme.test/none'];
    crawlState.pages.set('https://acme.test/none', { title: null });
    const issues = await titleRewriteModule.detect(ctx);
    expect(issues[0].severity).toBe('high');
  });

  it('generates a bounded title and previews a diff', async () => {
    const issue = { key: 'u', targetUrl: 'https://acme.test/long', severity: 'medium' as const, summary: '', detected: { url: 'https://acme.test/long', currentTitle: 'old', h1: null, pageSummary: '' }, before: { title: 'old' } };
    const draft = await titleRewriteModule.generate(issue, ctx);
    expect(String(draft.generated.title).length).toBeLessThanOrEqual(60);
    const preview = titleRewriteModule.preview(issue, draft);
    expect(preview.kind).toBe('text-diff');
    expect(preview.before).toBe('old');
  });
});

describe('meta-rewrite', () => {
  it('flags a missing meta description', async () => {
    crawlState.targets = ['https://acme.test/p'];
    crawlState.pages.set('https://acme.test/p', { title: 't', metaDescription: null });
    const issues = await metaRewriteModule.detect(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].summary).toMatch(/missing/);
  });
});

describe('faq-schema', () => {
  it('flags pages without FAQ schema and generates valid FAQPage JSON-LD', async () => {
    crawlState.targets = ['https://acme.test/has', 'https://acme.test/no'];
    crawlState.pages.set('https://acme.test/has', { hasFaqSchema: true, text: '' });
    crawlState.pages.set('https://acme.test/no', { hasFaqSchema: false, text: 'some content' });
    const issues = await faqSchemaModule.detect(ctx);
    expect(issues.map((i) => i.targetUrl)).toEqual(['https://acme.test/no']);

    const draft = await faqSchemaModule.generate(issues[0], ctx);
    const schema = JSON.parse(String(draft.generated.schema));
    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity[0]['@type']).toBe('Question');
    expect(schema.mainEntity[0].acceptedAnswer['@type']).toBe('Answer');
  });
});
