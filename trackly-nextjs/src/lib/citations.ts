/**
 * Citation Decoder data layer (Phase 1).
 *
 * Normalizes the per-response citation URL arrays (prompt_runs.citations
 * JSONB) into a queryable `citations` table - one row per cited URL per
 * prompt per engine - and seeds the `cited_pages` crawl queue that the
 * nightly /api/cron/crawl-citations job drains.
 *
 * Both prompt_runs persistence paths (the /run route's in-process after()
 * callback and the BullMQ run-worker) call persistCitations right after
 * their prompt_runs batch INSERT. Writes here are best-effort: a citation
 * insert failure must never fail the run itself.
 */
import { pool } from './db';
import { uid } from './helpers';
import { logger } from './logger';

const MAX_URL_LENGTH = 2048;
const MAX_CITATIONS_PER_RESULT = 10;

/**
 * Clean a raw citation URL (engine-native or regex-extracted from response
 * text). Strips trailing punctuation the URL regex tends to swallow,
 * drops fragments, and rejects anything that isn't plain http(s).
 * Returns null for URLs we don't want in the table.
 */
export function normalizeCitationUrl(raw: string): { url: string; domain: string } | null {
  const cleaned = (raw || '').trim().replace(/[.,;:!?'"»)\]]+$/, '');
  if (!cleaned || cleaned.length > MAX_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  parsed.hash = '';
  const url = parsed.toString();
  if (url.length > MAX_URL_LENGTH) return null;
  const domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!domain) return null;
  return { url, domain };
}

/**
 * Merge engine-native citations (ChatGPT url annotations, Perplexity
 * `citations`) with the parser's regex-extracted URLs. Native lists come
 * first - they are the engine's authoritative source URLs; the regex pass
 * only sees what survived into the response text. Deduped on the cleaned
 * URL, capped at MAX_CITATIONS_PER_RESULT, original order preserved.
 */
export function mergeCitations(native: string[] | undefined, parsed: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...(native || []), ...(parsed || [])]) {
    const norm = normalizeCitationUrl(raw);
    if (!norm || seen.has(norm.url)) continue;
    seen.add(norm.url);
    out.push(raw);
    if (out.length >= MAX_CITATIONS_PER_RESULT) break;
  }
  return out;
}

export interface CitationBatchRow {
  promptRunId: string;
  brandId: string;
  prompt: string;
  platform: string;
  urls: string[];
}

/**
 * Insert normalized citation rows for a batch of prompt_runs and enqueue
 * any never-seen URLs into cited_pages for the nightly crawler.
 * Best-effort by design: logs and swallows DB errors.
 */
export async function persistCitations(rows: CitationBatchRow[]): Promise<void> {
  const values: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any[] = [];
  const pages = new Map<string, string>(); // url -> domain
  let pi = 1;
  for (const row of rows) {
    const seen = new Set<string>();
    let position = 0;
    for (const raw of row.urls || []) {
      const norm = normalizeCitationUrl(raw);
      if (!norm || seen.has(norm.url)) continue;
      seen.add(norm.url);
      position++;
      values.push(`($${pi},$${pi + 1},$${pi + 2},$${pi + 3},$${pi + 4},$${pi + 5},$${pi + 6},$${pi + 7})`);
      params.push(uid(), row.promptRunId, row.brandId, row.prompt, row.platform, norm.url, norm.domain, position);
      pi += 8;
      pages.set(norm.url, norm.domain);
    }
  }
  if (values.length === 0) return;

  try {
    await pool.query(
      `INSERT INTO citations (id, prompt_run_id, brand_id, prompt, platform, url, domain, position)
       VALUES ${values.join(',')}
       ON CONFLICT DO NOTHING`,
      params,
    );
  } catch (e) {
    logger.error('citations.persist_failed', {
      rows: values.length,
      error: (e as Error).message,
    });
    return;
  }

  try {
    const pageValues: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageParams: any[] = [];
    let qi = 1;
    for (const [url, domain] of pages) {
      pageValues.push(`($${qi},$${qi + 1})`);
      pageParams.push(url, domain);
      qi += 2;
    }
    await pool.query(
      `INSERT INTO cited_pages (url, domain) VALUES ${pageValues.join(',')}
       ON CONFLICT (url) DO NOTHING`,
      pageParams,
    );
  } catch (e) {
    logger.error('citations.enqueue_pages_failed', {
      pages: pages.size,
      error: (e as Error).message,
    });
  }
}
