/**
 * Read side of rank tracking: everything the pages, the client portal and
 * the reports show. Positions compare the latest check with an earlier
 * one: the previous check ('last'), or the latest check at least N days
 * old (falling back to the oldest when the keyword is younger than that).
 */
import { pool } from '@/lib/db';
import { ensureRankSchema } from './schema';
import { keywordAiStatus, shareOfVoice } from './ai';
import { monthlyCommitment, rankCreditsForPlan, DAILY_PLANS, TOP100_PLANS, type Frequency } from './credits';
import { providerChain } from './providers';
import { matchesDomain } from './domain';
import type { ComparePeriod, GroupSummary, KeywordDto, KeywordHistory, RankCreditStatus, RankOverview, RankSummary, WebsiteDetail, WebsiteSummary } from './types';

export function parsePeriod(v: string | null | undefined): ComparePeriod {
  return v === '7' || v === '30' || v === '90' ? v : v === 'week' ? '7' : v === 'month' ? '30' : v === '3months' ? '90' : 'last';
}
const periodDays = (p: ComparePeriod): number | null => (p === 'last' ? null : Number(p));

/** "Austin,Texas,United States" -> "Austin, TX" style short city. */
export const STATE_ABBR: Record<string, string> = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };
export function shortCity(locationName: string): string {
  const parts = String(locationName || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length >= 3 && parts[parts.length - 1] === 'United States') return `${parts[0]}, ${STATE_ABBR[parts[1]] || parts[1]}`;
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(', ');
}

const pos = (r: number | null, depth: number) => (r == null ? depth + 1 : r);
const round1 = (n: number) => Math.round(n * 10) / 10;
const avgOf = (xs: (number | null)[]) => { const r = xs.filter((x): x is number => x != null); return r.length ? round1(r.reduce((s, x) => s + x, 0) / r.length) : null; };

export async function creditStatus(accountId: string, plan: string): Promise<RankCreditStatus> {
  await ensureRankSchema();
  const load = await pool.query(
    `SELECT k.frequency, k.depth, COUNT(*)::int AS count FROM rt_keywords k JOIN rt_websites w ON w.id = k.website_id
      WHERE w.account_id = $1 GROUP BY 1, 2`, [accountId]);
  const used = await pool.query(
    `SELECT COALESCE(SUM(c.credits), 0)::int AS n FROM rt_checks c JOIN rt_keywords k ON k.id = c.keyword_id JOIN rt_websites w ON w.id = k.website_id
      WHERE w.account_id = $1 AND c.checked_at >= date_trunc('month', NOW()) AND c.provider <> 'import'`, [accountId]);
  const now = new Date();
  const p = String(plan || 'free').toLowerCase();
  return {
    plan: p,
    allowance: rankCreditsForPlan(p),
    committed: monthlyCommitment(load.rows.map((r) => ({ frequency: r.frequency as Frequency, depth: r.depth, count: r.count }))),
    usedThisMonth: used.rows[0]?.n || 0,
    resetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
    allowsDaily: DAILY_PLANS.has(p),
    allowsTop100: TOP100_PLANS.has(p),
  };
}

interface RawKw {
  id: string; website_id: string; domain: string; keyword: string; group_id: string | null; group_name: string | null; starred: boolean;
  location_name: string; location_code: number | null; device: 'desktop' | 'mobile'; frequency: 'weekly' | 'daily'; depth: number;
  volume: number | null; next_check_at: Date; pending_task_id: string | null; pending_provider: string | null; last_error: string | null;
  rank: number | null; url: string | null; checked_at: Date | null; prev_rank: number | null; has_prev: boolean; best: number | null; spark: (number | null)[] | null;
}

