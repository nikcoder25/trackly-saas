/**
 * Fix Engine - lightweight page crawler.
 *
 * Pulls a single HTML page through the existing SSRF-safe fetch path
 * (same primitive the llms-txt-generator and ai-crawler-checker tools
 * use) and extracts the on-page signals the Phase-1 modules need:
 * title, meta description, H1s, heading outline, visible text, and any
 * JSON-LD blocks already present.
 *
 * This is deliberately regex-based, matching the repo's existing HTML
 * parsing style (no cheerio dependency). It's good enough for detection;
 * generation quality comes from the LLM, not the parser.
 */

import { safeFetch } from '@/lib/safe-fetch';

export interface CrawledPage {
  url: string;
  status: number;
  title: string | null;
  metaDescription: string | null;
  h1s: string[];
  headings: { level: number; text: string }[];
  /** Visible text content, collapsed + truncated to ~8k chars. */
  text: string;
  /** Raw JSON-LD blocks found in the page (parsed where possible). */
  jsonLd: unknown[];
  /** Word count of visible text - used by thin-content detection. */
  wordCount: number;
  /** True when the page already serves an FAQPage schema block. */
  hasFaqSchema: boolean;
  /** `<meta name="robots">` content, lowercased (e.g. "noindex,follow"). */
  metaRobots: string | null;
  /** X-Robots-Tag response header, lowercased. */
  xRobotsTag: string | null;
  /** True when the page already has Open Graph + Twitter card meta. */
  hasOgTags: boolean;
  /** Count of outbound links to a different host (external links). */
  externalLinkCount: number;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decodeEntities(stripTags(m[1])).trim() : null;
}

function extractMeta(html: string, name: string): string | null {
  // Handles both name="description" and property="og:description" ordering.
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`,
    'i',
  );
  const m = html.match(re);
  if (m) return decodeEntities(m[1]).trim();
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`,
    'i',
  );
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1]).trim() : null;
}

function extractHeadings(html: string): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = [];
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = decodeEntities(stripTags(m[2])).trim();
    if (text) out.push({ level: Number(m[1]), text });
  }
  return out;
}

function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      // Malformed JSON-LD is itself a finding the schema-repair module
      // (Phase 3) will care about; for Phase 1 we just skip it.
    }
  }
  return out;
}

export function jsonLdHasType(blocks: unknown[], type: string): boolean {
  const walk = (node: unknown): boolean => {
    if (!node) return false;
    if (Array.isArray(node)) return node.some(walk);
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      const t = obj['@type'];
      if (t === type || (Array.isArray(t) && t.includes(type))) return true;
      if (Array.isArray(obj['@graph'])) return (obj['@graph'] as unknown[]).some(walk);
    }
    return false;
  };
  return blocks.some(walk);
}

export async function crawlPage(url: string, _signal?: AbortSignal): Promise<CrawledPage> {
  // safeFetch manages its own timeout/abort internally; the optional
  // signal arg is kept for call-site symmetry with the engine context.
  const res = await safeFetch(url, { timeoutMs: 12_000, maxBytes: 3 * 1024 * 1024 });
  const html = await res.text();
  const headings = extractHeadings(html);
  const text = stripTags(html).slice(0, 8000);
  const jsonLd = extractJsonLd(html);
  const metaRobots = extractMeta(html, 'robots');
  const og = extractMeta(html, 'og:title');
  const twitter = extractMeta(html, 'twitter:card');
  const externalLinkCount = countExternalLinks(html, url);
  return {
    url,
    status: res.status,
    title: extractTag(html, 'title'),
    metaDescription: extractMeta(html, 'description'),
    h1s: headings.filter((h) => h.level === 1).map((h) => h.text),
    headings,
    text,
    jsonLd,
    wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
    hasFaqSchema: jsonLdHasType(jsonLd, 'FAQPage'),
    metaRobots: metaRobots ? metaRobots.toLowerCase() : null,
    xRobotsTag: (res.headers.get('x-robots-tag') || '').toLowerCase() || null,
    hasOgTags: !!og && !!twitter,
    externalLinkCount,
  };
}

function countExternalLinks(html: string, pageUrl: string): number {
  let host = '';
  try { host = new URL(pageUrl).host; } catch { /* leave blank */ }
  const hrefs = html.match(/<a\b[^>]*href=["']([^"']+)["']/gi) || [];
  let count = 0;
  for (const a of hrefs) {
    const m = a.match(/href=["']([^"']+)["']/i);
    const href = m?.[1] || '';
    if (!/^https?:\/\//i.test(href)) continue;
    try { if (new URL(href).host !== host) count++; } catch { /* skip */ }
  }
  return count;
}

/**
 * Resolve the set of URLs to crawl for a brand. Phase 1 keeps this
 * simple: the brand's own website plus its sitemap's first N entries.
 * Crawl-trigger modules call this; GSC-trigger modules (Phase 2+) get
 * their URL list from Search Console instead.
 */
export async function resolveCrawlTargets(
  website: string | undefined,
  max = 20,
): Promise<string[]> {
  if (!website) return [];
  const base = website.startsWith('http') ? website : `https://${website}`;
  const targets = new Set<string>([base]);

  // Best-effort sitemap discovery. Failures just fall back to the homepage.
  try {
    const origin = new URL(base).origin;
    const res = await safeFetch(`${origin}/sitemap.xml`, {
      timeoutMs: 8000,
      maxBytes: 5 * 1024 * 1024,
    });
    if (res.ok) {
      const xml = await res.text();
      const locs = xml.match(/<loc>([\s\S]*?)<\/loc>/g) || [];
      for (const loc of locs) {
        const u = loc.replace(/<\/?loc>/g, '').trim();
        if (u && !u.endsWith('.xml')) targets.add(u);
        if (targets.size >= max) break;
      }
    }
  } catch {
    // No sitemap - homepage only.
  }

  return Array.from(targets).slice(0, max);
}
