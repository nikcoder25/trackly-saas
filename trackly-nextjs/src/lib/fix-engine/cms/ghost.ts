/**
 * Fix Engine - Ghost CMS adapter (Admin API v5).
 *
 * Creds (encrypted in fix_connections):
 *   { adminApiUrl: "https://blog.example.com", adminApiKey: "id:hexsecret" }
 *
 * Ghost stores body as Lexical, which isn't safe to author over the API
 * blindly, so this adapter covers the SEO fields it CAN set cleanly
 * (title, meta description, canonical) plus create-as-HTML; body rewrites
 * and per-post robots throw CmsUnsupportedError.
 *
 * NOTE: built to Ghost's documented Admin API; treat as beta until run
 * against a live instance.
 */

import crypto from 'crypto';
import { safeFetch } from '@/lib/safe-fetch';
import type { CmsAdapter, CmsCreds, CmsTarget, CmsWriteResult } from './types';
import { CmsAuthError, CmsUnsupportedError } from './types';

interface GhostCreds { adminApiUrl: string; adminApiKey: string }

function readCreds(raw: CmsCreds): GhostCreds {
  const c = raw as Partial<GhostCreds>;
  if (!c.adminApiUrl || !c.adminApiKey || !String(c.adminApiKey).includes(':')) {
    throw new CmsAuthError('Ghost connection needs adminApiUrl + adminApiKey ("id:secret")');
  }
  return { adminApiUrl: String(c.adminApiUrl).replace(/\/+$/, ''), adminApiKey: String(c.adminApiKey) };
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Mint a short-lived Ghost Admin JWT from the id:secret key. */
function mintToken(key: string): string {
  const [id, secret] = key.split(':');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: id })));
  const payload = b64url(Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })));
  const sig = b64url(crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

function api(creds: GhostCreds): string { return `${creds.adminApiUrl}/ghost/api/admin`; }
function authHeaders(creds: GhostCreds): Record<string, string> {
  return { Authorization: `Ghost ${mintToken(creds.adminApiKey)}`, 'Content-Type': 'application/json', Accept: 'application/json' };
}
function slugFromUrl(url: string): string {
  const parts = new URL(url).pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

type GhostResource = { kind: 'posts' | 'pages'; id: string; updated_at: string };

async function resolve(creds: GhostCreds, url: string): Promise<GhostResource | null> {
  const slug = slugFromUrl(url);
  if (!slug) return null;
  for (const kind of ['posts', 'pages'] as const) {
    const res = await safeFetch(`${api(creds)}/${kind}/slug/${encodeURIComponent(slug)}/`, { headers: authHeaders(creds), timeoutMs: 12_000 });
    if (res.status === 401 || res.status === 403) throw new CmsAuthError('Ghost rejected the admin API key');
    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as Record<string, Array<{ id: string; updated_at: string }>>;
      const row = json[kind]?.[0];
      if (row?.id) return { kind, id: row.id, updated_at: row.updated_at };
    }
  }
  return null;
}

async function patch(creds: GhostCreds, r: GhostResource, fields: Record<string, unknown>): Promise<CmsWriteResult> {
  const res = await safeFetch(`${api(creds)}/${r.kind}/${r.id}/`, {
    method: 'PUT', headers: authHeaders(creds), timeoutMs: 15_000,
    body: JSON.stringify({ [r.kind]: [{ id: r.id, updated_at: r.updated_at, ...fields }] }),
  });
  if (res.status === 401 || res.status === 403) throw new CmsAuthError('Ghost rejected the admin API key on write');
  return res.ok ? { ok: true, resourceId: r.id } : { ok: false, detail: { status: res.status } };
}

export const ghostAdapter: CmsAdapter = {
  type: 'ghost',

  async verify(rawCreds) {
    const creds = readCreds(rawCreds);
    try {
      const res = await safeFetch(`${api(creds)}/site/`, { headers: authHeaders(creds), timeoutMs: 10_000 });
      if (res.ok) return { ok: true };
      if (res.status === 401 || res.status === 403) return { ok: false, detail: 'Invalid Ghost admin API key' };
      return { ok: false, detail: `Ghost returned HTTP ${res.status}` };
    } catch (e) { return { ok: false, detail: (e as Error).message }; }
  },

  async updateTitle(rawCreds, target, title) {
    const creds = readCreds(rawCreds);
    const r = await resolve(creds, target.url);
    if (!r) return { ok: false, detail: { reason: 'post_not_found' } };
    return patch(creds, r, { title, meta_title: title });
  },

  async updateMetaDescription(rawCreds, target, description) {
    const creds = readCreds(rawCreds);
    const r = await resolve(creds, target.url);
    if (!r) return { ok: false, detail: { reason: 'post_not_found' } };
    return patch(creds, r, { meta_description: description, custom_excerpt: description.slice(0, 300) });
  },

  async updateCanonical(rawCreds, target, canonical) {
    const creds = readCreds(rawCreds);
    const r = await resolve(creds, target.url);
    if (!r) return { ok: false, detail: { reason: 'post_not_found' } };
    return patch(creds, r, { canonical_url: canonical });
  },

  async createPage(rawCreds, page) {
    const creds = readCreds(rawCreds);
    const res = await safeFetch(`${api(creds)}/pages/?source=html`, {
      method: 'POST', headers: authHeaders(creds), timeoutMs: 15_000,
      body: JSON.stringify({ pages: [{ title: page.title, slug: page.slug, html: page.html, status: page.status === 'draft' ? 'draft' : 'published' }] }),
    });
    if (res.status === 401 || res.status === 403) throw new CmsAuthError('Ghost rejected the admin API key on create');
    const json = (await res.json().catch(() => ({}))) as { pages?: Array<{ id?: string; url?: string }> };
    const created = json.pages?.[0];
    if (!res.ok || !created?.id) return { ok: false, detail: { status: res.status } };
    return { ok: true, resourceId: created.id, url: created.url };
  },

  // Lexical body + no per-post robots over the API.
  async updateBody() { throw new CmsUnsupportedError('updateBody', 'ghost'); },
  async replaceInBody() { throw new CmsUnsupportedError('replaceInBody', 'ghost'); },
  async injectSchema() { throw new CmsUnsupportedError('injectSchema', 'ghost'); },
  async setIndexable() { throw new CmsUnsupportedError('setIndexable', 'ghost'); },
};
