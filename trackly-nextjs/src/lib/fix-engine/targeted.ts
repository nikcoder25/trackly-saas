/**
 * Targeted (user-initiated) fix creation.
 *
 * Shared by the "Ask for a fix" assistant and the legacy targeted route. Given
 * a module + its inputs (page URL / keyword / passage / competitor / false AI
 * claim / free-text instruction), build the `detected` payload that module's
 * generate() expects and create the fix in 'detected' state. The normal
 * generate → approve → ship flow then applies.
 *
 * Every supported module builds its evidence from at most a single page crawl
 * (+ a sitemap fetch for internal links, or a robots.txt fetch), so one
 * on-demand request stays cheap. There is no cap on how many targeted fixes a
 * user creates. Modules that need GSC query data (striking-distance,
 * ctr-rescue, indexing-repair, canonical-fix) can't be conjured from a chat
 * request — those run from scans; the classifier steers related asks to the
 * closest on-demand capability instead.
 */

import crypto from 'crypto';
import { upsertDetectedFix } from './schema';
import { getModule } from './registry';
import { safeFetch } from '@/lib/safe-fetch';
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
  | 'faq-schema'
  | 'schema-markup'
  | 'citable-passages'
  | 'external-citations'
  | 'content-freshness'
  | 'image-alt'
  | 'og-cards'
  | 'noindex-removal'
  | 'llms-txt'
  | 'robots-ai-access'
  | 'comparison-pages'
  | 'hallucination-correction';

export interface TargetedModuleInfo {
  key: TargetedModuleKey;
  /** Plain-language capability, shown to the classifier LLM. */
  purpose: string;
  /** Does the request need a specific keyword? */
  needsKeyword?: boolean;
  /** Does the request need the user to paste the exact passage? */
  needsPassage?: boolean;
  /** Does the request need a competitor name? */
  needsCompetitor?: boolean;
  /** Does the request need the false AI claim + the correct fact? */
  needsClaim?: boolean;
  /** Site-level: works from the site itself, no page URL required. */
  siteLevel?: boolean;
}

export const TARGETED_MODULES: TargetedModuleInfo[] = [
  { key: 'passage-rewrite', purpose: 'Rewrite a specific paragraph the user pasted so it is clearer and more likely to be cited by AI answers.', needsPassage: true },
  { key: 'internal-linking', purpose: 'Add contextual internal links (and anchor text) on a page, or improve interlinking / anchors between pages.' },
  { key: 'keyword-opportunities', purpose: 'Make a page target/rank for a specific keyword — produces a targeting plan and a ready-to-publish section. Also the closest fit for "rank higher for X" / striking-distance asks.', needsKeyword: true },
  { key: 'title-rewrite', purpose: 'Rewrite/fix the page title tag (too long, weak, missing keyword, not compelling, low CTR).' },
  { key: 'meta-rewrite', purpose: 'Write/fix the meta description for a page.' },
  { key: 'geo-page-rewrite', purpose: 'Optimise the page content for AI answers / GEO (structure, direct answers, citable facts) when the ask is general "improve this page for AI/SEO".' },
  { key: 'faq-schema', purpose: 'Add an FAQ section + FAQ schema to a page.' },
  { key: 'schema-markup', purpose: 'Add schema.org structured data / JSON-LD to a page (Organization, LocalBusiness, Product, Service, BlogPosting/Article…).' },
  { key: 'citable-passages', purpose: 'Add a TL;DR + key-facts block of short citable passages to a content page so AI answers can quote it.' },
  { key: 'external-citations', purpose: 'Add a Sources section citing authoritative external references (verified links) for the page’s claims.' },
  { key: 'content-freshness', purpose: 'Refresh a stale/outdated page with a dated update block — AI engines prefer recently-updated content.' },
  { key: 'image-alt', purpose: 'Write alt text for images on a page that are missing it (accessibility + image SEO).' },
  { key: 'og-cards', purpose: 'Add or fix Open Graph & Twitter card social-share meta so shared links render with a title, description, and card.', siteLevel: true },
  { key: 'noindex-removal', purpose: 'Remove an accidental noindex robots directive from a page that should be indexable and rank.' },
  { key: 'llms-txt', purpose: 'Create and serve an llms.txt file at the site root so AI assistants understand the site.', siteLevel: true },
  { key: 'robots-ai-access', purpose: 'Update robots.txt to explicitly allow AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…).', siteLevel: true },
  { key: 'comparison-pages', purpose: 'Create a "Brand vs Competitor" / alternatives comparison page — the format LLMs cite most.', needsCompetitor: true, siteLevel: true },
  { key: 'hallucination-correction', purpose: 'AI assistants say something false about the brand — publish a correction passage establishing the correct fact.', needsClaim: true, siteLevel: true },
];

const TARGETED_KEYS = new Set(TARGETED_MODULES.map((m) => m.key));
export const isTargetedModule = (k: string): k is TargetedModuleKey => TARGETED_KEYS.has(k as TargetedModuleKey);
export const targetedModuleInfo = (k: TargetedModuleKey): TargetedModuleInfo =>
  TARGETED_MODULES.find((m) => m.key === k)!;

