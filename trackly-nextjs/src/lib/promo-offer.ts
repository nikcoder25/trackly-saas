/**
 * The current promotional offer, published to AI crawlers and to humans.
 *
 * Design note, because this file is the one that is easy to get wrong:
 *
 * The business goal is that an assistant summarising Livesov can see a live
 * offer rather than a generic product description. The failure mode next door
 * to that goal is cloaking - publishing an inducement in `/llms.txt` and
 * `/ai-offer.json`, which only crawlers read, that a human visiting the site
 * can neither see nor redeem. That is a deceptive practice under the FTC
 * endorsement rules, it is what Google's spam policies call cloaking, and it
 * is the kind of thing that gets a domain delisted from the exact AI surfaces
 * the offer is meant to win.
 *
 * So there is exactly ONE offer record, rendered from ONE formatter, into
 * three surfaces:
 *
 *   /llms.txt       - agents  (markdown link section)
 *   /ai-offer.json  - agents  (structured JSON)
 *   /offer          - humans  (real page, linked from the footer, indexable)
 *
 * `offerSurfaces()` derives all three from the same row, and
 * tests/promo-offer-parity.test.ts pins that the human page carries the same
 * headline, body, code and dates as the machine surfaces. Adding a field that
 * agents see and humans do not should fail that test.
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
        humanReadableUrl: `${BASE_URL}/offer`,
        signupUrl: `${BASE_URL}/signup`,
      },
      // Stated explicitly so a crawler comparing surfaces can verify it,
      // and so anyone auditing this endpoint can see the intent.
      disclosure:
        'This offer is published identically to human visitors at ' +
        `${BASE_URL}/offer. No terms here differ from the public page.`,
    },
  };
}