/** Keyword rows with latest rank, comparison rank, best and last 8 ranks. `where` filters alias k (and w). */
export async function keywordRows(where: string, params: unknown[], period: ComparePeriod, withBest = true): Promise<RawKw[]> {
  await ensureRankSchema();
  const days = periodDays(period);
  const n = params.length;
  const r = await pool.query<RawKw>(
    `SELECT k.id, k.website_id, w.domain, k.keyword, k.group_id, g.name AS group_name, k.starred, k.location_name, k.location_code,
            k.device, k.frequency, k.depth, k.volume, k.next_check_at, k.pending_task_id, k.pending_provider, k.last_error,
            l.rank, l.url, l.checked_at,
            COALESCE(p.rank, o.rank) AS prev_rank, (p.has OR o.has) IS TRUE AS has_prev,
            ${withBest ? 'b.best' : 'NULL::int AS best'}, s.spark
       FROM rt_keywords k
       JOIN rt_websites w ON w.id = k.website_id
       LEFT JOIN rt_groups g ON g.id = k.group_id
       LEFT JOIN LATERAL (SELECT rank, url, checked_at FROM rt_checks WHERE keyword_id = k.id ORDER BY checked_at DESC LIMIT 1) l ON TRUE
       LEFT JOIN LATERAL (SELECT rank, TRUE AS has FROM rt_checks WHERE keyword_id = k.id AND checked_at < l.checked_at
                            AND ($${n + 1}::int IS NULL OR checked_at <= NOW() - make_interval(days => $${n + 1}::int))
                          ORDER BY checked_at DESC LIMIT 1) p ON TRUE
       LEFT JOIN LATERAL (SELECT rank, TRUE AS has FROM rt_checks WHERE keyword_id = k.id AND checked_at < l.checked_at AND p.has IS NULL
                          ORDER BY checked_at ASC LIMIT 1) o ON TRUE
       ${withBest ? 'LEFT JOIN LATERAL (SELECT MIN(rank) AS best FROM rt_checks WHERE keyword_id = k.id) b ON TRUE' : ''}
       LEFT JOIN LATERAL (SELECT array_agg(rank ORDER BY checked_at) AS spark FROM
                            (SELECT rank, checked_at FROM rt_checks WHERE keyword_id = k.id ORDER BY checked_at DESC LIMIT 8) x) s ON TRUE
      WHERE ${where}
      ORDER BY k.keyword`,
    [...params, days]);
  return r.rows;
}

function toDto(k: RawKw, ai: Map<string, import('./ai').AiStatus>): KeywordDto {
  const change = k.has_prev && k.checked_at ? pos(k.prev_rank, k.depth) - pos(k.rank, k.depth) : 0;
  return {
    id: k.id, keyword: k.keyword, groupId: k.group_id, groupName: k.group_name, starred: k.starred,
    rank: k.rank, prevRank: k.prev_rank, hasPrev: !!k.has_prev, change, best: k.best, url: k.url,
    locationName: k.location_name, locationCode: k.location_code, city: shortCity(k.location_name), device: k.device,
    frequency: k.frequency, depth: k.depth, volume: k.volume, ai: ai.get(k.keyword.toLowerCase()) ?? null,
    checkedAt: k.checked_at ? new Date(k.checked_at).toISOString() : null, nextCheckAt: new Date(k.next_check_at).toISOString(),
    pending: !!k.pending_provider, error: k.last_error, spark: k.spark || [],
  };
}

