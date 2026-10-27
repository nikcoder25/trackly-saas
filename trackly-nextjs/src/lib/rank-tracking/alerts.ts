/**
 * Alert rules: evaluated after every finished check (rank rules) and on
 * every scheduler tick (AI-mention rule). A rule fires at most once per
 * keyword per day. Channels: email to the account owner, a Slack incoming
 * webhook (users.settings.rankSlackWebhook), and the client logins that
 * can see the keyword.
 *
 * Notable moves are also logged as activity (kind 'event') whether or not
 * a rule exists, for the Overview's recent activity list.
 */
import { pool } from '@/lib/db';
import { enqueueEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { safeFetch } from '@/lib/safe-fetch';
import { clientCanSee, type ClientScopeRow } from './access';
import { recentAiMentions } from './ai';
import { ruleFires, ruleMessage, type RankMove, type RuleType } from './rules';

export interface CheckEvent {
  keywordId: string;
  accountId: string;
  websiteId: string;
  keyword: string;
  domain: string;
  prevRank: number | null | undefined;
  rank: number | null;
  depth: number;
}

interface RuleRow { id: string; type: RuleType; threshold: number | null; website_id: string | null; group_id: string | null; starred_only: boolean; channels: string[] }

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export async function sendSlack(webhook: string | null | undefined, text: string): Promise<boolean> {
  if (!webhook || !/^https:\/\/hooks\.slack\.com\//.test(webhook)) return false;
  try {
    const r = await safeFetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), timeoutMs: 8000 });
    return r.ok;
  } catch {
    return false;
  }
}

async function deliver(accountId: string, rule: RuleRow, kw: { id: string; website_id: string; group_id: string | null; starred: boolean }, message: string): Promise<void> {
  const u = await pool.query(`SELECT email, settings FROM users WHERE id = $1`, [accountId]);
  const owner = u.rows[0] as { email?: string; settings?: { rankSlackWebhook?: string } } | undefined;
  const html = `<p>${escapeHtml(message)}</p><p style="color:#475569;font-size:13px">Livesov rank tracking alert</p>`;
  const day = new Date().toISOString().slice(0, 10);
  if (rule.channels.includes('email') && owner?.email) {
    await enqueueEmail({ to: owner.email, subject: `Rank alert: ${message}`.slice(0, 180), html, text: message, templateKey: 'rank_alert', idempotencyKey: `rank_alert:${rule.id}:${kw.id}:${day}` });
  }
  if (rule.channels.includes('slack')) await sendSlack(owner?.settings?.rankSlackWebhook, message);
  if (rule.channels.includes('client')) {
    const c = await pool.query(`SELECT id, email, scope, website_ids, group_ids FROM rt_client_users WHERE account_id = $1 AND status <> 'revoked' AND email IS NOT NULL`, [accountId]);
    for (const row of c.rows as (ClientScopeRow & { id: string; email: string })[]) {
      if (!clientCanSee(row, kw)) continue;
      await enqueueEmail({ to: row.email, subject: `Ranking update: ${message}`.slice(0, 180), html, text: message, templateKey: 'rank_alert_client', idempotencyKey: `rank_alert:${rule.id}:${kw.id}:${row.id}:${day}` });
    }
  }
}

async function matchingRules(accountId: string, kw: { website_id: string; group_id: string | null; starred: boolean }, types?: RuleType[]): Promise<RuleRow[]> {
  const r = await pool.query(`SELECT id, type, threshold, website_id, group_id, starred_only, channels FROM rt_alert_rules WHERE account_id = $1`, [accountId]);
  return (r.rows as RuleRow[]).filter((x) =>
    (!types || types.includes(x.type)) &&
    (!x.website_id || x.website_id === kw.website_id) &&
    (!x.group_id || x.group_id === kw.group_id) &&
    (!x.starred_only || kw.starred));
}

