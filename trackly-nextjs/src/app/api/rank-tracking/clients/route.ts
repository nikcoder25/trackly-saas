/**
 * GET  /api/rank-tracking/clients - client logins.
 * POST /api/rank-tracking/clients {name, email?, scope, websiteIds[], groupIds[]} - add one; returns its link once.
 */
import { pool } from '@/lib/db';
import { rankCaller, jsonBody, noStore, str, strList } from '@/lib/rank-tracking/http';
import { createClientUser, listClientUsers } from '@/lib/rank-tracking/clients';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const rows = await listClientUsers(c.accountId);
  const names = await pool.query(
    `SELECT w.id, w.domain AS name FROM rt_websites w WHERE w.account_id = $1
     UNION ALL SELECT g.id, w.domain || ' · ' || g.name FROM rt_groups g JOIN rt_websites w ON w.id = g.website_id WHERE w.account_id = $1`, [c.accountId]);
  const label = new Map(names.rows.map((r) => [r.id, r.name]));
  return Response.json({
    clients: rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, scope: r.scope, status: r.status, lastLoginAt: r.last_login_at, createdAt: r.created_at,
      sees: r.scope === 'groups'
        ? r.group_ids.map((g) => label.get(g)).filter(Boolean).join(', ')
        : r.website_ids.map((w) => label.get(w)).filter(Boolean).join(', ') + (r.scope === 'starred' ? ' · starred keywords only' : ' · all groups'),
    })),
  }, noStore);
}

export async function POST(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const b = await jsonBody(request);
  const name = str(b?.name, 120);
  if (!name) return Response.json({ error: 'Enter the client name.' }, { status: 400 });
  const email = str(b?.email, 200).toLowerCase();
  if (email && !EMAIL_RE.test(email)) return Response.json({ error: 'That email address does not look right.' }, { status: 400 });
  const scope = b?.scope === 'groups' || b?.scope === 'starred' ? b.scope : 'websites';
  const websiteIds = strList(b?.websiteIds, 100);
  const groupIds = strList(b?.groupIds, 100);
  if (scope === 'groups' ? !groupIds.length : !websiteIds.length) return Response.json({ error: scope === 'groups' ? 'Pick at least one group.' : 'Pick at least one website.' }, { status: 400 });
  const r = await createClientUser(c.accountId, { name, email: email || null, scope, websiteIds, groupIds }, request);
  return Response.json(r);
}
