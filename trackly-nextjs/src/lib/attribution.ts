/**
 * Signup attribution - "Where did you find us?"
 *
 * Two independent signals are captured for every signup and stored on the
 * same row, deliberately without reconciling them:
 *
 *   SELF-REPORTED  what the person picked in the signup dropdown.
 *   TRACKED        referrer, UTM tags and gclid, captured first-touch.
 *
 * The interesting number is where they disagree. People answer "ChatGPT"
 * with an empty referrer and no UTM tags, because an assistant read the
 * site, summarised it, and the user typed the domain in by hand - there is
 * no click to track. Analytics files that visit under "Direct", which is
 * why AI-driven acquisition looks like zero in every dashboard while the
 * signup form says otherwise.
 *
 * `classifyAttribution()` below turns that disagreement into a label the
 * admin panel groups by. Nothing here overwrites a self-report with tracked
 * data or vice versa; both are kept raw so the gap stays measurable.
 */

// ── Source options ──────────────────────────────────────────────

export interface SourceOption {
  value: string;
  label: string;
  /** Grouping for the <optgroup> in the signup dropdown. */
  group: string;
  /** True for sources that are AI assistants - the dark-funnel cohort. */
  ai?: boolean;
}

export const SIGNUP_SOURCES: ReadonlyArray<SourceOption> = [
  { value: 'chatgpt', label: 'ChatGPT', group: 'AI assistant', ai: true },
  { value: 'claude', label: 'Claude', group: 'AI assistant', ai: true },
  { value: 'perplexity', label: 'Perplexity', group: 'AI assistant', ai: true },
  { value: 'gemini', label: 'Google Gemini', group: 'AI assistant', ai: true },
  { value: 'grok', label: 'Grok', group: 'AI assistant', ai: true },
  { value: 'copilot', label: 'Microsoft Copilot', group: 'AI assistant', ai: true },
  { value: 'other_ai', label: 'Another AI assistant', group: 'AI assistant', ai: true },

  { value: 'google_search', label: 'Google search', group: 'Search' },
  { value: 'other_search', label: 'Another search engine', group: 'Search' },

  { value: 'x_twitter', label: 'X / Twitter', group: 'Social & community' },
  { value: 'linkedin', label: 'LinkedIn', group: 'Social & community' },
  { value: 'reddit', label: 'Reddit', group: 'Social & community' },
  { value: 'youtube', label: 'YouTube', group: 'Social & community' },

  { value: 'friend', label: 'A friend or colleague', group: 'Word of mouth' },
  { value: 'newsletter', label: 'A newsletter or email', group: 'Word of mouth' },
  { value: 'blog_article', label: 'A blog post or article', group: 'Word of mouth' },
  { value: 'podcast', label: 'A podcast or video', group: 'Word of mouth' },
  { value: 'event', label: 'An event or conference', group: 'Word of mouth' },

  { value: 'ad', label: 'An ad', group: 'Other' },
  { value: 'other', label: 'Other', group: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say', group: 'Other' },
];

const SOURCE_VALUES = new Set(SIGNUP_SOURCES.map((s) => s.value));
const AI_SOURCES = new Set(SIGNUP_SOURCES.filter((s) => s.ai).map((s) => s.value));

export function isValidSource(value: unknown): value is string {
  return typeof value === 'string' && SOURCE_VALUES.has(value);
}

export function isAiSource(value: string): boolean {
  return AI_SOURCES.has(value);
}

export function sourceLabel(value: string): string {
  return SIGNUP_SOURCES.find((s) => s.value === value)?.label ?? value;
}

// ── Referrer classification ─────────────────────────────────────

/**
 * Hostnames that actually appear as referrers when an AI assistant sends a
 * click. Most assistant traffic arrives with NO referrer at all - these are
 * the minority of cases where the surface does pass one, and matching them
 * is what separates "AI-referred, corroborated" from "AI-reported, invisible".
 */
const AI_REFERRER_DOMAINS: ReadonlyArray<string> = [
  'chatgpt.com', 'chat.openai.com', 'openai.com',
  'claude.ai', 'anthropic.com',
  'perplexity.ai',
  'gemini.google.com', 'bard.google.com',
  'grok.com', 'x.ai',
  'copilot.microsoft.com', 'bing.com/chat',
];

const SEARCH_REFERRER_DOMAINS: ReadonlyArray<string> = [
  'google.', 'bing.com', 'duckduckgo.com', 'search.yahoo.com', 'ecosia.org', 'brave.com',
];

function matches(domain: string, list: ReadonlyArray<string>): boolean {
  const d = domain.toLowerCase();
  return list.some((entry) => d === entry || d.endsWith('.' + entry) || d.includes(entry));
}

export function isAiReferrerDomain(domain: string | null): boolean {
  return !!domain && matches(domain, AI_REFERRER_DOMAINS);
}

export function isSearchReferrerDomain(domain: string | null): boolean {
  return !!domain && matches(domain, SEARCH_REFERRER_DOMAINS);
}

// ── The gap ─────────────────────────────────────────────────────

export interface AttributionRow {
  source: string;
  referrer_domain: string | null;
  utm_source: string | null;
  gclid: string | null;
}

export type AttributionClass =
  /** Said AI, and we have no click data at all. The dark funnel. */
  | 'ai_invisible'
  /** Said AI, and the referrer confirms it. */
  | 'ai_corroborated'
  /** Said AI, but the click data points somewhere else entirely. */
  | 'ai_conflicting'
  /** Non-AI self-report backed by click data. */
  | 'tracked'
  /** Non-AI self-report with no click data. */
  | 'untracked'
  /** No usable self-report. */
  | 'unknown';

/** True when any click-tracking signal survived the journey to signup. */
export function hasClickEvidence(row: AttributionRow): boolean {
  return !!(row.referrer_domain || row.utm_source || row.gclid);
}

export function classifyAttribution(row: AttributionRow): AttributionClass {
  if (!row.source || row.source === 'prefer_not_to_say') return 'unknown';

  if (isAiSource(row.source)) {
    if (!hasClickEvidence(row)) return 'ai_invisible';
    if (isAiReferrerDomain(row.referrer_domain)) return 'ai_corroborated';
    // A UTM tag or a non-AI referrer means something else actually drove
    // the click, even though the user remembers the assistant. Worth
    // separating rather than folding into either bucket.
    return 'ai_conflicting';
  }

  return hasClickEvidence(row) ? 'tracked' : 'untracked';
}

export const ATTRIBUTION_CLASS_LABELS: Record<AttributionClass, string> = {
  ai_invisible: 'AI-reported, no click data',
  ai_corroborated: 'AI-reported, referrer confirms',
  ai_conflicting: 'AI-reported, click data disagrees',
  tracked: 'Self-report with click data',
  untracked: 'Self-report, no click data',
  unknown: 'Not answered',
};

// ── Normalising the client payload ──────────────────────────────

/** Everything the browser sends up at signup. All fields optional. */
export interface AttributionInput {
  source?: unknown;
  sourceDetail?: unknown;
  referrer?: unknown;
  landingPath?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  utmTerm?: unknown;
  utmContent?: unknown;
  gclid?: unknown;
  promoCode?: unknown;
}

export interface NormalisedAttribution {
  source: string;
  sourceDetail: string | null;
  referrer: string | null;
  referrerDomain: string | null;
  landingPath: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  promoCode: string | null;
}

/** Trims to a maximum length and collapses empty strings to null. */
function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Validates and clamps the browser payload.
 *
 * Everything here is attacker-controlled - it comes off an unauthenticated
 * signup request - so `source` is checked against the known set rather than
 * stored free-form, and every free-text field is length-capped. An
 * unrecognised source is recorded as 'unknown' instead of rejecting the
 * signup: losing a registration over an analytics field would be the wrong
 * trade.
 */
export function normaliseAttribution(input: AttributionInput | undefined | null): NormalisedAttribution {
  const raw = input ?? {};
  const source = isValidSource(raw.source) ? raw.source : 'unknown';
  const referrer = str(raw.referrer, 500);

  return {
    source,
    // Only meaningful for the free-text branches; kept short deliberately.
    sourceDetail: str(raw.sourceDetail, 200),
    referrer,
    referrerDomain: hostOf(referrer),
    landingPath: str(raw.landingPath, 500),
    utmSource: str(raw.utmSource, 200),
    utmMedium: str(raw.utmMedium, 200),
    utmCampaign: str(raw.utmCampaign, 200),
    utmTerm: str(raw.utmTerm, 200),
    utmContent: str(raw.utmContent, 200),
    gclid: str(raw.gclid, 200),
    promoCode: str(raw.promoCode, 64),
  };
}
