/**
 * Fix Engine - technical module tests: noindex-removal (Channel A) and
 * og-cards (Channel B) with the crawler / LLM / connector mocked.
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
      return { url, status: 200, title: null, metaDescription: null, h1s: [], headings: [], text: '', jsonLd: [], wordCount: 0, hasFaqSchema: false, metaRobots: null, xRobotsTag: null, hasOgTags: false, ...p };
    }),
  };
});
vi.mock('@/lib/fix-engine/generate', () => ({
  generateJson: vi.fn(async () => ({ data: { ogTitle: 'Acme — Plumbing', ogDescription: 'Fast local plumbing.', rationale: 'r' }, platform: 'Claude', model: 'x' })),
  generateContent: vi.fn(async () => ({ text: '{}', platform: 'Claude', model: 'x' })),
}));
vi.mock('@/lib/fix-engine/modules/_shared', () => ({
  queueConnectorInstruction: vi.fn(async (_ctx: unknown, _id: string, ins: { op: string; payload: any }) => ({ ok: true, detail: { channel: 'B', op: ins.op }, after: ins.payload })),
  resolveCmsForBrand: vi.fn(async () => ({ adapter: { setIndexable: vi.fn(async () => ({ ok: true, detail: {} })) }, creds: {}, siteUrl: 'https://acme.test' })),
}));

import { noindexRemovalModule } from '@/lib/fix-engine/modules/noindex-removal';
import { ogCardsModule } from '@/lib/fix-engine/modules/og-cards';

const ctx = { brand: { id: 'b1', userId: 'u1', name: 'Acme', website: 'https://acme.test' }, tenantId: 'u1', userKeysLegacy: {} } as unknown as FixContext;

beforeEach(() => { state.targets = []; state.pages.clear(); vi.clearAllMocks(); });

describe('noindex-removal', () => {
  it('flags a noindex page as critical and skips an indexable one', async () => {
    state.targets = ['https://acme.test/blocked', 'https://acme.test/ok'];
    state.pages.set('https://acme.test/blocked', { metaRobots: 'noindex,follow' });
    state.pages.set('https://acme.test/ok', { metaRobots: 'index,follow' });
    const issues = await noindexRemovalModule.detect(ctx);
    expect(issues.map((i) => i.targetUrl)).toEqual(['https://acme.test/blocked']);
    expect(issues[0].severity).toBe('critical');
  });

  it('also detects noindex via X-Robots-Tag header', async () => {
    state.targets = ['https://acme.test/h'];
    state.pages.set('https://acme.test/h', { metaRobots: null, xRobotsTag: 'noindex' });
    expect(await noindexRemovalModule.detect(ctx)).toHaveLength(1);
  });

  it('generates deterministically (no credit) and ships via CMS', async () => {
    const draft = await noindexRemovalModule.generate();
    expect(draft.creditsUsed).toBe(0);
    const issue = { key: 'u', targetUrl: 'https://acme.test/blocked', severity: 'critical' as const, summary: '', detected: {} };
    const res = await noindexRemovalModule.ship(issue, draft, ctx);
    expect(res.ok).toBe(true);
  });
});

describe('og-cards', () => {
  it('flags a homepage missing OG tags', async () => {
    state.pages.set('https://acme.test/', { title: 'Home', text: 'content', hasOgTags: false });
    const issues = await ogCardsModule.detect(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].targetUrl).toBe('https://acme.test/');
  });

  it('skips when OG tags already present', async () => {
    state.pages.set('https://acme.test/', { title: 'Home', text: 'content', hasOgTags: true });
    expect(await ogCardsModule.detect(ctx)).toEqual([]);
  });

  it('generates a head block and ships via connector set_header_block', async () => {
    const issue = { key: 'https://acme.test/', targetUrl: 'https://acme.test/', severity: 'low' as const, summary: '', detected: { url: 'https://acme.test/', title: 'Home', pageText: 'x' } };
    const draft = await ogCardsModule.generate(issue, ctx);
    expect(String(draft.generated.head)).toContain('og:title');
    const res = await ogCardsModule.ship(issue, draft, ctx);
    expect(res.ok).toBe(true);
    expect((res.detail as any).op).toBe('set_header_block');
  });
});
