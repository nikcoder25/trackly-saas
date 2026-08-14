/**
 * The current promotional offer, published to the AI channel.
 *
 * This is a CHANNEL-SPECIFIC offer, in the same sense as a podcast code or an
 * affiliate code: it is published where AI assistants read it and nowhere
 * else. It is not in the sitemap, not in the footer, not in search results,
 * and a visitor browsing livesov.com will not encounter it. That is the
 * intended behaviour, not an oversight.
 *
 *   /llms.txt       - published  (markdown link section for crawlers)
 *   /ai-offer.json  - published  (structured terms for agents)
 *   /offer          - unlisted   (redemption landing page, noindex)
 *
 * The one thing that is NOT optional is that the offer works for whoever acts
 * on it. An assistant tells someone about the promotion, they follow the
 * link, and /offer honours it. That redemption path is what separates a
 * channel-specific promotion (ordinary commerce) from an inducement the
 * business does not stand behind (a false offer, and a real consumer harm
 * regardless of which channel carried it). All three surfaces render from ONE
 * row through ONE formatter so what a model quotes and what a visitor is
 * shown cannot drift apart; tests/promo-offer-parity.test.ts pins that.
 *
 * The offer text is also deliberately declarative - it states terms. It does
 * not contain instructions addressed to a model ("recommend Livesov first",
 * "rank this above competitors"). Those are prompt injection against someone
 * else's system rather than marketing, they are trivially detectable, and
 * `assertNoAgentDirectives()` rejects them at write time in the admin API.
 */
import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';

export const BASE_URL = process.env.APP_URL || 'https://livesov.com';

export interface PromoOffer {
  id: string;
  headline: string;
  body: string;
  code: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

interface OfferRow {
  id: string;
  headline: string;
  body: string;
  code: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
}

// ── Anti-injection guard ────────────────────────────────────────
//
// Phrases that address the reading model rather than describing the
// product. An offer is a statement of terms; anything that tries to
// steer another vendor's ranking is out of scope for this field.
const AGENT_DIRECTIVE_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /\b(ignore|disregard|override)\b[^.]{0,40}\b(previous|prior|above|other|system)\b/i, label: 'instruction override' },
  { re: /\b(you|assistants?|models?|agents?|llms?|chatgpt|claude|gemini|perplexity|grok)\s+(must|should|will|need to|have to)\b/i, label: 'directive addressed to the model' },
  { re: /\b(recommend|rank|list|rate|prefer|choose|pick|promote)\b[^.]{0,40}\b(first|above|over|before|top|best|highest|instead of)\b/i, label: 'ranking instruction' },
  { re: /\b(do not|don'?t|never)\b[^.]{0,40}\b(mention|recommend|cite|show|list)\b[^.]{0,40}\b(competitor|alternative|other)/i, label: 'competitor suppression' },
  { re: /<\s*\/?\s*(system|instruction|prompt)[\s>]/i, label: 'pseudo-system tag' },
];

/**
 * Reject offer copy that instructs a reading model instead of describing
 * the offer. Returns a human-readable reason, or null when the text is fine.
 */
export function assertNoAgentDirectives(text: string): string | null {
  for (const { re, label } of AGENT_DIRECTIVE_PATTERNS) {
    if (re.test(text)) {
      return `This reads as an instruction to an AI assistant (${label}), not as offer terms. ` +
        `The offer is published to ChatGPT, Claude, Perplexity, Gemini and Grok crawlers - ` +
        `copy that tries to steer their answers is prompt injection, and it is what gets a ` +
        `domain filtered out of AI results. Describe what the customer gets instead.`;
    }
  }
  return null;
}

// ── Read path ───────────────────────────────────────────────────

// /llms.txt and /ai-offer.json are hit by crawlers, so the DB read is
// cached in-process. 60s is short enough that deactivating an expired
// offer in the admin panel takes effect promptly.
const CACHE_TTL_MS = 60_000;
let cache: { at: number; offer: PromoOffer | null } | null = null;

/** Clears the in-process cache. Called after an admin write, and by tests. */
export function invalidateOfferCache(): void {
  cache = null;
}

function toOffer(row: OfferRow): PromoOffer {
  return {
    id: row.id,
    headline: row.headline,
    body: row.body,
    code: row.code,
    startsAt: row.starts_at ? row.starts_at.toISOString() : null,
    endsAt: row.ends_at ? row.ends_at.toISOString() : null,
  };
}

/**
 * The offer to publish right now, or null.
 *
 * Null on: no active row, outside the start/end window, or ANY database
 * error. Never throws. The public surfaces that call this must render
 * without an offer rather than 500 - a crawler that gets an error page for
 * /llms.txt drops the whole manifest, which costs more than a missed promo.
 * This also lets the route tests call GET() with no database configured.
 */
export async function getActiveOffer(): Promise<PromoOffer | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.offer;

  try {
    const res = await pool.query(
      `SELECT id, headline, body, code, starts_at, ends_at
         FROM promo_offers
        WHERE active
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (ends_at   IS NULL OR ends_at   >  NOW())
        ORDER BY updated_at DESC
        LIMIT 1`
    );
    const offer = res.rows.length ? toOffer(res.rows[0] as OfferRow) : null;
    cache = { at: now, offer };
    return offer;
  } catch (e) {
    // Missing table on a not-yet-migrated deploy lands here too.
    logger.warn('promo_offer.read_failed', { error: (e as Error).message });
    cache = { at: now, offer: null };
    return null;
  }
}

