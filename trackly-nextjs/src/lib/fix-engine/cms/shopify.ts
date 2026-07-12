/**
 * Fix Engine - Shopify CMS adapter (Admin REST API).
 *
 * Creds (encrypted in fix_connections.encrypted_creds):
 *   { shop: "store.myshopify.com" | "store", accessToken: "shpat_…" }
 *
 * Targets Online-Store *pages* (the closest analogue to a CMS page). SEO
 * title/description live in the `global.title_tag` / `global.description_tag`
 * metafields. Operations Shopify can't express (per-page canonical / robots)
 * throw CmsUnsupportedError, which the engine surfaces as "needs Connector /
 * manual".
 *
 * NOTE: validated against Shopify's documented Admin API; treat as beta until
 * exercised against a live store.
 */

import { safeFetch } from '@/lib/safe-fetch';
import type { CmsAdapter, CmsCreds, CmsTarget, CmsWriteResult } from './types';
import { CmsAuthError, CmsUnsupportedError } from './types';

const API_VERSION = '2024-07';

interface ShopifyCreds { shop: string; accessToken: string }

function readCreds(raw: CmsCreds): ShopifyCreds {
  const c = raw as Partial<ShopifyCreds>;
  if (!c.shop || !c.accessToken) throw new CmsAuthError('Shopify connection needs shop + accessToken');
  const shop = String(c.shop).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const host = shop.includes('.') ? shop : `${shop}.myshopify.com`;
  return { shop: host, accessToken: String(c.accessToken) };
}

function base(creds: ShopifyCreds): string {
  return `https://${creds.shop}/admin/api/${API_VERSION}`;
}
function headers(creds: ShopifyCreds): Record<string, string> {
  return { 'X-Shopify-Access-Token': creds.accessToken, 'Content-Type': 'application/json', Accept: 'application/json' };
}
function handleFromUrl(url: string): string {
  const parts = new URL(url).pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

/** Find the Online-Store page whose handle matches the target URL. */
async function resolvePage(creds: ShopifyCreds, url: string): Promise<{ id: number; body_html: string } | null> {
  const handle = handleFromUrl(url);
  if (!handle) return null;
  const res = await safeFetch(`${base(creds)}/pages.json?limit=250`, { headers: headers(creds), timeoutMs: 12_000 });
  if (res.status === 401 || res.status === 403) throw new CmsAuthError('Shopify rejected the access token');
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { pages?: Array<{ id: number; handle: string; body_html?: string }> };
  const page = (json.pages || []).find((p) => p.handle === handle);
  return page ? { id: page.id, body_html: page.body_html ?? '' } : null;
}

async function putPage(creds: ShopifyCreds, id: number, page: Record<string, unknown>): Promise<CmsWriteResult> {
  const res = await safeFetch(`${base(creds)}/pages/${id}.json`, {
    method: 'PUT', headers: headers(creds), body: JSON.stringify({ page: { id, ...page } }), timeoutMs: 15_000,
  });
  if (res.status === 401 || res.status === 403) throw new CmsAuthError('Shopify rejected the access token on write');
  const json = (await res.json().catch(() => ({}))) as { page?: { id?: number } };
  return res.ok ? { ok: true, resourceId: json.page?.id ?? id } : { ok: false, detail: { status: res.status } };
}

async function setMetafield(creds: ShopifyCreds, pageId: number, key: string, value: string): Promise<CmsWriteResult> {
  const res = await safeFetch(`${base(creds)}/pages/${pageId}/metafields.json`, {
    method: 'POST', headers: headers(creds), timeoutMs: 15_000,
    body: JSON.stringify({ metafield: { namespace: 'global', key, type: 'single_line_text_field', value } }),
  });
  if (res.status === 401 || res.status === 403) throw new CmsAuthError('Shopify rejected the access token on metafield write');
  return res.ok ? { ok: true, resourceId: pageId } : { ok: false, detail: { status: res.status } };
}

export const shopifyAdapter: CmsAdapter = {
  type: 'shopify',

  async verify(rawCreds) {
    const creds = readCreds(rawCreds);
    try {
      const res = await safeFetch(`${base(creds)}/shop.json`, { headers: headers(creds), timeoutMs: 10_000 });
      if (res.ok) return { ok: true };
      if (res.status === 401 || res.status === 403) return { ok: false, detail: 'Invalid Shopify access token' };
      return { ok: false, detail: `Shopify returned HTTP ${res.status}` };
    } catch (e) { return { ok: false, detail: (e as Error).message }; }
  },

  async updateTitle(rawCreds, target, title) {
    const creds = readCreds(rawCreds);
    const page = await resolvePage(creds, target.url);
    if (!page) return { ok: false, detail: { reason: 'page_not_found' } };
    await setMetafield(creds, page.id, 'title_tag', title).catch(() => undefined);
    return putPage(creds, page.id, { title });
  },

  async updateMetaDescription(rawCreds, target, description) {
    const creds = readCreds(rawCreds);
    const page = await resolvePage(creds, target.url);
    if (!page) return { ok: false, detail: { reason: 'page_not_found' } };
    return setMetafield(creds, page.id, 'description_tag', description);
  },

  async updateBody(rawCreds, target, html, mode) {
    const creds = readCreds(rawCreds);
    const page = await resolvePage(creds, target.url);
    if (!page) return { ok: false, detail: { reason: 'page_not_found' } };
    const body = mode === 'append' ? `${page.body_html}\n\n${html}` : html;
    return putPage(creds, page.id, { body_html: body });
  },

  async replaceInBody(rawCreds, target, find, replace) {
    const creds = readCreds(rawCreds);
    const page = await resolvePage(creds, target.url);
    if (!page) return { ok: false, found: false, detail: { reason: 'page_not_found' } };
    if (!page.body_html.includes(find)) return { ok: false, found: false, detail: { reason: 'passage_not_found' } };
    const res = await putPage(creds, page.id, { body_html: page.body_html.replace(find, replace) });
    return { ...res, found: true };
  },

  async injectSchema(rawCreds, target, jsonLd) {
    return this.updateBody(rawCreds, target, `<script type="application/ld+json">${jsonLd}</script>`, 'append');
  },

  async createPage(rawCreds, page) {
    const creds = readCreds(rawCreds);
    const res = await safeFetch(`${base(creds)}/pages.json`, {
      method: 'POST', headers: headers(creds), timeoutMs: 15_000,
      body: JSON.stringify({ page: { title: page.title, handle: page.slug, body_html: page.html, published: page.status !== 'draft' } }),
    });
    if (res.status === 401 || res.status === 403) throw new CmsAuthError('Shopify rejected the access token on create');
    const json = (await res.json().catch(() => ({}))) as { page?: { id?: number; handle?: string } };
    if (!res.ok || !json.page?.id) return { ok: false, detail: { status: res.status } };
    return { ok: true, resourceId: json.page.id, url: `https://${creds.shop}/pages/${json.page.handle}` };
  },

  // Shopify has no per-page canonical or robots control via the Admin API.
  async updateCanonical() { throw new CmsUnsupportedError('updateCanonical', 'shopify'); },
  async setIndexable() { throw new CmsUnsupportedError('setIndexable', 'shopify'); },
};
