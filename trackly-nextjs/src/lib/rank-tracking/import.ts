/**
 * Import a Serpfox export (or any rank tracker CSV shaped like one), so a
 * customer's history moves over with them.
 *
 * Two shapes are read:
 *   wide - one row per keyword, then one column per check date holding the
 *          rank ("Keyword, URL, Location, 2026-10-26, 2026-10-19, ...")
 *   long - one row per check ("Keyword, URL, Location, Date, Rank")
 * Column names are matched loosely (keyword/query, url/domain/website,
 * location/city, device, date, rank/position). A rank of "-", "", "NR",
 * ">100" or "0" is "not ranking". Imported checks cost and charge nothing
 * (provider 'import'); the keywords then join the normal schedule.
 */
import { pool } from '@/lib/db';
import { uid } from '@/lib/helpers';
import { ensureRankSchema } from './schema';
import { normalizeDomain } from './domain';
import { canAddKeywords, addRefusalMessage } from './credits';
import { creditStatus } from './queries';
import { getOrCreateWebsite } from './keywords';
import { resolveLocation } from './locations';

export const MAX_IMPORT_ROWS = 50_000;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

/** A header or cell that is a date, as YYYY-MM-DD; null otherwise. */
export function parseDateCell(v: string): string | null {
  const t = v.trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; // US month first, as Serpfox writes it
  if (/[a-z]{3}/i.test(t) && /\d{4}|\d{1,2}/.test(t)) {
    const d = new Date(t);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d.toISOString().slice(0, 10);
  }
  return null;
}

export function parseRankCell(v: string | undefined): number | null {
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(n) || n <= 0 || /^>|nr|not/i.test(String(v).trim())) return null;
  return n;
}

export interface ImportedKeyword {
  keyword: string;
  domain: string;
  location: string;
  device: 'desktop' | 'mobile';
  url: string | null;
  history: { date: string; rank: number | null }[];
}

export function readSerpfoxCsv(text: string, defaultDomain = ''): { keywords: ImportedKeyword[]; error?: string } {
  const rows = parseCsv(text).slice(0, MAX_IMPORT_ROWS + 1);
  if (rows.length < 2) return { keywords: [], error: 'The file has no rows.' };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iKw = col(/^(keyword|query|search term|term)s?$|keyword/);
  if (iKw < 0) return { keywords: [], error: 'No keyword column found.' };
  const iUrl = col(/^(url|domain|website|site|target)|url|domain/);
  const iLoc = col(/location|city|geo|region/);
  const iDev = col(/device/);
  const iDate = head.findIndex((h, i) => i !== iKw && /^(date|checked|check date|day)/.test(h));
  const iRank = head.findIndex((h, i) => i !== iKw && /^(rank|position|pos|current rank|google rank)/.test(h));
  const dateCols = head.map((h, i) => ({ i, d: parseDateCell(rows[0][i]) })).filter((x) => x.d && ![iKw, iUrl, iLoc, iDev].includes(x.i));

  const byKey = new Map<string, ImportedKeyword>();
  for (const r of rows.slice(1)) {
    const keyword = String(r[iKw] || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!keyword) continue;
    const rawUrl = iUrl >= 0 ? String(r[iUrl] || '').trim() : '';
    const domain = normalizeDomain(rawUrl || defaultDomain);
    if (!domain) continue;
    const location = iLoc >= 0 ? String(r[iLoc] || '').trim() : '';
    const device = iDev >= 0 && /mob/i.test(String(r[iDev])) ? 'mobile' : 'desktop';
    const key = [keyword, domain, location.toLowerCase(), device].join('|');
    const k = byKey.get(key) || { keyword, domain, location, device, url: /\//.test(rawUrl.replace(/^https?:\/\//, '')) ? rawUrl : null, history: [] };
    if (dateCols.length) {
      for (const c of dateCols) k.history.push({ date: c.d as string, rank: parseRankCell(r[c.i]) });
    } else if (iDate >= 0 && iRank >= 0) {
      const d = parseDateCell(String(r[iDate] || ''));
      if (d) k.history.push({ date: d, rank: parseRankCell(r[iRank]) });
    } else if (iRank >= 0) {
      k.history.push({ date: new Date().toISOString().slice(0, 10), rank: parseRankCell(r[iRank]) });
    }
    byKey.set(key, k);
  }
  const keywords = [...byKey.values()].map((k) => ({ ...k, history: k.history.sort((a, b) => a.date.localeCompare(b.date)) }));
  if (!keywords.length) return { keywords, error: defaultDomain ? 'No keyword rows found.' : 'No website found: add a URL column or pick the website.' };
  return { keywords };
}

export interface ImportResult { ok: boolean; error?: string; websites: number; keywords: number; checks: number; skippedLocations: string[] }

export async function importKeywords(accountId: string, plan: string, items: ImportedKeyword[], fallbackLocation: string): Promise<ImportResult> {
  await ensureRankSchema();
  const credits = await creditStatus(accountId, plan);
  const gate = canAddKeywords(plan, credits.committed, items.length, 'weekly', 30);
  if (!gate.ok) return { ok: false, error: addRefusalMessage(gate), websites: 0, keywords: 0, checks: 0, skippedLocations: [] };

  const locCache = new Map<string, Awaited<ReturnType<typeof resolveLocation>>>();
  const siteCache = new Map<string, string>();
  const skipped = new Set<string>();
  let keywords = 0;
  let checks = 0;
  for (const it of items) {
    const locName = it.location || fallbackLocation;
    if (!locCache.has(locName)) locCache.set(locName, await resolveLocation({ name: locName }));
    const loc = locCache.get(locName);
    if (!loc) { skipped.add(locName || '(blank)'); continue; }
    if (!siteCache.has(it.domain)) {
      const s = await getOrCreateWebsite(accountId, it.domain);
      if (!s) continue;
      siteCache.set(it.domain, s.id);
    }
    const websiteId = siteCache.get(it.domain) as string;
    const deep = it.history.some((h) => h.rank != null && h.rank > 30);
    const k = await pool.query(
      `INSERT INTO rt_keywords (id, website_id, keyword, location_code, location_name, device, depth, next_check_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (website_id, keyword, location_code, device) DO UPDATE SET keyword = EXCLUDED.keyword RETURNING id`,
      [uid(), websiteId, it.keyword, loc.code, loc.name, it.device, deep ? 100 : 30]);
    const kid = k.rows[0].id;
    keywords++;
    if (it.history.length) {
      const r = await pool.query(
        `INSERT INTO rt_checks (keyword_id, checked_at, rank, url, pages_fetched, provider, cost_usd, credits)
         SELECT $1, d::date + TIME '12:00', rk, $4, 0, 'import', 0, 0 FROM unnest($2::text[], $3::int[]) AS h(d, rk)
          WHERE NOT EXISTS (SELECT 1 FROM rt_checks c WHERE c.keyword_id = $1 AND c.checked_at::date = h.d::date)`,
        [kid, it.history.map((h) => h.date), it.history.map((h) => h.rank), it.url]);
      checks += r.rowCount || 0;
    }
  }
  return { ok: true, websites: siteCache.size, keywords, checks, skippedLocations: [...skipped] };
}
