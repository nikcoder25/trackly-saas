/**
 * Prompt mapping: group a brand's tracked prompts into topics, and bind
 * each one to the page on the brand's site that ought to win it.
 *
 * Both halves are produced by a single LLM call. That is deliberate - a
 * classifier that sees the page list while it picks topics produces topics
 * that line up with how the site is actually organised, and a page binder
 * that sees the topic groups stops assigning six sibling prompts to six
 * different pages. Splitting them into two calls made both worse and cost
 * twice as much.
 *
 * The page binding is the part that matters most downstream: it is the join
 * between AI visibility and the Fix Engine. Once a prompt knows which page
 * is responsible for it, "we are invisible for financing questions" turns
 * into "rewrite /financing", which is a thing the Fix Engine can actually
 * do and then re-measure.
 */

import { queryAI, getDefaultModel } from './ai-platforms';
import { resolveCrawlTargets } from './fix-engine/crawl';
import { resolveGeneratorKey } from './generator-key';
import { logger } from './logger';
import {
  sanitizePageUrl,
  sanitizeTopic,
  type PromptMetaInput,
} from './prompt-meta';

/** Pages offered to the classifier. Beyond this the prompt gets unwieldy. */
export const MAX_CANDIDATE_PAGES = 40;
/** Prompts classified per LLM call. Keeps the response inside token limits. */
export const CHUNK_SIZE = 40;

/**
 * Path segments that are almost never the page you want to rank for a
 * commercial prompt. Matching is on the lowercased pathname.
 */
const DEMOTED_PATTERNS = [
  /\/blog\//, /\/news\//, /\/tag\//, /\/tags\//, /\/category\//, /\/categories\//,
  /\/author\//, /\/archive/, /\/page\/\d+/, /\/\d{4}\/\d{2}\//,
  /privacy/, /terms/, /cookie/, /disclaimer/, /sitemap/, /\/cart/, /\/checkout/,
  /\/account/, /\/login/, /\/wp-/, /\/feed/, /\/search/,
];

/**
 * Paths that tend to be the money pages on a local service site. A small
 * nudge, not a hard rule - the LLM makes the final call.
 */
const PROMOTED_PATTERNS = [
  /service/, /repair/, /install/, /replace/, /maintenance/, /pricing/, /price/,
  /financing/, /finance/, /contact/, /about/, /areas?-we-serve/, /locations?/,
];

export interface CandidatePage {
  url: string;
  /** Path only, for display and for the classifier prompt. */
  path: string;
}

/**
 * Rank a site's URLs by how likely each is to be a page worth ranking, and
 * return the top `max`.
 *
 * The ranking is deliberately cheap: it reads the sitemap once (via the Fix
 * Engine's existing target resolver) and scores on URL shape alone. No
 * per-page fetch, so this stays fast enough to run inline during onboarding.
 * The scoring is a heuristic to pick which pages to *offer* the classifier -
 * it is not the final answer, so being approximately right is enough.
 */
export async function selectImportantPages(
  website: string | undefined,
  max = MAX_CANDIDATE_PAGES,
): Promise<CandidatePage[]> {
  if (!website) return [];
  let targets: string[] = [];
  try {
    targets = await resolveCrawlTargets(website, 200);
  } catch (e) {
    logger.warn('prompt_map.sitemap_failed', { errorMessage: (e as Error).message });
    return [];
  }
  if (!targets.length) return [];

  let homeOrigin = '';
  try { homeOrigin = new URL(targets[0]).origin; } catch { /* keep empty */ }

  const scored: Array<{ url: string; path: string; score: number; order: number }> = [];
  const seenPaths = new Set<string>();

  for (let i = 0; i < targets.length; i++) {
    const raw = targets[i];
    let parsed: URL;
    try { parsed = new URL(raw); } catch { continue; }
    parsed.hash = '';
    // A URL with a query string is nearly always a filtered view of a page
    // that also exists without one; keeping both just splits the binding.
    if (parsed.search) continue;

    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    const key = path.toLowerCase();
    if (seenPaths.has(key)) continue;
    seenPaths.add(key);

    const isHome = path === '/' && parsed.origin === homeOrigin;
    // Depth dominates: /services beats /services/hvac/auburn/emergency.
    const depth = isHome ? 0 : path.split('/').filter(Boolean).length;
    let score = 100 - depth * 18;
    if (isHome) score += 30;
    if (DEMOTED_PATTERNS.some(re => re.test(key))) score -= 70;
    if (PROMOTED_PATTERNS.some(re => re.test(key))) score += 22;
    // Sitemap order is a weak signal that most CMSes get roughly right.
    score -= Math.min(20, i * 0.1);

    scored.push({ url: parsed.toString(), path, score, order: i });
  }

  scored.sort((a, b) => (b.score - a.score) || (a.order - b.order));
  return scored.slice(0, max).map(({ url, path }) => ({ url, path }));
}

export interface ClassifyInput {
  tenantId: string;
  brandName: string;
  industry?: string;
  city?: string;
  queries: string[];
  pages: CandidatePage[];
}

export interface ClassifyOutcome {
  rows: PromptMetaInput[];
  /** Provider that produced the classification, for the UI to attribute. */
  platform: string | null;
  /** Prompts the model returned nothing usable for. */
  unclassified: number;
}

