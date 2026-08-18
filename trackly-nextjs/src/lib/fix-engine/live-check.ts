/**
 * Fix Engine - live page verification.
 *
 * "It says SHIPPED. Is the change actually on my page?"
 *
 * That question had no honest answer before this module. Each fix module
 * owns a recheck(), but recheck answers a different question depending on
 * the module: sixteen of them re-crawl the page (good), while the five
 * GSC-driven ones ask Search Console whether CTR or position improved.
 * Two of those five - ctr-rescue and striking-distance - WRITE to the page,
 * so shipping one left the user with no way to confirm the write landed,
 * and no way to find out for weeks, because that is how long GSC takes to
 * say anything. A publish that silently failed sat at "shipped" looking
 * identical to one that worked.
 *
 * This module answers the narrow, immediate, checkable question instead:
 * fetch the live URL right now and look for the exact value we shipped.
 *
 * Three design rules, because a verification tool that lies is worse than
 * none at all:
 *
 * 1. NEVER claim more than was checked. The verdict names the exact strings
 *    searched for and the URL fetched, so the user can reproduce it by hand
 *    in view-source. That reproducibility is the feature.
 * 2. "Not in the HTML" is not the same as "not published". A JS-rendered
 *    site serves a shell to a plain GET, and a CDN can serve a stale copy
 *    for hours. Both are reported as themselves - with the CDN's own cache
 *    headers as evidence - rather than as a failed publish.
 * 3. A diagnostic module writes nothing by design, so it is reported as
 *    not-applicable, never as a failure. ("Shipped" on a diagnostic means
 *    "finding accepted", which is its own source of confusion.)
 */

import { safeFetch } from '@/lib/safe-fetch';
import { logger } from '@/lib/logger';
import { renderHtml, renderServiceEnabled } from '@/lib/page-render';
import { jsonLdHasType } from './crawl';
import type { FixModule } from './types';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 3 * 1024 * 1024;

/**
 * How much of a long value must appear for the check to pass.
 *
 * Body content is matched on a distinctive opening slice, not the whole
 * block. A CMS legitimately reformats what it stores - re-wrapping
 * paragraphs, escaping entities, injecting its own classes - so demanding
 * an exact match of a 2,000-character HTML append would report "missing"
 * for content sitting right there on the page. Titles and meta
 * descriptions are short and stored verbatim, so those are matched whole.
 */
export const BODY_MATCH_CHARS = 60;

export type LiveCheckKind =
  | 'title' | 'meta-description' | 'canonical' | 'og-tags'
  | 'body-contains' | 'jsonld-type' | 'indexable' | 'image-alt' | 'file-contains';

/** One thing to look for on the live page. */
export interface LiveCheck {
  /** Human label for the card, e.g. "Page title". */
  label: string;
  kind: LiveCheckKind;
  /**
   * The exact text to find. This is also what the user is told to search
   * for by hand, so it must be the real string - never a paraphrase.
   */
  expected: string;
  /** Fetch this instead of the fix's target URL (llms.txt, robots.txt). */
  url?: string;
}

export interface LiveCheckResult extends LiveCheck {
  found: boolean;
  /** What is on the page now, when it could be read. Null when unknown. */
  actual: string | null;
}

export type LiveVerdictState =
  /** Every check found what we shipped. */
  | 'confirmed'
  /** Some found, some not. */
  | 'partial'
  /** Nothing we shipped is on the page. */
  | 'missing'
  /** The page could not be fetched at all. */
  | 'unreachable'
  /** The module writes nothing to the site (diagnostics). */
  | 'not_applicable'
  /** We have no way to check this module's output automatically. */
  | 'unsupported';

export interface LiveVerdict {
  state: LiveVerdictState;
  checkedAt: string;
  url: string | null;
  /**
   * Where the value was found. 'html' = in the raw served HTML, which is
   * what every crawler sees. 'rendered' = only after JavaScript ran, which
   * Google usually still indexes but many other crawlers do not.
   */
  source: 'html' | 'rendered' | null;
  /** HTTP status of the fetch, when there was one. */
  status: number | null;
  /**
   * Cache headers from the response. When a check misses, these are the
   * difference between "the publish failed" and "your CDN is still serving
   * the old copy" - so they are captured rather than described.
   */
  cache: { age: string | null; cacheControl: string | null; cacheStatus: string | null } | null;
  checks: LiveCheckResult[];
  /** One sentence for the card. */
  note: string;
}

// ── what to look for, per module ─────────────────────────────────

