/**
 * Fix Engine - zero-click intent screening.
 *
 * A page can sit at position 2 with a 3% CTR and be working exactly as
 * intended: the query is "what does SEER mean", Google answered it in the
 * SERP, and nobody needed to click. Flagging that page as a CTR failure
 * sends the customer off to rewrite a title that was never the problem,
 * and the rewrite cannot win back clicks that were never available.
 *
 * So before a CTR-shaped module flags a page, its primary query is screened
 * here. Two signals, in order:
 *
 *   1. SHAPE (always available, deterministic). Definitional, conversion,
 *      and calculation queries are the ones Google resolves in place.
 *   2. INTENT (DataForSEO, optional). A commercial or transactional label
 *      RESCUES a query the shape rule would have dropped - "what is the
 *      best hvac company in auburn" is definitional in shape and a buying
 *      question in fact, and dropping it would be exactly backwards.
 *
 * The asymmetry is deliberate. The shape rule can only ever exclude, and
 * intent data can only ever rescue, so a tenant with no DataForSEO
 * credentials gets a slightly more conservative screen rather than a
 * broken one. Nothing here is a hard dependency.
 */

import { getSearchIntent, isDataForSeoConfigured, type KeywordIntent } from '@/lib/dataforseo';
import { logger } from '@/lib/logger';

/**
 * Query shapes Google routinely answers without sending a click.
 *
 * Deliberately narrow. Every pattern here is one where the searcher wants
 * a single fact - a definition, a unit conversion, a date, a spelling -
 * not a page. Broader informational shapes ("how to", "why does", "best
 * way to") are NOT included: those pull real clicks and a weak title
 * genuinely costs them.
 *
 * Notably absent: "how much does X cost". Price queries look definitional
 * but for a service business they are the top of the buying funnel and
 * they convert, so they stay in scope.
 */
const ZERO_CLICK_SHAPES: RegExp[] = [
  // Definitions and meanings.
  /^what (?:is|are|was|were) (?:a |an |the )?[\w\s-]{1,40}\??$/i,
  /^what does .{1,40} mean\??$/i,
  /^(?:define|definition of|meaning of) /i,
  /\bstands for\b/i,
  // Unit conversion and arithmetic.
  /^how many .{1,30} (?:in|are in|per) .{1,30}\??$/i,
  /^\d[\d.,]*\s*\w+\s+(?:to|in)\s+\w+$/i,
  /\b(?:converter|conversion chart|calculator)\b/i,
  // Dates, times, and other one-line facts.
  /^(?:when|what time) (?:is|was|does) /i,
  /^who (?:is|was) /i,
  /^how (?:to spell|do you spell) /i,
  /\bsynonym\b/i,
];

/** True when the query's SHAPE suggests Google answers it without a click. */
export function hasZeroClickShape(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return ZERO_CLICK_SHAPES.some((re) => re.test(q));
}

/**
 * Intent labels that override the shape rule. A query someone asks on the
 * way to buying is worth a click no matter how it is phrased.
 */
function intentRescues(intent: KeywordIntent | undefined): boolean {
  if (!intent) return false;
  if (intent.label === 'commercial' || intent.label === 'transactional') return true;
  // The classifier is often unsure on local buying queries and puts the
  // buying read second - see isBuyingIntent() in dataforseo.ts, which makes
  // the same allowance for the same reason.
  return intent.secondary.some(
    (s) => (s.label === 'commercial' || s.label === 'transactional') && s.probability >= 0.2,
  );
}

/**
 * Decide, for a batch of primary queries, which ones are zero-click and
 * should not be treated as CTR failures.
 *
 * One DataForSEO call for the whole batch, or none at all when it isn't
 * configured. Returns the set of queries to EXCLUDE, lowercased.
 */
export async function screenZeroClickQueries(queries: string[]): Promise<Set<string>> {
  const excluded = new Set<string>();
  const suspects = [...new Set(
    queries.map((q) => q.trim().toLowerCase()).filter((q) => q && hasZeroClickShape(q)),
  )];
  if (!suspects.length) return excluded;

  // No intent data available: fall back to shape alone.
  if (!isDataForSeoConfigured()) {
    for (const q of suspects) excluded.add(q);
    return excluded;
  }

  let intents = new Map<string, KeywordIntent>();
  try {
    intents = await getSearchIntent(suspects);
  } catch (e) {
    // Intent is enrichment. A DataForSEO outage must not silently widen
    // what we flag, so on failure we keep the conservative shape verdict.
    logger.warn('fix_engine.intent.screen_failed', { err: (e as Error).message });
  }
  for (const q of suspects) {
    if (!intentRescues(intents.get(q))) excluded.add(q);
  }
  return excluded;
}