async function alreadyLogged(ruleId: string | null, keywordId: string, kind: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM rt_alert_log WHERE keyword_id = $1 AND kind = $3 AND rule_id IS NOT DISTINCT FROM $2 AND created_at >= date_trunc('day', NOW()) LIMIT 1`,
    [keywordId, ruleId, kind]);
  return r.rows.length > 0;
}

export async function evaluateAlertsForCheck(e: CheckEvent): Promise<number> {
  const kwr = await pool.query(`SELECT id, website_id, group_id, starred FROM rt_keywords WHERE id = $1`, [e.keywordId]);
  const kw = kwr.rows[0];
  if (!kw) return 0;
  // Best and worst of every check before this one (the newest row is this check).
  const h = await pool.query(
    `SELECT MIN(rank) AS best, MAX(COALESCE(rank, $2::int + 1)) AS worst, COUNT(*)::int AS n FROM (
       SELECT rank FROM rt_checks WHERE keyword_id = $1 ORDER BY checked_at DESC OFFSET 1) x`, [e.keywordId, e.depth]);
  const hist = h.rows[0] || {};
  const move: RankMove = { prev: e.prevRank, now: e.rank, depth: e.depth, bestBefore: hist.n ? hist.best : null, worstBefore: hist.n ? hist.worst : null };
  let fired = 0;
  for (const rule of await matchingRules(e.accountId, kw)) {
    if (rule.type === 'ai_mentioned' || !ruleFires(rule.type, rule.threshold, move)) continue;
    if (await alreadyLogged(rule.id, e.keywordId, 'alert')) continue;
    const message = ruleMessage(rule.type, rule.threshold, e.keyword, e.domain, move);
    await pool.query(`INSERT INTO rt_alert_log (account_id, rule_id, keyword_id, kind, message) VALUES ($1, $2, $3, 'alert', $4)`, [e.accountId, rule.id, e.keywordId, message]);
    try { await deliver(e.accountId, rule, kw, message); } catch (err) { logger.warn('rank.alert_deliver_failed', { ruleId: rule.id, err: (err as Error).message }); }
    fired++;
  }
  // Activity feed: the moves worth a line whether or not a rule asked for them.
  const notable: [RuleType, number | null][] = [['enters_top', 3], ['leaves_top', 10], ['new_best', null]];
  for (const [type, n] of notable) {
    if (!ruleFires(type, n, move)) continue;
    if (type === 'new_best' && (move.bestBefore == null || (e.rank ?? 99) > 10)) continue;
    await pool.query(`INSERT INTO rt_alert_log (account_id, rule_id, keyword_id, kind, message) VALUES ($1, NULL, $2, 'event', $3)`,
      [e.accountId, e.keywordId, ruleMessage(type, n, e.keyword, e.domain, move)]);
    break;
  }
  return fired;
}

/** "Gets mentioned by AI" rules: checked each tick against the last few hours of AI answers. */
export async function evaluateAiMentionRules(hours = 2): Promise<number> {
  const rules = await pool.query(`SELECT DISTINCT account_id FROM rt_alert_rules WHERE type = 'ai_mentioned'`);
  let fired = 0;
  for (const { account_id: accountId } of rules.rows) {
    const sites = await pool.query(`SELECT id, domain FROM rt_websites WHERE account_id = $1`, [accountId]);
    for (const w of sites.rows) {
      const kws = await pool.query(`SELECT id, keyword, website_id, group_id, starred FROM rt_keywords WHERE website_id = $1`, [w.id]);
      if (!kws.rows.length) continue;
      const hits = await recentAiMentions(accountId, w.domain, kws.rows.map((k) => k.keyword), hours);
      for (const kw of kws.rows) {
        if (!hits.has(String(kw.keyword).toLowerCase())) continue;
        for (const rule of await matchingRules(accountId, kw, ['ai_mentioned'])) {
          if (await alreadyLogged(rule.id, kw.id, 'alert')) continue;
          const message = `AI answers mentioned ${w.domain} for "${kw.keyword}"`;
          await pool.query(`INSERT INTO rt_alert_log (account_id, rule_id, keyword_id, kind, message) VALUES ($1, $2, $3, 'alert', $4)`, [accountId, rule.id, kw.id, message]);
          try { await deliver(accountId, rule, kw, message); } catch { /* logged in deliver */ }
          fired++;
        }
      }
    }
  }
  return fired;
}
