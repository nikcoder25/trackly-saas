/**
 * Write side: websites, groups and keywords, owned by an account.
 */
import { pool } from '@/lib/db';
import { uid } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { ensureRankSchema } from './schema';
import { normalizeDomain } from './domain';
import { canAddKeywords, addRefusalMessage, monthlyCreditsFor, type Frequency, type AddCheck } from './credits';
import { creditStatus } from './queries';
import { resolveLocation } from './locations';
import { fetchSearchVolume } from './providers/dataforseo';
import { addKeywordsAsPrompts, type AddPromptsResult } from './ai';

export const MAX_KEYWORDS_PER_ADD = 1000;

export function parseKeywordList(text: string): string[] {
  return [...new Set(String(text || '').split(/\r?\n/).map((k) => k.trim().toLowerCase().replace(/\s+/g, ' ')).filter((k) => k && k.length <= 200))];
}

export async function ownWebsite(accountId: string, websiteId: string): Promise<{ id: string; domain: string } | null> {
  await ensureRankSchema();
  const r = await pool.query(`SELECT id, domain FROM rt_websites WHERE id = $1 AND account_id = $2`, [websiteId, accountId]);
  return r.rows[0] || null;
}

export async function getOrCreateWebsite(accountId: string, domainInput: string): Promise<{ id: string; domain: string } | null> {
  await ensureRankSchema();
  const domain = normalizeDomain(domainInput);
  if (!domain || !domain.includes('.')) return null;
  const r = await pool.query(
    `INSERT INTO rt_websites (id, account_id, domain) VALUES ($1, $2, $3)
     ON CONFLICT (account_id, domain) DO UPDATE SET domain = EXCLUDED.domain RETURNING id, domain`,
    [uid(), accountId, domain]);
  return r.rows[0];
}

export async function deleteWebsite(accountId: string, websiteId: string): Promise<boolean> {
  await ensureRankSchema();
  const r = await pool.query(`DELETE FROM rt_websites WHERE id = $1 AND account_id = $2`, [websiteId, accountId]);
  return (r.rowCount || 0) > 0;
}

