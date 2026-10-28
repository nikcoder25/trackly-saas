/**
 * Fix Engine - AI answer-capture evidence.
 *
 * When a page's impressions hold steady while its clicks fall, the click
 * is usually being absorbed by something rendered above the results. Every
 * other SEO tool can see that shape and has to stop there, because Search
 * Console reports the impression and says nothing about what sat on top of
 * it. Guessing "probably AI Overviews" is not a diagnosis.
 *
 * Livesov already runs the brand's prompts against the answer engines and
 * stores every URL each engine cited, so the question is answerable from
 * data the product collects anyway: for the topics this page covers, are
 * the engines citing THIS page, some other page of ours, or a competitor?
 *
 * Three findings, in descending order of how bad they are:
 *   - `competitor_cited`  the engines answer this topic and cite someone
 *                         else. The click went somewhere specific.
 *   - `brand_cited_elsewhere`  we are cited on the topic, but a different
 *                         page of ours is. Often an internal routing
 *                         problem rather than a content one.
 *   - `page_cited`        this page is cited. AI capture is unlikely to be
 *                         what is costing the clicks; look elsewhere.
 *
 * Everything is best-effort: no citation history means no evidence, which
 * the prompt is explicitly told to treat as a reason to lower confidence
 * rather than to assume the worst.
 */

import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';

/** How far back to read citation history. Matches a typical tracking cadence. */
export const CITATION_LOOKBACK_DAYS = 60;

/** Minimum word length for a query token to count as topical. */
const MIN_TOKEN_LENGTH = 4;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are',
  'what', 'when', 'where', 'which', 'how', 'why', 'near', 'best', 'top',
  'cost', 'costs', 'price', 'prices', 'does', 'can', 'should', 'will',
]);

export interface AiCaptureEvidence {
  finding: 'page_cited' | 'brand_cited_elsewhere' | 'competitor_cited' | 'no_data';
  /** Prompts whose citations overlapped this page's topic. */
  matchedPrompts: number;
  /** Competitor domains cited on those prompts, most frequent first. */
  competitorDomains: { domain: string; citations: number }[];
  /** Our own URLs cited on those prompts. */
  ourCitedUrls: string[];
  /** Prose summary handed to the diagnosis prompt. Null when no data. */
  summary: string | null;
}

/** Topical tokens from a set of queries, used to match prompts loosely. */
export function topicTokens(queries: string[]): string[] {
  const counts = new Map<string, number>();
  for (const q of queries) {
    for (const raw of q.toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length < MIN_TOKEN_LENGTH || STOPWORDS.has(raw)) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);
}

function hostOf(url: string): string | null {
  try { return new URL(url).host.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
}

/** Normalise for comparison: host + path, no protocol, no trailing slash. */
function pathKey(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.host.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch { return null; }
}

/**
 * Look for evidence that an answer engine is capturing the clicks for a
 * page's topic. Reads only `citations`, which the tracking runs populate.
 */
export async function getAiCaptureEvidence(args: {
  brandId: string;
  brandWebsite: string | undefined;
  pageUrl: string;
  queries: string[];
}): Promise<AiCaptureEvidence> {
  const empty: AiCaptureEvidence = {
    finding: 'no_data', matchedPrompts: 0, competitorDomains: [], ourCitedUrls: [], summary: null,
  };
  const tokens = topicTokens(args.queries);
  if (!tokens.length) return empty;

  const ourHost = hostOf(args.brandWebsite || args.pageUrl);
  const targetKey = pathKey(args.pageUrl);

  let rows: { prompt: string; url: string; domain: string | null }[];
  try {
    // Match a citation's prompt against any topical token from the page's
    // queries. Loose on purpose: a tracked prompt is phrased like a person
    // talks to an assistant, not like a Search Console query, so exact
    // matching would find nothing.
    const res = await pool.query(
      `SELECT prompt, url, domain
         FROM citations
        WHERE brand_id = $1
          AND created_at > NOW() - ($2 || ' days')::interval
          AND prompt ~* $3
        LIMIT 500`,
      [args.brandId, String(CITATION_LOOKBACK_DAYS), `(${tokens.map(escapeRegex).join('|')})`],
    );
    rows = res.rows;
  } catch (e) {
    logger.warn('fix_engine.ai_capture.query_failed', { brandId: args.brandId, err: (e as Error).message });
    return empty;
  }
  if (!rows.length) return empty;

  const prompts = new Set<string>();
  const competitorCounts = new Map<string, number>();
  const ourUrls = new Set<string>();
  let pageCited = false;

  for (const r of rows) {
    prompts.add(r.prompt);
    const host = r.domain?.replace(/^www\./, '').toLowerCase() || hostOf(r.url);
    if (!host) continue;
    if (ourHost && host === ourHost) {
      ourUrls.add(r.url);
      if (targetKey && pathKey(r.url) === targetKey) pageCited = true;
    } else {
      competitorCounts.set(host, (competitorCounts.get(host) ?? 0) + 1);
    }
  }

  const competitorDomains = [...competitorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, citations]) => ({ domain, citations }));

  const finding: AiCaptureEvidence['finding'] = pageCited
    ? 'page_cited'
    : ourUrls.size > 0
      ? 'brand_cited_elsewhere'
      : competitorDomains.length > 0
        ? 'competitor_cited'
        : 'no_data';

  if (finding === 'no_data') return { ...empty, matchedPrompts: prompts.size };

  const lines: string[] = [
    `Across ${prompts.size} tracked AI prompt(s) covering this page's topic in the last ${CITATION_LOOKBACK_DAYS} days:`,
  ];
  if (finding === 'page_cited') {
    lines.push(`- This exact page IS cited by the answer engines. AI capture is therefore an unlikely explanation for its click loss.`);
  } else if (finding === 'brand_cited_elsewhere') {
    lines.push(`- The brand is cited on this topic, but by other pages, not this one: ${[...ourUrls].slice(0, 3).join(', ')}.`);
  } else {
    lines.push(`- The brand is NOT cited on this topic at all.`);
  }
  if (competitorDomains.length) {
    lines.push(
      `- Competing domains cited on these prompts: `
      + competitorDomains.map((c) => `${c.domain} (${c.citations})`).join(', ') + '.',
    );
  }

  return {
    finding,
    matchedPrompts: prompts.size,
    competitorDomains,
    ourCitedUrls: [...ourUrls].slice(0, 5),
    summary: lines.join('\n'),
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