// Modules whose generate() reads crawled page content out of `detected`.
const NEEDS_PAGE = new Set<TargetedModuleKey>([
  'internal-linking', 'title-rewrite', 'meta-rewrite', 'geo-page-rewrite', 'faq-schema',
  'schema-markup', 'citable-passages', 'external-citations', 'content-freshness',
  'image-alt', 'og-cards', 'noindex-removal',
]);

const sha16 = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** Site origin from the page URL (preferred) or the brand website. */
function originOf(url: string, website?: string): string | null {
  for (const cand of [url, website]) {
    if (!cand) continue;
    try { return new URL(cand.startsWith('http') ? cand : `https://${cand}`).origin; } catch { /* next */ }
  }
  return null;
}

/**
 * Best schema.org type for a targeted schema-markup ask: an explicitly named
 * type in the user's words wins; otherwise the same path heuristic the scan
 * uses; otherwise WebPage (always valid).
 */
function inferSchemaType(url: string, instruction: string): string {
  const text = instruction.toLowerCase();
  if (/local\s*business/.test(text)) return 'LocalBusiness';
  if (/organi[sz]ation/.test(text)) return 'Organization';
  if (/blog\s*posting|article|blog\s*post/.test(text)) return 'BlogPosting';
  if (/product/.test(text)) return 'Product';
  if (/service/.test(text)) return 'Service';
  let p = '/';
  try { p = new URL(url).pathname.replace(/\/+$/, '').toLowerCase() || '/'; } catch { /* keep '/' */ }
  if (p === '/') return 'Organization';
  if (/(^|\/)(blog|article|news|post|guide|learn)(\/|$)/.test(p)) return 'BlogPosting';
  if (/(^|\/)(product|products|shop|store|item)(\/|$)/.test(p)) return 'Product';
  if (/(^|\/)(service|services|solutions)(\/|$)/.test(p)) return 'Service';
  return 'WebPage';
}

export interface CreateTargetedArgs {
  brandId: string;
  ownerId: string;
  website?: string;
  moduleKey: TargetedModuleKey;
  url: string;
  keyword?: string;
  passage?: string;
  instruction?: string;
  /** Competitor name — comparison-pages. */
  competitor?: string;
  /** The false statement an AI assistant makes — hallucination-correction. */
  falseClaim?: string;
  /** The correct fact that should replace it — hallucination-correction. */
  correctFact?: string;
  /** Short topic label for the disputed fact (e.g. "pricing"). */
  factTopic?: string;
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
  const info = targetedModuleInfo(moduleKey);
  let url = (args.url || '').trim();
  const instruction = (args.instruction || '').trim();
  const keyword = (args.keyword || '').trim();
  const passage = (args.passage || '').trim();
  const competitor = (args.competitor || '').trim();
  const falseClaim = (args.falseClaim || '').trim();
  const correctFact = (args.correctFact || '').trim();

  if (!getModule(moduleKey)) throw new Error(`Unknown fix type: ${moduleKey}`);
  if (!url && !info.siteLevel) throw new Error('Which page is this about? Add the page URL.');
  if (moduleKey === 'passage-rewrite' && passage.length < 12) {
    throw new Error('Paste the exact paragraph you want rewritten (at least a sentence).');
  }
  if (moduleKey === 'keyword-opportunities' && keyword.length < 2) {
    throw new Error('Which keyword should the page target?');
  }
  if (moduleKey === 'comparison-pages' && competitor.length < 2) {
    throw new Error('Which competitor should the comparison page cover?');
  }
  if (moduleKey === 'hallucination-correction' && (!falseClaim || !correctFact)) {
    throw new Error('Tell me what the AI is claiming and what the correct fact is — e.g. “ChatGPT says we have no free plan, but we do.”');
  }

  // Site-level modules work from the site origin even without a page URL.
  const origin = originOf(url, args.website);
  if (info.siteLevel && !origin) throw new Error('What’s your site URL? Add it and I’ll take it from there.');
  // og-cards applies a site-wide head block, so it targets the homepage
  // unless the user pointed at a specific page.
  if (moduleKey === 'og-cards' && !url) url = `${origin}/`;

  // Crawl the page once for the modules that read its content.
  let page: CrawledPage | null = null;
  if (NEEDS_PAGE.has(moduleKey)) {
    try { page = await crawlPage(url); } catch { page = null; }
  }

  let severity: FixSeverity = 'low';
  let summary: string;
  let dedupeKey: string;
  let targetUrl: string | null = url || null;
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

    case 'schema-markup': {
      const schemaType = inferSchemaType(url, instruction);
      dedupeKey = `${url}#${schemaType}`;
      summary = `Add ${schemaType} schema to ${url}`;
      detected = { url, schemaType, title: page?.title ?? null, pageText: page?.text ?? '', instruction };
      before = { hasType: false };
      break;
    }

