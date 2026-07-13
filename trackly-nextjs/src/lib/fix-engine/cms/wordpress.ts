/**
 * Fix Engine - WordPress CMS adapter (Channel A reference implementation).
 *
 * Talks to the WordPress REST API (/wp-json/wp/v2) using Application
 * Password auth (Basic auth: username:application_password). This is the
 * native, plugin-free way to write to a WP site, which is why WordPress
 * is the Channel-A reference: it proves the "ship via CMS REST API" loop
 * without the Connector plugin.
 *
 * Credential shape (stored encrypted in fix_connections.encrypted_creds):
 *   { username: string, appPassword: string }
 * plus fix_connections.site_url = the WP site origin.
 *
 * SEO title/meta live in plugin fields (Yoast / Rank Math). WordPress
 * core has no first-class SEO title or meta-description, so those writes
 * target the known Yoast + Rank Math meta keys. WP silently ignores any
 * post-meta key a plugin hasn't registered with `show_in_rest` and still
 * returns HTTP 200 — so every SEO-field write here reads the object WP
 * echoes back and confirms the value actually persisted. If it didn't
 * (no REST-writable SEO plugin), the write returns a truthful failure
 * that points the user at the Connector, instead of a false "shipped".
 */

import { safeFetch } from '@/lib/safe-fetch';
import type { CmsAdapter, CmsCreds, CmsTarget, CmsWriteResult } from './types';
import { CmsAuthError } from './types';

interface WpCreds {
  username: string;
  appPassword: string;
}

function authHeader(creds: WpCreds): string {
  const token = Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');
  return `Basic ${token}`;
}

function readCreds(raw: CmsCreds): WpCreds {
  const c = raw as Partial<WpCreds>;
  if (!c.username || !c.appPassword) {
    throw new CmsAuthError('WordPress connection is missing username/appPassword');
  }
  return { username: c.username, appPassword: c.appPassword };
}

