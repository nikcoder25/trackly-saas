/**
 * Targeted (user-initiated) fix creation.
 *
 * Shared by the "Ask for a fix" assistant and the legacy targeted route. Given
 * a module + a page URL (+ optional keyword / passage / free-text
 * instruction), build the `detected` payload that module's generate() expects
 * and create the fix in 'detected' state. The normal
 * generate → approve → ship flow then applies.
 *
 * Every supported module builds its evidence from a single page crawl, so one
 * on-demand request is at most one crawl (+ a sitemap fetch for internal
 * links). There is no cap on how many targeted fixes a user creates.
 */

import crypto from 'crypto';
import { upsertDetectedFix } from './schema';
import { getModule } from './registry';
import { crawlPage, resolveCrawlTargets, type CrawledPage } from './crawl';
import type { FixSeverity } from './types';

/** Modules the free-text assistant can route a request to. */
export type TargetedModuleKey =
  | 'passage-rewrite'
  | 'internal-linking'
  | 'keyword-opportunities'
  | 'title-rewrite'
  | 'meta-rewrite'
  | 'geo-page-rewrite'
  | 'faq-schema';

export interface TargetedModuleInfo {
  key: TargetedModuleKey;
  /** Plain-language capability, shown to the classifier LLM. */
  purpose: string;
  /** Does the request need a specific keyword? */
  needsKeyword?: boolean;
  /** Does the request need the user to paste the exact passage? */
  needsPassage?: boolean;
}

export const TARGETED_MODULES: TargetedModuleInfo[] = [
  { key: 'passage-rewrite', purpose: 'Rewrite a specific paragraph the user pasted so it is clearer and more likely to be cited by AI answers.', needsPassage: true },
  { key: 'internal-linking', purpose: 'Add contextual internal links (and anchor text) on a page, or improve interlinking / anchors between pages.' },
  { key: 'keyword-opportunities', purpose: 'Make a page target/rank for a specific keyword — produces a targeting plan and a ready-to-publish section.', needsKeyword: true },
  { key: 'title-rewrite', purpose: 'Rewrite/fix the page title tag (too long, weak, missing keyword, not compelling).' },
  { key: 'meta-rewrite', purpose: 'Write/fix the meta description for a page.' },
  { key: 'geo-page-rewrite', purpose: 'Optimise the page content for AI answers / GEO (structure, direct answers, citable facts) when the ask is general "improve this page for AI/SEO".' },
  { key: 'faq-schema', purpose: 'Add an FAQ section + FAQ schema to a page.' },
];

const TARGETED_KEYS = new Set(TARGETED_MODULES.map((m) => m.key));
export const isTargetedModule = (k: string): k is TargetedModuleKey => TARGETED_KEYS.has(k as TargetedModuleKey);

// Modules whose generate() reads crawled page content out of `detected`.
const NEEDS_PAGE = new Set<TargetedModuleKey>(['internal-linking', 'title-rewrite', 'meta-rewrite', 'geo-page-rewrite', 'faq-schema']);

const sha16 = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

export interface CreateTargetedArgs {
  brandId: string;
  ownerId: string;
  website?: string;
  moduleKey: TargetedModuleKey;
  url: string;
  keyword?: string;
  passage?: string;
  instruction?: string;
  /** Brand's tracked queries — used to seed FAQ generation. */
  brandQueries?: string[];
}

export interface CreateTargetedResult {
  fixId: string;
  moduleKey: TargetedModuleKey;
}

/**
 * Validate + create a targeted fix. Throws a user-facing Error when required
 * inputs are missing (so the caller can surface a clarifying question).
 */
