/**
 * Fix Engine - Webflow CMS adapter (Data API v2).
 *
 * Creds (encrypted in fix_connections):
 *   { apiToken: "…", siteId: "…" }
 *
 * Webflow's static page *content* isn't editable over the API (it's a visual
 * builder), but page SEO title/description are. So this adapter covers
 * updateTitle / updateMetaDescription (and best-effort publish); everything
 * else throws CmsUnsupportedError.
 *
 * NOTE: built to Webflow's documented v2 API; treat as beta until run
 * against a live site.
 */

import { safeFetch } from '@/lib/safe-fetch';
import type { CmsAdapter, CmsCreds, CmsTarget, CmsWriteResult } from './types';
import { CmsAuthError, CmsUnsupportedError } from './types';

const API = 'https://api.webflow.com/v2';

interface WebflowCreds { apiToken: string; siteId: string }

function readCreds(raw: CmsCreds): WebflowCreds {
  const c = raw as Partial<WebflowCreds>;
  if (!c.apiToken || !c.siteId) throw new CmsAuthError('Webflow connection needs apiToken + siteId');
  return { apiToken: String(c.apiToken), siteId: String(c.siteId) };
}
function headers(creds: WebflowCreds): Record<string, string> {
  return { Authorization: `Bearer ${creds.apiToken}`, 'Content-Type': 'application/json', Accept: 'application/json' };
}
function slugFromUrl(url: string): string {
  const parts = new URL(url).pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

async function resolvePageId(creds: WebflowCreds, url: string): Promise<string | null> {
  const slug = slugFromUrl(url);
  const res = await safeFetch(`${API}/sites/${creds.siteId}/pages?limit=100`, { headers: headers(creds), timeoutMs: 12_000 });
  if (res.status === 401 || res.status === 403) throw new CmsAuthError('Webflow rejected the API token');
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { pages?: Array<{ id: string; slug?: string; isHomepage?: boolean }> };
  const pages = json.pages || [];
  if (!slug) return pages.find((p) => p.isHomepage)?.id ?? null;
  return pages.find((p) => p.slug === slug)?.id ?? null;
}

async function patchSeo(creds: WebflowCreds, pageId: string, seo: Record<string, string>): Promise<CmsWriteResult> {
  // Only touch SEO metadata — never the page `title` (that renames the page
  // in the designer / nav). Webflow's `seo.title` drives the <title> tag.
  const res = await safeFetch(`${API}/pages/${pageId}`, { method: 'PATCH', headers: headers(creds), body: JSON.stringify({ seo }), timeoutMs: 15_000 });
  if (res.status === 401 || res.status === 403) throw new CmsAuthError('Webflow rejected the API token on write');
  if (!res.ok) return { ok: false, detail: { status: res.status } };
  // Best-effort publish so the change goes live; don't fail the op if it errors.
  await safeFetch(`${API}/sites/${creds.siteId}/publish`, {
    method: 'POST', headers: headers(creds), timeoutMs: 15_000, body: JSON.stringify({ publishToWebflowSubdomain: true }),
  }).catch(() => undefined);
  return { ok: true, resourceId: pageId };
}

export const webflowAdapter: CmsAdapter = {
  type: 'webflow',

  async verify(rawCreds) {
    const creds = readCreds(rawCreds);
    try {
      const res = await safeFetch(`${API}/sites/${creds.siteId}`, { headers: headers(creds), timeoutMs: 10_000 });
      if (res.ok) return { ok: true };
      if (res.status === 401 || res.status === 403) return { ok: false, detail: 'Invalid Webflow API token' };
      if (res.status === 404) return { ok: false, detail: 'Webflow site not found — check the siteId' };
      return { ok: false, detail: `Webflow returned HTTP ${res.status}` };
    } catch (e) { return { ok: false, detail: (e as Error).message }; }
  },

  async updateTitle(rawCreds, target, title) {
    const creds = readCreds(rawCreds);
    const id = await resolvePageId(creds, target.url);
    if (!id) return { ok: false, detail: { reason: 'page_not_found' } };
    return patchSeo(creds, id, { title });
  },

  async updateMetaDescription(rawCreds, target, description) {
    const creds = readCreds(rawCreds);
    const id = await resolvePageId(creds, target.url);
    if (!id) return { ok: false, detail: { reason: 'page_not_found' } };
    return patchSeo(creds, id, { description });
  },

  // Static page content + canonical/robots/create aren't available via the API.
  async updateBody() { throw new CmsUnsupportedError('updateBody', 'webflow'); },
  async replaceInBody() { throw new CmsUnsupportedError('replaceInBody', 'webflow'); },
  async injectSchema() { throw new CmsUnsupportedError('injectSchema', 'webflow'); },
  async updateCanonical() { throw new CmsUnsupportedError('updateCanonical', 'webflow'); },
  async setIndexable() { throw new CmsUnsupportedError('setIndexable', 'webflow'); },
  async createPage() { throw new CmsUnsupportedError('createPage', 'webflow'); },
};
