/**
 * Classic rank tracker: chart ticks, the site rollup, history ranges, and
 * (with DATABASE_URL) that rt_checks stays append-only and the /api/rank
 * read side returns every stored check.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rankTicks } from '@/components/rank-tracking/classic/PositionChart';
import { parseHistoryRange, siteRollup } from '@/lib/rank-tracking/sites';
import { siteKeywordOrder } from '@/lib/rank-tracking/order';
import type { RawKw } from '@/lib/rank-tracking/queries';
import type { RankSiteKeyword } from '@/lib/rank-tracking/types';

const kw = (o: Partial<RawKw>): RawKw => ({
  id: 'k', website_id: 'w', domain: 'example.com', keyword: 'x', group_id: null, group_name: null, starred: false, location_name: 'Austin,Texas,United States',
  location_code: 1, device: 'desktop', frequency: 'weekly', depth: 30, volume: null, next_check_at: new Date(), pending_task_id: null, pending_provider: null,
  last_error: null, rank: null, url: null, checked_at: new Date(), prev_rank: null, prev_checked_at: null, has_prev: false, first_checked_at: null, best: null, spark: null, ...o,
});

describe('rankTicks', () => {
  it('puts 1 at the top and spans the data', () => {
    const t = rankTicks([3, 27]);
    expect(t.ticks[0]).toBe(1);
    expect(t.ticks[t.ticks.length - 1]).toBeGreaterThanOrEqual(27);
    expect(t.ticks.length).toBeLessThanOrEqual(8);
  });
  it('zooms in on a narrow range', () => {
    expect(rankTicks([12, 17]).ticks).toEqual([12, 13, 14, 15, 16, 17]);
  });
  it('handles one value', () => {
    const t = rankTicks([5]);
    expect(t.lo).toBe(5);
    expect(t.hi).toBeGreaterThan(5);
  });
});

describe('siteRollup', () => {
  it('sums net change and counts movers; not ranking counts as depth + 1', () => {
    const r = siteRollup({ id: 'w', domain: 'example.com' }, [
      kw({ rank: 4, prev_rank: 9, has_prev: true }),
      kw({ rank: 12, prev_rank: 10, has_prev: true }),
      kw({ rank: null, prev_rank: 28, has_prev: true }),
      kw({ rank: 2 }),
    ]);
    expect(r.keywords).toBe(4);
    expect(r.high).toBe(2);
    expect(r.low).toBe(12);
    expect(r.change).toBe(5 - 2 - 3);
    expect([r.improved, r.dropped, r.unchanged]).toEqual([1, 2, 1]);
    expect(r.location).toBe('Austin, TX');
  });
});

describe('history range and order', () => {
  it('parses ranges, default 30d', () => {
    expect(parseHistoryRange(null)).toBe('30d');
    expect(parseHistoryRange('90d')).toBe('90d');
    expect(parseHistoryRange('365')).toBe('1y');
    expect(parseHistoryRange('all')).toBe('all');
  });
  it('sorts starred first, then rank, not ranking last', () => {
    const k = (keyword: string, current: number | null, starred = false) => ({ keyword, current, starred }) as RankSiteKeyword;
    const out = [k('a', null), k('b', 3), k('c', 20, true), k('d', 1)].sort(siteKeywordOrder).map((x) => x.keyword);
    expect(out).toEqual(['c', 'd', 'b', 'a']);
  });
});

const DB = !!process.env.DATABASE_URL;
describe.skipIf(!DB)('rank history in the database', () => {
  let db: typeof import('@/lib/db');
  let sites: typeof import('@/lib/rank-tracking/sites');
  const user = 'rtc_test_' + Date.now();
  const site = 'rtc_site_' + Date.now();
  const k1 = 'rtc_kw_' + Date.now();

  beforeAll(async () => {
    const url = process.env.DATABASE_URL || '';
    if (!/sslmode=/.test(url) && /@(localhost|127\.0\.0\.1)[:/]/.test(url)) process.env.DATABASE_URL = url + (url.includes('?') ? '&' : '?') + 'sslmode=disable';
    db = await import('@/lib/db');
    sites = await import('@/lib/rank-tracking/sites');
    await db.ensureColumns();
    const { ensureRankSchema } = await import('@/lib/rank-tracking/schema');
    await ensureRankSchema();
    await db.pool.query(`INSERT INTO users (id, email, plan) VALUES ($1, $2, 'pro')`, [user, `${user}@test.local`]);
    await db.pool.query(`INSERT INTO rt_websites (id, account_id, domain) VALUES ($1, $2, 'example.com')`, [site, user]);
    await db.pool.query(`INSERT INTO rt_keywords (id, website_id, keyword, location_code, location_name) VALUES ($1, $2, 'plumber', 2840, 'United States')`, [k1, site]);
    const ranks = [18, 15, null, 12, 9, 7];
    for (let i = 0; i < ranks.length; i++) {
      await db.pool.query(`INSERT INTO rt_checks (keyword_id, checked_at, rank, url, provider) VALUES ($1, NOW() - make_interval(days => $2::int), $3, $4, 'test')`,
        [k1, (ranks.length - i) * 3, ranks[i], ranks[i] ? 'https://example.com/p' : null]);
    }
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.pool.query(`DELETE FROM rt_websites WHERE account_id = $1`, [user]);
    await db.pool.query(`DELETE FROM users WHERE id = $1`, [user]);
  });

  it('refuses to overwrite a stored check', async () => {
    await expect(db.pool.query(`UPDATE rt_checks SET rank = 1 WHERE keyword_id = $1`, [k1])).rejects.toThrow(/append-only/);
    const v = await db.pool.query(`SELECT COUNT(*)::int AS n FROM rt_rank_history WHERE keyword_id = $1`, [k1]);
    expect(v.rows[0].n).toBe(6);
  });

  it('returns every check in the range, gaps as null', async () => {
    const h = await sites.rankKeywordHistory(user, k1, '30d');
    expect(h?.points.map((p) => p.position)).toEqual([18, 15, null, 12, 9, 7]);
    expect((await sites.rankKeywordHistory(user, k1, '30d'))?.points[0].url).toBe('https://example.com/p');
    expect(await sites.rankKeywordHistory('someone_else', k1, 'all')).toBeNull();
  });

  it('lists the site and its keywords with the last positions', async () => {
    const list = await sites.rankSites(user);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ keywords: 1, high: 7, low: 7, change: 2, improved: 1 });
    const d = await sites.rankSiteKeywords(user, site);
    expect(d?.keywords[0]).toMatchObject({ current: 7, previous: 9, best: 7, history: [18, 15, null, 12, 9, 7] });
  });

  it('queues a re-check', async () => {
    expect(await sites.queueRecheck(user, [k1, 'nope'])).toEqual([k1]);
  });
});
