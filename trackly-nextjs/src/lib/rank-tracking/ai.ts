/**
 * The AI-visibility side of a tracked website, read from Livesov's own
 * prompt_runs. A website is linked to the account's brand whose website
 * field has the same domain.
 *
 *   share of voice  - share of the brand's successful AI answers in the
 *                     last 30 days that mention it
 *   per keyword     - the latest answers to tracked prompts that contain
 *                     the keyword: recommended, mentioned, not mentioned,
 *                     or null when no prompt covers it
 *   "Also check AI answers" adds keywords to that brand's tracked prompts,
 *   inside the plan's account-wide prompt limit.
 */
import { pool } from '@/lib/db';
import { getPlanCredits } from '@/lib/plan-config';
import { countTrackedPromptsForOwner } from '@/lib/prompt-quota';
import { normalizeDomain } from './domain';

export type AiStatus = 'recommended' | 'mentioned' | 'not_mentioned' | null;

export async function brandIdsByDomain(accountId: string): Promise<Map<string, string[]>> {
  const r = await pool.query(`SELECT id, data->>'website' AS website FROM brands WHERE user_id = $1`, [accountId]);
  const out = new Map<string, string[]>();
  for (const b of r.rows) {
    const d = normalizeDomain(b.website);
    if (!d) continue;
    out.set(d, [...(out.get(d) || []), b.id]);
  }
  return out;
}

/** AI share of voice (0-100) per website domain; domains with no linked brand or no answers are absent. */
export async function shareOfVoice(accountId: string, domains: string[]): Promise<Map<string, number>> {
  const byDomain = await brandIdsByDomain(accountId);
  const out = new Map<string, number>();
  const ids = domains.flatMap((d) => byDomain.get(normalizeDomain(d)) || []);
  if (!ids.length) return out;
  const r = await pool.query(
    `SELECT brand_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE mentioned)::int AS hits
       FROM prompt_runs
      WHERE brand_id = ANY($1::text[]) AND success = TRUE AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY brand_id`, [ids]);
  const byBrand = new Map(r.rows.map((x) => [x.brand_id as string, x as { total: number; hits: number }]));
  for (const d of domains) {
    const rows = (byDomain.get(normalizeDomain(d)) || []).map((id) => byBrand.get(id)).filter(Boolean) as { total: number; hits: number }[];
    const total = rows.reduce((s, x) => s + x.total, 0);
    if (total) out.set(d, Math.round((rows.reduce((s, x) => s + x.hits, 0) / total) * 100));
  }
  return out;
}

/** AI status per keyword (lower-cased) for one website. */
export async function keywordAiStatus(accountId: string, domain: string, keywords: string[]): Promise<Map<string, AiStatus>> {
  const out = new Map<string, AiStatus>();
  const ids = (await brandIdsByDomain(accountId)).get(normalizeDomain(domain)) || [];
  const kws = [...new Set(keywords.map((k) => k.toLowerCase()))];
  if (!ids.length || !kws.length) return out;
  const r = await pool.query(
    `WITH kw AS (SELECT unnest($2::text[]) AS k),
          latest AS (
            SELECT DISTINCT ON (lower(prompt), platform) lower(prompt) AS p, mentioned, recommended
              FROM prompt_runs
             WHERE brand_id = ANY($1::text[]) AND success = TRUE AND created_at >= NOW() - INTERVAL '30 days'
             ORDER BY lower(prompt), platform, created_at DESC)
     SELECT kw.k, BOOL_OR(l.recommended) AS rec, BOOL_OR(l.mentioned) AS men, COUNT(l.p)::int AS n
       FROM kw LEFT JOIN latest l ON l.p = kw.k OR position(kw.k IN l.p) > 0
      GROUP BY kw.k`, [ids, kws]);
  for (const row of r.rows) {
    out.set(row.k, row.n === 0 ? null : row.rec ? 'recommended' : row.men ? 'mentioned' : 'not_mentioned');
  }
  return out;
}

/** Websites with a linked brand that answered with a mention in the last `hours`, per keyword. */
export async function recentAiMentions(accountId: string, domain: string, keywords: string[], hours: number): Promise<Set<string>> {
  const ids = (await brandIdsByDomain(accountId)).get(normalizeDomain(domain)) || [];
  const kws = [...new Set(keywords.map((k) => k.toLowerCase()))];
  if (!ids.length || !kws.length) return new Set();
  const r = await pool.query(
    `SELECT DISTINCT kw.k FROM unnest($2::text[]) AS kw(k)
       JOIN prompt_runs pr ON pr.brand_id = ANY($1::text[]) AND pr.success AND pr.mentioned
        AND pr.created_at >= NOW() - make_interval(hours => $3::int)
        AND position(kw.k IN lower(pr.prompt)) > 0`, [ids, kws, hours]);
  return new Set(r.rows.map((x) => x.k as string));
}

export interface AddPromptsResult { added: number; brandId: string | null; reason?: 'no_brand' | 'prompt_limit' }

/** Add keywords as tracked prompts on the website's brand, as many as the plan's prompt limit allows. */
export async function addKeywordsAsPrompts(accountId: string, plan: string, domain: string, keywords: string[]): Promise<AddPromptsResult> {
  const ids = (await brandIdsByDomain(accountId)).get(normalizeDomain(domain)) || [];
  if (!ids.length) return { added: 0, brandId: null, reason: 'no_brand' };
  const brandId = ids[0];
  const limit = getPlanCredits(plan).trackedPromptsPerAccount;
  const used = await countTrackedPromptsForOwner(accountId);
  const room = Math.max(0, limit - used);
  const r = await pool.query(`SELECT data->'queries' AS q FROM brands WHERE id = $1`, [brandId]);
  const existing: string[] = Array.isArray(r.rows[0]?.q) ? r.rows[0].q : [];
  const have = new Set(existing.map((q) => String(q).toLowerCase()));
  const fresh = [...new Set(keywords.map((k) => k.trim()).filter((k) => k && !have.has(k.toLowerCase())))];
  const take = limit >= 9999 ? fresh : fresh.slice(0, room);
  if (take.length) {
    await pool.query(
      `UPDATE brands SET data = jsonb_set(data, '{queries}', COALESCE(data->'queries', '[]'::jsonb) || $2::jsonb), updated_at = NOW() WHERE id = $1`,
      [brandId, JSON.stringify(take)]);
  }
  return { added: take.length, brandId, reason: take.length < fresh.length ? 'prompt_limit' : undefined };
}
