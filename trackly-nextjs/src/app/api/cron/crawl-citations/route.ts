/**
 * Nightly cited-page crawler (Citation Decoder, Phase 1).
 *
 * GET /api/cron/crawl-citations
 * Auth: `Authorization: Bearer $CRON_SECRET` (same as /api/cron/*).
 *
 * Drains the cited_pages queue: fetches each newly-cited URL once and
 * stores the raw HTML so the Phase 2 feature extractor can analyze why
 * those pages get cited. URLs come out of AI responses (untrusted input),
 * so every fetch goes through the SSRF-hardened safeFetch wrapper —
 * private/loopback/metadata IPs are blocked at DNS-resolution time and
 * every redirect hop is re-validated.
 *
 * Bounded per invocation: CITATION_CRAWL_BATCH pages (default 30) at
 * CITATION_CRAWL_CONCURRENCY (default 3), with a wall-clock deadline so
 * a slow night never outlives the platform's request timeout. Failed
 * fetches retry on later ticks up to CITATION_CRAWL_MAX_ATTEMPTS, then
 * stay in 'error' as a permanent record.
 *
 * Idempotent: returns `{ skipped: true, reason: 'locked' }` when another
 * tick holds the `crawl_citations` lock.
 */
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { pool, ensureColumns } from '@/lib/db';
import { acquireCronLock } from '@/lib/cron-lock';
import { safeFetch, SSRFError } from '@/lib/safe-fetch';
import { logger } from '@/lib/logger';

const BATCH_SIZE = Number(process.env.CITATION_CRAWL_BATCH) || 30;
const CONCURRENCY = Number(process.env.CITATION_CRAWL_CONCURRENCY) || 3;
const MAX_ATTEMPTS = Number(process.env.CITATION_CRAWL_MAX_ATTEMPTS) || 3;
const FETCH_TIMEOUT_MS = Number(process.env.CITATION_CRAWL_TIMEOUT_MS) || 15000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const DEADLINE_MS = 4 * 60 * 1000;
const USER_AGENT = 'Mozilla/5.0 (compatible; LivesovBot/1.0; +https://livesov.com)';

interface QueuedPage {
  url: string;
  attempts: number;
}

async function crawlOne(page: QueuedPage): Promise<'fetched' | 'skipped' | 'error'> {
  let status: 'fetched' | 'skipped' | 'error' = 'error';
  let httpStatus: number | null = null;
  let contentType: string | null = null;
  let html: string | null = null;
  let errorMsg: string | null = null;

  try {
    const res = await safeFetch(page.url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_HTML_BYTES,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en',
      },
    });
    httpStatus = res.status;
    contentType = (res.headers.get('content-type') || '').split(';')[0].trim() || null;
    if (!res.ok) {
      errorMsg = `HTTP ${res.status}`;
      try { await res.body?.cancel(); } catch { /* already drained */ }
    } else if (contentType && !/html|xml|plain/.test(contentType)) {
      // PDFs, images, JSON endpoints etc. — record that the URL resolves
      // but don't store binary payloads the extractor can't use.
      status = 'skipped';
      try { await res.body?.cancel(); } catch { /* already drained */ }
    } else {
      html = await res.text();
      status = 'fetched';
    }
  } catch (e) {
    errorMsg = e instanceof SSRFError ? `${e.code}: ${e.message}` : (e as Error).message;
  }

  // Permanent failures (4xx, blocked URL) shouldn't burn retries on
  // later ticks — cap attempts immediately. Transient ones (5xx,
  // timeouts, network) keep their natural attempt count.
  const permanent = (httpStatus !== null && httpStatus >= 400 && httpStatus < 500)
    || (errorMsg !== null && /^(INVALID_URL|PROTOCOL_BLOCKED|HOST_BLOCKED|IP_BLOCKED|DNS_EMPTY):/.test(errorMsg));
  const attempts = permanent ? MAX_ATTEMPTS : page.attempts + 1;

  await pool.query(
    `UPDATE cited_pages
        SET status = $1, http_status = $2, content_type = $3, html = $4,
            error = $5, attempts = $6, last_fetched_at = NOW(), updated_at = NOW()
      WHERE url = $7`,
    [status, httpStatus, contentType, html, errorMsg, attempts, page.url],
  );
  return status;
}

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const ok = !!headerToken
    && headerToken.length === cronSecret.length
    && crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(cronSecret));
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureColumns();

  const lock = await acquireCronLock('crawl_citations', 30);
  if (!lock) {
    return NextResponse.json({ skipped: true, reason: 'locked' });
  }

  try {
    const start = Date.now();
    const picked = await pool.query(
      `SELECT url, attempts FROM cited_pages
        WHERE (status = 'pending' OR (status = 'error' AND attempts < $1))
        ORDER BY first_seen_at ASC
        LIMIT $2`,
      [MAX_ATTEMPTS, BATCH_SIZE],
    );
    const queue: QueuedPage[] = picked.rows;

    let fetched = 0, skipped = 0, errored = 0, deadlineHit = false;
    async function worker() {
      while (queue.length > 0) {
        if (Date.now() - start > DEADLINE_MS) { deadlineHit = true; return; }
        const page = queue.shift()!;
        try {
          const result = await crawlOne(page);
          if (result === 'fetched') fetched++;
          else if (result === 'skipped') skipped++;
          else errored++;
        } catch (e) {
          // crawlOne's UPDATE failed — leave the row for the next tick.
          errored++;
          logger.warn('cron.crawl_citations.page_update_failed', {
            url: page.url,
            error: (e as Error).message,
          });
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.max(1, Math.min(CONCURRENCY, picked.rows.length)) }, () => worker()),
    );

    const durationMs = Date.now() - start;
    if (picked.rows.length > 0) {
      logger.info('cron.crawl_citations.done', {
        picked: picked.rows.length, fetched, skipped, errored,
        deadline_hit: deadlineHit, duration_ms: durationMs,
      });
    }

    return NextResponse.json({
      ok: true,
      picked: picked.rows.length,
      fetched,
      skipped,
      errored,
      deadlineHit,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    logger.error('cron.crawl_citations.failed', { error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await lock.release();
  }
}
