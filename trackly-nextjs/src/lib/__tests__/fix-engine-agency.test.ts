/**
 * Fix Engine - agency-scale features: scan-scoped crawl cache, image-alt
 * extraction + module, and the keyword-opportunities module (GSC × KWE).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixContext } from '@/lib/fix-engine/types';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// ── crawl cache + extraction (real crawl module, mocked safeFetch) ──

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: fetchMock }));

import { crawlPage, beginCrawlCache, endCrawlCache, extractImagesMissingAlt } from '@/lib/fix-engine/crawl';

function htmlRes(html: string) {
  return { status: 200, ok: true, text: async () => html, headers: new Headers() } as unknown as Response;
}

describe('scan-scoped crawl cache', () => {
  beforeEach(() => { fetchMock.mockReset(); fetchMock.mockResolvedValue(htmlRes('<title>T</title>')); });

  it('fetches each page once inside a scan, and always outside one', async () => {
    beginCrawlCache();
    try {
      await crawlPage('https://a.com/x');
      await crawlPage('https://a.com/x');
      await crawlPage('https://a.com/x');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { endCrawlCache(); }
    // Cache cleared after the scan → recheck sees the live page.
    await crawlPage('https://a.com/x');
    await crawlPage('https://a.com/x');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('extractImagesMissingAlt', () => {
  it('finds imgs with no alt attr; leaves alt="" (decorative) and data: URIs alone', () => {
    const html = `
      <img src="/a.png">
      <img alt="" src="/decorative.png">
      <img src="/b.jpg" alt="described">
      <img src="data:image/gif;base64,xyz">
      <img class="hero" src="/a.png">
    `;
    expect(extractImagesMissingAlt(html)).toEqual(['/a.png']);
  });
});

// ── image-alt module (mocked crawl/generate/cms) ──

const modState = vi.hoisted(() => ({
  images: ['/img/team-dashboard.png', '/img/IMG_1234.jpg'],
  replaceResults: {} as Record<string, boolean>,
  replaceCalls: [] as { find: string; replace: string }[],
}));

vi.mock('@/lib/fix-engine/generate', () => ({
  generateJson: vi.fn(async ({ system }: { system: string }) => {
    if (system.includes('alt text for images')) {
      return { data: { alts: [
        { src: '/img/team-dashboard.png', alt: 'Team analytics dashboard in dark mode' },
        { src: '/img/IMG_1234.jpg', alt: 'Acme Analytics reporting view' },
      ], rationale: 'r' } };
    }
    return { data: {
      suggestedTitle: 'Best AI Visibility Tools for Agencies | Acme',
      suggestedH1: 'Best AI Visibility Tools for Agencies',
      suggestedMetaDescription: 'Compare the best AI visibility tools for agencies and pick the right one for tracking brand mentions across AI answer engines.',
      suggestedSlug: 'best-ai-visibility-tools',
      plan: ['Title: lead with the exact keyword', 'H1: use the exact keyword', 'Meta description: include the exact keyword', 'URL slug: best-ai-visibility-tools'],
      heading: 'What are the best AI visibility tools?',
      html: '<h2>What are the best AI visibility tools?</h2><p>...</p>',
      rationale: 'winnable',
    } };
  }),
}));
vi.mock('@/lib/fix-engine/modules/_shared', () => ({
  resolveCmsForBrand: vi.fn(async () => ({
    adapter: {
      replaceInBody: vi.fn(async (_c: unknown, _t: unknown, find: string, replace: string) => {
        modState.replaceCalls.push({ find, replace });
        const ok = modState.replaceResults[find] !== false;
        return ok ? { ok: true, found: true } : { ok: false, found: false };
      }),
      updateBody: vi.fn(async () => ({ ok: true })),
    },
    creds: {}, siteUrl: 'https://acme.test',
  })),
  clamp: (s: string) => s,
}));

import { imageAltModule } from '@/lib/fix-engine/modules/image-alt';

const ctx = { brand: { id: 'b1', userId: 'u1', name: 'Acme', website: 'https://acme.test' }, tenantId: 'u1', userKeysLegacy: {} } as unknown as FixContext;

describe('image-alt module', () => {
  beforeEach(() => {
    modState.replaceResults = {}; modState.replaceCalls = [];
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(htmlRes('<title>P</title><img src="/img/team-dashboard.png"><img src="/img/IMG_1234.jpg">'));
  });

  it('detects one issue per page with images missing alt', async () => {
    // resolveCrawlTargets fetches sitemap (fails → homepage only), then crawl.
    const issues = await imageAltModule.detect(ctx);
    expect(issues).toHaveLength(1);
    expect((issues[0].detected as { images: string[] }).images).toContain('/img/team-dashboard.png');
  });

  it('generates alts and ships them as per-image body edits', async () => {
    const issue = { key: 'u', targetUrl: 'https://acme.test/p', severity: 'low' as const, summary: 's', detected: { url: 'https://acme.test/p', images: modState.images, title: 'P', pageSummary: 't' } };
    const draft = await imageAltModule.generate(issue, ctx);
    expect((draft.generated.alts as unknown[]).length).toBe(2);
    const res = await imageAltModule.ship(issue, draft, ctx);
    expect(res.ok).toBe(true);
    expect(res.detail.applied).toBe(2);
    expect(modState.replaceCalls[0].replace).toContain('alt="Team analytics dashboard in dark mode"');
  });

  it('degrades to a clear handoff when no image is in the editable body', async () => {
    modState.replaceResults['src="/img/team-dashboard.png"'] = false;
    modState.replaceResults['src="/img/IMG_1234.jpg"'] = false;
    const issue = { key: 'u', targetUrl: 'https://acme.test/p', severity: 'low' as const, summary: 's', detected: { url: 'https://acme.test/p', images: modState.images, title: 'P', pageSummary: 't' } };
    const draft = await imageAltModule.generate(issue, ctx);
    const res = await imageAltModule.ship(issue, draft, ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/page builder/);
  });
});

// ── keyword-opportunities (mocked gsc + kwe) ──

const kwState = vi.hoisted(() => ({
  hasKwe: true,
  gscRows: [] as { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[],
  metrics: new Map<string, { keyword: string; volume: number; cpc: number; competition: number }>(),
}));

vi.mock('@/lib/fix-engine/gsc', () => ({
  getValidAccessToken: vi.fn(async () => ({ accessToken: 'tok', siteUrl: 'sc-domain:acme.test' })),
  searchAnalytics: vi.fn(async () => kwState.gscRows),
  trailingDateRange: () => ({ startDate: '2026-06-01', endDate: '2026-06-28' }),
}));
vi.mock('@/lib/fix-engine/keywords', () => ({
  hasKeywordData: vi.fn(async () => kwState.hasKwe),
  getKeywordMetrics: vi.fn(async () => kwState.metrics),
}));

import { keywordOpportunitiesModule, MIN_VOLUME, MAX_COMPETITION } from '@/lib/fix-engine/modules/keyword-opportunities';
import { faqSchemaModule } from '@/lib/fix-engine/modules/faq-schema';

describe('keyword-opportunities module', () => {
  beforeEach(() => {
    kwState.hasKwe = true;
    kwState.gscRows = [
      { keys: ['best ai visibility tools', 'https://acme.test/blog/tools'], clicks: 4, impressions: 900, ctr: 0.004, position: 12.3 },
      { keys: ['acme login', 'https://acme.test/login'], clicks: 500, impressions: 2000, ctr: 0.25, position: 1.1 },   // page 1 → excluded
      { keys: ['analytics platform', 'https://acme.test/'], clicks: 1, impressions: 700, ctr: 0.001, position: 15 },   // high competition ↓
    ];
    kwState.metrics = new Map([
      ['best ai visibility tools', { keyword: 'best ai visibility tools', volume: 1900, cpc: 4.2, competition: 0.18 }],
      ['analytics platform', { keyword: 'analytics platform', volume: 5000, cpc: 9.1, competition: 0.85 }],
    ]);
  });

  it('surfaces only low-competition, high-volume, page-2 keywords', async () => {
    const issues = await keywordOpportunitiesModule.detect(ctx);
    expect(issues).toHaveLength(1);
    const d = issues[0].detected as { query: string; volume: number; competition: number };
    expect(d.query).toBe('best ai visibility tools');
    expect(d.volume).toBeGreaterThanOrEqual(MIN_VOLUME);
    expect(d.competition).toBeLessThanOrEqual(MAX_COMPETITION);
    expect(issues[0].severity).toBe('high'); // 1900/mo ≥ 1000
    expect(issues[0].summary).toContain('1,900 searches/mo');
  });

  it('detects nothing without a Keywords Everywhere connection', async () => {
    kwState.hasKwe = false;
    expect(await keywordOpportunitiesModule.detect(ctx)).toEqual([]);
  });

  it('generates a plan + shippable section grounded in the page', async () => {
    const issue = (await keywordOpportunitiesModule.detect(ctx))[0];
    fetchMock.mockResolvedValue(htmlRes('<title>Tools</title><p>content</p>'));
    const draft = await keywordOpportunitiesModule.generate(issue, ctx);
    expect(String(draft.generated.suggestedTitle)).toContain('AI Visibility');
    expect(String(draft.generated.html)).toContain('<h2>');
    expect(keywordOpportunitiesModule.contentPatch!(issue, draft)?.bodyAppend).toContain('<h2>');
  });

  it('captures the on-page keyword targets (title/H1/meta/slug) for review', async () => {
    const issue = (await keywordOpportunitiesModule.detect(ctx))[0];
    fetchMock.mockResolvedValue(htmlRes('<title>Tools</title><p>content</p>'));
    const draft = await keywordOpportunitiesModule.generate(issue, ctx);
    // The module surfaces the exact keyword's placement across on-page areas so
    // a reviewer can confirm title/H1/meta/slug all target the same phrase.
    expect(String(draft.generated.suggestedH1)).toContain('AI Visibility');
    expect(String(draft.generated.suggestedMetaDescription).toLowerCase()).toContain('ai visibility tools');
    expect(String(draft.generated.suggestedSlug)).toBe('best-ai-visibility-tools');
    const preview = keywordOpportunitiesModule.preview(issue, draft);
    expect(preview.after).toContain('Exact keyword to target across on-page SEO: "best ai visibility tools"');
    expect(preview.after).toContain('H1:');
    expect(preview.after).toContain('Slug:   /best-ai-visibility-tools');
    // Before/after: the preview shows the page's current title as the "before"
    // so the reviewer can see the change, not just the proposed new content.
    expect(preview.before).toContain('Current title: Tools');
    expect(preview.before).toContain('No section on this page targets "best ai visibility tools" yet');
  });
});

describe('every generated preview carries a before/after', () => {
  // Additive fixes (schema, FAQ, citations, alt text…) have no current value,
  // so they must supply an addNote explaining what's added; edit-style fixes
  // must supply a real `before`. Either way the card can render NOW → FIX.
  it('image-alt shows the current (missing) alt as the before', async () => {
    const draft = { generated: { alts: [{ src: '/img/a.png', alt: 'A dashboard' }] } };
    const preview = imageAltModule.preview({ key: 'k', detected: {} } as never, draft as never);
    expect(preview.before).toContain('(no alt text)');
    expect(preview.after).toContain('A dashboard');
  });

  it('faq-schema (additive) supplies an addNote instead of a before', () => {
    const draft = { generated: { faqs: [{ question: 'Q?', answer: 'A.' }] } };
    const preview = faqSchemaModule.preview({ key: 'k', detected: {} } as never, draft as never);
    expect(preview.before).toBeUndefined();
    expect(preview.addNote).toMatch(/no faq/i);
    expect(preview.after).toContain('Q: Q?');
  });
});
