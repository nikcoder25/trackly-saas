/**
 * Fix Engine - custom-site adapter (any stack).
 *
 * For custom-coded sites with no CMS API: the site owner drops a single
 * small HTTP endpoint into their codebase (reference implementations for
 * Node/Express, Next.js and PHP live in docs/CUSTOM-SITE-CONNECT.md) and
 * pastes its URL + a shared secret into Connections. Every ship operation
 * becomes one signed POST to that endpoint:
 *
 *   POST {endpoint}
 *   Authorization: Bearer <secret>
 *   X-Livesov-Signature: sha256=<hex hmac-sha256(rawBody, secret)>
 *   { "op": "update_title", "url": "<page>", "value": "<new title>", "ts": <unix ms> }
 *
 * The endpoint applies the change however the site stores content (DB
 * row, template, flat file) and replies { ok: true }. Ops it doesn't
 * implement reply { ok: false, unsupported: true } (or HTTP 501), which
 * the engine surfaces as "needs manual / hand-off" instead of a failure —
 * so a 20-line endpoint that only handles titles + metas is already
 * useful, and coverage can grow op by op.
 */

import crypto from 'crypto';
import { safeFetch } from '@/lib/safe-fetch';
import type { CmsAdapter, CmsCreds, CmsTarget, CmsWriteResult } from './types';
import { CmsAuthError, CmsUnsupportedError } from './types';

interface CustomCreds { endpoint: string; secret: string }

function readCreds(raw: CmsCreds): CustomCreds {
  const c = raw as Partial<CustomCreds>;
  const endpoint = String(c.endpoint || '').trim();
  const secret = String(c.secret || '').trim();
  if (!/^https:\/\//i.test(endpoint) || secret.length < 16) {
    throw new CmsAuthError('Custom connection needs an https endpoint URL + a shared secret (16+ chars)');
  }
  return { endpoint, secret };
}

export interface CustomOpPayload {
  op: string;
  ts: number;
  url?: string;
  value?: string;
  mode?: 'replace' | 'append';
  find?: string;
  replace?: string;
  page?: { title: string; slug: string; html: string; status: 'publish' | 'draft' };
}

async function send(creds: CustomCreds, payload: CustomOpPayload): Promise<CmsWriteResult & { found?: boolean }> {
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', creds.secret).update(body).digest('hex');
  const res = await safeFetch(creds.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${creds.secret}`,
      'X-Livesov-Signature': `sha256=${sig}`,
    },
    body,
    timeoutMs: 20_000,
  });
  if (res.status === 401 || res.status === 403) throw new CmsAuthError('Your site endpoint rejected the shared secret');
  if (res.status === 501) throw new CmsUnsupportedError(payload.op, 'custom');
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; unsupported?: boolean; error?: string; resourceId?: string | number; url?: string; found?: boolean };
  if (json.unsupported) throw new CmsUnsupportedError(payload.op, 'custom');
  if (!res.ok || !json.ok) {
    return { ok: false, detail: { status: res.status, error: json.error || 'endpoint returned an error' } };
  }
  return { ok: true, resourceId: json.resourceId, url: json.url, found: json.found, detail: { status: res.status } };
}

const now = () => Date.now();

export const customAdapter: CmsAdapter = {
  type: 'custom',

  async verify(creds: CmsCreds): Promise<{ ok: boolean; detail?: string }> {
    try {
      const c = readCreds(creds);
      const r = await send(c, { op: 'ping', ts: now() });
      return r.ok ? { ok: true } : { ok: false, detail: String(r.detail?.error || 'ping failed') };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },

  async updateTitle(creds: CmsCreds, target: CmsTarget, title: string): Promise<CmsWriteResult> {
    return send(readCreds(creds), { op: 'update_title', ts: now(), url: target.url, value: title });
  },

  async updateMetaDescription(creds: CmsCreds, target: CmsTarget, description: string): Promise<CmsWriteResult> {
    return send(readCreds(creds), { op: 'update_meta_description', ts: now(), url: target.url, value: description });
  },

  async updateBody(creds: CmsCreds, target: CmsTarget, html: string, mode: 'replace' | 'append'): Promise<CmsWriteResult> {
    return send(readCreds(creds), { op: 'update_body', ts: now(), url: target.url, value: html, mode });
  },

  async injectSchema(creds: CmsCreds, target: CmsTarget, jsonLd: string): Promise<CmsWriteResult> {
    return send(readCreds(creds), { op: 'inject_schema', ts: now(), url: target.url, value: jsonLd });
  },

  async updateCanonical(creds: CmsCreds, target: CmsTarget, canonical: string): Promise<CmsWriteResult> {
    return send(readCreds(creds), { op: 'update_canonical', ts: now(), url: target.url, value: canonical });
  },

  async createPage(creds: CmsCreds, page: { title: string; slug: string; html: string; status?: 'publish' | 'draft' }): Promise<CmsWriteResult> {
    return send(readCreds(creds), { op: 'create_page', ts: now(), page: { ...page, status: page.status ?? 'draft' } });
  },

  async setIndexable(creds: CmsCreds, target: CmsTarget): Promise<CmsWriteResult> {
    return send(readCreds(creds), { op: 'set_indexable', ts: now(), url: target.url });
  },

  async replaceInBody(creds: CmsCreds, target: CmsTarget, find: string, replace: string): Promise<CmsWriteResult & { found?: boolean }> {
    return send(readCreds(creds), { op: 'replace_in_body', ts: now(), url: target.url, find, replace });
  },
};
