/**
 * GET  /api/rank-tracking/alerts - rules and the alert log.
 * POST /api/rank-tracking/alerts {type, threshold?, websiteId?, groupId?, starredOnly?, channels[]} - add a rule.
 */
import { pool } from '@/lib/db';
import { uid } from '@/lib/helpers';
import { rankCaller, jsonBody, noStore, str, strList } from '@/lib/rank-tracking/http';
import { describeRule, RULE_NEEDS_THRESHOLD, RULE_TYPES, type RuleType } from '@/lib/rank-tracking/rules';

const CHANNELS = ['email', 'slack', 'client'];

export async function GET(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const rules = await pool.query(
    `SELECT r.id, r.type, r.threshold, r.website_id AS "websiteId", r.group_id AS "groupId", r.starred_only AS "starredOnly", r.channels,
            w.domain, g.name AS "groupName", r.created_at AS "createdAt"
       FROM rt_alert_rules r LEFT JOIN rt_websites w ON w.id = r.website_id LEFT JOIN rt_groups g ON g.id = r.group_id
      WHERE r.account_id = $1 ORDER BY r.created_at DESC`, [c.accountId]);
  const log = await pool.query(
    `SELECT id, message, kind, created_at AS "createdAt" FROM rt_alert_log WHERE account_id = $1 AND kind = 'alert' ORDER BY created_at DESC LIMIT 50`, [c.accountId]);
  const slack = await pool.query(`SELECT COALESCE(settings->>'rankSlackWebhook', '') <> '' AS on FROM users WHERE id = $1`, [c.accountId]);
  return Response.json({
    rules: rules.rows.map((r) => ({ ...r, label: describeRule(r.type, r.threshold) })),
    log: log.rows,
    slackConnected: !!slack.rows[0]?.on,
  }, noStore);
}

export async function POST(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const b = await jsonBody(request);
  const type = str(b?.type, 40) as RuleType;
  if (!RULE_TYPES.includes(type)) return Response.json({ error: 'Pick what the alert watches for.' }, { status: 400 });
  const threshold = RULE_NEEDS_THRESHOLD[type] ? Math.min(100, Math.max(1, Number(b?.threshold) || 0)) : null;
  if (RULE_NEEDS_THRESHOLD[type] && !threshold) return Response.json({ error: 'Enter a number from 1 to 100.' }, { status: 400 });
  const channels = strList(b?.channels, 3).filter((x) => CHANNELS.includes(x));
  if (!channels.length) return Response.json({ error: 'Pick at least one place to send it.' }, { status: 400 });
  const websiteId = str(b?.websiteId, 64) || null;
  const groupId = str(b?.groupId, 64) || null;
  if (websiteId) {
    const ok = await pool.query(`SELECT 1 FROM rt_websites WHERE id = $1 AND account_id = $2`, [websiteId, c.accountId]);
    if (!ok.rows.length) return Response.json({ error: 'Website not found' }, { status: 404 });
  }
  if (groupId) {
    const ok = await pool.query(`SELECT 1 FROM rt_groups g JOIN rt_websites w ON w.id = g.website_id WHERE g.id = $1 AND w.account_id = $2`, [groupId, c.accountId]);
    if (!ok.rows.length) return Response.json({ error: 'Group not found' }, { status: 404 });
  }
  const count = await pool.query(`SELECT COUNT(*)::int AS n FROM rt_alert_rules WHERE account_id = $1`, [c.accountId]);
  if ((count.rows[0]?.n || 0) >= 100) return Response.json({ error: 'You have 100 alert rules. Delete some to add more.' }, { status: 403 });
  const id = uid();
  await pool.query(
    `INSERT INTO rt_alert_rules (id, account_id, type, threshold, website_id, group_id, starred_only, channels) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, c.accountId, type, threshold, websiteId, groupId, b?.starredOnly === true, channels]);
  return Response.json({ id, label: describeRule(type, threshold) });
}
