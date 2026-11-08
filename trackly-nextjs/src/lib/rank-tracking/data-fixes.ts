/**
 * One-off rank tracking data fixes, applied once per database on the first
 * rank tracking request after a deploy (from ensureRankSchema). Each fix has
 * an id; rt_data_fixes records the ones applied, so a fix never runs twice
 * and two instances racing on boot apply it only once.
 *
 * A location fix moves a keyword to a new location going forward: its check
 * history is kept, its schedule is untouched, and location_changed marks its
 * next check so that check is not compared with ranks from the old location.
 * A keyword is left alone when the same keyword is already tracked from the
 * target location on that site and device (unique key).
 */
import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface LocationRule {
  /** Keyword match: exact keyword, or a word/phrase it contains. */
  keyword?: string;
  contains?: string;
  code: number;
  name: string;
}

export interface LocationFix {
  id: string;
  domain: string;
  /** Only keywords currently at a location_name matching this (SQL ILIKE). */
  fromLocation: string;
  /** First matching rule wins. */
  rules: LocationRule[];
}

// DataForSEO location codes looked up with /v3/serp/google/locations (GB, US) on 2026-11-08.
const WASHINGTON_DC = { code: 1014895, name: 'Washington,District of Columbia,United States' };
const NEW_YORK = { code: 1023191, name: 'New York,New York,United States' };
const GB = {
  kettering: { code: 1006837, name: 'Kettering,England,United Kingdom' },
  bedford: { code: 9198634, name: 'Bedford,Bedford,England,United Kingdom' },
  luton: { code: 1006897, name: 'Luton,England,United Kingdom' },
  dunstable: { code: 1006687, name: 'Dunstable,Dunstable,England,United Kingdom' },
  stevenage: { code: 1007113, name: 'Stevenage,England,United Kingdom' },
  watford: { code: 1007204, name: 'Watford,England,United Kingdom' },
  wembley: { code: 1007210, name: 'Wembley,England,United Kingdom' },
  chelmsford: { code: 1006621, name: 'Chelmsford,England,United Kingdom' },
  harlow: { code: 1006764, name: 'Harlow,England,United Kingdom' },
  hatfield: { code: 9072509, name: 'Hatfield,Hertfordshire,England,United Kingdom' },
  amersham: { code: 1006474, name: 'Amersham,England,United Kingdom' },
  aylesbury: { code: 1006490, name: 'Aylesbury,England,United Kingdom' },
  chesham: { code: 1006624, name: 'Chesham,Chesham,England,United Kingdom' },
  stAlbans: { code: 1007097, name: 'St Albans,St Albans,England,United Kingdom' },
  welwyn: { code: 9237185, name: 'Welwyn Garden City,England,United Kingdom' },
  leighton: { code: 1006868, name: 'Leighton Buzzard,Leighton Buzzard,England,United Kingdom' },
  hertford: { code: 1006793, name: 'Hertford,England,United Kingdom' },
};

