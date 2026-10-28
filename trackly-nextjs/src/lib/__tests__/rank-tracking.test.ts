import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ pool: { query: vi.fn() } }));

import { findRank, matchesDomain, normalizeDomain, urlPath } from '../rank-tracking/domain';
import { afterPage, maxPages, runCheck } from '../rank-tracking/checker';
import { canAddKeywords, creditsPerCheck, monthlyCommitment, monthlyCreditsFor, rankCreditsForPlan } from '../rank-tracking/credits';
import { moveOf, ruleFires, ruleMessage, type RankMove } from '../rank-tracking/rules';
import { firstCheckAt, nextCheckAt, retryAt, slotMinute } from '../rank-tracking/schedule';
import { parseOrganic } from '../rank-tracking/providers/dataforseo';
import { fetchPageWithFallback } from '../rank-tracking/providers';
import { ProviderError, type OrganicResult, type SerpPageRequest, type SerpProvider } from '../rank-tracking/providers/types';
import { parseCsv, parseRankCell, readSerpfoxCsv } from '../rank-tracking/import';
import { clientCanSee } from '../rank-tracking/access';

const org = (domains: string[], start = 1): OrganicResult[] =>
  domains.map((d, i) => ({ position: start + i, url: `https://${d}/page-${i}`, domain: d, title: d }));

describe('domain matching', () => {
  it('normalises protocol, www, path, port and case', () => {
    expect(normalizeDomain('HTTPS://www.Example.com:443/a/b?x=1')).toBe('example.com');
    expect(normalizeDomain('example.com/')).toBe('example.com');
    expect(normalizeDomain('http://user@www2.example.com')).toBe('example.com');
    expect(normalizeDomain('')).toBe('');
  });

  it('matches the root and its subdomains, never look-alikes', () => {
    expect(matchesDomain('https://www.example.com/x', 'example.com')).toBe(true);
    expect(matchesDomain('blog.example.com', 'https://example.com/')).toBe(true);
    expect(matchesDomain('notexample.com', 'example.com')).toBe(false);
    expect(matchesDomain('example.com.evil.io', 'example.com')).toBe(false);
    expect(matchesDomain('example.com', 'blog.example.com')).toBe(false);
  });

  it('finds the first organic result for the domain', () => {
    const hit = findRank(org(['a.com', 'shop.example.com', 'example.com']), 'example.com');
    expect(hit?.position).toBe(2);
    expect(findRank(org(['a.com']), 'example.com')).toBeNull();
    expect(urlPath('https://example.com/ac-repair/?x=1')).toBe('/ac-repair/?x=1');
  });
});

describe('DataForSEO organic parsing', () => {
  it('keeps organic results only and adds the page offset', () => {
    const items = [
      { type: 'paid', rank_group: 1, url: 'https://ad.com', domain: 'ad.com' },
      { type: 'local_pack', rank_group: 1, url: 'https://map.com', domain: 'map.com' },
      { type: 'organic', rank_group: 2, url: 'https://b.com', domain: 'www.b.com' },
      { type: 'organic', rank_group: 1, url: 'https://a.com', domain: 'a.com' },
      { type: 'ai_overview', rank_group: 1 },
    ];
    expect(parseOrganic(items, 1).map((r) => [r.position, r.domain])).toEqual([[1, 'a.com'], [2, 'b.com']]);
    expect(parseOrganic(items, 3).map((r) => r.position)).toEqual([21, 22]);
    // Already absolute on a later page: left as is.
    expect(parseOrganic([{ type: 'organic', rank_group: 14, url: 'https://c.com', domain: 'c.com' }], 2)[0].position).toBe(14);
  });
});

