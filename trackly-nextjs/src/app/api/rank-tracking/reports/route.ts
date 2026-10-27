/**
 * GET  /api/rank-tracking/reports - scheduled and saved reports.
 * POST /api/rank-tracking/reports - create a report once (returns its download link) or save a schedule.
 */
import { pool } from '@/lib/db';
import { rankCaller, jsonBody, noStore, str, strList } from '@/lib/rank-tracking/http';
import { createReport, FORMAT_LABEL, REPORT_FORMATS, reportRange, type ReportFormat } from '@/lib/rank-tracking/reports';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const r = await pool.query(
    `SELECT r.*, w.domain, g.name AS group_name FROM rt_reports r LEFT JOIN rt_websites w ON w.id = r.website_id LEFT JOIN rt_groups g ON g.id = r.group_id
      WHERE r.account_id = $1 ORDER BY r.created_at DESC LIMIT 200`, [c.accountId]);
  const rows = r.rows.map((x) => {
    const range = reportRange(x);
    return {
      id: x.id, title: x.title, format: x.format, formatLabel: FORMAT_LABEL[x.format as ReportFormat], schedule: x.schedule, recipients: x.recipients,
      website: x.domain || 'All websites', group: x.group_name || null, starredOnly: x.starred_only, start: range.start, end: range.end,
      lastSentAt: x.last_sent_at, createdAt: x.created_at, downloadUrl: `/api/rank-tracking/reports/${x.id}/download`,
    };
  });
  return Response.json({ scheduled: rows.filter((x) => x.schedule), saved: rows.filter((x) => !x.schedule) }, noStore);
}

export async function POST(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const b = await jsonBody(request);
  if (!b) return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  const format = str(b.format, 20) as ReportFormat;
  if (!REPORT_FORMATS.includes(format)) return Response.json({ error: 'Pick a format.' }, { status: 400 });
  const title = str(b.title, 160) || 'Rankings report';
  const schedule = b.schedule === 'weekly' || b.schedule === 'monthly' ? b.schedule : null;
  const recipients = strList(b.recipients, 10).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e));
  if (schedule && !recipients.length) return Response.json({ error: 'Add an email address to send it to.' }, { status: 400 });
  const start = DATE_RE.test(str(b.start, 10)) ? str(b.start, 10) : null;
  const end = DATE_RE.test(str(b.end, 10)) ? str(b.end, 10) : null;
  if (start && end && start > end) return Response.json({ error: 'The start date is after the end date.' }, { status: 400 });
  const websiteId = str(b.websiteId, 64) || null;
  const groupId = str(b.groupId, 64) || null;
  if (websiteId) {
    const ok = await pool.query(`SELECT 1 FROM rt_websites WHERE id = $1 AND account_id = $2`, [websiteId, c.accountId]);
    if (!ok.rows.length) return Response.json({ error: 'Website not found' }, { status: 404 });
  }
  if (groupId) {
    const ok = await pool.query(`SELECT 1 FROM rt_groups g JOIN rt_websites w ON w.id = g.website_id WHERE g.id = $1 AND w.account_id = $2`, [groupId, c.accountId]);
    if (!ok.rows.length) return Response.json({ error: 'Group not found' }, { status: 404 });
  }
  const rep = await createReport(c.accountId, {
    title, format, websiteId, groupId, starredOnly: b.starredOnly === true, includeAi: b.includeAi !== false, useLogo: b.useLogo !== false,
    start, end, schedule, recipients,
  });
  return Response.json({ id: rep.id, downloadUrl: `/api/rank-tracking/reports/${rep.id}/download` });
}
