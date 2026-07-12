/**
 * Fix Engine - GEO module tests (comparison pages, citable passages,
 * hallucination correction) with the crawler, LLM, and DB mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixContext } from '@/lib/fix-engine/types';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const state = vi.hoisted(() => ({ targets: [] as string[], pages: new Map<string, any>() }));

vi.mock('@/lib/fix-engine/crawl', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    resolveCrawlTargets: vi.fn(async () => state.targets),
    crawlPage: vi.fn(async (url: string) => {
      const p = state.pages.get(url);
      if (!p) throw new Error('unreachable');
      return { url, status: 200, title: null, metaDescription: null, h1s: [], headings: [], text: '', jsonLd: [], wordCount: 0, hasFaqSchema: false, ...p };
    }),
  };
});
vi.mock('@/lib/fix-engine/generate', () => ({
  generateJson: vi.fn(async () => ({ data: {
    title: 'Acme vs Rivalco', slug: 'acme-vs-rivalco', answer: 'Both are good.',
    tableMarkdown: '| a | b |', chooseBrand: 'x', chooseCompetitor: 'y',
    faqs: [{ question: 'q', answer: 'a' }], rationale: 'r',
    tldr: 'Acme does X.', passages: ['Fact one.', 'Fact two.'],
    heading: 'Correction', passage: 'The correct value is 2009.',
  }, platform: 'Claude', model: 'x' })),
  generateContent: vi.fn(async () => ({ text: '{}', platform: 'Claude', model: 'x' })),
}));

import { comparisonPagesModule } from '@/lib/fix-engine/modules/comparison-pages';
import { citablePassagesModule } from '@/lib/fix-engine/modules/citable-passages';
import { hallucinationCorrectionModule } from '@/lib/fix-engine/modules/hallucination-correction';

function ctxWith(over: Partial<any> = {}, rows: any[] = []): FixContext {
  return {
    brand: { id: 'b1', userId: 'u1', name: 'Acme', website: 'https://acme.test', competitors: [], ...over },
    tenantId: 'u1', userKeysLegacy: {},
    pool: { query: vi.fn(async () => ({ rows })) },
  } as unknown as FixContext;
}

beforeEach(() => {
  state.targets = [];
  state.pages.clear();
  vi.clearAllMocks();
});

describe('comparison-pages', () => {
  it('flags competitors without an existing comparison page', async () => {
    state.targets = ['https://acme.test/', 'https://acme.test/pricing'];
    state.pages.set('https://acme.test/', { title: 'Home' });
    state.pages.set('https://acme.test/pricing', { title: 'Pricing' });
    const ctx = ctxWith({ competitors: ['Rivalco', 'Otherco'] });
    const issues = await comparisonPagesModule.detect(ctx);
    expect(issues.map((i) => (i.detected as any).competitor).sort()).toEqual(['Otherco', 'Rivalco']);
  });

  it('skips a competitor already covered by a vs page', async () => {
    state.targets = ['https://acme.test/vs-rivalco'];
    state.pages.set('https://acme.test/vs-rivalco', { title: 'Acme vs Rivalco' });
    const ctx = ctxWith({ competitors: ['Rivalco'] });
    expect(await comparisonPagesModule.detect(ctx)).toEqual([]);
  });

  it('generates a page with title, slug, and html', async () => {
    const ctx = ctxWith({ competitors: ['Rivalco'] });
    const draft = await comparisonPagesModule.generate({ key: 'k', targetUrl: null, severity: 'medium', summary: '', detected: { competitor: 'Rivalco' } }, ctx);
    expect(draft.generated.slug).toBe('acme-vs-rivalco');
    expect(String(draft.generated.html)).toContain('Rivalco');
  });
});

describe('citable-passages', () => {
  it('flags substantial pages without a Key facts block', async () => {
    state.targets = ['https://acme.test/guide', 'https://acme.test/thin', 'https://acme.test/done'];
    state.pages.set('https://acme.test/guide', { wordCount: 800, text: 'long content here' });
    state.pages.set('https://acme.test/thin', { wordCount: 50, text: 'short' });
    state.pages.set('https://acme.test/done', { wordCount: 800, text: 'has Key facts already' });
    const issues = await citablePassagesModule.detect(ctxWith());
    expect(issues.map((i) => i.targetUrl)).toEqual(['https://acme.test/guide']);
  });
});

describe('hallucination-correction', () => {
  it('creates one fix per distinct fact, keeping worst severity', async () => {
    const rows = [
      { fact_key: 'founded', expected: '2009', found: '2012', severity: 'high', explanation: null },
      { fact_key: 'founded', expected: '2009', found: '2015', severity: 'critical', explanation: null },
      { fact_key: 'hq', expected: 'Austin', found: 'Dallas', severity: 'medium', explanation: null },
    ];
    const ctx = ctxWith({}, rows);
    const issues = await hallucinationCorrectionModule.detect(ctx);
    expect(issues).toHaveLength(2);
    const founded = issues.find((i) => (i.detected as any).factKey === 'founded')!;
    expect(founded.severity).toBe('critical'); // worst severity kept
    expect(founded.targetUrl).toBe('https://acme.test/'); // homepage
  });

  it('returns nothing when there is no accuracy data', async () => {
    const ctx = ctxWith({}, []);
    expect(await hallucinationCorrectionModule.detect(ctx)).toEqual([]);
  });
});
