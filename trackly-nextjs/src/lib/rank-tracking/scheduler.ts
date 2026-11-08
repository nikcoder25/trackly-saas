/**
 * Rank check scheduler. Driven by /api/cron/rank-tracking (GitHub Actions
 * every 10 minutes) and, for brand-new keywords, by the add-keywords request
 * itself so the first rank shows up within minutes.
 *
 * With DataForSEO configured (and RANK_SERP_PROVIDER unset or "dataforseo"),
 * every scheduled check goes through the Standard queue, never the live
 * endpoint:
 *   dispatch - due keywords are claimed (SKIP LOCKED, a bounded number per
 *              tick so checks keep their spread across the day) and posted
 *              as one task each (depth = the keyword's depth, priority 1,
 *              tag = keyword id), 100 tasks per request. The task id is
 *              cached on the keyword; a keyword with a cached id is never
 *              posted again, so a check is never paid for twice.
 *   collect  - tasks_ready, then task_get/advanced for our cached ids. Done:
 *              the check is stored. Errors 40101/40102/40106: posted again
 *              (up to 3 times). A task post that crashed before its id was
 *              saved is adopted by its tag instead of being re-posted.
 *   rescue   - a task missing from tasks_ready for an hour is read directly
 *              by its id; one still unanswered after a day is posted again.
 *   Every run logs and returns what it spent on DataForSEO, and rt_spend
 *   holds every charge (the admin spend page sums it by month).
 *
 * Other providers (LiteScrape, Serper) run synchronously through the chain.
 * Failed checks back off (15 min doubling to 12 h) and keep their place.
 */
import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureRankSchema } from './schema';
import { runCheck, type CheckOutcome, type CheckTarget } from './checker';
import { creditsPerCheck, type Frequency } from './credits';
import { nextCheckAt, retryAt } from './schedule';
import { findRank } from './domain';
import { fetchPageWithFallback, providerChain } from './providers';
import { dfsQueue, DFS_PENDING_CODES, DFS_REPOST_CODES, type DfsCheckTask } from './providers/dataforseo';
import { evaluateAlertsForCheck } from './alerts';

const DISPATCH_PER_TICK = Number(process.env.RANK_DISPATCH_PER_TICK) || 300;
const SYNC_CONCURRENCY = Number(process.env.RANK_SYNC_CONCURRENCY) || 4;
const STALE_PENDING_MINUTES = 60;
/** A queued task with no answer after this long is posted again. */
const LOST_TASK_HOURS = 24;
const MAX_POSTS = 3;
const DFS = 'dataforseo';

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
  pending_attempts?: number;
  pending_since?: Date | null;
  pending_posted_at?: Date | null;
  location_changed?: boolean;
}

const KW_SELECT = `k.id, k.website_id, w.account_id, w.domain, k.keyword, k.location_code, k.location_name, k.device,
  k.language, k.frequency, k.depth, k.fail_count, k.pending_provider, k.pending_task_id, k.pending_page, k.pending_cost, k.pending_pages,
  k.pending_attempts, k.pending_since, k.pending_posted_at, k.location_changed`;

function target(k: KeywordRow): CheckTarget {
  return { keyword: k.keyword, locationCode: k.location_code, locationName: k.location_name, device: k.device, language: k.language || 'en', depth: k.depth, domain: k.domain };
}

async function pool2<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/**
 * Store a finished check, schedule the next one and run the alert rules.
 * `spendLogged`: the charge is already in rt_spend (queued checks log it when
 * the task is posted, which is when DataForSEO bills it).
 */