export async function createTargetedFix(args: CreateTargetedArgs): Promise<CreateTargetedResult> {
  const { brandId, ownerId, moduleKey } = args;
  const url = (args.url || '').trim();
  const instruction = (args.instruction || '').trim();
  const keyword = (args.keyword || '').trim();
  const passage = (args.passage || '').trim();

  if (!getModule(moduleKey)) throw new Error(`Unknown fix type: ${moduleKey}`);
  if (!url) throw new Error('Which page is this about? Add the page URL.');
  if (moduleKey === 'passage-rewrite' && passage.length < 12) {
    throw new Error('Paste the exact paragraph you want rewritten (at least a sentence).');
  }
  if (moduleKey === 'keyword-opportunities' && keyword.length < 2) {
    throw new Error('Which keyword should the page target?');
  }

  // Crawl the page once for the modules that read its content.
  let page: CrawledPage | null = null;
  if (NEEDS_PAGE.has(moduleKey)) {
    try { page = await crawlPage(url); } catch { page = null; }
  }

  let severity: FixSeverity = 'low';
  let summary: string;
  let dedupeKey: string;
  let detected: Record<string, unknown>;
  let before: Record<string, unknown> | undefined;

  switch (moduleKey) {
    case 'passage-rewrite':
      dedupeKey = `${url}#${sha16(passage)}`;
      summary = `Rewrite passage on ${url}`;
      detected = { url, passage, instruction };
      before = { passage };
      break;

    case 'keyword-opportunities':
      severity = 'medium';
      dedupeKey = `${url}#kw#${sha16(keyword.toLowerCase())}`;
      summary = `Target “${keyword}” on ${url}`;
      detected = { query: keyword, page: url, position: 0, impressions: 0, volume: 0, competition: 0, cpc: 0, instruction, targeted: true };
      break;

    case 'internal-linking': {
      const targets = await resolveCrawlTargets(args.website, 40);
      const candidates = targets.filter((u) => u !== url).map((u) => ({ url: u, title: null as string | null }));
      if (candidates.length === 0) throw new Error('Couldn’t find other pages on this site to link to (no reachable sitemap). Try a different page or a passage rewrite.');
      dedupeKey = `${url}#links${instruction ? `#${sha16(instruction.toLowerCase())}` : ''}`;
      summary = instruction ? `Internal links on ${url} — ${instruction.slice(0, 60)}` : `Add contextual internal links to ${url}`;
      detected = { url, title: page?.title ?? null, pageText: page?.text ?? '', candidates, instruction };
      break;
    }

    case 'title-rewrite': {
      const title = page?.title ?? null;
      dedupeKey = url;
      summary = title ? `Rewrite title on ${url}` : `Add a title to ${url}`;
      detected = { url, currentTitle: title, length: title?.length ?? 0, h1: page?.h1s[0] ?? null, pageSummary: (page?.text ?? '').slice(0, 1200), instruction };
      before = { title };
      break;
    }

    case 'meta-rewrite': {
      const meta = page?.metaDescription ?? null;
      dedupeKey = url;
      summary = meta ? `Rewrite meta description on ${url}` : `Add a meta description to ${url}`;
      detected = { url, currentMeta: meta, title: page?.title ?? null, pageSummary: (page?.text ?? '').slice(0, 1500), instruction };
      before = { description: meta };
      break;
    }

    case 'geo-page-rewrite':
      severity = 'medium';
      dedupeKey = url;
      summary = `Optimise ${url} for AI answers`;
      detected = { url, title: page?.title ?? null, headings: (page?.headings ?? []).map((h) => h.text), pageText: page?.text ?? '', instruction };
      break;

    case 'faq-schema':
      dedupeKey = url;
      summary = `Add FAQ schema to ${url}`;
      detected = { url, title: page?.title ?? null, pageText: page?.text ?? '', queries: args.brandQueries ?? [], instruction };
      break;

    default:
      throw new Error(`Unsupported fix type: ${moduleKey as string}`);
  }

  const mod = getModule(moduleKey)!;
  const fixId = await upsertDetectedFix({
    userId: ownerId,
    brandId,
    batchId: null,
    moduleKey,
    channel: mod.channel,
    targetUrl: url,
    dedupeKey,
    severity,
    summary,
    detected,
    before,
  });
  return { fixId, moduleKey };
}