/** Average position per week for the last 8 weeks, per website (and per group). */
async function weeklyTrend(accountId: string): Promise<{ site: Map<string, (number | null)[]>; group: Map<string, (number | null)[]> }> {
  const r = await pool.query(
    `SELECT k.website_id, k.group_id, floor(EXTRACT(EPOCH FROM (NOW() - c.checked_at)) / 604800)::int AS wk, AVG(c.rank)::float AS avg
       FROM rt_checks c JOIN rt_keywords k ON k.id = c.keyword_id JOIN rt_websites w ON w.id = k.website_id
      WHERE w.account_id = $1 AND c.checked_at >= NOW() - INTERVAL '56 days' AND c.rank IS NOT NULL
      GROUP BY 1, 2, 3`, [accountId]);
  const acc = (m: Map<string, { s: number[]; n: number[] }>, key: string, wk: number, avg: number) => {
    const v = m.get(key) || { s: Array(8).fill(0), n: Array(8).fill(0) };
    if (wk >= 0 && wk < 8) { v.s[7 - wk] += avg; v.n[7 - wk] += 1; }
    m.set(key, v);
  };
  const site = new Map<string, { s: number[]; n: number[] }>();
  const group = new Map<string, { s: number[]; n: number[] }>();
  for (const row of r.rows) {
    acc(site, row.website_id, row.wk, row.avg);
    if (row.group_id) acc(group, row.group_id, row.wk, row.avg);
  }
  const fin = (m: Map<string, { s: number[]; n: number[] }>) => new Map([...m].map(([k, v]) => [k, v.s.map((s, i) => (v.n[i] ? round1(s / v.n[i]) : null))]));
  return { site: fin(site), group: fin(group) };
}

function rollup(rows: RawKw[]) {
  const ranked = rows.filter((r) => r.checked_at);
  const now = avgOf(ranked.map((r) => r.rank));
  const prev = avgOf(ranked.filter((r) => r.has_prev).map((r) => r.prev_rank));
  const cities = new Map<string, number>();
  rows.forEach((r) => { const c = shortCity(r.location_name); cities.set(c, (cities.get(c) || 0) + 1); });
  return {
    keywords: rows.length,
    avg: now,
    top10: ranked.filter((r) => r.rank != null && r.rank <= 10).length,
    change: now != null && prev != null ? round1(prev - now) : 0,
    city: [...cities].sort((a, b) => b[1] - a[1])[0]?.[0] || '',
  };
}

/**
 * Limit websites (and their keyword rows) to one brand's domain. `undefined`
 * means no brand scope (all websites); an empty string means the brand has no
 * website yet, so nothing matches.
 */
function scopeToDomain<S extends { id: string; domain: string }, R extends { website_id: string }>(sites: S[], rows: R[], domain: string | undefined): { sites: S[]; rows: R[] } {
  if (domain === undefined) return { sites, rows };
  const kept = sites.filter((s) => !!domain && matchesDomain(s.domain, domain));
  const ids = new Set(kept.map((s) => s.id));
  return { sites: kept, rows: rows.filter((r) => ids.has(r.website_id)) };
}

