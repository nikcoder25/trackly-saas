/**
 * Fix Engine - Keywords Everywhere integration (search volume / CPC /
 * competition for keyword targeting).
 *
 * The per-brand API key is stored encrypted in fix_connections (provider
 * 'kwe'), same model as the CMS/tracker creds. Because KWE bills per
 * keyword credit, volumes are cached in `fix_keyword_metrics` for
 * KEYWORD_CACHE_DAYS — volumes are monthly aggregates, so a week-old
 * number is still current.
 */

import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { safeFetch } from '@/lib/safe-fetch';
import { getConnection } from './connections';

const KWE_ENDPOINT = 'https://api.keywordseverywhere.com/v1/get_keyword_data';
export const KEYWORD_CACHE_DAYS = 7;

export interface KeywordMetrics {
  keyword: string;
  volume: number;
  cpc: number;
  /** 0..1 (Google Ads competition — the standard low-competition proxy). */
  competition: number;
}

let schemaEnsured = false;
async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fix_keyword_metrics (
      brand_id    TEXT NOT NULL,
      keyword     TEXT NOT NULL,
      volume      INTEGER NOT NULL DEFAULT 0,
      cpc         DOUBLE PRECISION NOT NULL DEFAULT 0,
      competition DOUBLE PRECISION NOT NULL DEFAULT 0,
      fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (brand_id, keyword)
    )
  `);
  schemaEnsured = true;
}

function norm(kw: string): string {
  return kw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

async function getApiKey(brandId: string): Promise<string | null> {
  const conn = await getConnection(brandId, 'kwe');
  if (!conn || conn.status !== 'active' || !conn.creds) return null;
  const key = (conn.creds as { apiKey?: string }).apiKey;
  return typeof key === 'string' && key ? key : null;
}

/** Validate a Keywords Everywhere key (spends 1 credit on one keyword). */
export async function verifyKeywordsEverywhere(apiKey: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await callKwe(apiKey, ['seo'], 'us');
    if (res.size > 0) return { ok: true };
    return { ok: false, detail: 'Keywords Everywhere returned no data — check the key and your credit balance.' };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

async function callKwe(apiKey: string, keywords: string[], country: string): Promise<Map<string, KeywordMetrics>> {
  const form = new URLSearchParams();
  form.set('country', country);
  form.set('currency', 'usd');
  form.set('dataSource', 'gkp');
  for (const kw of keywords) form.append('kw[]', kw);
  const res = await safeFetch(KWE_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form.toString(),
    timeoutMs: 15_000,
  });
  if (res.status === 401 || res.status === 403) throw new Error('Keywords Everywhere rejected the API key');
  if (res.status === 402) throw new Error('Keywords Everywhere: out of credits');
  if (!res.ok) throw new Error(`Keywords Everywhere returned HTTP ${res.status}`);
  const json = (await res.json().catch(() => ({}))) as { data?: Array<{ keyword?: string; vol?: number; cpc?: { value?: string } | number; competition?: number }> };
  const out = new Map<string, KeywordMetrics>();
  for (const row of json.data || []) {
    if (!row.keyword) continue;
    const cpc = typeof row.cpc === 'number' ? row.cpc : Number(row.cpc?.value) || 0;
    out.set(norm(row.keyword), {
      keyword: norm(row.keyword),
      volume: Number(row.vol) || 0,
      cpc,
      competition: Number(row.competition) || 0,
    });
  }
  return out;
}

/**
 * Metrics for a set of keywords: cache first, then one KWE call for the
 * misses (batched ≤100/call per KWE limits). Returns whatever it could
 * resolve; missing keywords are simply absent. Returns empty when the
 * brand has no KWE connection — callers treat that as "feature off".
 */
export async function getKeywordMetrics(brandId: string, keywords: string[], country = 'us'): Promise<Map<string, KeywordMetrics>> {
  await ensureSchema();
  const wanted = [...new Set(keywords.map(norm).filter(Boolean))];
  const out = new Map<string, KeywordMetrics>();
  if (wanted.length === 0) return out;

  const cached = await pool.query(
    `SELECT keyword, volume, cpc, competition FROM fix_keyword_metrics
      WHERE brand_id = $1 AND keyword = ANY($2)
        AND fetched_at > NOW() - ($3 || ' days')::interval`,
    [brandId, wanted, String(KEYWORD_CACHE_DAYS)],
  );
  for (const r of cached.rows) {
    out.set(String(r.keyword), { keyword: String(r.keyword), volume: Number(r.volume) || 0, cpc: Number(r.cpc) || 0, competition: Number(r.competition) || 0 });
  }

  const misses = wanted.filter((k) => !out.has(k));
  if (misses.length === 0) return out;
  const apiKey = await getApiKey(brandId);
  if (!apiKey) return out;

  try {
    const fresh = await callKwe(apiKey, misses.slice(0, 100), country);
    for (const [kw, m] of fresh) {
      out.set(kw, m);
      await pool.query(
        `INSERT INTO fix_keyword_metrics (brand_id, keyword, volume, cpc, competition, fetched_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (brand_id, keyword) DO UPDATE
           SET volume = EXCLUDED.volume, cpc = EXCLUDED.cpc,
               competition = EXCLUDED.competition, fetched_at = NOW()`,
        [brandId, kw, m.volume, m.cpc, m.competition],
      );
    }
  } catch (e) {
    logger.warn('fix_engine.kwe_fetch_failed', { brandId, err: (e as Error).message });
  }
  return out;
}

/** True when the brand has an active Keywords Everywhere connection. */
export async function hasKeywordData(brandId: string): Promise<boolean> {
  return (await getApiKey(brandId)) !== null;
}
