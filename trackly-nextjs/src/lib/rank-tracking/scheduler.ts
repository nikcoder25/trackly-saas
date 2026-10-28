/**
 * Rank check scheduler. Driven by /api/cron/rank-tracking (GitHub Actions
 * every 10 minutes, so also every hour) and, for brand-new keywords, by the
 * add-keywords request itself so the first rank shows up within minutes.
 *
 * One tick:
 *   1. rescue   - a queued task that never came back (20 min) is finished
 *                 on the synchronous path; a claim left by a crashed tick
 *                 is released.
 *   2. collect  - finished DataForSEO Standard tasks are read. Domain found
 *                 or last page reached: the check is stored. Otherwise the
 *                 next page is posted (early stop, see checker.ts).
 *   3. dispatch - keywords with next_check_at <= now are claimed (SKIP
 *                 LOCKED, so two pods never take the same keyword), a
 *                 bounded number per tick so checks spread across the day,
 *                 and their page 1 is posted. A provider without a queue,
 *                 or a post that fails twice, runs the check synchronously
 *                 through the provider chain with limited concurrency.
 *
 * Failed checks back off (15 min doubling to 12 h) and keep their place.
 */
import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureRankSchema } from './schema';
import { afterPage, runCheck, type CheckOutcome, type CheckTarget } from './checker';
import { creditsPerCheck, type Frequency } from './credits';
import { nextCheckAt, retryAt } from './schedule';
import { primaryProvider, PROVIDERS, providerChain } from './providers';
import type { SerpProvider } from './providers/types';
import { evaluateAlertsForCheck } from './alerts';

const DISPATCH_PER_TICK = Number(process.env.RANK_DISPATCH_PER_TICK) || 300;
const SYNC_CONCURRENCY = Number(process.env.RANK_SYNC_CONCURRENCY) || 4;
const STALE_PENDING_MINUTES = 20;

export interface KeywordRow {
  id: string;
  website_id: string;
  account_id: string;
  domain: string;
  keyword: string;
  location_code: number | null;
  location_name: string;
  device: 'desktop' | 'mobile';
  language: string;
  frequency: Frequency;
  depth: number;
  fail_count: number;
  pending_provider: string | null;
  pending_task_id: string | null;
  pending_page: number | null;
  pending_cost: string | number;
  pending_pages: number;
}

const KW_SELECT = `k.id, k.website_id, w.account_id, w.domain, k.keyword, k.location_code, k.location_name, k.device,
  k.language, k.frequency, k.depth, k.fail_count, k.pending_provider, k.pending_task_id, k.pending_page, k.pending_cost, k.pending_pages`;

function target(k: KeywordRow): CheckTarget {
  return { keyword: k.keyword, locationCode: k.location_code, locationName: k.location_name, device: k.device, language: k.language || 'en', depth: k.depth, domain: k.domain };
}

