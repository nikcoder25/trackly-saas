/**
 * Client logins: a read-only, branded view of chosen websites, groups or
 * starred keywords at /client/<token>. The link is the login (shown once
 * and emailed to the client when an address is given); only its sha256
 * is stored, and revoking the row ends access at once.
 */
import { pool } from '@/lib/db';
import { enqueueEmail } from '@/lib/email';
import { uid } from '@/lib/helpers';
import { hashToken } from '@/lib/auth';
import { ensureRankSchema } from './schema';
import { newClientToken, type ClientScope, type ClientScopeRow } from './access';
import { getBranding } from './reports';

export interface ClientInput { name: string; email: string | null; scope: ClientScope; websiteIds: string[]; groupIds: string[] }

export interface ClientUserRow extends ClientScopeRow { id: string; account_id: string; name: string; email: string | null; status: string; last_login_at: Date | null; created_at: Date }

function baseUrl(request?: Request): string {
  const env = process.env.APP_URL;
  if (env) return env.replace(/\/+$/, '');
  if (request) return new URL(request.url).origin;
  return 'https://livesov.com';
}

export async function createClientUser(accountId: string, i: ClientInput, request?: Request): Promise<{ id: string; url: string }> {
  await ensureRankSchema();
  // Only the account's own websites and groups can be granted.
  const sites = i.websiteIds.length ? (await pool.query(`SELECT id FROM rt_websites WHERE account_id = $1 AND id = ANY($2::text[])`, [accountId, i.websiteIds])).rows.map((r) => r.id) : [];
  const groups = i.groupIds.length ? (await pool.query(
    `SELECT g.id FROM rt_groups g JOIN rt_websites w ON w.id = g.website_id WHERE w.account_id = $1 AND g.id = ANY($2::text[])`, [accountId, i.groupIds])).rows.map((r) => r.id) : [];
  const { token, hash } = newClientToken();
  const id = uid();
  await pool.query(
    `INSERT INTO rt_client_users (id, account_id, name, email, scope, website_ids, group_ids, token_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, accountId, i.name.slice(0, 120), i.email, i.scope, sites, groups, hash]);
  const brand = await getBranding(accountId);
  const host = brand.customDomain ? `https://${brand.customDomain}` : baseUrl(request);
  const url = `${host}/client/${token}`;
  if (i.email) {
    const from = brand.agencyName || 'Your SEO agency';
    await enqueueEmail({
      to: i.email,
      subject: `${from}: your rankings dashboard`,
      html: `<p>${from} shared a live view of your Google rankings with you.</p><p><a href="${url}">Open your rankings</a></p><p style="color:#475569;font-size:13px">Keep this link private: anyone with it can see these rankings.</p>`,
      text: `Open your rankings: ${url}`,
      templateKey: 'rank_client_invite',
    });
  }
  return { id, url };
}

export async function listClientUsers(accountId: string): Promise<ClientUserRow[]> {
  await ensureRankSchema();
  const r = await pool.query<ClientUserRow>(`SELECT id, account_id, name, email, scope, website_ids, group_ids, status, last_login_at, created_at FROM rt_client_users WHERE account_id = $1 AND status <> 'revoked' ORDER BY created_at DESC`, [accountId]);
  return r.rows;
}

export async function revokeClientUser(accountId: string, id: string): Promise<boolean> {
  const r = await pool.query(`UPDATE rt_client_users SET status = 'revoked' WHERE id = $1 AND account_id = $2`, [id, accountId]);
  return (r.rowCount || 0) > 0;
}

/** The client a portal token belongs to; marks it active and records the visit. */
export async function clientByToken(token: string): Promise<ClientUserRow | null> {
  if (!token || token.length < 20) return null;
  await ensureRankSchema();
  const r = await pool.query<ClientUserRow>(
    `UPDATE rt_client_users SET status = 'active', last_login_at = NOW() WHERE token_hash = $1 AND status <> 'revoked'
     RETURNING id, account_id, name, email, scope, website_ids, group_ids, status, last_login_at, created_at`, [hashToken(token)]);
  return r.rows[0] || null;
}

export interface BrandingInput { agencyName?: string; logoUrl?: string; primaryColor?: string; customDomain?: string; slackWebhook?: string }

export async function saveBranding(accountId: string, b: BrandingInput): Promise<void> {
  const clean = {
    agencyName: String(b.agencyName || '').slice(0, 80),
    logoUrl: /^https:\/\/[^\s"']+$/.test(b.logoUrl || '') ? String(b.logoUrl).slice(0, 500) : '',
    primaryColor: /^#[0-9a-f]{6}$/i.test(b.primaryColor || '') ? b.primaryColor : '#4f46e5',
    customDomain: /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(b.customDomain || '') ? String(b.customDomain).toLowerCase() : '',
  };
  const slack = /^https:\/\/hooks\.slack\.com\/[^\s"']+$/.test(b.slackWebhook || '') ? b.slackWebhook : '';
  await pool.query(
    `UPDATE users SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('rankBranding', $2::jsonb, 'rankSlackWebhook', $3::text) WHERE id = $1`,
    [accountId, JSON.stringify(clean), slack]);
}

export async function getSlackWebhook(accountId: string): Promise<string> {
  const r = await pool.query(`SELECT settings->>'rankSlackWebhook' AS s FROM users WHERE id = $1`, [accountId]);
  return r.rows[0]?.s || '';
}