export async function finalizeCheck(k: KeywordRow, o: CheckOutcome, now = new Date(), spendLogged = false): Promise<void> {
  const credits = creditsPerCheck(k.depth);
  const prev = await pool.query(
    `SELECT rank FROM rt_checks WHERE keyword_id = $1 ORDER BY checked_at DESC LIMIT 1`, [k.id]);
  const moved = !!k.location_changed;
  await pool.query(
    `INSERT INTO rt_checks (keyword_id, checked_at, rank, url, pages_fetched, provider, cost_usd, credits, location_change)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [k.id, now, o.rank, o.url, o.pagesFetched, o.provider, o.cost.toFixed(5), credits, moved]);
  await pool.query(
    `UPDATE rt_keywords SET next_check_at = $2, fail_count = 0, last_error = NULL, location_changed = FALSE, pending_attempts = 0,
       pending_provider = NULL, pending_task_id = NULL, pending_page = NULL, pending_since = NULL, pending_cost = 0, pending_pages = 0
     WHERE id = $1`,
    [k.id, nextCheckAt(k.id, k.frequency, now)]);
  if (!spendLogged) {
    await pool.query(
      `INSERT INTO rt_spend (account_id, provider, kind, units, cost_usd) VALUES ($1, $2, 'serp', $3, $4)`,
      [k.account_id, o.provider, o.pagesFetched, o.cost.toFixed(5)]);
  }
  try {
    // After a location change the previous rank is from somewhere else: no movement alerts.
    await evaluateAlertsForCheck({ keywordId: k.id, accountId: k.account_id, websiteId: k.website_id, keyword: k.keyword, domain: k.domain,
      prevRank: prev.rows.length && !moved ? prev.rows[0].rank : undefined, rank: o.rank, depth: k.depth });
  } catch (e) {
    logger.warn('rank.alerts_failed', { keywordId: k.id, err: (e as Error).message });
  }
}

async function failCheck(k: KeywordRow, err: unknown, now = new Date()): Promise<void> {
  const n = (k.fail_count || 0) + 1;
  await pool.query(
    `UPDATE rt_keywords SET fail_count = $2, last_error = $3, next_check_at = $4, pending_attempts = 0,
       pending_provider = NULL, pending_task_id = NULL, pending_page = NULL, pending_since = NULL, pending_cost = 0, pending_pages = 0
     WHERE id = $1`,
    [k.id, n, String((err as Error)?.message || err).slice(0, 300), retryAt(n, now)]);
  logger.warn('rank.check_failed', { keywordId: k.id, failCount: n, err: String((err as Error)?.message || err).slice(0, 200) });
}

/** Scheduled checks go through the DataForSEO Standard queue when it is configured and not overridden. */
export function useDfsQueue(): boolean {
  const pick = (process.env.RANK_SERP_PROVIDER || '').toLowerCase();
  return dfsQueue.configured() && (!pick || pick === DFS);
}

/** Synchronous providers for scheduled checks: never DataForSEO's live endpoint. */
function syncChain() {
  return providerChain().filter((p) => p.name !== DFS);
}

/** Finish a check synchronously on the non-DataForSEO providers. */
async function runSync(k: KeywordRow): Promise<void> {
  const chain = syncChain();
  if (!chain.length) { await failCheck(k, new Error('no synchronous SERP provider configured')); return; }
  try {
    await finalizeCheck(k, await runCheck(target(k), (r) => fetchPageWithFallback(r, chain)));
  } catch (e) {
    await failCheck(k, e);
  }
}

function dfsTask(k: KeywordRow): DfsCheckTask {
  return { tag: k.id, keyword: k.keyword, locationCode: k.location_code, locationName: k.location_name, device: k.device, language: k.language || 'en', depth: k.depth };
}

/** DataForSEO spend of one run, logged and returned with the tick. */
export interface DfsRunCost { posted: number; reposted: number; collected: number; costUsd: number }
const newRunCost = (): DfsRunCost => ({ posted: 0, reposted: 0, collected: 0, costUsd: 0 });

async function logSpend(accountId: string, cost: number, units: number): Promise<void> {
  await pool.query(`INSERT INTO rt_spend (account_id, provider, kind, units, cost_usd) VALUES ($1, $2, 'serp', $3, $4)`, [accountId, DFS, units, cost.toFixed(5)]);
}

/**
 * Post checks to the queue. Each keyword must already be claimed by the
 * caller. A posted task's id and cost are cached on the keyword at once;
 * repost-worthy errors are tried again in the same run, up to MAX_POSTS.
 */
async function postChecks(rows: KeywordRow[], run: DfsRunCost, isRepost = false): Promise<void> {
  let todo = rows;
  for (let round = 0; todo.length && round < MAX_POSTS; round++) {
    const answers = await dfsQueue.post(todo.map(dfsTask));
    const byId = new Map(todo.map((k) => [k.id, k]));
    const again: KeywordRow[] = [];
    for (const a of answers) {
      const k = byId.get(a.tag);
      if (!k) continue;
      const attempts = (k.pending_attempts || 0) + 1;
      if (a.cost > 0) { run.costUsd += a.cost; await logSpend(k.account_id, a.cost, Math.ceil(k.depth / 10)); }
      if (a.id) {
        await pool.query(
          `UPDATE rt_keywords SET pending_provider = $2, pending_task_id = $3, pending_page = 1, pending_since = NOW(), pending_posted_at = NOW(),
             pending_cost = pending_cost + $4, pending_pages = $5, pending_attempts = $6 WHERE id = $1`,
          [k.id, DFS, a.id, a.cost.toFixed(5), Math.ceil(k.depth / 10), attempts]);
        if (isRepost || round > 0) run.reposted++; else run.posted++;
        continue;
      }
      if ((DFS_REPOST_CODES.has(a.status) || a.status === 0) && attempts < MAX_POSTS) {
        again.push({ ...k, pending_attempts: attempts });
        continue;
      }
      await failCheck(k, new Error(`dataforseo task_post ${a.status}: ${a.message}`));
    }
    todo = again;
  }
}

/** Store a finished task's result, or post it again / fail it on a task error. Cost is already logged. */
async function settleTask(k: KeywordRow, res: { status: number; message: string; organic: import('./providers/types').OrganicResult[] }, run: DfsRunCost): Promise<void> {
  if (res.status === 20000 && res.organic.length) {
    const hit = findRank(res.organic, k.domain, k.depth);
    await finalizeCheck(k, {
      rank: hit ? hit.position : null, url: hit ? hit.url : null, pagesFetched: Math.ceil(k.depth / 10), provider: DFS, cost: Number(k.pending_cost) || 0,
    }, new Date(), true);
    run.collected++;
    return;
  }
  const repostable = DFS_REPOST_CODES.has(res.status) || (res.status === 20000 && !res.organic.length);
  if (repostable && (k.pending_attempts || 0) < MAX_POSTS) {
    // Clear the dead task id first; the keyword stays claimed while it is posted again.
    await pool.query(`UPDATE rt_keywords SET pending_task_id = NULL, pending_provider = 'claim', pending_since = NOW() WHERE id = $1`, [k.id]);
    await postChecks([{ ...k, pending_task_id: null }], run, true);
    return;
  }
  await failCheck(k, new Error(`dataforseo task ${res.status}: ${res.message || 'no results'}`));
}

/** Claim due keywords and start their checks. `ids` limits it to those keywords (first check after adding). */
export async function dispatchDue(limit = DISPATCH_PER_TICK, ids?: string[], run: DfsRunCost = newRunCost()): Promise<{ claimed: number; queued: number; sync: number }> {
  const r = await pool.query<KeywordRow>(
    `WITH due AS (
       SELECT id FROM rt_keywords
        WHERE pending_task_id IS NULL AND pending_provider IS NULL
          AND (($2::text[] IS NOT NULL AND id = ANY($2::text[])) OR ($2::text[] IS NULL AND next_check_at <= NOW()))
          AND (location_code IS NOT NULL OR location_name <> '')
        ORDER BY next_check_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED)
     UPDATE rt_keywords k SET pending_provider = 'claim', pending_since = NOW(), pending_attempts = 0, pending_cost = 0
       FROM due, rt_websites w
      WHERE k.id = due.id AND w.id = k.website_id
     RETURNING ${KW_SELECT}`,
    [limit, ids && ids.length ? ids : null]);
  const rows = r.rows;
  if (!rows.length) return { claimed: 0, queued: 0, sync: 0 };
  if (useDfsQueue()) {
    const before = run.posted;
    await postChecks(rows, run);
    return { claimed: rows.length, queued: run.posted - before, sync: 0 };
  }
  await pool2(rows, SYNC_CONCURRENCY, (k) => runSync(k));
  return { claimed: rows.length, queued: 0, sync: rows.length };
}

/** Claim one keyword's cached task for collection; false when another collector has it. */
async function claimTask(k: KeywordRow, taskId: string): Promise<boolean> {
  const c = await pool.query(
    `UPDATE rt_keywords SET pending_task_id = 'collecting:' || pending_task_id, pending_since = NOW() WHERE id = $1 AND pending_task_id = $2 RETURNING id`,
    [k.id, taskId]);
  return c.rows.length > 0;
}

/** Read finished queue tasks and settle each check. */
export async function collectReady(run: DfsRunCost = newRunCost()): Promise<{ collected: number; finished: number }> {
  if (!dfsQueue.configured()) return { collected: 0, finished: 0 };
  const pending = await pool.query<KeywordRow>(
    `SELECT ${KW_SELECT} FROM rt_keywords k JOIN rt_websites w ON w.id = k.website_id
      WHERE (k.pending_provider = $1 AND k.pending_task_id IS NOT NULL AND k.pending_task_id NOT LIKE 'collecting:%')
         OR (k.pending_provider = 'claim' AND k.pending_task_id IS NULL)`, [DFS]);
  if (!pending.rows.length) return { collected: 0, finished: 0 };
  let ready: { id: string; tag: string }[];
  try { ready = await dfsQueue.ready(); } catch (e) {
    logger.warn('rank.tasks_ready_failed', { err: (e as Error).message });
    return { collected: 0, finished: 0 };
  }
  const byTask = new Map(pending.rows.filter((k) => k.pending_task_id).map((k) => [k.pending_task_id as string, k]));
  // A post whose answer was lost (crash between task_post and saving the id) is adopted by its tag.
  const orphans = new Map(pending.rows.filter((k) => !k.pending_task_id).map((k) => [k.id, k]));
  const work: { k: KeywordRow; id: string }[] = [];
  for (const t of ready) {
    if (byTask.has(t.id)) work.push({ k: byTask.get(t.id)!, id: t.id });
    else if (orphans.has(t.tag)) {
      const k = orphans.get(t.tag)!;
      const adopt = await pool.query(
        `UPDATE rt_keywords SET pending_provider = $2, pending_task_id = $3, pending_since = NOW() WHERE id = $1 AND pending_provider = 'claim' AND pending_task_id IS NULL RETURNING id`,
        [k.id, DFS, t.id]);
      if (adopt.rows.length) { orphans.delete(t.tag); work.push({ k: { ...k, pending_task_id: t.id }, id: t.id }); }
    }
  }
  let collected = 0;
  let finished = 0;
  await pool2(work, SYNC_CONCURRENCY, async ({ k, id }) => {
    if (!(await claimTask(k, id))) return;
    collected++;
    try {
      const res = await dfsQueue.get(id);
      if (DFS_PENDING_CODES.has(res.status)) {
        await pool.query(`UPDATE rt_keywords SET pending_task_id = $2 WHERE id = $1`, [k.id, id]);
        return;
      }
      await settleTask(k, res, run);
      finished++;
    } catch (e) {
      // Network or API trouble: put the cached id back and read it again next tick (no repost, no second charge).
      await pool.query(`UPDATE rt_keywords SET pending_task_id = $2 WHERE id = $1`, [k.id, id]);
      logger.warn('rank.collect_failed', { keywordId: k.id, taskId: id, err: (e as Error).message });
    }
  });
  return { collected, finished };
}

/**
 * Queue tasks missing from tasks_ready are read directly by their cached id;
 * one still unanswered after LOST_TASK_HOURS is posted again. Claims a
 * crashed tick left behind are freed.
 */
export async function rescueStale(run: DfsRunCost = newRunCost()): Promise<number> {
  await pool.query(
    `UPDATE rt_keywords SET pending_provider = NULL, pending_since = NULL
      WHERE pending_provider = 'claim' AND pending_task_id IS NULL AND pending_since < NOW() - INTERVAL '30 minutes'`);
  // A collector that died mid-read: hand the id back.
  await pool.query(
    `UPDATE rt_keywords SET pending_task_id = substr(pending_task_id, 12)
      WHERE pending_task_id LIKE 'collecting:%' AND pending_since < NOW() - INTERVAL '15 minutes'`);
  if (!dfsQueue.configured()) return 0;
  const r = await pool.query<KeywordRow>(
    `UPDATE rt_keywords k SET pending_since = NOW()
       FROM rt_websites w
      WHERE w.id = k.website_id AND k.pending_provider = $2 AND k.pending_task_id IS NOT NULL AND k.pending_task_id NOT LIKE 'collecting:%'
        AND k.pending_since < NOW() - make_interval(mins => $1)
     RETURNING ${KW_SELECT}`, [STALE_PENDING_MINUTES, DFS]);
  let n = 0;
  await pool2(r.rows, SYNC_CONCURRENCY, async (k) => {
    const id = k.pending_task_id as string;
    if (!(await claimTask(k, id))) return;
    n++;
    try {
      const res = await dfsQueue.get(id);
      const ageH = k.pending_posted_at ? (Date.now() - new Date(k.pending_posted_at).getTime()) / 3600e3 : LOST_TASK_HOURS;
      if (DFS_PENDING_CODES.has(res.status) && ageH < LOST_TASK_HOURS) {
        await pool.query(`UPDATE rt_keywords SET pending_task_id = $2 WHERE id = $1`, [k.id, id]);
        return;
      }
      if (DFS_PENDING_CODES.has(res.status) || res.status === 40400) res.status = 40102; // lost: post again
      await settleTask(k, res, run);
    } catch (e) {
      await pool.query(`UPDATE rt_keywords SET pending_task_id = $2 WHERE id = $1`, [k.id, id]);
      logger.warn('rank.rescue_failed', { keywordId: k.id, taskId: id, err: (e as Error).message });
    }
  });
  return n;
}

export interface TickResult {
  rescued: number; collected: number; finished: number; claimed: number; queued: number; sync: number; providers: string[];
  dataforseo: DfsRunCost & { monthToDateUsd: number };
}

/** DataForSEO rank tracking spend since the start of the month (UTC). */
export async function dfsMonthSpend(): Promise<number> {
  const r = await pool.query(`SELECT COALESCE(SUM(cost_usd), 0)::float AS usd FROM rt_spend WHERE provider = $1 AND kind = 'serp' AND at >= date_trunc('month', NOW())`, [DFS]);
  return Math.round((r.rows[0]?.usd || 0) * 1e5) / 1e5;
}

export async function runRankTick(opts: { dispatchLimit?: number } = {}): Promise<TickResult> {
  await ensureRankSchema();
  const providers = useDfsQueue() ? [DFS, ...syncChain().map((p) => p.name)] : providerChain().map((p) => p.name);
  const run = newRunCost();
  if (!providers.length) return { rescued: 0, collected: 0, finished: 0, claimed: 0, queued: 0, sync: 0, providers, dataforseo: { ...run, monthToDateUsd: 0 } };
  const rescued = await rescueStale(run);
  const c = await collectReady(run);
  const d = await dispatchDue(opts.dispatchLimit ?? DISPATCH_PER_TICK, undefined, run);
  run.costUsd = Math.round(run.costUsd * 1e5) / 1e5;
  const monthToDateUsd = await dfsMonthSpend();
  if (run.posted || run.reposted || run.collected) logger.info('rank.dataforseo_run', { ...run, monthToDateUsd });
  return { rescued, ...c, ...d, providers, dataforseo: { ...run, monthToDateUsd } };
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