export const RANK_DATA_FIXES: LocationFix[] = [
  {
    id: '2026-11-08-miniml-us-locations',
    domain: 'miniml.ai',
    fromLocation: 'United Kingdom',
    rules: [
      { keyword: 'ai visibility consultants washington dc', ...WASHINGTON_DC },
      { keyword: 'artificial intelligence washington dc', ...WASHINGTON_DC },
      { keyword: 'local ai consultant washington dc area', ...WASHINGTON_DC },
      { keyword: 'nlp ai consulting companies ny', ...NEW_YORK },
    ],
  },
  {
    id: '2026-11-08-easypump-town-locations',
    domain: 'easypump.co.uk',
    fromLocation: 'London%',
    rules: [
      // "london" anywhere keeps London, so it is checked first.
      { contains: 'london', code: 0, name: '' },
      { contains: 'welwyn garden city', ...GB.welwyn },
      { contains: 'leighton buzzard', ...GB.leighton },
      { contains: 'st albans', ...GB.stAlbans },
      { contains: 'kettering', ...GB.kettering },
      // Counties go to their main town; "bedfordshire" before "bedford".
      { contains: 'bedfordshire', ...GB.bedford },
      { contains: 'buckinghamshire', ...GB.aylesbury },
      { contains: 'hertfordshire', ...GB.hertford },
      { contains: 'essex', ...GB.chelmsford },
      { contains: 'bedford', ...GB.bedford },
      { contains: 'luton', ...GB.luton },
      { contains: 'dunstable', ...GB.dunstable },
      { contains: 'stevenage', ...GB.stevenage },
      { contains: 'watford', ...GB.watford },
      { contains: 'wembley', ...GB.wembley },
      { contains: 'chelmsford', ...GB.chelmsford },
      { contains: 'harlow', ...GB.harlow },
      { contains: 'hatfield', ...GB.hatfield },
      { contains: 'amersham', ...GB.amersham },
      { contains: 'aylesbury', ...GB.aylesbury },
      { contains: 'chesham', ...GB.chesham },
      { contains: 'hertford', ...GB.hertford },
    ],
  },
];

const wordRe = (phrase: string) => new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');

/** The rule for a keyword, or null. A rule with code 0 means "leave it where it is". */
export function ruleFor(fix: LocationFix, keyword: string): LocationRule | null {
  const kw = keyword.trim().toLowerCase();
  for (const r of fix.rules) {
    if (r.keyword ? r.keyword === kw : r.contains ? wordRe(r.contains).test(kw) : false) return r.code ? r : null;
  }
  return null;
}

async function applyFix(c: PoolClient, fix: LocationFix): Promise<number> {
  const rows = await c.query<{ id: string; keyword: string; website_id: string; device: string }>(
    `SELECT k.id, k.keyword, k.website_id, k.device FROM rt_keywords k JOIN rt_websites w ON w.id = k.website_id
      WHERE w.domain = $1 AND k.location_name ILIKE $2`, [fix.domain, fix.fromLocation]);
  let moved = 0;
  for (const k of rows.rows) {
    const r = ruleFor(fix, k.keyword);
    if (!r) continue;
    const u = await c.query(
      `UPDATE rt_keywords k SET location_code = $2, location_name = $3, location_changed = TRUE
        WHERE k.id = $1 AND (k.location_code IS DISTINCT FROM $2) AND NOT EXISTS (
          SELECT 1 FROM rt_keywords o WHERE o.website_id = k.website_id AND o.keyword = k.keyword AND o.device = k.device AND o.location_code = $2 AND o.id <> k.id)`,
      [k.id, r.code, r.name]);
    moved += u.rowCount || 0;
  }
  return moved;
}

export async function applyRankDataFixes(fixes: LocationFix[] = RANK_DATA_FIXES): Promise<Record<string, number>> {
  await pool.query(`CREATE TABLE IF NOT EXISTS rt_data_fixes (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), changed INTEGER NOT NULL DEFAULT 0)`);
  const done = await pool.query<{ id: string }>(`SELECT id FROM rt_data_fixes WHERE id = ANY($1::text[])`, [fixes.map((f) => f.id)]);
  const have = new Set(done.rows.map((r) => r.id));
  const out: Record<string, number> = {};
  for (const fix of fixes) {
    if (have.has(fix.id)) continue;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // The marker row is the lock: a second instance blocks here, then sees it and skips.
      const claim = await c.query(`INSERT INTO rt_data_fixes (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id`, [fix.id]);
      if (!claim.rows.length) { await c.query('ROLLBACK'); continue; }
      const n = await applyFix(c, fix);
      await c.query(`UPDATE rt_data_fixes SET changed = $2 WHERE id = $1`, [fix.id, n]);
      await c.query('COMMIT');
      out[fix.id] = n;
      logger.info('rank.data_fix_applied', { id: fix.id, domain: fix.domain, changed: n });
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
  return out;
}