export async function rankSummary(accountId: string, plan: string, period: ComparePeriod, domain?: string): Promise<RankSummary> {
  await ensureRankSchema();
  const [allRows, credits, allSites, allGroups, trend] = await Promise.all([
    keywordRows('w.account_id = $1', [accountId], period, false),
    creditStatus(accountId, plan),
    pool.query(`SELECT id, domain FROM rt_websites WHERE account_id = $1 ORDER BY domain`, [accountId]),
    pool.query(`SELECT g.id, g.name, g.website_id, w.domain FROM rt_groups g JOIN rt_websites w ON w.id = g.website_id WHERE w.account_id = $1 ORDER BY w.domain, g.name`, [accountId]),
    weeklyTrend(accountId),
  ]);
  const { sites: siteRows, rows } = scopeToDomain(allSites.rows, allRows, domain);
  const sites = { rows: siteRows };
  const siteIds = new Set(siteRows.map((x) => x.id));
  const groups = { rows: allGroups.rows.filter((g) => siteIds.has(g.website_id)) };
  const sov = await shareOfVoice(accountId, sites.rows.map((s) => s.domain));
  const websites: WebsiteSummary[] = sites.rows.map((s) => {
    const list = rows.filter((r) => r.website_id === s.id);
    return { id: s.id, domain: s.domain, ...rollup(list), sov: sov.get(s.domain) ?? null, trend: trend.site.get(s.id) || Array(8).fill(null) };
  });
  const groupList: GroupSummary[] = groups.rows.map((g) => {
    const list = rows.filter((r) => r.group_id === g.id);
    return { id: g.id, websiteId: g.website_id, domain: g.domain, name: g.name, ...rollup(list), trend: trend.group.get(g.id) || Array(8).fill(null) };
  });
  const checked = rows.filter((r) => r.checked_at);
  const ranks = checked.map((r) => r.rank);
  const prevChecked = checked.filter((r) => r.has_prev);
  const nowAvg = avgOf(ranks);
  const prevAvg = avgOf(prevChecked.map((r) => r.prev_rank));
  const last = checked.reduce<Date | null>((m, r) => (!m || (r.checked_at as Date) > m ? (r.checked_at as Date) : m), null);
  const next = rows.reduce<Date | null>((m, r) => (!m || r.next_check_at < m ? r.next_check_at : m), null);
  const top3 = ranks.filter((r) => r != null && r <= 3).length;
  const top10 = ranks.filter((r) => r != null && r <= 10).length;
  return {
    credits,
    stats: {
      keywords: rows.length, websites: sites.rows.length, avg: nowAvg, avgChange: nowAvg != null && prevAvg != null ? round1(prevAvg - nowAvg) : 0,
      top3, top3Change: top3 - prevChecked.filter((r) => r.prev_rank != null && r.prev_rank <= 3).length - checked.filter((r) => !r.has_prev && r.rank != null && r.rank <= 3).length,
      top10, top10Change: top10 - prevChecked.filter((r) => r.prev_rank != null && r.prev_rank <= 10).length - checked.filter((r) => !r.has_prev && r.rank != null && r.rank <= 10).length,
      dropped: prevChecked.filter((r) => r.prev_rank != null && r.rank == null).length,
    },
    spread: [
      ranks.filter((r) => r != null && r <= 3).length,
      ranks.filter((r) => r != null && r > 3 && r <= 10).length,
      ranks.filter((r) => r != null && r > 10 && r <= 20).length,
      ranks.filter((r) => r != null && r > 20 && r <= 30).length,
      ranks.filter((r) => r == null || r > 30).length,
    ],
    lastCheck: last ? last.toISOString() : null,
    nextCheck: next ? new Date(next).toISOString() : null,
    websites,
    groups: groupList,
    providersConfigured: providerChain().length > 0,
  };
}

export async function websiteDetail(accountId: string, websiteId: string, period: ComparePeriod, scope?: { sql: string; params: unknown[] }): Promise<WebsiteDetail | null> {
  await ensureRankSchema();
  const w = await pool.query(`SELECT id, domain, created_at FROM rt_websites WHERE id = $1 AND account_id = $2`, [websiteId, accountId]);
  if (!w.rows.length) return null;
  const extra = scope ? ` AND ${scope.sql.replace(/\$(\d+)/g, (_m, i) => `$${Number(i) + 1}`)}` : '';
  const rows = await keywordRows(`k.website_id = $1${extra}`, [websiteId, ...(scope?.params || [])], period);
  const ai = await keywordAiStatus(accountId, w.rows[0].domain, rows.map((r) => r.keyword));
  const keywords = rows.map((r) => toDto(r, ai));
  const groups = await pool.query(`SELECT id, name FROM rt_groups WHERE website_id = $1 ORDER BY name`, [websiteId]);
  const sov = (await shareOfVoice(accountId, [w.rows[0].domain])).get(w.rows[0].domain) ?? null;
  const next = keywords.reduce<string | null>((m, k) => (!m || k.nextCheckAt < m ? k.nextCheckAt : m), null);
  return {
    website: { id: w.rows[0].id, domain: w.rows[0].domain, createdAt: new Date(w.rows[0].created_at).toISOString() },
    groups: groups.rows.map((g) => ({ id: g.id, name: g.name, count: keywords.filter((k) => k.groupId === g.id).length })),
    stats: {
      up: keywords.filter((k) => k.change > 0).length,
      down: keywords.filter((k) => k.change < 0).length,
      top10: keywords.filter((k) => k.rank != null && k.rank <= 10).length,
      ranking: keywords.filter((k) => k.rank != null).length,
      total: keywords.length,
      nextCheck: next,
    },
    keywords,
    sov,
  };
}

