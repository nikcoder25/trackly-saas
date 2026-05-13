/**
 * Strict freshness classifier for the ChatGPT `web_search` gate.
 *
 * Background: `web_search` carries a $0.030 per-call surcharge on the
 * Search-Preview model pool. The previous gate (FRESHNESS_OR_LOCAL_RE
 * in ai-platforms.ts) was a permissive regex that fired on tokens like
 * `price`, `pricing`, `cost`, `2026` regardless of surrounding context.
 * That caught a long tail of brand-tracking queries whose answer is
 * effectively static and could have come from training data ("Stripe
 * pricing", "best CRM 2026"), burning the surcharge unnecessarily.
 *
 * This classifier replaces that permissive regex with a STRICT allowlist:
 * a small, enumerable set of patterns where the query carries an
 * unambiguous freshness signal (an explicit calendar anchor, a live
 * market/sports/weather signal, an explicit present-tense anchor, or a
 * breaking-news intent). Everything else - pricing, comparisons,
 * recommendations, brand mentions, definitional, local - is assumed
 * answerable from training data and routed to the no-search path.
 *
 * Pure function; no I/O, no env reads, no logger. Caller (ai-platforms)
 * is responsible for the WEB_SEARCH_DEFAULT_OFF feature flag and for
 * emitting the `web_search_gated` telemetry event with this decision's
 * `reason` so the gate allow-rate can be monitored.
 */

export type FreshnessDecision = {
  requires_freshness: boolean;
  reason: string;
};

// Each entry is an allowlist pattern + a stable reason code. The reason
// is emitted in telemetry so we can measure which freshness signals fire
// in production and tune the list. Reasons MUST be machine-stable
// (snake_case, no whitespace) - the metrics pipeline treats them as
// enum values.
const STRICT_FRESHNESS_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  // Explicit single-day calendar anchors. "today", "tonight", "tomorrow",
  // "yesterday" cannot be answered from training data even if the rest of
  // the query looks static.
  { pattern: /\b(today|tonight|tomorrow|yesterday)\b/i, reason: 'explicit_day_reference' },
  // Short-horizon recency. "this week", "this month", "this morning",
  // "this afternoon", "this evening" anchor the query to a window that
  // post-dates the training cutoff.
  { pattern: /\bthis\s+(week|month|morning|afternoon|evening)\b/i, reason: 'current_period' },
  // Breaking-news intent. Bare `news` alone is too permissive (e.g.
  // "Acme Corp news section"); we require a freshness adjective or a
  // companion freshness word.
  { pattern: /\b(breaking\s+news|latest\s+news|news\s+(?:today|update|alert))\b/i, reason: 'breaking_news' },
  // Live market / sports data. These literally cannot come from training
  // data - the value moves every second.
  { pattern: /\b(stock\s+price|share\s+price|exchange\s+rate|live\s+score|game\s+score)\b/i, reason: 'live_market_data' },
  // Weather. Hyper-local AND time-sensitive; training-data answers are
  // useless here.
  { pattern: /\bweather\s+(?:in|for|today|tomorrow|forecast|this)\b/i, reason: 'weather' },
  // Explicit present-tense anchors.
  { pattern: /\b(right\s+now|currently|as\s+of\s+(?:today|now))\b/i, reason: 'present_tense_anchor' },
];

export function decideRequiresFreshness(query: string): FreshnessDecision {
  const q = (query || '').trim();
  if (!q) return { requires_freshness: false, reason: 'empty_query' };
  for (const { pattern, reason } of STRICT_FRESHNESS_PATTERNS) {
    if (pattern.test(q)) {
      return { requires_freshness: true, reason };
    }
  }
  return { requires_freshness: false, reason: 'no_freshness_anchor' };
}