function apiBase(siteUrl: string): string {
  const origin = new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`).origin;
  return `${origin}/wp-json/wp/v2`;
}

function slugFromUrl(url: string): string {
  const path = new URL(url).pathname.replace(/\/+$/, '');
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

/** Resolve a public URL to a WP resource (pages first, then posts). */
async function resolveResource(
  base: string,
  creds: WpCreds,
  url: string,
): Promise<{ kind: 'pages' | 'posts'; id: number } | null> {
  const slug = slugFromUrl(url);
  if (!slug) {
    // Homepage / no slug: fall back to the front page if set.
    return null;
  }
  for (const kind of ['pages', 'posts'] as const) {
    const res = await safeFetch(`${base}/${kind}?slug=${encodeURIComponent(slug)}`, {
      headers: { Authorization: authHeader(creds) },
      timeoutMs: 10_000,
    });
    if (res.status === 401 || res.status === 403) {
      throw new CmsAuthError('WordPress rejected the application password');
    }
    if (res.ok) {
      const arr = (await res.json()) as Array<{ id: number }>;
      if (Array.isArray(arr) && arr[0]?.id) return { kind, id: arr[0].id };
    }
  }
  return null;
}

/** A patch result that also carries the WP object the write returned, so
 *  callers can confirm which fields actually persisted (WP silently drops
 *  post-meta keys that aren't registered with `show_in_rest`). */
type PatchResult = CmsWriteResult & { response?: Record<string, unknown> };

async function patchResource(
  base: string,
  creds: WpCreds,
  kind: 'pages' | 'posts',
  id: number,
  body: Record<string, unknown>,
): Promise<PatchResult> {
  const res = await safeFetch(`${base}/${kind}/${id}`, {
    method: 'POST', // WP accepts POST for updates
    headers: {
      Authorization: authHeader(creds),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    timeoutMs: 15_000,
  });
  if (res.status === 401 || res.status === 403) {
    throw new CmsAuthError('WordPress rejected the application password on write');
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, detail: { status: res.status, response: json } };
  }
  return {
    ok: true,
    resourceId: id,
    url: typeof json.link === 'string' ? json.link : undefined,
    detail: { kind },
    response: json,
  };
}

/**
 * WordPress core silently ignores post-meta keys that an SEO plugin hasn't
 * registered with `show_in_rest`, so an HTTP 200 does NOT prove that a
 * Yoast / Rank Math field (SEO title, meta description, canonical, robots)
 * was actually stored. Given the object WP echoed back from the write,
 * return true only when at least one of the target meta keys came back
 * holding the value we sent — i.e. the field really is writable via REST.
 */
function seoMetaPersisted(
  response: Record<string, unknown> | undefined,
  matchers: Array<{ key: string; matches: (value: unknown) => boolean }>,
): boolean {
  const meta = response?.meta;
  if (!meta || typeof meta !== 'object') return false;
  const m = meta as Record<string, unknown>;
  return matchers.some(({ key, matches }) => key in m && matches(m[key]));
}

/**
 * The write went through at the HTTP level but WordPress didn't actually
 * store the SEO field — the plugin doesn't expose it to the REST API. Report
 * a truthful failure (instead of a false "shipped") that points the user at
 * the Connector, which writes the meta server-side with `update_post_meta`.
 */
function seoFieldNotWritable(field: string, r: { kind: 'pages' | 'posts'; id: number }): CmsWriteResult {
  return {
    ok: false,
    resourceId: r.id,
    detail: { reason: 'seo_field_not_writable_via_rest', field, kind: r.kind },
    error:
      `WordPress accepted the request but did not store the ${field}: your SEO plugin ` +
      `does not expose that field to the REST API, so the change is not live on the page. ` +
      `Connect the Livesov Connector (Connections) to apply ${field} changes reliably.`,
  };
}

export const wordpressAdapter: CmsAdapter = {
  type: 'wordpress',

  async verify(rawCreds, siteUrl) {
    const creds = readCreds(rawCreds);
    const base = apiBase(siteUrl);
    try {
      const res = await safeFetch(`${base}/users/me?context=edit`, {
        headers: { Authorization: authHeader(creds) },
        timeoutMs: 10_000,
      });
      if (res.ok) return { ok: true };
      if (res.status === 401 || res.status === 403) {
        return { ok: false, detail: 'Invalid username or application password' };
      }
      return { ok: false, detail: `WordPress returned HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },

  async updateTitle(rawCreds, target, title) {
    const creds = readCreds(rawCreds);
    const base = apiBase(target.url);
    const r = await resolveResource(base, creds, target.url);
    if (!r) return { ok: false, detail: { reason: 'page_not_found_in_wp' } };
    // The SEO <title> is plugin-driven (Yoast / Rank Math), so write those
    // meta keys — NOT the core `title`, which is the page's H1/menu label and
    // must not be overwritten with a truncated SEO title.
    const res = await patchResource(base, creds, r.kind, r.id, {
      meta: { _yoast_wpseo_title: title, rank_math_title: title },
    });
    if (!res.ok) return res;
    // WP returns 200 even when it dropped an unregistered meta key, so confirm
    // the SEO title actually persisted before reporting the change as live.
    if (!seoMetaPersisted(res.response, [
      { key: '_yoast_wpseo_title', matches: (v) => String(v) === title },
      { key: 'rank_math_title', matches: (v) => String(v) === title },
    ])) {
      return seoFieldNotWritable('SEO title', r);
    }
    return res;
  },

  async updateMetaDescription(rawCreds, target, description) {
    const creds = readCreds(rawCreds);
    const base = apiBase(target.url);
    const r = await resolveResource(base, creds, target.url);
    if (!r) return { ok: false, detail: { reason: 'page_not_found_in_wp' } };
    const res = await patchResource(base, creds, r.kind, r.id, {
      // Write both popular SEO plugins' keys; WP ignores unknown meta keys
      // that aren't registered, so this is safe to send unconditionally.
      meta: {
        _yoast_wpseo_metadesc: description,
        rank_math_description: description,
      },
    });
    if (!res.ok) return res;
    // The meta description has no core WP field backing it — if neither SEO
    // plugin's key was actually stored, nothing changed on the page.
    if (!seoMetaPersisted(res.response, [
      { key: '_yoast_wpseo_metadesc', matches: (v) => String(v) === description },
      { key: 'rank_math_description', matches: (v) => String(v) === description },
    ])) {
      return seoFieldNotWritable('meta description', r);
    }
    return res;
  },

  async updateBody(rawCreds, target, html, mode) {
    const creds = readCreds(rawCreds);
    const base = apiBase(target.url);
    const r = await resolveResource(base, creds, target.url);
    if (!r) return { ok: false, detail: { reason: 'page_not_found_in_wp' } };
    if (mode === 'append') {
      // Fetch current content, append, write back.
      const cur = await safeFetch(`${base}/${r.kind}/${r.id}?context=edit`, {
        headers: { Authorization: authHeader(creds) },
        timeoutMs: 10_000,
      });
      const curJson = (await cur.json().catch(() => ({}))) as {
        content?: { raw?: string; rendered?: string };
      };
      const existing = curJson.content?.raw ?? curJson.content?.rendered ?? '';
      html = `${existing}\n\n${html}`;
    }
    return patchResource(base, creds, r.kind, r.id, { content: html });
  },

  async createPage(rawCreds, page) {
    const creds = readCreds(rawCreds);
    // createPage takes a slug, not a full URL, so the site origin is passed
    // through on creds.site by the engine (resolveCmsForBrand supplies it).
    const site = (rawCreds as { site?: string }).site;
    if (!site) return { ok: false, detail: { reason: 'missing_site_for_create' } };
    const base = apiBase(site);
    const res = await safeFetch(`${base}/pages`, {
      method: 'POST',
      headers: { Authorization: authHeader(creds), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: page.title,
        slug: page.slug,
        content: page.html,
        status: page.status || 'publish',
      }),
      timeoutMs: 15_000,
    });
    if (res.status === 401 || res.status === 403) {
      throw new CmsAuthError('WordPress rejected the application password on create');
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, detail: { status: res.status, response: json } };
    return {
      ok: true,
      resourceId: json.id as number | undefined,
      url: typeof json.link === 'string' ? json.link : undefined,
      detail: { created: true },
    };
  },

  async updateCanonical(rawCreds, target, canonical) {
    const creds = readCreds(rawCreds);
    const base = apiBase(target.url);
    const r = await resolveResource(base, creds, target.url);
    if (!r) return { ok: false, detail: { reason: 'page_not_found_in_wp' } };
    // Canonical is plugin-managed; write both Yoast and Rank Math keys.
    const res = await patchResource(base, creds, r.kind, r.id, {
      meta: { _yoast_wpseo_canonical: canonical, rank_math_canonical_url: canonical },
    });
    if (!res.ok) return res;
    if (!seoMetaPersisted(res.response, [
      { key: '_yoast_wpseo_canonical', matches: (v) => String(v) === canonical },
      { key: 'rank_math_canonical_url', matches: (v) => String(v) === canonical },
    ])) {
      return seoFieldNotWritable('canonical URL', r);
    }
    return res;
  },

  async setIndexable(rawCreds, target) {
    const creds = readCreds(rawCreds);
    const base = apiBase(target.url);
    const r = await resolveResource(base, creds, target.url);
    if (!r) return { ok: false, detail: { reason: 'page_not_found_in_wp' } };
    // Clear the SEO plugins' per-post noindex. Yoast: '2' = noindex, set
    // '0' to follow the (indexable) site default. Rank Math stores robots
    // as an array; index/follow makes the page indexable.
    const res = await patchResource(base, creds, r.kind, r.id, {
      meta: { '_yoast_wpseo_meta-robots-noindex': '0', rank_math_robots: ['index', 'follow'] },
    });
    if (!res.ok) return res;
    if (!seoMetaPersisted(res.response, [
      { key: '_yoast_wpseo_meta-robots-noindex', matches: (v) => String(v) === '0' },
      { key: 'rank_math_robots', matches: (v) => Array.isArray(v) && v.includes('index') },
    ])) {
      return seoFieldNotWritable('indexable flag', r);
    }
    return res;
  },

  async replaceInBody(rawCreds, target, find, replace) {
    const creds = readCreds(rawCreds);
    const base = apiBase(target.url);
    const r = await resolveResource(base, creds, target.url);
    if (!r) return { ok: false, found: false, detail: { reason: 'page_not_found_in_wp' } };
    // Read the raw post body, do an exact in-place replacement, write back.
    const cur = await safeFetch(`${base}/${r.kind}/${r.id}?context=edit`, {
      headers: { Authorization: authHeader(creds) },
      timeoutMs: 10_000,
    });
    const curJson = (await cur.json().catch(() => ({}))) as { content?: { raw?: string; rendered?: string } };
    const body = curJson.content?.raw ?? curJson.content?.rendered ?? '';
    if (!body || !body.includes(find)) {
      // Passage isn't in the stored body (likely theme-rendered).
      return { ok: false, found: false, detail: { reason: 'passage_not_found_in_body' } };
    }
    const updated = body.replace(find, replace); // first occurrence only
    const res = await patchResource(base, creds, r.kind, r.id, { content: updated });
    return { ...res, found: true };
  },

  async injectSchema(rawCreds, target, jsonLd) {
    // Without a Connector/plugin we can't touch <head>, so the pragmatic
    // Channel-A path appends the JSON-LD <script> to the post body, which
    // search engines and AI crawlers still read. Head injection is the
    // Connector's job (Channel B).
    const block = `<script type="application/ld+json">${jsonLd}</script>`;
    return this.updateBody(rawCreds, target, block, 'append');
  },
};