export async function getOrCreateGroup(websiteId: string, name: string): Promise<string | null> {
  const n = name.trim().slice(0, 80);
  if (!n) return null;
  const r = await pool.query(
    `INSERT INTO rt_groups (id, website_id, name) VALUES ($1, $2, $3)
     ON CONFLICT (website_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [uid(), websiteId, n]);
  return r.rows[0].id;
}

export interface AddKeywordsInput {
  accountId: string;
  plan: string;
  domain: string;
  keywords: string[];
  location: { code?: number | null; name?: string | null };
  device: 'desktop' | 'mobile';
  frequency: Frequency;
  depth: 30 | 100;
  groupName?: string | null;
  checkAi?: boolean;
}

export type AddKeywordsResult =
  | { ok: true; websiteId: string; added: string[]; skipped: number; location: string; ai: AddPromptsResult | null }
  | { ok: false; status: number; error: string; credit?: AddCheck };

export async function addKeywords(input: AddKeywordsInput): Promise<AddKeywordsResult> {
  await ensureRankSchema();
  const words = input.keywords.slice(0, MAX_KEYWORDS_PER_ADD);
  if (!words.length) return { ok: false, status: 400, error: 'Add at least one keyword, one per line.' };
  const loc = await resolveLocation(input.location);
  if (!loc) return { ok: false, status: 400, error: 'Pick the city to check from in the list.' };
  const site = await getOrCreateWebsite(input.accountId, input.domain);
  if (!site) return { ok: false, status: 400, error: 'Enter the website domain, like example.com.' };

  const existing = await pool.query(
    `SELECT keyword FROM rt_keywords WHERE website_id = $1 AND location_code = $2 AND device = $3 AND keyword = ANY($4::text[])`,
    [site.id, loc.code, input.device, words]);
  const have = new Set(existing.rows.map((r) => r.keyword));
  const fresh = words.filter((w) => !have.has(w));

  const credits = await creditStatus(input.accountId, input.plan);
  const check = canAddKeywords(input.plan, credits.committed, fresh.length, input.frequency, input.depth);
  if (!check.ok && fresh.length) return { ok: false, status: 402, error: addRefusalMessage(check), credit: check };

  const groupId = input.groupName ? await getOrCreateGroup(site.id, input.groupName) : null;
  const ids: string[] = [];
  if (fresh.length) {
    const rows = fresh.map(() => uid());
    const r = await pool.query(
      `INSERT INTO rt_keywords (id, website_id, group_id, keyword, location_code, location_name, device, frequency, depth, next_check_at)
       SELECT unnest($1::text[]), $2, $3, unnest($4::text[]), $5, $6, $7, $8, $9, NOW()
       ON CONFLICT (website_id, keyword, location_code, device) DO NOTHING
       RETURNING id`,
      [rows, site.id, groupId, fresh, loc.code, loc.name, input.device, input.frequency, input.depth]);
    ids.push(...r.rows.map((x) => x.id));
  }

  // Search volume: one call per add, stored on the keyword. Best effort.
  if (ids.length) {
    try {
      const v = await fetchSearchVolume(fresh, loc.code, 'en', loc.name);
      if (v.volumes.size) {
        await pool.query(
          `UPDATE rt_keywords k SET volume = v.vol FROM unnest($2::text[], $3::int[]) AS v(kw, vol) WHERE k.website_id = $1 AND k.keyword = v.kw AND k.location_code = $4`,
          [site.id, [...v.volumes.keys()], [...v.volumes.values()], loc.code]);
      }
      if (v.cost > 0) await pool.query(`INSERT INTO rt_spend (account_id, provider, kind, units, cost_usd) VALUES ($1, 'dataforseo', 'volume', $2, $3)`, [input.accountId, fresh.length, v.cost.toFixed(5)]);
    } catch (e) {
      logger.warn('rank.volume_failed', { err: (e as Error).message });
    }
  }

  const ai = input.checkAi ? await addKeywordsAsPrompts(input.accountId, input.plan, site.domain, fresh.length ? fresh : words) : null;
  return { ok: true, websiteId: site.id, added: ids, skipped: words.length - ids.length, location: loc.name, ai };
}

/** Keyword ids that belong to the account, out of the given ones. */
export async function ownKeywordIds(accountId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const r = await pool.query(
    `SELECT k.id FROM rt_keywords k JOIN rt_websites w ON w.id = k.website_id WHERE w.account_id = $1 AND k.id = ANY($2::text[])`,
    [accountId, ids]);
  return r.rows.map((x) => x.id);
}

export interface BulkUpdate {
  starred?: boolean;
  groupName?: string | null;
  groupId?: string | null;
  location?: { code?: number | null; name?: string | null };
  frequency?: Frequency;
  depth?: 30 | 100;
}

export async function updateKeywords(accountId: string, plan: string, ids: string[], u: BulkUpdate): Promise<{ ok: true; updated: number } | { ok: false; status: number; error: string }> {
  await ensureRankSchema();
  const own = await ownKeywordIds(accountId, ids);
  if (!own.length) return { ok: true, updated: 0 };
  if (typeof u.starred === 'boolean') await pool.query(`UPDATE rt_keywords SET starred = $2 WHERE id = ANY($1::text[])`, [own, u.starred]);
  if (u.groupId !== undefined || u.groupName !== undefined) {
    if (u.groupName) {
      // A named group is created on each keyword's own website.
      const sites = await pool.query(`SELECT DISTINCT website_id FROM rt_keywords WHERE id = ANY($1::text[])`, [own]);
      for (const s of sites.rows) {
        const gid = await getOrCreateGroup(s.website_id, u.groupName);
        await pool.query(`UPDATE rt_keywords SET group_id = $3 WHERE id = ANY($1::text[]) AND website_id = $2`, [own, s.website_id, gid]);
      }
    } else if (u.groupId) {
      await pool.query(
        `UPDATE rt_keywords k SET group_id = g.id FROM rt_groups g WHERE k.id = ANY($1::text[]) AND g.id = $2 AND g.website_id = k.website_id`, [own, u.groupId]);
    } else {
      await pool.query(`UPDATE rt_keywords SET group_id = NULL WHERE id = ANY($1::text[])`, [own]);
    }
  }
  if (u.location) {
    const loc = await resolveLocation(u.location);
    if (!loc) return { ok: false, status: 400, error: 'Pick the city to check from in the list.' };
    // Moving a keyword to a city it is already tracked from on that site would collide: those are left as they are.
    await pool.query(
      `UPDATE rt_keywords k SET location_code = $2, location_name = $3, next_check_at = NOW()
        WHERE k.id = ANY($1::text[]) AND NOT EXISTS (
          SELECT 1 FROM rt_keywords o WHERE o.website_id = k.website_id AND o.keyword = k.keyword AND o.device = k.device AND o.location_code = $2 AND o.id <> k.id)`,
      [own, loc.code, loc.name]);
  }
  if (u.frequency || u.depth) {
    const cur = await pool.query(`SELECT frequency, depth FROM rt_keywords WHERE id = ANY($1::text[])`, [own]);
    const credits = await creditStatus(accountId, plan);
    const before = cur.rows.reduce((s, r) => s + monthlyCreditsFor(r.frequency, r.depth), 0);
    const after = cur.rows.reduce((s, r) => s + monthlyCreditsFor(u.frequency || r.frequency, u.depth || r.depth), 0);
    // Same gate as adding: the plan's daily/top-100 rules, and the new total must fit.
    const gate = canAddKeywords(plan, credits.committed - before, 0, u.frequency || 'weekly', u.depth || 30);
    if (gate.reason && gate.reason !== 'over_limit') return { ok: false, status: 402, error: addRefusalMessage(gate) };
    if (credits.committed - before + after > credits.allowance) {
      return { ok: false, status: 402, error: addRefusalMessage({ ...gate, ok: false, needed: after, reason: 'over_limit' }) };
    }
    if (u.frequency) await pool.query(`UPDATE rt_keywords SET frequency = $2 WHERE id = ANY($1::text[])`, [own, u.frequency]);
    if (u.depth) await pool.query(`UPDATE rt_keywords SET depth = $2 WHERE id = ANY($1::text[])`, [own, u.depth]);
  }
  return { ok: true, updated: own.length };
}

export async function deleteKeywords(accountId: string, ids: string[]): Promise<number> {
  await ensureRankSchema();
  const own = await ownKeywordIds(accountId, ids);
  if (!own.length) return 0;
  const r = await pool.query(`DELETE FROM rt_keywords WHERE id = ANY($1::text[])`, [own]);
  return r.rowCount || 0;
}
