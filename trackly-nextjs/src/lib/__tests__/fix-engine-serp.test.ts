/**
 * Fix Engine - competitor SERP intelligence (serp.ts): query derivation,
 * GSC primary-query lookup, and cache-first competitor fetch with
 * own-domain filtering.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixContext } from '@/lib/fix-engine/types';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const db = vi.hoisted(() => ({
  query: vi.fn(),
  cachedRows: [] as { results: unknown }[],
  inserts: [] as unknown[][],
}));
vi.mock('@/lib/db', () => ({ pool: { query: db.query } }));

const gen = vi.hoisted(() => ({
  generateJson: vi.fn(),
}));
vi.mock('@/lib/fix-engine/generate', () => ({ generateJson: gen.generateJson }));

const gsc = vi.hoisted(() => ({
  token: null as { accessToken: string; siteUrl: string } | null,
  rows: [] as { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[],
}));
vi.mock('@/lib/fix-engine/gsc', () => ({
  getValidAccessToken: vi.fn(async () => gsc.token),
  searchAnalytics: vi.fn(async () => gsc.rows),
  trailingDateRange: () => ({ startDate: '2026-06-01', endDate: '2026-06-28' }),
}));

const serpApiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: serpApiFetch }));

import { deriveQuery, getCompetitorContext, getPrimaryQueryForPage, getTopSerpResults } from '@/lib/fix-engine/serp';

const ctx = {
  brand: { id: 'b1', userId: 'u1', name: 'Acme', website: 'https://www.acme.test' },
  tenantId: 'u1',
  userKeysLegacy: {},
} as unknown as FixContext;

beforeEach(() => {
  db.cachedRows = [];
  db.inserts = [];
  db.query.mockReset();
  db.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('INSERT INTO fix_serp_cache')) { db.inserts.push(params ?? []); return { rows: [] }; }
    if (sql.includes('SELECT results FROM fix_serp_cache')) return { rows: db.cachedRows };
    return { rows: [] }; // CREATE TABLE etc.
  });
  gen.generateJson.mockReset();
  serpApiFetch.mockReset();
  delete process.env.SERPAPI_KEY;
  delete process.env.SERPER_API_KEY;
  gsc.token = null;
  gsc.rows = [];
});

describe('deriveQuery', () => {
  it('strips the brand suffix and lowercases', () => {
    expect(deriveQuery('Best AI Visibility Tools | Acme', null, 'Acme')).toBe('best ai visibility tools');
    expect(deriveQuery('Pricing – Acme Analytics', null, 'Acme')).toBe('pricing');
  });

  it('falls back to the H1 and rejects empty/too-short input', () => {
    expect(deriveQuery(null, 'How to Track AI Mentions', 'Acme')).toBe('how to track ai mentions');
    expect(deriveQuery(null, null, 'Acme')).toBeNull();
    expect(deriveQuery('Ac', null, undefined)).toBeNull();
  });
});

describe('getPrimaryQueryForPage', () => {
  it('returns the top-impressions GSC query for the URL, or null without GSC', async () => {
    expect(await getPrimaryQueryForPage(ctx, 'https://acme.test/blog/tools')).toBeNull();

    gsc.token = { accessToken: 'tok', siteUrl: 'sc-domain:acme.test' };
    gsc.rows = [
      { keys: ['https://acme.test/blog/tools', 'ai visibility tools'], clicks: 3, impressions: 900, ctr: 0.003, position: 9 },
      { keys: ['https://acme.test/blog/tools', 'best geo tools'], clicks: 1, impressions: 200, ctr: 0.005, position: 14 },
      { keys: ['https://acme.test/pricing', 'acme pricing'], clicks: 50, impressions: 5000, ctr: 0.01, position: 2 },
    ];
    expect(await getPrimaryQueryForPage(ctx, 'https://acme.test/blog/tools/')).toBe('ai visibility tools');
  });
});

describe('getTopSerpResults', () => {
  const serp = [
    { title: 'Top 10 AI Visibility Tools (2026)', description: 'Compared and ranked.', url: 'https://competitor.com/tools' },
    { title: 'Acme’s own page', description: 'should be filtered', url: 'https://acme.test/blog/tools' },
    { title: 'AI Visibility Guide', description: 'Deep dive.', url: 'https://other.io/guide' },
  ];

  it('fetches via web-grounded generation, filters own domain, and caches', async () => {
    gen.generateJson.mockResolvedValue({ data: { results: serp } });
    const results = await getTopSerpResults(ctx, 'AI Visibility Tools');
    expect(gen.generateJson).toHaveBeenCalledWith(expect.objectContaining({ platform: 'Perplexity' }));
    expect(results.map((r) => r.url)).toEqual(['https://competitor.com/tools', 'https://other.io/guide']);
    // Cached under the normalized query for the brand.
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0][0]).toBe('b1');
    expect(db.inserts[0][1]).toBe('ai visibility tools');
  });

  it('serves from cache without a model call', async () => {
    db.cachedRows = [{ results: [{ title: 'Cached', description: 'd', url: 'https://c.com' }] }];
    const results = await getTopSerpResults(ctx, 'ai visibility tools');
    expect(results).toEqual([{ title: 'Cached', description: 'd', url: 'https://c.com' }]);
    expect(gen.generateJson).not.toHaveBeenCalled();
  });

  it('returns [] on any failure (best-effort)', async () => {
    gen.generateJson.mockRejectedValue(new Error('provider down'));
    expect(await getTopSerpResults(ctx, 'ai visibility tools')).toEqual([]);
  });

  it('prefers Serper.dev when SERPER_API_KEY is set, skipping the model', async () => {
    process.env.SERPER_API_KEY = 'sk';
    serpApiFetch.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ organic: [
        { title: 'Serper result', snippet: 'Real Google.', link: 'https://rival.com/page' },
        { title: 'Own page', snippet: 'filtered', link: 'https://www.acme.test/x' },
      ] }),
    });
    const results = await getTopSerpResults(ctx, 'ai visibility tools');
    expect(results).toEqual([{ title: 'Serper result', description: 'Real Google.', url: 'https://rival.com/page' }]);
    expect(gen.generateJson).not.toHaveBeenCalled();
    const [url, init] = serpApiFetch.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toContain('google.serper.dev');
    expect(init.headers['X-API-KEY']).toBe('sk');
  });

  it('uses SerpApi (real Google results) when SERPAPI_KEY is set, skipping the model', async () => {
    process.env.SERPAPI_KEY = 'k';
    serpApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ organic_results: [
        { title: 'Real result', snippet: 'From Google.', link: 'https://real.com/page' },
        { title: 'Own site', snippet: 'filtered', link: 'https://acme.test/page' },
      ] }),
    });
    const results = await getTopSerpResults(ctx, 'ai visibility tools');
    expect(results).toEqual([{ title: 'Real result', description: 'From Google.', url: 'https://real.com/page' }]);
    expect(gen.generateJson).not.toHaveBeenCalled();
    expect(String(serpApiFetch.mock.calls[0][0])).toContain('serpapi.com');
  });
});

describe('getCompetitorContext', () => {
  it('prefers the GSC query, falls back to a derived one, and returns competitors', async () => {
    gen.generateJson.mockResolvedValue({ data: { results: [{ title: 'T', description: 'D', url: 'https://x.com' }] } });

    // No GSC → derived from title.
    const derived = await getCompetitorContext(ctx, 'https://acme.test/p', 'Best AI Visibility Tools | Acme', null);
    expect(derived.query).toBe('best ai visibility tools');
    expect(derived.competitors).toHaveLength(1);

    // GSC present → its top query wins.
    gsc.token = { accessToken: 'tok', siteUrl: 'sc-domain:acme.test' };
    gsc.rows = [{ keys: ['https://acme.test/p', 'geo tracking software'], clicks: 2, impressions: 400, ctr: 0.005, position: 11 }];
    const fromGsc = await getCompetitorContext(ctx, 'https://acme.test/p', 'Best AI Visibility Tools | Acme', null);
    expect(fromGsc.query).toBe('geo tracking software');
  });

  it('returns no competitors when no query can be determined', async () => {
    const none = await getCompetitorContext(ctx, 'https://acme.test/p', null, null);
    expect(none).toEqual({ query: null, competitors: [] });
    expect(gen.generateJson).not.toHaveBeenCalled();
  });
});
