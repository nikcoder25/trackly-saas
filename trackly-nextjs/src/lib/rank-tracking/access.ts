/**
 * Who may see which keywords.
 *
 * The account that owns a website is its users' own id (the same owner
 * scoping as brands.user_id). A client login (rt_client_users) sees one of:
 *   websites - every keyword of the listed websites
 *   groups   - every keyword in the listed groups
 *   starred  - the starred keywords of the listed websites
 * Client links are long random tokens; only their sha256 is stored.
 */
import crypto from 'crypto';
import { hashToken } from '@/lib/auth';

export type ClientScope = 'websites' | 'groups' | 'starred';

export interface ClientScopeRow {
  scope: ClientScope;
  website_ids: string[];
  group_ids: string[];
}

export interface KeywordScopeFields {
  website_id: string;
  group_id: string | null;
  starred: boolean;
}

export function clientCanSee(c: ClientScopeRow, k: KeywordScopeFields): boolean {
  if (c.scope === 'groups') return !!k.group_id && c.group_ids.includes(k.group_id);
  if (!c.website_ids.includes(k.website_id)) return false;
  return c.scope === 'starred' ? k.starred : true;
}

/** SQL filter equivalent of clientCanSee, for keyword alias `k` and params $n.. */
export function clientScopeSql(c: ClientScopeRow, firstParam: number): { sql: string; params: unknown[] } {
  if (c.scope === 'groups') return { sql: `k.group_id = ANY($${firstParam}::text[])`, params: [c.group_ids] };
  if (c.scope === 'starred') return { sql: `k.website_id = ANY($${firstParam}::text[]) AND k.starred`, params: [c.website_ids] };
  return { sql: `k.website_id = ANY($${firstParam}::text[])`, params: [c.website_ids] };
}

export function newClientToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(24).toString('base64url');
  return { token, hash: hashToken(token) };
}
