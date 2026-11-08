/**
 * The classic rank tracker read side behind /api/rank/*: the sites table,
 * one site's keyword table and one keyword's position history.
 *
 * Every number comes from rt_checks, the append-only check history. "Change"
 * compares each keyword's latest check with the check before it, counting a
 * keyword that is not ranking as position depth + 1.
 */
import { pool } from '@/lib/db';
import { ensureRankSchema } from './schema';
import { keywordAiStatus } from './ai';
import { matchesDomain } from './domain';
import { keywordRows, shortCity, type RawKw } from './queries';
import { siteKeywordOrder } from './order';
import type { RankHistoryRange, RankHistoryRow, RankSiteKeyword, RankSiteKeywords, RankSiteRow } from './types';

export { siteKeywordOrder };

const pos = (r: number | null, depth: number) => (r == null ? depth + 1 : r);

/** Positions gained (positive) or lost (negative) since the previous check; 0 without one. */
export function keywordChange(k: Pick<RawKw, 'has_prev' | 'checked_at' | 'prev_rank' | 'rank' | 'depth'>): number {
  return k.has_prev && k.checked_at ? pos(k.prev_rank, k.depth) - pos(k.rank, k.depth) : 0;
}

/** Roll a site's keyword rows up into one sites-table row. */
export function siteRollup(site: { id: string; domain: string }, rows: RawKw[]): RankSiteRow {
  const ranks = rows.map((r) => r.rank).filter((r): r is number => r != null);
  const changes = rows.map(keywordChange);
  const cities = new Map<string, number>();
  const devices = new Map<string, number>();
  for (const r of rows) {
    const c = shortCity(r.location_name);
    if (c) cities.set(c, (cities.get(c) || 0) + 1);
    devices.set(r.device, (devices.get(r.device) || 0) + 1);
  }
  const top = <T,>(m: Map<T, number>) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0];
  const last = rows.reduce<Date | null>((m, r) => (r.checked_at && (!m || r.checked_at > m) ? r.checked_at : m), null);
  return {
    id: site.id,
    domain: site.domain,
    location: top(cities) || '',
    device: (top(devices) as 'desktop' | 'mobile') || 'desktop',
    keywords: rows.length,
    high: ranks.length ? Math.min(...ranks) : null,
    low: ranks.length ? Math.max(...ranks) : null,
    change: changes.reduce((s, x) => s + x, 0),
    improved: changes.filter((x) => x > 0).length,
    dropped: changes.filter((x) => x < 0).length,
    unchanged: changes.filter((x) => x === 0).length,
    checkedAt: last ? new Date(last).toISOString() : null,
  };
}

/** Every website on the account (optionally one brand's domain), with its rollup. */
export async function rankSites(accountId: string, domain?: string): Promise<RankSiteRow[]> {
  await ensureRankSchema();
  const [sites, rows] = await Promise.all([
    pool.query<{ id: string; domain: string }>(`SELECT id, domain FROM rt_websites WHERE account_id = $1 ORDER BY domain`, [accountId]),
    keywordRows('w.account_id = $1', [accountId], 'last', false, 1),
  ]);
  const kept = domain === undefined ? sites.rows : sites.rows.filter((s) => !!domain && matchesDomain(s.domain, domain));
  return kept.map((s) => siteRollup(s, rows.filter((r) => r.website_id === s.id)));
}

export function toSiteKeyword(k: RawKw, ai: import('./ai').AiStatus): RankSiteKeyword {
  return {
    id: k.id,
    keyword: k.keyword,
    location: shortCity(k.location_name) || k.location_name,
    locationName: k.location_name,
    device: k.device,
    starred: k.starred,
    groupId: k.group_id,
    groupName: k.group_name,
    current: k.rank,
    previous: k.has_prev ? k.prev_rank : null,
    hasPrevious: !!k.has_prev,
    change: keywordChange(k),
    best: k.best,
    history: k.spark || [],
    volume: k.volume,
    rankingUrl: k.url,
    ai,
    aiMentioned: ai == null ? null : ai !== 'not_mentioned',
    checkedAt: k.checked_at ? new Date(k.checked_at).toISOString() : null,
    depth: k.depth,
    pending: !!k.pending_provider,
    error: k.last_error,
  };
}

/** One site's keywords, starred first then by rank, with the last 30 positions each. */
export async function rankSiteKeywords(accountId: string, websiteId: string): Promise<RankSiteKeywords | null> {
  await ensureRankSchema();
  const w = await pool.query<{ id: string; domain: string }>(`SELECT id, domain FROM rt_websites WHERE id = $1 AND account_id = $2`, [websiteId, accountId]);
  if (!w.rows.length) return null;
  const rows = await keywordRows('k.website_id = $1', [websiteId], 'last', true, 30);
  const ai = await keywordAiStatus(accountId, w.rows[0].domain, rows.map((r) => r.keyword));
  const groups = await pool.query<{ id: string; name: string }>(`SELECT id, name FROM rt_groups WHERE website_id = $1 ORDER BY name`, [websiteId]);
  const keywords = rows.map((r) => toSiteKeyword(r, ai.get(r.keyword.toLowerCase()) ?? null)).sort(siteKeywordOrder);
  return { site: siteRollup(w.rows[0], rows), groups: groups.rows, keywords };
}

export function parseHistoryRange(v: string | null | undefined): RankHistoryRange {
  if (v === '90d' || v === '90') return '90d';
  if (v === '1y' || v === '365' || v === '365d') return '1y';
  if (v === 'all') return 'all';
  return '30d';
}
const RANGE_DAYS: Record<RankHistoryRange, number | null> = { '30d': 30, '90d': 90, '1y': 365, all: null };

/** Every stored check of one keyword in the range, oldest first. position null = not ranking. */
export async function rankKeywordHistory(accountId: string, keywordId: string, range: RankHistoryRange): Promise<{ depth: number; points: RankHistoryRow[] } | null> {
  await ensureRankSchema();
  const k = await pool.query<{ depth: number }>(
    `SELECT k.depth FROM rt_keywords k JOIN rt_websites w ON w.id = k.website_id WHERE k.id = $1 AND w.account_id = $2`, [keywordId, accountId]);
  if (!k.rows.length) return null;
  const r = await pool.query<{ checked_at: Date; rank: number | null; url: string | null }>(
    `SELECT checked_at, rank, url FROM rt_checks
      WHERE keyword_id = $1 AND ($2::int IS NULL OR checked_at >= NOW() - make_interval(days => $2::int))
      ORDER BY checked_at`,
    [keywordId, RANGE_DAYS[range]]);
  return { depth: k.rows[0].depth, points: r.rows.map((x) => ({ date: new Date(x.checked_at).toISOString(), position: x.rank, url: x.url })) };
}

/** Queue the given keywords for a check on the next scheduler tick. Keywords already being checked are left alone. */
export async function queueRecheck(accountId: string, ids: string[]): Promise<string[]> {
  await ensureRankSchema();
  if (!ids.length) return [];
  const r = await pool.query<{ id: string }>(
    `UPDATE rt_keywords k SET next_check_at = NOW()
       FROM rt_websites w
      WHERE w.id = k.website_id AND w.account_id = $1 AND k.id = ANY($2::text[]) AND k.pending_task_id IS NULL
      RETURNING k.id`, [accountId, ids]);
  return r.rows.map((x) => x.id);
}
