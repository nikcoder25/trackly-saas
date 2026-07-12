/**
 * Fix Engine - per-page GSC metrics (28-day clicks/impressions/CTR/position).
 *
 * One Search Analytics by-page query per brand, cached in `fix_page_metrics`
 * for PAGE_METRICS_TTL_HOURS, powers three features without hammering GSC:
 *   - page-weighted fix ranking (impressions of the target URL),
 *   - per-fix before/after outcome measurement,
 *   - the measured auto-revert check.
 *
 * All read paths degrade to null when GSC isn't connected — callers treat
 * metrics as an enrichment, never a requirement.
 */

import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getValidAccessToken, searchAnalytics, trailingDateRange } from './gsc';

export const PAGE_METRICS_TTL_HOURS = 12;
export const PAGE_METRICS_WINDOW_DAYS = 28;

export interface PageMetrics {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;       // 0..1
  position: number;
  fetchedAt: string;
}

let schemaEnsured = false;
async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fix_page_metrics (
      brand_id    TEXT NOT NULL,
      url         TEXT NOT NULL,
      clicks      INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      ctr         DOUBLE PRECISION NOT NULL DEFAULT 0,
      position    DOUBLE PRECISION NOT NULL DEFAULT 0,
      fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (brand_id, url)
    )
  `);
  schemaEnsured = true;
}

/** Normalise a URL for matching GSC page keys against fix target URLs. */
export function normUrl(u: string): string {
  try {
    const url = new URL(u);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return u.replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * Refresh the brand's page metrics from GSC if the cache is stale. Returns
 * true when fresh data is present (either already fresh or just fetched).
 */
export async function refreshPageMetrics(brandId: string, tenantId: string): Promise<boolean> {
  await ensureSchema();
  const fresh = await pool.query(
    `SELECT 1 FROM fix_page_metrics
      WHERE brand_id = $1 AND fetched_at > NOW() - ($2 || ' hours')::interval
      LIMIT 1`,
    [brandId, String(PAGE_METRICS_TTL_HOURS)],
  );
  if ((fresh.rowCount || 0) > 0) return true;

  const token = await getValidAccessToken(brandId, tenantId);
  if (!token || !token.siteUrl) return false;
  try {
    const { startDate, endDate } = trailingDateRange(PAGE_METRICS_WINDOW_DAYS);
    const rows = await searchAnalytics({
      accessToken: token.accessToken, siteUrl: token.siteUrl,
      startDate, endDate, dimensions: ['page'], rowLimit: 2500,
    });
    // Replace the brand's snapshot wholesale — it's a cache, not history.
    await pool.query(`DELETE FROM fix_page_metrics WHERE brand_id = $1`, [brandId]);
    for (const r of rows) {
      await pool.query(
        `INSERT INTO fix_page_metrics (brand_id, url, clicks, impressions, ctr, position)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (brand_id, url) DO UPDATE
           SET clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions,
               ctr = EXCLUDED.ctr, position = EXCLUDED.position, fetched_at = NOW()`,
        [brandId, normUrl(r.keys[0] || ''), r.clicks, r.impressions, r.ctr, r.position],
      );
    }
    return rows.length > 0;
  } catch (e) {
    logger.warn('fix_engine.page_metrics_refresh_failed', { brandId, err: (e as Error).message });
    return false;
  }
}

/** Read cached metrics for a set of URLs (normalised). No GSC calls. */
export async function getPageMetrics(brandId: string, urls: string[]): Promise<Map<string, PageMetrics>> {
  await ensureSchema();
  const out = new Map<string, PageMetrics>();
  if (urls.length === 0) return out;
  const norm = [...new Set(urls.map(normUrl))];
  const res = await pool.query(
    `SELECT url, clicks, impressions, ctr, position, fetched_at
       FROM fix_page_metrics WHERE brand_id = $1 AND url = ANY($2)`,
    [brandId, norm],
  );
  for (const r of res.rows) {
    out.set(String(r.url), {
      url: String(r.url), clicks: Number(r.clicks) || 0, impressions: Number(r.impressions) || 0,
      ctr: Number(r.ctr) || 0, position: Number(r.position) || 0, fetchedAt: String(r.fetched_at),
    });
  }
  return out;
}

/** Fetch a single URL's CURRENT 28-day metrics straight from GSC (no cache). */
export async function fetchUrlMetricsLive(brandId: string, tenantId: string, url: string): Promise<PageMetrics | null> {
  const token = await getValidAccessToken(brandId, tenantId);
  if (!token || !token.siteUrl) return null;
  try {
    const { startDate, endDate } = trailingDateRange(PAGE_METRICS_WINDOW_DAYS);
    const rows = await searchAnalytics({
      accessToken: token.accessToken, siteUrl: token.siteUrl,
      startDate, endDate, dimensions: ['page'], rowLimit: 2500,
    });
    const want = normUrl(url);
    const row = rows.find((r) => normUrl(r.keys[0] || '') === want);
    if (!row) return null;
    return { url: want, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position, fetchedAt: new Date().toISOString() };
  } catch (e) {
    logger.warn('fix_engine.url_metrics_live_failed', { brandId, err: (e as Error).message });
    return null;
  }
}
