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
 * core has no first-class meta-description, so updateMetaDescription
 * writes the known Yoast + Rank Math meta keys; if neither plugin
 * exposes them via REST, the write degrades to a recorded note rather
 * than a hard failure (the engine then suggests the Connector path).
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

async function patchResource(
  base: string,
  creds: WpCreds,
  kind: 'pages' | 'posts',
  id: number,
  body: Record<string, unknown>,
): Promise<CmsWriteResult> {
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
    // Core post title. Note: this updates the H1/post title; SEO <title>
    // is plugin-driven and handled by updateMetaDescription's plugin meta.
    return patchResource(base, creds, r.kind, r.id, {
      title,
      meta: { _yoast_wpseo_title: title, rank_math_title: title },
    });
  },

  async updateMetaDescription(rawCreds, target, description) {
    const creds = readCreds(rawCreds);
    const base = apiBase(target.url);
    const r = await resolveResource(base, creds, target.url);
    if (!r) return { ok: false, detail: { reason: 'page_not_found_in_wp' } };
    return patchResource(base, creds, r.kind, r.id, {
      // Write both popular SEO plugins' keys; WP ignores unknown meta keys
      // that aren't registered, so this is safe to send unconditionally.
      meta: {
        _yoast_wpseo_metadesc: description,
        rank_math_description: description,
      },
      excerpt: description,
    });
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
    return patchResource(base, creds, r.kind, r.id, {
      meta: { _yoast_wpseo_canonical: canonical, rank_math_canonical_url: canonical },
    });
  },

  async setIndexable(rawCreds, target) {
    const creds = readCreds(rawCreds);
    const base = apiBase(target.url);
    const r = await resolveResource(base, creds, target.url);
    if (!r) return { ok: false, detail: { reason: 'page_not_found_in_wp' } };
    // Clear the SEO plugins' per-post noindex. Yoast: '2' = noindex, set
    // '0' to follow the (indexable) site default. Rank Math stores robots
    // as an array; index/follow makes the page indexable.
    return patchResource(base, creds, r.kind, r.id, {
      meta: { '_yoast_wpseo_meta-robots-noindex': '0', rank_math_robots: ['index', 'follow'] },
    });
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
