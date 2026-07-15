/**
 * Fix Engine - edge adapter (plugin-free publishing for ANY stack).
 *
 * Nothing is installed on the customer's site. A small Cloudflare Worker
 * (generated in the dashboard, pasted once into the domain's CDN) rewrites
 * each HTML response in transit: it pulls the brand's per-path overrides
 * from /api/edge/serve?file=seo.json and applies the shipped title, meta
 * description, canonical, JSON-LD schema, OG/Twitter head block, and
 * noindex-removal values via HTMLRewriter. Because the change happens at
 * the CDN layer, it works identically for WordPress, custom-coded sites,
 * or anything else behind the domain.
 *
 * Shipping therefore doesn't push anything: a fix's shipped/verified row IS
 * the override (getEdgeSeoOverrides), and reverting removes it. What this
 * adapter's write methods do is guard truthfulness — they confirm the Worker
 * is actually routed on the target page (marker header `x-livesov-edge`)
 * before letting the engine mark the fix shipped, so we never claim a change
 * is live on a domain the Worker isn't serving. The post-ship auto-recheck
 * then verifies the rendered HTML end-to-end (≤5-min override cache).
 */

import { safeFetch } from '@/lib/safe-fetch';
import { EDGE_MARKER_HEADER } from '../edge-worker';
import type { CmsAdapter, CmsCreds, CmsWriteResult } from './types';
import { CmsUnsupportedError } from './types';

export { EDGE_MARKER_HEADER };

async function edgeMarkerOn(url: string): Promise<{ routed: boolean; status?: number; error?: string }> {
  try {
    const res = await safeFetch(url, { timeoutMs: 12_000, maxBytes: 1024 * 1024 });
    return { routed: !!res.headers.get(EDGE_MARKER_HEADER), status: res.status };
  } catch (e) {
    return { routed: false, error: (e as Error).message };
  }
}

/**
 * Whether the Livesov edge Worker actually fronts a URL (the `x-livesov-edge`
 * marker is present on the response). The ship handler uses this to confirm a
 * page is Worker-served before publishing an edge-serveable fix there — so we
 * never mark a fix shipped-to-edge on a domain the Worker isn't routed on. A
 * fetch/SSRF failure resolves to `{ routed: false }` (never throws).
 */
export async function probeEdgeMarker(url: string): Promise<{ routed: boolean; status?: number; error?: string }> {
  return edgeMarkerOn(url);
}

function notRouted(url: string, probe: { status?: number; error?: string }): CmsWriteResult {
  return {
    ok: false,
    detail: { reason: 'edge_worker_not_detected', url, ...probe },
    error:
      'The Livesov edge Worker is not serving this page yet, so the change would not appear. ' +
      'Paste the Worker from Connections into your Cloudflare zone and route it to this domain, then ship again.',
  };
}

/**
 * The edge "write" for title / meta / canonical: verify the Worker fronts
 * the target page, then report ok — the value itself is delivered by the
 * seo.json override feed the moment this fix's row turns shipped.
 */
async function edgeWrite(url: string, field: string, value: string): Promise<CmsWriteResult> {
  const probe = await edgeMarkerOn(url);
  if (!probe.routed) return notRouted(url, probe);
  return { ok: true, url, detail: { delivery: 'edge', field, value } };
}

export const edgeAdapter: CmsAdapter = {
  type: 'edge',

  // Connectable once the Worker is live on the brand's domain — checking the
  // marker here means we never store an "active" edge connection that can't
  // actually publish.
  async verify(_creds: CmsCreds, siteUrl: string) {
    if (!siteUrl) return { ok: false, detail: 'Site URL is required for an edge connection' };
    const target = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`;
    const probe = await edgeMarkerOn(target);
    if (probe.routed) return { ok: true };
    return {
      ok: false,
      detail: probe.error
        ? `Could not reach ${target}: ${probe.error}`
        : `No ${EDGE_MARKER_HEADER} header on ${target} — paste the Worker from Connections into your Cloudflare zone and route it to this domain first.`,
    };
  },

  async updateTitle(_creds, target, title) {
    return edgeWrite(target.url, 'title', title);
  },

  async updateMetaDescription(_creds, target, description) {
    return edgeWrite(target.url, 'description', description);
  },

  async updateCanonical(_creds, target, canonical) {
    return edgeWrite(target.url, 'canonical', canonical);
  },

  // JSON-LD is injected before </head> by the Worker (override field jsonLd).
  async injectSchema(_creds, target, jsonLd) {
    return edgeWrite(target.url, 'jsonLd', jsonLd);
  },

  // The Worker rewrites meta robots to index,follow and strips the
  // X-Robots-Tag response header (override flag indexable).
  async setIndexable(_creds, target) {
    return edgeWrite(target.url, 'indexable', 'true');
  },

  // The edge can only touch head-level SEO; body/content edits still need
  // a CMS/endpoint. These degrade to the engine's hand-off path (ticket /
  // manual) instead of failing silently.
  async updateBody() { throw new CmsUnsupportedError('update_body', 'edge'); },
  async createPage() { throw new CmsUnsupportedError('create_page', 'edge'); },
  async replaceInBody() { throw new CmsUnsupportedError('replace_in_body', 'edge'); },
};