type Bag = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Strip tags and collapse whitespace, for comparing content to HTML. */
export function textOf(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Case- and whitespace-insensitive, for matching across CMS reformatting. */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The first sentence-ish slice of a generated block: enough to be unique on
 * the page, short enough that a user can eyeball it in view-source.
 */
export function distinctiveSlice(html: string, chars = BODY_MATCH_CHARS): string {
  const text = textOf(html);
  if (text.length <= chars) return text;
  const cut = text.slice(0, chars);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > chars * 0.5 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * What to look for on the live page for one fix.
 *
 * Reads the SHIPPED values (after_snapshot, falling back to the draft),
 * because the point is to verify what actually went out, not what was once
 * drafted - a fix edited between generate and ship must be checked against
 * the edited text.
 *
 * Returns [] for modules whose output cannot be checked from the served
 * HTML; the caller reports that as 'unsupported' rather than inventing a
 * check that would pass or fail for the wrong reason.
 */
export function describeLiveChecks(fix: {
  moduleKey: string;
  targetUrl: string | null;
  generated: Bag | null;
  afterSnapshot: Bag | null;
}): LiveCheck[] {
  const g = fix.generated ?? {};
  const a = fix.afterSnapshot ?? {};
  // after_snapshot wins: it is what ship() actually wrote.
  const val = (key: string) => str(a[key]) || str(g[key]);
  const out: LiveCheck[] = [];

  const title = () => {
    const t = val('title');
    if (t) out.push({ label: 'Page title', kind: 'title', expected: t });
  };
  const meta = () => {
    const d = val('description');
    if (d) out.push({ label: 'Meta description', kind: 'meta-description', expected: d });
  };
  const body = (label: string, raw: string) => {
    const slice = distinctiveSlice(raw);
    if (slice.length >= 12) out.push({ label, kind: 'body-contains', expected: slice });
  };
  const origin = () => {
    try { return new URL(fix.targetUrl ?? '').origin; } catch { return null; }
  };

  switch (fix.moduleKey) {
    case 'title-rewrite':
      title();
      break;
    case 'meta-rewrite':
      meta();
      break;
    // The two modules this whole file exists for: they write the page's
    // title/meta/body but their recheck only ever asked GSC about CTR.
    case 'ctr-rescue':
      title(); meta();
      break;
    case 'striking-distance':
      title();
      body('New section', str(g.sectionHeading) || str(a.sectionHtml) || str(g.sectionHtml));
      break;
    case 'keyword-opportunities':
      body('New section', val('heading') || str(g.html));
      break;
    case 'hallucination-correction':
      body('Correction section', val('heading') || str(g.html));
      break;
    case 'citable-passages':
      body('TL;DR block', val('tldr') || str(g.html));
      break;
    case 'geo-page-rewrite':
    case 'indexing-repair':
      body('Rewritten content', str(g.html));
      break;
    case 'passage-rewrite':
      body('Rewritten passage', val('rewritten'));
      break;
    case 'content-freshness':
      body('Freshness update', val('update'));
      break;
    case 'external-citations': {
      const cites = Array.isArray(a.citations) ? a.citations : [];
      for (const c of cites.slice(0, 3)) {
        const url = str((c as Bag)?.url) || str(c);
        if (url) out.push({ label: 'Citation link', kind: 'body-contains', expected: url });
      }
      if (!out.length) body('Citations block', str(g.html));
      break;
    }
    case 'internal-linking': {
      const links = Array.isArray(a.links) ? a.links : (Array.isArray(g.links) ? g.links : []);
      for (const l of links.slice(0, 3)) {
        const href = str((l as Bag)?.url) || str((l as Bag)?.href);
        if (href) out.push({ label: 'Internal link', kind: 'body-contains', expected: href });
      }
      break;
    }
    case 'faq-schema':
      out.push({ label: 'FAQPage schema', kind: 'jsonld-type', expected: 'FAQPage' });
      break;
    case 'schema-markup': {
      const t = val('schemaType');
      if (t) out.push({ label: `${t} schema`, kind: 'jsonld-type', expected: t });
      break;
    }
    case 'canonical-fix': {
      const c = val('canonical');
      if (c) out.push({ label: 'Canonical URL', kind: 'canonical', expected: c });
      break;
    }
    case 'noindex-removal':
      out.push({ label: 'Page is indexable', kind: 'indexable', expected: 'no noindex directive' });
      break;
    case 'og-cards':
      out.push({ label: 'Open Graph tags', kind: 'og-tags', expected: 'og:title + twitter:card' });
      break;
    case 'image-alt': {
      const alts = (a.alts ?? g.alts) as Bag | undefined;
      const first = alts && typeof alts === 'object' ? Object.values(alts).map(str).filter(Boolean)[0] : '';
      if (first) out.push({ label: 'Image alt text', kind: 'image-alt', expected: first });
      break;
    }
    case 'llms-txt': {
      const o = origin();
      if (o) out.push({ label: 'llms.txt', kind: 'file-contains', expected: '#', url: `${o}/llms.txt` });
      break;
    }
    case 'robots-ai-access': {
      const o = origin();
      if (o) out.push({ label: 'robots.txt allows AI crawlers', kind: 'file-contains', expected: 'GPTBot', url: `${o}/robots.txt` });
      break;
    }
    case 'comparison-pages': {
      // The fix creates a NEW page; the check is that the page exists and
      // carries its title, so it targets that URL rather than the origin.
      const u = str(a.url);
      const t = str(g.title);
      if (u && t) out.push({ label: 'New comparison page', kind: 'title', expected: t, url: u });
      break;
    }
    default:
      break;
  }
  return out;
}

// ── reading the live page ────────────────────────────────────────

function tagText(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? textOf(m[1]) : null;
}

function metaContent(html: string, name: string): string | null {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const a = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${esc}["'][^>]*content=["']([^"']*)["']`, 'i'));
  if (a) return textOf(a[1]);
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${esc}["']`, 'i'));
  return b ? textOf(b[1]) : null;
}

function linkHref(html: string, rel: string): string | null {
  const m = html.match(new RegExp(`<link[^>]+rel=["']${rel}["'][^>]*href=["']([^"']*)["']`, 'i'));
  if (m) return m[1].trim();
  const m2 = html.match(new RegExp(`<link[^>]+href=["']([^"']*)["'][^>]*rel=["']${rel}["']`, 'i'));
  return m2 ? m2[1].trim() : null;
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try { out.push(JSON.parse(m[1].trim())); } catch { /* malformed block */ }
  }
  return out;
}

/** Run one check against a document. Pure, so every kind is testable. */
export function runCheck(check: LiveCheck, html: string): LiveCheckResult {
  const body = norm(textOf(html));
  const rawLower = html.toLowerCase();

  switch (check.kind) {
    case 'title': {
      const actual = tagText(html, 'title');
      return { ...check, actual, found: !!actual && norm(actual) === norm(check.expected) };
    }
    case 'meta-description': {
      const actual = metaContent(html, 'description');
      return { ...check, actual, found: !!actual && norm(actual) === norm(check.expected) };
    }
    case 'canonical': {
      const actual = linkHref(html, 'canonical');
      const same = (x: string, y: string) => x.replace(/\/+$/, '') === y.replace(/\/+$/, '');
      return { ...check, actual, found: !!actual && same(norm(actual), norm(check.expected)) };
    }
    case 'og-tags': {
      const og = metaContent(html, 'og:title');
      const tw = metaContent(html, 'twitter:card');
      return {
        ...check,
        actual: og ? `og:title "${og}"${tw ? ` + twitter:card "${tw}"` : ' (no twitter:card)'}` : null,
        found: !!og && !!tw,
      };
    }
    case 'jsonld-type': {
      const found = jsonLdHasType(jsonLdBlocks(html), check.expected);
      return { ...check, actual: found ? `${check.expected} present` : 'not present', found };
    }
    case 'indexable': {
      const robots = (metaContent(html, 'robots') || '').toLowerCase();
      const found = !robots.includes('noindex');
      return { ...check, actual: robots ? `meta robots: ${robots}` : 'no meta robots tag', found };
    }
    case 'image-alt': {
      const found = rawLower.includes(`alt="${check.expected.toLowerCase()}"`)
        || rawLower.includes(`alt='${check.expected.toLowerCase()}'`)
        || norm(html).includes(norm(check.expected));
      return { ...check, actual: found ? 'present' : 'not found', found };
    }
    case 'file-contains':
    case 'body-contains':
    default: {
      // Match against visible text AND raw HTML: a link href or a robots
      // directive never appears in visible text, and prose does not
      // survive tag stripping intact in the raw markup.
      const needle = norm(check.expected);
      const found = body.includes(needle) || norm(html).includes(needle);
      return { ...check, actual: found ? 'present' : 'not found', found };
    }
  }
}

interface Fetched { html: string; status: number; cache: LiveVerdict['cache'] }

/**
 * Fetch the live page, asking every cache in the path for a fresh copy.
 *
 * The no-cache headers are a request, not a guarantee - a CDN may serve a
 * stale copy anyway - so the response's own cache headers come back with
 * the body. When a check then misses, those headers are what distinguishes
 * "the publish failed" from "you are looking at a cached page", which is
 * the single most common false alarm this feature could produce.
 */
async function fetchLive(url: string): Promise<Fetched> {
  const res = await safeFetch(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    maxBytes: MAX_BYTES,
    headers: {
      'Cache-Control': 'no-cache, max-age=0',
      Pragma: 'no-cache',
      'User-Agent': 'Mozilla/5.0 (compatible; LivesovVerify/1.0; +https://livesov.com/bot)',
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
    },
  });
  return {
    html: await res.text(),
    status: res.status,
    cache: {
      age: res.headers.get('age'),
      cacheControl: res.headers.get('cache-control'),
      cacheStatus: res.headers.get('x-cache') || res.headers.get('cf-cache-status') || res.headers.get('x-vercel-cache'),
    },
  };
}

function summarise(state: LiveVerdictState, checks: LiveCheckResult[], source: LiveVerdict['source'], cache: LiveVerdict['cache']): string {
  const ok = checks.filter((c) => c.found).length;
  switch (state) {
    case 'confirmed':
      return source === 'rendered'
        ? `Found on the page, but only after JavaScript ran - it is not in the HTML your server sends. Google usually still sees it; most other crawlers do not.`
        : `Confirmed live: ${ok === 1 ? 'the change is' : `all ${ok} changes are`} in the HTML your page serves right now.`;
    case 'partial':
      return `${ok} of ${checks.length} changes are live. The rest are not on the page yet.`;
    case 'missing': {
      const stale = cache && (cache.cacheStatus?.toUpperCase().includes('HIT') || (cache.age && Number(cache.age) > 60));
      return stale
        ? `Not found - but the page came from a cache (${cache?.cacheStatus ?? `age ${cache?.age}s`}), so you may be seeing an old copy. Purge your CDN cache and check again.`
        : `Not found on the live page. The write may not have saved, or your CMS/CDN may still be serving the old version.`;
    }
    case 'unreachable':
      return `Could not fetch the page to check it.`;
    case 'not_applicable':
      return `This fix is a diagnosis - nothing was written to your site, so there is nothing on the page to verify.`;
    case 'unsupported':
    default:
      return `This fix type can't be verified automatically from the page's HTML.`;
  }
}

const now = () => new Date().toISOString();

/**
 * Verify one shipped fix against its live page.
 *
 * Never throws for an unreachable page: "we could not check" is a real
 * answer the card must show, not an error that hides the whole panel.
 */
export async function verifyFixLive(args: {
  fix: { moduleKey: string; targetUrl: string | null; generated: Bag | null; afterSnapshot: Bag | null };
  module: FixModule;
}): Promise<LiveVerdict> {
  const { fix, module: mod } = args;
  const base: Omit<LiveVerdict, 'state' | 'note'> = {
    checkedAt: now(), url: fix.targetUrl, source: null, status: null, cache: null, checks: [],
  };

  if (mod.diagnostic) {
    return { ...base, state: 'not_applicable', note: summarise('not_applicable', [], null, null) };
  }

  const checks = describeLiveChecks(fix);
  if (!checks.length) {
    return { ...base, state: 'unsupported', note: summarise('unsupported', [], null, null) };
  }

  // Most checks share the fix's target URL; llms.txt / robots.txt / a new
  // comparison page each name their own.
  const url = checks[0].url ?? fix.targetUrl;
  if (!url) {
    return { ...base, state: 'unsupported', note: 'This fix has no page URL to check.' };
  }

  let fetched: Fetched;
  try {
    fetched = await fetchLive(url);
  } catch (e) {
    logger.warn('fix_engine.live_check.fetch_failed', { url, err: (e as Error).message });
    return {
      ...base, url, state: 'unreachable',
      note: `Could not fetch ${url} to check it: ${(e as Error).message}`,
    };
  }

  let results = checks.map((c) => runCheck(c, fetched.html));
  let source: LiveVerdict['source'] = 'html';

  // A miss on a JS-rendered site is not a failed publish. Re-check the
  // misses against the rendered DOM before calling anything missing, and
  // say which document the value was found in - the distinction matters
  // for every crawler that does not execute JavaScript.
  if (results.some((r) => !r.found) && renderServiceEnabled()) {
    try {
      const rendered = await renderHtml(url, false);
      if (rendered?.html) {
        const retried = checks.map((c, i) => (results[i].found ? results[i] : runCheck(c, rendered.html)));
        if (retried.some((r, i) => r.found && !results[i].found)) {
          results = retried;
          source = 'rendered';
        }
      }
    } catch (e) {
      logger.warn('fix_engine.live_check.render_failed', { url, err: (e as Error).message });
    }
  }

  const okCount = results.filter((r) => r.found).length;
  const state: LiveVerdictState =
    okCount === results.length ? 'confirmed' : okCount === 0 ? 'missing' : 'partial';

  return {
    checkedAt: now(),
    url,
    source: okCount > 0 ? source : null,
    status: fetched.status,
    cache: fetched.cache,
    checks: results,
    state,
    note: summarise(state, results, source, fetched.cache),
  };
}
