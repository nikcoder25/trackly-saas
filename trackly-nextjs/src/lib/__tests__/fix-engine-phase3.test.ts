/**
 * Fix Engine - Phase 2/3 module tests.
 *
 * Covers internal-linking + schema-markup (crawl-driven) and the GSC
 * URL-Inspection modules indexing-repair + canonical-fix, plus the
 * parseInspection helper — all with the crawler / GSC client mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixContext } from '@/lib/fix-engine/types';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const state = vi.hoisted(() => ({
  targets: [] as string[],
  pages: new Map<string, any>(),
  token: { accessToken: 'tok', siteUrl: 'https://acme.test/' } as any,
  inspections: new Map<string, any>(),
}));

vi.mock('@/lib/fix-engine/crawl', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual, // keep real jsonLdHasType
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
    links: [{ anchor: 'Pricing', url: 'https://acme.test/pricing', reason: 'rel' }],
    sections: [{ heading: 'More', body: 'depth' }],
    name: 'Acme', rationale: 'r',
  }, platform: 'Claude', model: 'x' })),
  generateContent: vi.fn(async () => ({ text: '{}', platform: 'Claude', model: 'x' })),
}));
vi.mock('@/lib/fix-engine/gsc', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual, // keep real parseInspection
    getValidAccessToken: vi.fn(async () => state.token),
    inspectUrl: vi.fn(async ({ inspectionUrl }: { inspectionUrl: string }) => state.inspections.get(inspectionUrl) || {}),
  };
});

import { internalLinkingModule } from '@/lib/fix-engine/modules/internal-linking';
import { schemaMarkupModule } from '@/lib/fix-engine/modules/schema-markup';
import { indexingRepairModule } from '@/lib/fix-engine/modules/indexing-repair';
import { canonicalFixModule } from '@/lib/fix-engine/modules/canonical-fix';
import { parseInspection } from '@/lib/fix-engine/gsc';

const ctx = {
  brand: { id: 'b1', userId: 'u1', name: 'Acme', website: 'https://acme.test', city: 'Austin' },
  tenantId: 'u1', userKeysLegacy: {},
} as unknown as FixContext;

function inspection(idx: Record<string, unknown>) {
  return { inspectionResult: { indexStatusResult: idx } };
}

beforeEach(() => {
  state.targets = [];
  state.pages.clear();
  state.inspections.clear();
  state.token = { accessToken: 'tok', siteUrl: 'https://acme.test/' };
  vi.clearAllMocks();
});

describe('parseInspection', () => {
  it('extracts the fields the modules use', () => {
    const s = parseInspection(inspection({
      verdict: 'PASS', coverageState: 'Crawled - currently not indexed',
      robotsTxtState: 'ALLOWED', indexingState: 'INDEXING_ALLOWED',
      googleCanonical: 'https://acme.test/a', userCanonical: 'https://acme.test/b',
    }));
    expect(s.coverageState).toMatch(/not indexed/);
    expect(s.googleCanonical).toBe('https://acme.test/a');
  });
});

describe('internal-linking', () => {
  it('creates per-page fixes when there are enough peers', async () => {
    state.targets = ['https://acme.test/', 'https://acme.test/pricing', 'https://acme.test/about', 'https://acme.test/blog'];
    for (const u of state.targets) state.pages.set(u, { title: u, text: 'content' });
    const issues = await internalLinkingModule.detect(ctx);
    expect(issues.length).toBeGreaterThan(0);
    const draft = await internalLinkingModule.generate(issues[0], ctx);
    // self-link filtered, only candidate URLs kept
    expect((draft.generated.links as any[]).every((l) => l.url !== issues[0].targetUrl)).toBe(true);
  });
});

describe('schema-markup', () => {
  it('flags a homepage missing LocalBusiness (brand has a city)', async () => {
    state.targets = ['https://acme.test/'];
    state.pages.set('https://acme.test/', { title: 'Home', text: 'x', jsonLd: [] });
    const issues = await schemaMarkupModule.detect(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].summary).toMatch(/LocalBusiness/);
    const draft = await schemaMarkupModule.generate(issues[0], ctx);
    const schema = JSON.parse(String(draft.generated.schema));
    expect(schema['@type']).toBe('LocalBusiness');
    expect(schema['@context']).toBe('https://schema.org');
  });

  it('skips a page that already has the schema type', async () => {
    state.targets = ['https://acme.test/'];
    state.pages.set('https://acme.test/', { title: 'Home', text: 'x', jsonLd: [{ '@type': 'LocalBusiness' }] });
    expect(await schemaMarkupModule.detect(ctx)).toEqual([]);
  });
});

describe('indexing-repair', () => {
  it('flags only the content cause (not robots/noindex blocked)', async () => {
    state.targets = ['https://acme.test/thin', 'https://acme.test/blocked', 'https://acme.test/noindex'];
    state.inspections.set('https://acme.test/thin', inspection({ coverageState: 'Crawled - currently not indexed', robotsTxtState: 'ALLOWED', indexingState: 'INDEXING_ALLOWED' }));
    state.inspections.set('https://acme.test/blocked', inspection({ coverageState: 'Blocked by robots.txt', robotsTxtState: 'DISALLOWED', indexingState: 'INDEXING_ALLOWED' }));
    state.inspections.set('https://acme.test/noindex', inspection({ coverageState: 'Excluded by ‘noindex’ tag', robotsTxtState: 'ALLOWED', indexingState: 'BLOCKED_BY_META_TAG' }));
    state.pages.set('https://acme.test/thin', { title: 't', text: 'thin' });
    const issues = await indexingRepairModule.detect(ctx);
    expect(issues.map((i) => i.targetUrl)).toEqual(['https://acme.test/thin']);
  });

  it('returns nothing without a GSC connection', async () => {
    state.token = null;
    expect(await indexingRepairModule.detect(ctx)).toEqual([]);
  });
});

describe('canonical-fix', () => {
  it('flags a mismatch and generates the intended canonical deterministically', async () => {
    state.targets = ['https://acme.test/p', 'https://acme.test/ok'];
    state.inspections.set('https://acme.test/p', inspection({ googleCanonical: 'https://acme.test/other', userCanonical: 'https://acme.test/p' }));
    state.inspections.set('https://acme.test/ok', inspection({ googleCanonical: 'https://acme.test/ok', userCanonical: 'https://acme.test/ok' }));
    const issues = await canonicalFixModule.detect(ctx);
    expect(issues.map((i) => i.targetUrl)).toEqual(['https://acme.test/p']);
    const draft = await canonicalFixModule.generate(issues[0], ctx);
    expect(draft.generated.canonical).toBe('https://acme.test/p');
    expect(draft.creditsUsed).toBe(0);
  });
});