describe('early stop', () => {
  it('stops on the page the domain is found', () => {
    expect(afterPage(org(['x.com', 'example.com']), 1, 30, 'example.com')).toEqual({ done: true, rank: 2, url: 'https://example.com/page-1' });
    expect(afterPage(org(['x.com']), 1, 30, 'example.com')).toEqual({ done: false, nextPage: 2 });
    expect(afterPage(org(['x.com']), 3, 30, 'example.com')).toEqual({ done: true, rank: null, url: null });
    expect(afterPage([], 2, 30, 'example.com')).toEqual({ done: true, rank: null, url: null });
    expect(maxPages(30)).toBe(3);
    expect(maxPages(100)).toBe(10);
  });

  function fetcher(found: number | null, costPerPage = 0.0006) {
    const calls: number[] = [];
    const fn = async (req: SerpPageRequest) => {
      calls.push(req.page);
      const start = (req.page - 1) * 10 + 1;
      const doms = Array.from({ length: 10 }, (_, i) => (start + i === found ? 'example.com' : `other${start + i}.com`));
      return { organic: org(doms, start), cost: costPerPage, totalCost: costPerPage, provider: 'dataforseo' };
    };
    return { fn, calls };
  }
  const target = { keyword: 'ac repair austin', locationCode: 1026201, locationName: 'Austin,Texas,United States', device: 'desktop' as const, language: 'en', domain: 'example.com' };

  it('pays for one page when the domain is on page 1', async () => {
    const f = fetcher(4);
    const o = await runCheck({ ...target, depth: 30 }, f.fn);
    expect(o).toMatchObject({ rank: 4, pagesFetched: 1 });
    expect(o.cost).toBeCloseTo(0.0006);
    expect(f.calls).toEqual([1]);
  });

  it('pays for two pages when the domain is on page 2', async () => {
    const f = fetcher(17);
    const o = await runCheck({ ...target, depth: 30 }, f.fn);
    expect(o).toMatchObject({ rank: 17, pagesFetched: 2 });
    expect(o.cost).toBeCloseTo(0.0012);
    expect(f.calls).toEqual([1, 2]);
  });

  it('stops after three pages for a top 30 check that is not found', async () => {
    const f = fetcher(45);
    const o = await runCheck({ ...target, depth: 30 }, f.fn);
    expect(o).toMatchObject({ rank: null, pagesFetched: 3 });
    expect(o.cost).toBeCloseTo(0.0018);
  });

  it('goes on to page 5 for a top 100 check', async () => {
    const f = fetcher(45);
    const o = await runCheck({ ...target, depth: 100 }, f.fn);
    expect(o).toMatchObject({ rank: 45, pagesFetched: 5 });
    expect(f.calls).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('provider fallback', () => {
  const req: SerpPageRequest = { keyword: 'k', locationCode: 1, locationName: 'Austin,Texas,United States', device: 'desktop', language: 'en', page: 1 };
  const provider = (name: string, impl: () => Promise<OrganicResult[]>): SerpProvider & { calls: number } => {
    const p = { name, costPerPage: 0.001, calls: 0, configured: () => true, fetchSerpPage: async () => { p.calls++; return { organic: await impl(), cost: 0.001 }; } };
    return p;
  };
  const noSleep = async () => {};

  it('retries once, then uses the other provider', async () => {
    const a = provider('a', async () => { throw new ProviderError('a', 'HTTP 500'); });
    const b = provider('b', async () => org(['example.com']));
    const r = await fetchPageWithFallback(req, [a, b], noSleep);
    expect(r.provider).toBe('b');
    expect(a.calls).toBe(2);
    expect(b.calls).toBe(1);
  });

  it('treats an empty page 1 as a failure', async () => {
    const a = provider('a', async () => []);
    const b = provider('b', async () => org(['x.com']));
    const r = await fetchPageWithFallback(req, [a, b], noSleep);
    expect(r.provider).toBe('b');
    expect(r.totalCost).toBeCloseTo(0.003);
  });

  it('does not retry a provider that is not configured', async () => {
    const a = provider('a', async () => { throw new ProviderError('a', 'not configured', false); });
    const b = provider('b', async () => org(['x.com']));
    await fetchPageWithFallback(req, [a, b], noSleep);
    expect(a.calls).toBe(1);
  });

  it('throws when every provider fails', async () => {
    const a = provider('a', async () => { throw new ProviderError('a', 'down'); });
    await expect(fetchPageWithFallback(req, [a], noSleep)).rejects.toThrow('down');
  });
});

describe('credits', () => {
  it('prices checks: top 30 = 1, top 100 = 2; weekly = 4, daily = 30', () => {
    expect(creditsPerCheck(30)).toBe(1);
    expect(creditsPerCheck(100)).toBe(2);
    expect(monthlyCreditsFor('weekly', 30)).toBe(4);
    expect(monthlyCreditsFor('weekly', 100)).toBe(8);
    expect(monthlyCreditsFor('daily', 30)).toBe(30);
    expect(monthlyCreditsFor('daily', 100)).toBe(60);
    expect(monthlyCommitment([{ frequency: 'weekly', depth: 30, count: 12 }, { frequency: 'daily', depth: 100, count: 2 }])).toBe(48 + 120);
  });

  it('gives the plan allowances from the pricing', () => {
    expect(rankCreditsForPlan('starter')).toBe(1000);
    expect(rankCreditsForPlan('pro')).toBe(4000);
    expect(rankCreditsForPlan('agency')).toBe(20000);
    expect(rankCreditsForPlan('free')).toBe(0);
    expect(rankCreditsForPlan(undefined)).toBe(0);
  });

  it('blocks adds past the limit and plan features the plan lacks', () => {
    expect(canAddKeywords('starter', 0, 250, 'weekly', 30).ok).toBe(true);
    expect(canAddKeywords('starter', 0, 251, 'weekly', 30)).toMatchObject({ ok: false, reason: 'over_limit', needed: 1004 });
    expect(canAddKeywords('starter', 990, 3, 'weekly', 30)).toMatchObject({ ok: false, remaining: 10 });
    expect(canAddKeywords('starter', 0, 1, 'daily', 30)).toMatchObject({ ok: false, reason: 'plan_no_daily' });
    expect(canAddKeywords('starter', 0, 1, 'weekly', 100)).toMatchObject({ ok: false, reason: 'plan_no_top100' });
    expect(canAddKeywords('pro', 0, 1, 'weekly', 100).ok).toBe(true);
    expect(canAddKeywords('agency', 0, 100, 'daily', 30).ok).toBe(true);
    expect(canAddKeywords('free', 0, 1, 'weekly', 30)).toMatchObject({ ok: false, reason: 'plan_no_rank_tracking' });
  });
});

describe('alert rules', () => {
  const m = (prev: number | null | undefined, now: number | null, extra: Partial<RankMove> = {}): RankMove => ({ prev, now, depth: 30, bestBefore: 5, worstBefore: 25, ...extra });

  it('measures moves with "not ranking" as depth + 1', () => {
    expect(moveOf(m(10, 4))).toBe(6);
    expect(moveOf(m(null, 20))).toBe(11);
    expect(moveOf(m(20, null))).toBe(-11);
    expect(moveOf(m(undefined, 3))).toBe(0);
  });

  it('fires each rule type on the right moves', () => {
    expect(ruleFires('changes_by', 5, m(10, 4))).toBe(true);
    expect(ruleFires('changes_by', 5, m(10, 5))).toBe(false);
    expect(ruleFires('changes_by', 5, m(4, 12))).toBe(true);
    expect(ruleFires('gains', 3, m(10, 6))).toBe(true);
    expect(ruleFires('gains', 3, m(6, 10))).toBe(false);
    expect(ruleFires('loses', 3, m(6, 10))).toBe(true);
    expect(ruleFires('loses', 3, m(10, null))).toBe(true);
    expect(ruleFires('enters_top', 3, m(5, 3))).toBe(true);
    expect(ruleFires('enters_top', 3, m(2, 3))).toBe(false);
    expect(ruleFires('enters_top', 10, m(null, 9))).toBe(true);
    expect(ruleFires('leaves_top', 10, m(9, 11))).toBe(true);
    expect(ruleFires('leaves_top', 10, m(9, null))).toBe(true);
    expect(ruleFires('leaves_top', 10, m(11, 12))).toBe(false);
    expect(ruleFires('new_best', null, m(6, 4))).toBe(true);
    expect(ruleFires('new_best', null, m(6, 5))).toBe(false);
    expect(ruleFires('new_best', null, m(6, null))).toBe(false);
    expect(ruleFires('new_worst', null, m(20, 26))).toBe(true);
    expect(ruleFires('new_worst', null, m(20, null))).toBe(true);
    expect(ruleFires('new_worst', null, m(20, 25))).toBe(false);
  });

  it('never fires on the first check', () => {
    for (const t of ['changes_by', 'enters_top', 'gains', 'new_best', 'new_worst'] as const) expect(ruleFires(t, 1, m(undefined, 1))).toBe(false);
  });

  it('writes plain messages', () => {
    expect(ruleMessage('enters_top', 3, 'ac repair austin', 'example.com', m(5, 2))).toBe('ac repair austin entered the top 3 on example.com (now #2)');
    expect(ruleMessage('loses', 5, 'k', 'example.com', m(4, null))).toBe('k lost 27 positions on example.com (now not in the top 30)');
  });
});

describe('schedule', () => {
  const from = new Date('2026-10-26T23:00:00Z');

  it('keeps each keyword on its own minute of the day', () => {
    expect(slotMinute('abc')).toBe(slotMinute('abc'));
    expect(slotMinute('abc')).toBeGreaterThanOrEqual(0);
    expect(slotMinute('abc')).toBeLessThan(1440);
  });

  it('schedules weekly checks 7 days on, within 12 hours', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const gap = nextCheckAt(id, 'weekly', from).getTime() - from.getTime();
      expect(gap).toBeGreaterThanOrEqual(6.5 * 86400e3);
      expect(gap).toBeLessThan(7.5 * 86400e3);
    }
  });

  it('schedules daily checks 1 day on, within 12 hours, and stays on the slot after that', () => {
    const n1 = nextCheckAt('k1', 'daily', from);
    const gap = n1.getTime() - from.getTime();
    expect(gap).toBeGreaterThanOrEqual(12 * 3600e3);
    expect(gap).toBeLessThan(36 * 3600e3);
    const n2 = nextCheckAt('k1', 'daily', n1);
    expect(n2.getTime() - n1.getTime()).toBe(86400e3);
  });

  it('spreads keywords across the day', () => {
    const minutes = new Set(Array.from({ length: 200 }, (_, i) => Math.floor(slotMinute('kw' + i) / 60)));
    expect(minutes.size).toBeGreaterThan(18);
  });

  it('runs the first check within 10 minutes and backs off failures', () => {
    const now = new Date('2026-10-27T10:00:00Z');
    expect(firstCheckAt('x', now).getTime() - now.getTime()).toBeLessThan(10 * 60e3);
    expect(retryAt(1, now).getTime() - now.getTime()).toBe(15 * 60e3);
    expect(retryAt(3, now).getTime() - now.getTime()).toBe(60 * 60e3);
    expect(retryAt(20, now).getTime() - now.getTime()).toBe(12 * 3600e3);
  });
});

describe('Serpfox import', () => {
  it('parses quoted CSV', () => {
    expect(parseCsv('a,"b, c",d\n1,"x ""y""",3\n')).toEqual([['a', 'b, c', 'd'], ['1', 'x "y"', '3']]);
  });

  it('reads ranks', () => {
    expect(parseRankCell('4')).toBe(4);
    expect(parseRankCell('-')).toBeNull();
    expect(parseRankCell('>100')).toBeNull();
    expect(parseRankCell('NR')).toBeNull();
    expect(parseRankCell('0')).toBeNull();
  });

  it('reads the wide shape with one column per date', () => {
    const csv = 'Keyword,URL,Location,2026-10-19,2026-10-26\nac repair austin,https://www.example.com/ac/,"Austin, TX",6,4\nduct cleaning austin,example.com,"Austin, TX",-,18\n';
    const r = readSerpfoxCsv(csv);
    expect(r.error).toBeUndefined();
    expect(r.keywords).toHaveLength(2);
    expect(r.keywords[0]).toMatchObject({ keyword: 'ac repair austin', domain: 'example.com', location: 'Austin, TX', url: 'https://www.example.com/ac/' });
    expect(r.keywords[0].history).toEqual([{ date: '2026-10-19', rank: 6 }, { date: '2026-10-26', rank: 4 }]);
    expect(r.keywords[1].history[0].rank).toBeNull();
  });

  it('reads the long shape with a date and a rank per row', () => {
    const csv = 'Keyword,Domain,Location,Device,Date,Rank\nplumber denver,example.com,Denver,Mobile,10/19/2026,9\nplumber denver,example.com,Denver,Mobile,10/26/2026,7\n';
    const r = readSerpfoxCsv(csv);
    expect(r.keywords).toHaveLength(1);
    expect(r.keywords[0]).toMatchObject({ device: 'mobile', history: [{ date: '2026-10-19', rank: 9 }, { date: '2026-10-26', rank: 7 }] });
  });

  it('uses the chosen website when the file has no URL column, and explains a bad file', () => {
    expect(readSerpfoxCsv('Keyword,Rank\nfoo,3\n', 'example.com').keywords[0].domain).toBe('example.com');
    expect(readSerpfoxCsv('Keyword,Rank\nfoo,3\n').error).toMatch(/website/i);
    expect(readSerpfoxCsv('Name\nfoo\n').error).toMatch(/keyword column/i);
  });
});

describe('client access', () => {
  const kw = { website_id: 'w1', group_id: 'g1', starred: false };
  it('limits a client to their websites, groups or starred keywords', () => {
    expect(clientCanSee({ scope: 'websites', website_ids: ['w1'], group_ids: [] }, kw)).toBe(true);
    expect(clientCanSee({ scope: 'websites', website_ids: ['w2'], group_ids: [] }, kw)).toBe(false);
    expect(clientCanSee({ scope: 'groups', website_ids: [], group_ids: ['g1'] }, kw)).toBe(true);
    expect(clientCanSee({ scope: 'groups', website_ids: [], group_ids: ['g2'] }, kw)).toBe(false);
    expect(clientCanSee({ scope: 'starred', website_ids: ['w1'], group_ids: [] }, kw)).toBe(false);
    expect(clientCanSee({ scope: 'starred', website_ids: ['w1'], group_ids: [] }, { ...kw, starred: true })).toBe(true);
  });
});
