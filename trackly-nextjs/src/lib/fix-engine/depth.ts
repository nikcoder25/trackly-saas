/**
 * Fix Engine - content depth extraction for competitor comparison.
 *
 * Separate from crawl.ts on purpose, for two reasons.
 *
 * First, budget. `crawlPage` truncates visible text at 8,000 characters,
 * which is ample for the questions it exists to answer (is there a title,
 * is this thin, is there FAQ schema) and actively wrong for this one. A
 * 4,000-word competitor guide is roughly 24,000 characters, so measuring
 * "who covers more" against an 8k window compares the first third of one
 * page with the first third of another and calls it depth.
 *
 * Second, rendering. crawl.ts does a plain SSRF-guarded GET, which is the
 * right posture for the customer's own site. Competitor pages are often
 * JS-rendered, and a static GET of one returns a near-empty shell. Reading
 * that as "the competitor has 40 words" would manufacture a content gap
 * that does not exist - a confidently wrong finding, which is worse than
 * no finding. So a suspiciously thin result is retried through the shared
 * render cascade, and if that is unavailable the page is reported as
 * UNREAD rather than as empty.
 *
 * Third-party fetches also consult robots.txt here, which crawl.ts does
 * not. Reading the customer's own pages at their request is a different
 * act from crawling a competitor on a schedule.
 */

import { safeFetch } from '@/lib/safe-fetch';
import { logger } from '@/lib/logger';
import { renderHtml, renderServiceEnabled, robotsAllows } from '@/lib/page-render';
import { jsonLdHasType } from './crawl';

/** Visible-text budget. Roughly 4,000 words - past any real article length. */
export const DEPTH_TEXT_CAP = 24_000;
const FETCH_TIMEOUT_MS = 12_000;

/**
 * Below this word count a static fetch is treated as suspect rather than as
 * a measurement. Real pages that rank in Google's top 10 for a commercial
 * query are essentially never this short, so the likely explanation is that
 * the body never rendered.
 */
export const SUSPICIOUS_WORD_COUNT = 150;

export interface DepthProfile {
  url: string;
  /** False when the page could not be read; every metric below is then meaningless. */
  read: boolean;
  /** Why it could not be read, when read is false. */
  unreadReason?: 'robots' | 'fetch_failed' | 'empty_after_render';
  title: string | null;
  headings: string[];
  wordCount: number;
  text: string;
  hasTables: boolean;
  hasLists: boolean;
  hasFaqSchema: boolean;
  /** True when the body only became readable through the render cascade. */
  rendered: boolean;
}

function unread(url: string, reason: DepthProfile['unreadReason']): DepthProfile {
  return {
    url, read: false, unreadReason: reason, title: null, headings: [],
    wordCount: 0, text: '', hasTables: false, hasLists: false,
    hasFaqSchema: false, rendered: false,
  };
}

/** Strip script/style/nav chrome, then tags, then collapse whitespace. */
export function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(?:nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/(?:nav|footer|header|aside)>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Heading text in document order, H1 through H4, tags stripped. */
export function extractHeadings(html: string, cap = 40): string[] {
  const out: string[] = [];
  const re = /<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < cap) {
    const text = visibleText(m[2]);
    if (text) out.push(`H${m[1]}: ${text.slice(0, 160)}`);
  }
  return out;
}

function parseJsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try { blocks.push(JSON.parse(m[1].trim())); } catch { /* skip malformed block */ }
  }
  return blocks;
}

/**
 * A data or comparison table, not a layout one. Requires at least two body
 * rows, since single-row tables are almost always layout scaffolding.
 */
export function hasDataTable(html: string): boolean {
  const tables = html.match(/<table\b[\s\S]*?<\/table>/gi) || [];
  return tables.some((t) => (t.match(/<tr\b/gi) || []).length >= 3);
}

/** A list of real substance, not a nav menu. */
export function hasContentList(html: string): boolean {
  const lists = html.match(/<(?:ul|ol)\b[\s\S]*?<\/(?:ul|ol)>/gi) || [];
  return lists.some((l) => {
    const items = l.match(/<li\b/gi) || [];
    if (items.length < 3) return false;
    // Nav menus are lists of short links; content lists carry prose.
    return visibleText(l).length > 200;
  });
}

/** Build a depth profile from already-fetched HTML. Pure, so it is testable. */
export function profileFromHtml(url: string, html: string, rendered: boolean): DepthProfile {
  const text = visibleText(html).slice(0, DEPTH_TEXT_CAP);
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const jsonLd = parseJsonLd(html);
  return {
    url,
    read: true,
    title: titleMatch ? visibleText(titleMatch[1]).slice(0, 300) : null,
    headings: extractHeadings(html),
    wordCount: text ? text.split(/\s+/).length : 0,
    text,
    hasTables: hasDataTable(html),
    hasLists: hasContentList(html),
    hasFaqSchema: jsonLdHasType(jsonLd, 'FAQPage'),
    rendered,
  };
}

/**
 * Fetch and profile one page for depth comparison.
 *
 * `thirdParty` controls the robots.txt check: on for competitor pages, off
 * for the customer's own site, which they connected and asked us to work on.
 */
export async function profilePage(
  url: string,
  opts: { thirdParty: boolean; signal?: AbortSignal } = { thirdParty: true },
): Promise<DepthProfile> {
  if (opts.thirdParty && !(await robotsAllows(url))) {
    logger.info('fix_engine.depth.robots_disallowed', { url });
    return unread(url, 'robots');
  }

  let html: string | null = null;
  try {
    const res = await safeFetch(url, { timeoutMs: FETCH_TIMEOUT_MS });
    if (res.ok) html = await res.text();
  } catch (e) {
    logger.info('fix_engine.depth.fetch_failed', { url, err: (e as Error).message });
  }

  let profile = html ? profileFromHtml(url, html, false) : null;

  // A thin or failed read is a rendering question, not a measurement.
  if ((!profile || profile.wordCount < SUSPICIOUS_WORD_COUNT) && renderServiceEnabled()) {
    try {
      const r = await renderHtml(url, false);
      if (r?.html) {
        const rendered = profileFromHtml(url, r.html, true);
        // Keep whichever read actually saw more of the page.
        if (!profile || rendered.wordCount > profile.wordCount) profile = rendered;
      }
    } catch (e) {
      logger.info('fix_engine.depth.render_failed', { url, err: (e as Error).message });
    }
  }

  if (!profile) return unread(url, 'fetch_failed');
  // Still implausibly thin after everything we can do. Say so rather than
  // letting a zero flow into a comparison as if it were measured.
  if (profile.wordCount < SUSPICIOUS_WORD_COUNT) {
    return { ...unread(url, 'empty_after_render'), title: profile.title, rendered: profile.rendered };
  }
  return profile;
}

/** Median, so one enormous outlier competitor doesn't set the bar alone. */
export function medianWordCount(profiles: DepthProfile[]): number {
  const counts = profiles.filter((p) => p.read).map((p) => p.wordCount).sort((a, b) => a - b);
  if (!counts.length) return 0;
  const mid = Math.floor(counts.length / 2);
  return counts.length % 2 ? counts[mid] : Math.round((counts[mid - 1] + counts[mid]) / 2);
}