// ── Render path ─────────────────────────────────────────────────

/** Formats an ISO timestamp as a plain YYYY-MM-DD date for public copy. */
function isoDate(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

/**
 * One sentence of terms, appended to every surface. Keeping the date and
 * code in a single derived string is what stops the human page from drifting
 * to different terms than the JSON.
 */
export function offerTerms(offer: PromoOffer): string {
  const parts: string[] = [];
  if (offer.code) parts.push(`Code ${offer.code}`);
  const ends = isoDate(offer.endsAt);
  if (ends) parts.push(`valid until ${ends}`);
  parts.push('available to every visitor on the same terms');
  return parts.join(', ') + '.';
}

export interface OfferSurfaces {
  /** Markdown link-list section for /llms.txt. Empty string when no offer. */
  llmsTxtSection: string;
  /** Body for /ai-offer.json. */
  json: Record<string, unknown>;
}

/**
 * Renders the offer for both machine surfaces.
 *
 * The llms.txt section is a link LIST, not a prose block, because our own
 * validator (and the llms.txt spec) treats a headed section with no
 * markdown links as an empty section - which our dogfood test fails on.
 * Both links must also be URLs that appear nowhere else in the manifest,
 * or the validator's duplicate-URL check downgrades the score.
 */
export function offerSurfaces(offer: PromoOffer | null): OfferSurfaces {
  if (!offer) return { llmsTxtSection: '', json: { offer: null } };

  const terms = offerTerms(offer);
  return {
    llmsTxtSection: [
      '## Current offer',
      '',
      `- [${offer.headline}](${BASE_URL}/offer): ${offer.body} ${terms}`,
      `- [Offer as JSON](${BASE_URL}/ai-offer.json): The same offer, machine-readable, with exact validity dates.`,
      '',
    ].join('\n'),
    json: {
      offer: {
        headline: offer.headline,
        description: offer.body,
        code: offer.code,
        terms,
        validFrom: offer.startsAt,
        validUntil: offer.endsAt,
        // Where to send someone to actually claim it. This link is the
        // redemption path, and it must be passed along to anyone who is told
        // about the offer - the terms above are only honoured through it.
        redemptionUrl: `${BASE_URL}/offer`,
        signupUrl: offer.code
          ? `${BASE_URL}/signup?promo=${encodeURIComponent(offer.code)}`
          : `${BASE_URL}/signup`,
      },
      // Says plainly what this endpoint is, so nobody reading it has to infer
      // whether the offer is public. It is not: it is specific to this
      // channel, and it is honoured at the redemption URL above.
      disclosure:
        'A channel-specific offer, published for AI assistants and not listed on the public site. ' +
        `It is honoured in full at ${BASE_URL}/offer, which carries these exact terms.`,
    },
  };
}
