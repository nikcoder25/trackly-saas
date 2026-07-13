/**
 * Fix Engine - targeted internal-linking & keyword requests.
 *
 * The "Ask for a fix" box lets a user drive the internal-linking and
 * keyword-opportunities modules on demand, optionally steering them with a
 * plain-language instruction (e.g. anchor-text preference). These tests lock
 * in that the instruction is threaded into the generation prompt, and that
 * scan-detected issues (no instruction) are unaffected.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixContext } from '@/lib/fix-engine/types';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/fix-engine/crawl', () => ({
  crawlPage: vi.fn(async () => ({ url: 'u', status: 200, title: 't', metaDescription: null, h1s: [], headings: [], text: 'page text', jsonLd: [], wordCount: 2, hasFaqSchema: false, metaRobots: null, xRobotsTag: null, hasOgTags: false })),
  resolveCrawlTargets: vi.fn(async () => ['https://acme.test/a', 'https://acme.test/b']),
}));

const gen = vi.hoisted(() => ({ lastUser: '' }));
vi.mock('@/lib/fix-engine/generate', () => ({
  generateJson: vi.fn(async ({ user }: { user: string }) => {
    gen.lastUser = user;
    return {
      data: {
        links: [{ anchor: 'pricing', url: 'https://acme.test/a', reason: 'r' }],
        suggestedTitle: 'T', plan: ['do x'], heading: 'H', html: '<p>x</p>',
        rationale: 'because',
      },
      platform: 'Claude', model: 'x',
    };
  }),
}));

vi.mock('@/lib/fix-engine/gsc', () => ({ getValidAccessToken: vi.fn(), searchAnalytics: vi.fn(), trailingDateRange: vi.fn() }));
vi.mock('@/lib/fix-engine/keywords', () => ({ getKeywordMetrics: vi.fn(), hasKeywordData: vi.fn(async () => false) }));

import { internalLinkingModule } from '@/lib/fix-engine/modules/internal-linking';
import { keywordOpportunitiesModule } from '@/lib/fix-engine/modules/keyword-opportunities';

const ctx = { brand: { id: 'b1', userId: 'u1', name: 'Acme', website: 'https://acme.test' }, tenantId: 'u1', userKeysLegacy: {} } as unknown as FixContext;

beforeEach(() => { gen.lastUser = ''; vi.clearAllMocks(); });

describe('targeted internal-linking', () => {
  const base = {
    key: 'https://acme.test/p', targetUrl: 'https://acme.test/p', severity: 'low' as const, summary: '',
    detected: { url: 'https://acme.test/p', title: 't', pageText: 'body', candidates: [{ url: 'https://acme.test/a', title: null }] },
  };

  it('threads a user instruction into the generation prompt', async () => {
    const issue = { ...base, detected: { ...base.detected, instruction: 'link to /a using anchor "pricing"' } };
    await internalLinkingModule.generate(issue, ctx);
    expect(gen.lastUser).toContain('User preference');
    expect(gen.lastUser).toContain('link to /a using anchor "pricing"');
  });

  it('adds nothing extra for scan-detected issues (no instruction)', async () => {
    await internalLinkingModule.generate(base, ctx);
    expect(gen.lastUser).not.toContain('User preference');
  });
});

describe('targeted keyword-opportunities', () => {
  const base = {
    key: 'kw:crm', targetUrl: 'https://acme.test/p', severity: 'medium' as const, summary: '',
    detected: { query: 'best crm', page: 'https://acme.test/p', position: 0, impressions: 0, volume: 0, competition: 0, cpc: 0 },
  };

  it('threads a user instruction into the generation prompt', async () => {
    const issue = { ...base, detected: { ...base.detected, instruction: 'focus on comparison shoppers' } };
    await keywordOpportunitiesModule.generate(issue, ctx);
    expect(gen.lastUser).toContain('User preference');
    expect(gen.lastUser).toContain('focus on comparison shoppers');
    expect(gen.lastUser).toContain('best crm');
  });

  it('adds nothing extra when there is no instruction', async () => {
    await keywordOpportunitiesModule.generate(base, ctx);
    expect(gen.lastUser).not.toContain('User preference');
  });
});
