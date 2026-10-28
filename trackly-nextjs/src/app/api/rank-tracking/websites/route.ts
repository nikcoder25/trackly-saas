/**
 * GET  /api/rank-tracking/websites - the account's websites and groups (for pickers).
 * POST /api/rank-tracking/websites {domain} - add a website.
 */
import { pool } from '@/lib/db';
import { rankCaller, jsonBody, noStore, str } from '@/lib/rank-tracking/http';
import { getOrCreateWebsite } from '@/lib/rank-tracking/keywords';

export async function GET(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const w = await pool.query(`SELECT id, domain FROM rt_websites WHERE account_id = $1 ORDER BY domain`, [c.accountId]);
  const g = await pool.query(
    `SELECT g.id, g.name, g.website_id AS "websiteId" FROM rt_groups g JOIN rt_websites w ON w.id = g.website_id WHERE w.account_id = $1 ORDER BY g.name`, [c.accountId]);
  return Response.json({ websites: w.rows, groups: g.rows }, noStore);
}

export async function POST(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const body = await jsonBody(request);
  const site = await getOrCreateWebsite(c.accountId, str(body?.domain, 255));
  if (!site) return Response.json({ error: 'Enter the website domain, like example.com.' }, { status: 400 });
  return Response.json({ website: site });
}
