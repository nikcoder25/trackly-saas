/**
 * Fix Engine - GSC layer tests.
 *
 * Covers the signed OAuth state round-trip, the site-matching helper, and
 * the striking-distance / CTR-rescue detection logic with the GSC client
 * mocked (no network, no DB).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixContext } from '@/lib/fix-engine/types';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const gscState = vi.hoisted(() => ({ rows: [] as any[], token: { accessToken: 'tok', siteUrl: 'https://acme.test/' } as any }));
vi.mock('@/lib/fix-engine/gsc', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    getValidAccessToken: vi.fn(async () => gscState.token),
    searchAnalytics: vi.fn(async () => gscState.rows),
    trailingDateRange: () => ({ startDate: '2026-01-01', endDate: '2026-01-28' }),
  };
});
vi.mock('@/lib/fix-engine/crawl', () => ({
  crawlPage: vi.fn(async () => ({ title: 't', metaDescription: 'm', text: 'body', headings: [], h1s: [], jsonLd: [], wordCount: 2, hasFaqSchema: false, url: 'u', status: 200 })),
}));

import { signState, verifyState } from '@/lib/fix-engine/gsc-state';
import { matchSite } from '@/lib/fix-engine/gsc';
import { strikingDistanceModule } from '@/lib/fix-engine/modules/striking-distance';
import { ctrRescueModule } from '@/lib/fix-engine/modules/ctr-rescue';

const ctx = {
  brand: { id: 'b1', userId: 'u1', name: 'Acme', website: 'https://acme.test' },
  tenantId: 'u1', userKeysLegacy: {},
} as unknown as FixContext;

beforeEach(() => {
  process.env.JWT_SECRET = 'x'.repeat(40);
  gscState.rows = [];
  gscState.token = { accessToken: 'tok', siteUrl: 'https://acme.test/' };
  vi.clearAllMocks();
});

describe('gsc-state', () => {
  it('round-trips a signed state', () => {
    const s = signState('brandA', 'userB');
    const p = verifyState(s);
    expect(p).toMatchObject({ brandId: 'brandA', userId: 'userB' });
  });
  it('rejects tampered state', () => {
    const s = signState('brandA', 'userB');
    expect(verifyState(s.slice(0, -2) + 'xy')).toBeNull();
  });
  it('rejects expired state', () => {
    const s = signState('brandA', 'userB');
    expect(verifyState(s, -1)).toBeNull();
  });
});

describe('matchSite', () => {
  it('prefers an exact URL-prefix origin match', () => {
    const sites = [
      { siteUrl: 'https://other.com/', permissionLevel: 'owner' },
      { siteUrl: 'https://acme.test/', permissionLevel: 'owner' },
    ];
    expect(matchSite(sites, 'https://acme.test/pricing')).toBe('https://acme.test/');
  });
  it('falls back to a sc-domain property', () => {
    const sites = [{ siteUrl: 'sc-domain:acme.test', permissionLevel: 'owner' }];
    expect(matchSite(sites, 'https://www.acme.test')).toBe('sc-domain:acme.test');
  });
});

describe('striking-distance detect', () => {
  it('flags pages with position 4-15 queries that have impressions', async () => {
    gscState.rows = [
      { keys: ['https://acme.test/a', 'q1'], clicks: 1, impressions: 300, ctr: 0.003, position: 7.2 },
      { keys: ['https://acme.test/a', 'q2'], clicks: 0, impressions: 50, ctr: 0, position: 11 },
      { keys: ['https://acme.test/b', 'q3'], clicks: 5, impressions: 500, ctr: 0.01, position: 2.1 }, // too high (already ranks)
      { keys: ['https://acme.test/c', 'q4'], clicks: 0, impressions: 5, ctr: 0, position: 8 },        // too few impressions
    ];
    const issues = await strikingDistanceModule.detect(ctx);
    expect(issues.map((i) => i.targetUrl)).toEqual(['https://acme.test/a']);
    expect(issues[0].severity).toBe('high'); // best impressions > 200
  });

  it('returns nothing when GSC is not connected', async () => {
    gscState.token = null;
    expect(await strikingDistanceModule.detect(ctx)).toEqual([]);
  });
});

describe('ctr-rescue detect', () => {
  it('flags high-impression pages whose CTR is well below position-expected', async () => {
    gscState.rows = [
      // pos ~3 expects ~10% CTR; actual ~0.5% → rescue
      { keys: ['https://acme.test/p', 'q1'], clicks: 5, impressions: 1000, ctr: 0.005, position: 3 },
      // healthy page: pos ~3, CTR 12% → skip
      { keys: ['https://acme.test/ok', 'q2'], clicks: 120, impressions: 1000, ctr: 0.12, position: 3 },
    ];
    const issues = await ctrRescueModule.detect(ctx);
    expect(issues.map((i) => i.targetUrl)).toEqual(['https://acme.test/p']);
  });
});