export async function keywordHistory(accountId: string, keywordId: string, rangeDays: number | null): Promise<KeywordHistory | null> {
  await ensureRankSchema();
  const k = await pool.query(
    `SELECT k.depth FROM rt_keywords k JOIN rt_websites w ON w.id = k.website_id WHERE k.id = $1 AND w.account_id = $2`, [keywordId, accountId]);
  if (!k.rows.length) return null;
  const r = await pool.query(
    `SELECT checked_at, rank FROM rt_checks WHERE keyword_id = $1 AND ($2::int IS NULL OR checked_at >= NOW() - make_interval(days => $2::int)) ORDER BY checked_at`,
    [keywordId, rangeDays]);
  const ranks = r.rows.map((x) => x.rank as number | null);
  const depth = k.rows[0].depth as number;
  const found = ranks.filter((x): x is number => x != null);
  return {
    points: r.rows.map((x) => ({ at: new Date(x.checked_at).toISOString(), rank: x.rank })),
    best: found.length ? Math.min(...found) : null,
    worst: ranks.length ? (ranks.some((x) => x == null) ? null : Math.max(...found)) : null,
    depth,
  };
}

export async function rankOverview(accountId: string, period: ComparePeriod, domain?: string): Promise<RankOverview> {
  await ensureRankSchema();
  const allRows = await keywordRows('w.account_id = $1', [accountId], period, false);
  const allSites = await pool.query(`SELECT id, domain FROM rt_websites WHERE account_id = $1 ORDER BY domain`, [accountId]);
  const { sites: siteRows, rows } = scopeToDomain(allSites.rows, allRows, domain);
  const sites = { rows: siteRows };
  const sov = await shareOfVoice(accountId, sites.rows.map((s) => s.domain));
  const moves = rows.filter((r) => r.has_prev && r.checked_at).map((r) => ({
    keywordId: r.id, websiteId: r.website_id, keyword: r.keyword, domain: r.domain, rank: r.rank, change: pos(r.prev_rank, r.depth) - pos(r.rank, r.depth),
  }));
  const sovVals = [...sov.values()];
  const activity = await pool.query(
    `SELECT message, kind, created_at FROM rt_alert_log WHERE account_id = $1 ORDER BY created_at DESC LIMIT ${domain === undefined ? 12 : 200}`, [accountId]);
  // Brand scope: keep only activity that names one of the brand's websites.
  if (domain !== undefined) {
    const names = siteRows.map((x) => String(x.domain).toLowerCase());
    activity.rows = activity.rows.filter((a) => names.some((n) => String(a.message || '').toLowerCase().includes(n))).slice(0, 12);
  }
  return {
    stats: {
      up: moves.filter((m) => m.change > 0).length,
      down: moves.filter((m) => m.change < 0).length,
      top10: rows.filter((r) => r.rank != null && r.rank <= 10).length,
      ranking: rows.filter((r) => r.rank != null).length,
      total: rows.length,
      sov: sovVals.length ? Math.round(sovVals.reduce((s, x) => s + x, 0) / sovVals.length) : null,
    },
    gainers: moves.filter((m) => m.change > 0).sort((a, b) => b.change - a.change).slice(0, 6),
    losers: moves.filter((m) => m.change < 0).sort((a, b) => a.change - b.change).slice(0, 6),
    sites: sites.rows.map((s) => {
      const list = rows.filter((r) => r.website_id === s.id);
      const ro = rollup(list);
      return { id: s.id, domain: s.domain, keywords: list.length, city: ro.city, change: ro.change };
    }),
    activity: activity.rows.map((a) => ({ message: a.message, kind: a.kind, at: new Date(a.created_at).toISOString() })),
  };
}