async function pool2<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** Store a finished check, schedule the next one and run the alert rules. */
export async function finalizeCheck(k: KeywordRow, o: CheckOutcome, now = new Date()): Promise<void> {
  const credits = creditsPerCheck(k.depth);
  const prev = await pool.query(
    `SELECT rank FROM rt_checks WHERE keyword_id = $1 ORDER BY checked_at DESC LIMIT 1`, [k.id]);
  await pool.query(
    `INSERT INTO rt_checks (keyword_id, checked_at, rank, url, pages_fetched, provider, cost_usd, credits)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [k.id, now, o.rank, o.url, o.pagesFetched, o.provider, o.cost.toFixed(5), credits]);
  await pool.query(
    `UPDATE rt_keywords SET next_check_at = $2, fail_count = 0, last_error = NULL,
       pending_provider = NULL, pending_task_id = NULL, pending_page = NULL, pending_since = NULL, pending_cost = 0, pending_pages = 0
     WHERE id = $1`,
    [k.id, nextCheckAt(k.id, k.frequency, now)]);
  await pool.query(
    `INSERT INTO rt_spend (account_id, provider, kind, units, cost_usd) VALUES ($1, $2, 'serp', $3, $4)`,
    [k.account_id, o.provider, o.pagesFetched, o.cost.toFixed(5)]);
  try {
    await evaluateAlertsForCheck({ keywordId: k.id, accountId: k.account_id, websiteId: k.website_id, keyword: k.keyword, domain: k.domain,
      prevRank: prev.rows.length ? prev.rows[0].rank : undefined, rank: o.rank, depth: k.depth });
  } catch (e) {
    logger.warn('rank.alerts_failed', { keywordId: k.id, err: (e as Error).message });
  }
}

async function failCheck(k: KeywordRow, err: unknown, now = new Date()): Promise<void> {
  const n = (k.fail_count || 0) + 1;
  await pool.query(
    `UPDATE rt_keywords SET fail_count = $2, last_error = $3, next_check_at = $4,
       pending_provider = NULL, pending_task_id = NULL, pending_page = NULL, pending_since = NULL, pending_cost = 0, pending_pages = 0
     WHERE id = $1`,
    [k.id, n, String((err as Error)?.message || err).slice(0, 300), retryAt(n, now)]);
  logger.warn('rank.check_failed', { keywordId: k.id, failCount: n, err: String((err as Error)?.message || err).slice(0, 200) });
}

/** Finish a check synchronously, from `startPage`, adding what earlier pages already cost. */
async function runSync(k: KeywordRow, startPage = 1, carried = { cost: 0, pages: 0, provider: '' }): Promise<void> {
  try {
    const o = await runCheck(target(k), undefined, startPage);
    const provider = [carried.provider, o.provider].filter(Boolean).join('+');
    await finalizeCheck(k, { ...o, cost: o.cost + carried.cost, pagesFetched: o.pagesFetched + carried.pages, provider: [...new Set(provider.split('+'))].join('+') });
  } catch (e) {
    await failCheck(k, e);
  }
}

async function submitWithRetry(p: SerpProvider, k: KeywordRow, page: number): Promise<string> {
  try {
    return await p.submitPage!({ ...target(k), page });
  } catch (e) {
    await new Promise((r) => setTimeout(r, 1500));
    return p.submitPage!({ ...target(k), page });
  }
}

async function markPending(k: KeywordRow, provider: string, taskId: string, page: number, cost: number, pages: number): Promise<void> {
  await pool.query(
    `UPDATE rt_keywords SET pending_provider = $2, pending_task_id = $3, pending_page = $4, pending_since = NOW(), pending_cost = $5, pending_pages = $6 WHERE id = $1`,
    [k.id, provider, taskId, page, cost.toFixed(5), pages]);
}

/** Claim due keywords and start their checks. `ids` limits it to those keywords (first check after adding). */
export async function dispatchDue(limit = DISPATCH_PER_TICK, ids?: string[]): Promise<{ claimed: number; queued: number; sync: number }> {
  const r = await pool.query<KeywordRow>(
    `WITH due AS (
       SELECT id FROM rt_keywords
        WHERE pending_task_id IS NULL AND pending_provider IS NULL
          AND (($2::text[] IS NOT NULL AND id = ANY($2::text[])) OR ($2::text[] IS NULL AND next_check_at <= NOW()))
          AND (location_code IS NOT NULL OR location_name <> '')
        ORDER BY next_check_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED)
     UPDATE rt_keywords k SET pending_provider = 'claim', pending_since = NOW()
       FROM due, rt_websites w
      WHERE k.id = due.id AND w.id = k.website_id
     RETURNING ${KW_SELECT}`,
    [limit, ids && ids.length ? ids : null]);
  const rows = r.rows;
  if (!rows.length) return { claimed: 0, queued: 0, sync: 0 };
  const p = primaryProvider();
  const queuedCapable = !!(p.submitPage && p.readyTaskIds && p.collectPage && p.configured());
  const syncRows: KeywordRow[] = [];
  let queued = 0;
  for (const k of rows) {
    if (!queuedCapable) { syncRows.push(k); continue; }
    try {
      const taskId = await submitWithRetry(p, k, 1);
      await markPending(k, p.name, taskId, 1, 0, 0);
      queued++;
    } catch (e) {
      logger.warn('rank.submit_failed', { keywordId: k.id, provider: p.name, err: (e as Error).message });
      syncRows.push(k);
    }
  }
  await pool2(syncRows, SYNC_CONCURRENCY, (k) => runSync(k));
  return { claimed: rows.length, queued, sync: syncRows.length };
}

/** Read finished queued tasks and move each check on by one page. */
export async function collectReady(): Promise<{ collected: number; finished: number }> {
  let collected = 0;
  let finished = 0;
  for (const p of Object.values(PROVIDERS)) {
    if (!p.readyTaskIds || !p.collectPage || !p.configured()) continue;
    const pending = await pool.query<KeywordRow>(
      `SELECT ${KW_SELECT} FROM rt_keywords k JOIN rt_websites w ON w.id = k.website_id
        WHERE k.pending_provider = $1 AND k.pending_task_id IS NOT NULL`, [p.name]);
    if (!pending.rows.length) continue;
    const byTask = new Map(pending.rows.map((k) => [k.pending_task_id as string, k]));
    let ready: string[];
    try { ready = await p.readyTaskIds(); } catch (e) {
      logger.warn('rank.tasks_ready_failed', { provider: p.name, err: (e as Error).message });
      continue;
    }
    const mine = ready.filter((id) => byTask.has(id));
    await pool2(mine, SYNC_CONCURRENCY, async (taskId) => {
      const k = byTask.get(taskId)!;
      // Claim the task first: two collectors (the cron and a just-added
      // keyword's first check) can see the same ready task.
      const claim = await pool.query(
        `UPDATE rt_keywords SET pending_task_id = 'collecting:' || pending_task_id, pending_since = NOW() WHERE id = $1 AND pending_task_id = $2 RETURNING id`,
        [k.id, taskId]);
      if (!claim.rows.length) return;
      const page = k.pending_page || 1;
      const cost = Number(k.pending_cost) || 0;
      const pages = k.pending_pages || 0;
      collected++;
      try {
        const res = await p.collectPage!(taskId);
        const totalCost = cost + res.cost;
        if (page === 1 && !res.organic.length) {
          // Empty page 1: never a real answer. Finish on the provider chain.
          await runSync(k, 1, { cost: totalCost, pages: pages + 1, provider: p.name });
          finished++;
          return;
        }
        const d = afterPage(res.organic, page, k.depth, k.domain);
        if (d.done) {
          await finalizeCheck(k, { rank: d.rank, url: d.url, pagesFetched: pages + 1, provider: p.name, cost: totalCost });
          finished++;
          return;
        }
        try {
          const next = await submitWithRetry(p, k, d.nextPage);
          await markPending(k, p.name, next, d.nextPage, totalCost, pages + 1);
        } catch {
          await runSync(k, d.nextPage, { cost: totalCost, pages: pages + 1, provider: p.name });
          finished++;
        }
      } catch (e) {
        logger.warn('rank.collect_failed', { keywordId: k.id, taskId, err: (e as Error).message });
        await runSync(k, page, { cost, pages, provider: '' });
        finished++;
      }
    });
  }
  return { collected, finished };
}

/** Finish checks whose queued task is lost, and free claims a crashed tick left behind. */
export async function rescueStale(): Promise<number> {
  await pool.query(
    `UPDATE rt_keywords SET pending_provider = NULL, pending_since = NULL
      WHERE pending_provider = 'claim' AND pending_task_id IS NULL AND pending_since < NOW() - INTERVAL '15 minutes'`);
  const r = await pool.query<KeywordRow>(
    `UPDATE rt_keywords k SET pending_since = NOW()
       FROM rt_websites w
      WHERE w.id = k.website_id AND k.pending_task_id IS NOT NULL
        AND k.pending_since < NOW() - make_interval(mins => $1)
     RETURNING ${KW_SELECT}`, [STALE_PENDING_MINUTES]);
  await pool2(r.rows, SYNC_CONCURRENCY, (k) =>
    runSync(k, k.pending_page || 1, { cost: Number(k.pending_cost) || 0, pages: k.pending_pages || 0, provider: k.pending_provider || '' }));
  return r.rows.length;
}

export interface TickResult { rescued: number; collected: number; finished: number; claimed: number; queued: number; sync: number; providers: string[] }

export async function runRankTick(opts: { dispatchLimit?: number } = {}): Promise<TickResult> {
  await ensureRankSchema();
  const providers = providerChain().map((p) => p.name);
  if (!providers.length) return { rescued: 0, collected: 0, finished: 0, claimed: 0, queued: 0, sync: 0, providers };
  const rescued = await rescueStale();
  const c = await collectReady();
  const d = await dispatchDue(opts.dispatchLimit ?? DISPATCH_PER_TICK);
  return { rescued, ...c, ...d, providers };
}

/**
 * First check for keywords just added: start them now, then collect a few
 * times over the next couple of minutes. The cron finishes whatever is
 * still pending.
 */
export async function startFirstChecks(ids: string[]): Promise<void> {
  await ensureRankSchema();
  if (!ids.length || !providerChain().length) return;
  for (let i = 0; i < ids.length; i += 200) await dispatchDue(200, ids.slice(i, i + 200));
  for (let pass = 0; pass < 4; pass++) {
    await new Promise((r) => setTimeout(r, 40_000));
    const c = await collectReady();
    const left = await pool.query(`SELECT 1 FROM rt_keywords WHERE id = ANY($1::text[]) AND pending_task_id IS NOT NULL LIMIT 1`, [ids]);
    if (!left.rows.length && c.collected === 0) break;
  }
}