    case 'citable-passages':
      if (!page || !page.text.trim()) throw new Error('Couldn’t read that page’s content — check the URL and try again.');
      dedupeKey = url;
      summary = `Add citable key-facts block to ${url}`;
      detected = { url, title: page.title, pageText: page.text, instruction };
      break;

    case 'external-citations':
      if (!page || !page.text.trim()) throw new Error('Couldn’t read that page’s content — check the URL and try again.');
      dedupeKey = url;
      summary = `Add authoritative external citations to ${url}`;
      detected = { url, title: page.title, pageText: page.text, instruction };
      break;

    case 'content-freshness': {
      if (!page || !page.text.trim()) throw new Error('Couldn’t read that page’s content — check the URL and try again.');
      severity = 'medium';
      const lastModified = page.lastModified ?? 'unknown';
      const daysOld = page.lastModified ? Math.floor((Date.now() - Date.parse(page.lastModified)) / 86_400_000) : undefined;
      dedupeKey = url;
      summary = page.lastModified ? `Refresh ${url} (last updated ${lastModified.slice(0, 10)})` : `Refresh ${url} with a dated update`;
      detected = { url, lastModified, daysOld, title: page.title, pageSummary: page.text.slice(0, 2500), instruction };
      before = { lastModified: page.lastModified };
      break;
    }

    case 'image-alt': {
      const images = (page?.imagesMissingAlt ?? []).slice(0, 10);
      if (images.length === 0) throw new Error(page ? 'Good news — every image on that page already has alt text. Want me to check a different page?' : 'Couldn’t load that page to check its images — is the URL right?');
      severity = images.length >= 5 ? 'medium' : 'low';
      dedupeKey = url;
      summary = `${images.length} image${images.length === 1 ? '' : 's'} missing alt text`;
      detected = { url, images, title: page!.title, pageSummary: page!.text.slice(0, 1500), instruction };
      before = { missingAlt: images.length };
      break;
    }

    case 'og-cards':
      if (!page || !page.text.trim()) throw new Error('Couldn’t read that page’s content — check the URL and try again.');
      dedupeKey = url;
      summary = page.hasOgTags ? `Improve Open Graph / Twitter card meta for ${url}` : `Add Open Graph / Twitter card meta for ${url}`;
      detected = { url, title: page.title, pageText: page.text, instruction };
      before = { hasOgTags: page.hasOgTags };
      break;

    case 'noindex-removal': {
      if (!page) throw new Error('Couldn’t load that page to check its robots directives — is the URL right?');
      const blocked = (page.metaRobots?.includes('noindex') ?? false) || (page.xRobotsTag?.includes('noindex') ?? false);
      if (!blocked) throw new Error('That page isn’t blocked — no noindex directive found on it. Anything else you’d like to fix?');
      severity = 'critical';
      dedupeKey = url;
      summary = `Page is set to noindex (${page.metaRobots || page.xRobotsTag})`;
      detected = { url, metaRobots: page.metaRobots, xRobotsTag: page.xRobotsTag };
      before = { metaRobots: page.metaRobots, xRobotsTag: page.xRobotsTag };
      break;
    }

    case 'llms-txt':
      severity = 'medium';
      dedupeKey = origin!;
      targetUrl = `${origin}/llms.txt`;
      summary = `Generate llms.txt for ${origin}`;
      detected = { origin, instruction };
      before = { exists: false };
      break;

    case 'robots-ai-access': {
      severity = 'medium';
      let status = 0; let robotsText = '';
      try {
        const res = await safeFetch(`${origin}/robots.txt`, { timeoutMs: 8000, maxBytes: 512 * 1024 });
        status = res.status;
        if (res.ok) robotsText = await res.text();
      } catch { /* unreachable robots.txt = same as missing */ }
      dedupeKey = origin!;
      targetUrl = `${origin}/robots.txt`;
      summary = status === 200 ? 'Explicitly allow AI crawlers in robots.txt' : 'Create robots.txt with AI-crawler access';
      detected = { origin, currentStatus: status };
      before = { robots: robotsText.slice(0, 2000) };
      break;
    }

    case 'comparison-pages':
      severity = 'medium';
      dedupeKey = `vs:${slugify(competitor)}`;
      targetUrl = null;
      summary = `Create a “vs ${competitor}” comparison page`;
      detected = { competitor, instruction };
      break;

    case 'hallucination-correction': {
      severity = 'high';
      const factKey = slugify((args.factTopic || '').trim() || falseClaim).slice(0, 40) || sha16(falseClaim);
      dedupeKey = `fact:${factKey}`;
      targetUrl = origin ? `${origin}/` : null;
      summary = `AI claims “${falseClaim.slice(0, 80)}” — correct is “${correctFact.slice(0, 80)}”`;
      detected = { factKey, expected: correctFact, found: falseClaim, explanation: instruction || null };
      break;
    }

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
    targetUrl,
    dedupeKey,
    severity,
    summary,
    detected,
    before,
  });
  return { fixId, moduleKey };
}