function buildPrompt(input: ClassifyInput, queries: string[]): string {
  const pageList = input.pages.length
    ? input.pages.map((p, i) => `${i + 1}. ${p.path}`).join('\n')
    : '(no pages available)';
  const queryList = queries.map((q, i) => `${i + 1}. ${q}`).join('\n');
  const where = input.city ? ` serving ${input.city}` : '';
  const what = input.industry ? ` in the ${input.industry} industry` : '';

  return `You are organising the tracked AI-search prompts for "${input.brandName}", a business${what}${where}.

TASK A - Group the prompts into topics.
Give every prompt a short topic label (2-4 words, Title Case) describing the
buying question behind it, not the wording. Prompts that a marketer would work
on together must get the BYTE-IDENTICAL label. Aim for ${Math.max(3, Math.min(8, Math.ceil(queries.length / 4)))} topics
across the whole list - too many topics is the common failure here. Examples of
good labels: "Emergency Repair", "Financing Options", "Heat Pump Installation".

TASK B - Bind each prompt to the page that should win it.
Choose from the site pages below, by number. Pick the single page a searcher
should land on if this prompt sent them to the site. Use null when no listed
page fits, or when the prompt is about the brand itself rather than a service
(e.g. "is ${input.brandName} reliable", "${input.brandName} reviews") - those
are brand-level and binding them to an arbitrary page is worse than leaving
them unbound.

SITE PAGES:
${pageList}

PROMPTS:
${queryList}

Return ONLY a JSON array, one object per prompt, in the same order as the
prompt list, with no commentary:
[{"i":1,"topic":"Financing Options","page":3},{"i":2,"topic":"Emergency Repair","page":null}]`;
}

/**
 * Parse the model's array into rows. Tolerant by design: a model that drops
 * an entry, returns them out of order, or emits an out-of-range page index
 * should degrade that one prompt to unclassified rather than fail the batch.
 */
function parseClassification(
  text: string,
  queries: string[],
  pages: CandidatePage[],
): PromptMetaInput[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(match[0]); } catch { return []; }
  if (!Array.isArray(parsed)) return [];

  const byIndex = new Map<number, { topic: string | null; pageUrl: string | null }>();
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { i?: unknown; topic?: unknown; page?: unknown };
    const idx = typeof row.i === 'number' ? Math.trunc(row.i) : NaN;
    if (!Number.isFinite(idx) || idx < 1 || idx > queries.length) continue;

    let pageUrl: string | null = null;
    if (typeof row.page === 'number' && Number.isFinite(row.page)) {
      const p = pages[Math.trunc(row.page) - 1];
      if (p) pageUrl = sanitizePageUrl(p.url);
    } else if (typeof row.page === 'string') {
      // Some models answer with the path instead of the index.
      const wanted = row.page.trim().toLowerCase().replace(/\/+$/, '') || '/';
      const hit = pages.find(p => p.path.toLowerCase() === wanted || p.url.toLowerCase() === wanted);
      if (hit) pageUrl = sanitizePageUrl(hit.url);
    }

    byIndex.set(idx, { topic: sanitizeTopic(row.topic), pageUrl });
  }

  const out: PromptMetaInput[] = [];
  for (let i = 0; i < queries.length; i++) {
    const hit = byIndex.get(i + 1);
    out.push({
      query: queries[i],
      topic: hit?.topic ?? null,
      pageUrl: hit?.pageUrl ?? null,
      source: 'auto',
    });
  }
  return out;
}

/**
 * Classify a brand's prompts into topics and bind them to pages.
 *
 * Never throws: a provider failure yields rows with null topic/page for the
 * affected chunk, so a partial classification still lands and the prompts
 * page shows real groups for everything that worked.
 */
export async function classifyPrompts(input: ClassifyInput): Promise<ClassifyOutcome> {
  const queries = input.queries.map(q => q.trim()).filter(Boolean);
  if (!queries.length) return { rows: [], platform: null, unclassified: 0 };

  const key = await resolveGeneratorKey(input.tenantId);
  if (!key) {
    logger.warn('prompt_map.no_generator_key', { tenantId: input.tenantId });
    return {
      rows: queries.map(q => ({ query: q, topic: null, pageUrl: null, source: 'auto' as const })),
      platform: null,
      unclassified: queries.length,
    };
  }

  const model = getDefaultModel(key.platform);
  const rows: PromptMetaInput[] = [];

  for (let start = 0; start < queries.length; start += CHUNK_SIZE) {
    const chunk = queries.slice(start, start + CHUNK_SIZE);
    try {
      const result = await queryAI(
        key.platform,
        buildPrompt(input, chunk),
        key.apiKey,
        model,
        undefined,
        { jsonMode: true, tenantId: input.tenantId, maxTokens: 4000 },
      );
      const parsed = parseClassification(result?.text || '', chunk, input.pages);
      if (parsed.length) {
        rows.push(...parsed);
        continue;
      }
      logger.warn('prompt_map.unparseable_response', {
        tenantId: input.tenantId,
        platform: key.platform,
        chunkSize: chunk.length,
      });
    } catch (e) {
      logger.error('prompt_map.classify_failed', {
        tenantId: input.tenantId,
        platform: key.platform,
        errorMessage: (e as Error).message,
      });
    }
    // Chunk failed - record the prompts unclassified so the caller still
    // gets a complete row set and a later retry can fill them in.
    rows.push(...chunk.map(q => ({ query: q, topic: null, pageUrl: null, source: 'auto' as const })));
  }

  return {
    rows,
    platform: key.platform,
    unclassified: rows.filter(r => !r.topic).length,
  };
}
