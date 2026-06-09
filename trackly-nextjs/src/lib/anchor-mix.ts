/**
 * Anchor-text mix planner for the admin backlink content generator.
 *
 * Pure helpers (no React, no DOM) so the math is unit-testable and the
 * client component just renders the UI on top. Each backlink campaign
 * has a target distribution of anchor types — exact / partial / branded /
 * generic / topical / geo / naked URL / full URL — and we pre-assign one
 * type per article so the realised mix matches the operator's request
 * regardless of which articles fail and get retried.
 */

export const ANCHOR_TYPES = [
  'exact',
  'partial',
  'branded',
  'generic',
  'topical',
  'geo',
  'naked',
  'url',
] as const;
export type AnchorType = (typeof ANCHOR_TYPES)[number];

export const ANCHOR_LABELS: Record<AnchorType, string> = {
  exact: 'Exact match',
  partial: 'Partial match',
  branded: 'Branded',
  generic: 'Generic',
  topical: 'Topical / LSI',
  geo: 'Geo / local',
  naked: 'Naked URL',
  url: 'Full URL',
};

export const ANCHOR_HELP: Record<AnchorType, string> = {
  exact: 'The target keyword used verbatim — e.g. "hvac repair near me".',
  partial: 'A fragment of the keyword — e.g. "hvac repair".',
  branded: 'Brand name only — e.g. "Acme HVAC" or "AcmeHVAC".',
  generic: 'Call-to-action phrasing — e.g. "click here", "this guide".',
  topical: 'Topical / LSI phrase — e.g. "professional HVAC services".',
  geo: 'Keyword + location — e.g. "HVAC repair in Detroit".',
  naked: 'Bare domain — e.g. "acme-hvac.com".',
  url: 'The full URL string — e.g. "https://acme-hvac.com/repair".',
};

export const DEFAULT_ANCHOR_MIX: Record<AnchorType, number> = {
  branded: 35,
  generic: 15,
  topical: 15,
  partial: 10,
  naked: 10,
  exact: 5,
  url: 5,
  geo: 5,
};

export const ANCHOR_MIX_TOLERANCE = 1;

const GENERIC_ANCHOR_POOL = [
  'click here',
  'read more',
  'visit the website',
  'learn more',
  'see the details',
  'check it out',
  'find out more',
  'this article',
  'browse the site',
  'see for yourself',
  'view the guide',
  'get the full story',
];

const TOPICAL_LEADERS = [
  'professional',
  'trusted',
  'reliable',
  'local',
  'expert',
  'experienced',
  'top-rated',
  'qualified',
];

const BANNED_TOPICAL_MODIFIERS = new Set([
  'near',
  'me',
  'best',
  'top',
  'cheap',
  'cheapest',
  'affordable',
  'in',
  'the',
  'for',
  'of',
  'and',
  'a',
  'an',
]);

export function normaliseMix(mix: Record<AnchorType, number>): Record<AnchorType, number> {
  const fixed = { ...DEFAULT_ANCHOR_MIX };
  let total = 0;
  for (const t of ANCHOR_TYPES) {
    const v = mix[t];
    const safe = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
    fixed[t] = safe;
    total += safe;
  }
  return total === 0 ? { ...DEFAULT_ANCHOR_MIX } : fixed;
}

/**
 * Largest-remainder method: deterministic integer distribution of
 * `count` slots across the anchor types so the realised mix matches
 * the requested percentages as closely as integer slots allow.
 */
export function planAnchorAssignments(
  count: number,
  mix: Record<AnchorType, number>,
): Record<AnchorType, number> {
  if (count <= 0) {
    return ANCHOR_TYPES.reduce(
      (acc, t) => ({ ...acc, [t]: 0 }),
      {} as Record<AnchorType, number>,
    );
  }
  const totalPct = ANCHOR_TYPES.reduce((s, t) => s + (mix[t] ?? 0), 0) || 100;
  const raw = ANCHOR_TYPES.map((t) => ({
    type: t,
    exact: (count * (mix[t] ?? 0)) / totalPct,
  }));
  const floored = raw.map((r) => ({
    ...r,
    floor: Math.floor(r.exact),
    frac: r.exact - Math.floor(r.exact),
  }));
  const assigned: Record<AnchorType, number> = floored.reduce(
    (acc, r) => ({ ...acc, [r.type]: r.floor }),
    {} as Record<AnchorType, number>,
  );
  let remaining = count - floored.reduce((s, r) => s + r.floor, 0);
  const queue = floored.slice().sort((a, b) => b.frac - a.frac);
  for (const r of queue) {
    if (remaining <= 0) break;
    assigned[r.type] += 1;
    remaining -= 1;
  }
  return assigned;
}

export function assignAnchorTypes(
  count: number,
  mix: Record<AnchorType, number>,
): AnchorType[] {
  const counts = planAnchorAssignments(count, mix);
  // Build a deterministic, evenly-interleaved sequence rather than a
  // run of identical types so a campaign with 35 branded + 15 generic
  // doesn't burn through 35 branded articles before any generic ones.
  const buckets: AnchorType[][] = ANCHOR_TYPES.map((t) =>
    Array.from({ length: counts[t] }, () => t),
  );
  const out: AnchorType[] = [];
  let i = 0;
  while (out.length < count) {
    const bucket = buckets[i % buckets.length];
    const item = bucket.shift();
    if (item) out.push(item);
    i++;
    // Safety stop if we somehow circle without progress.
    if (i > count * (buckets.length + 1)) break;
  }
  return out;
}

export function extractDomain(rawUrl: string): string {
  try {
    const u = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return rawUrl
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .toLowerCase();
  }
}

export function brandFromMoneySite(moneySite: string): string {
  const host = extractDomain(moneySite);
  const root = host.split('.')[0] || host;
  return root
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function partialFromKeyword(keyword: string): string {
  const words = keyword.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return keyword.trim();
  // Drop tail modifiers ("near me") and trailing single word so the
  // partial reads like a head-term.
  const head = words.slice(0, Math.max(1, Math.ceil(words.length / 2)));
  return head.join(' ');
}

export function topicalFromKeyword(
  keyword: string,
  niche: string,
  index: number,
): string {
  const base = keyword.trim() || niche.trim();
  const cleaned =
    base
      .split(/\s+/)
      .filter((w) => !BANNED_TOPICAL_MODIFIERS.has(w.toLowerCase()))
      .join(' ')
      .trim() || base;
  const leader = TOPICAL_LEADERS[index % TOPICAL_LEADERS.length];
  return `${leader} ${cleaned}`.replace(/\s+/g, ' ').trim();
}

export function geoFromKeyword(
  keyword: string,
  location: string,
  niche: string,
): string {
  const what =
    (keyword.trim() || niche.trim() || 'services').replace(/\s+near me$/i, '').trim();
  const where = location.trim();
  if (!where) return what;
  return `${what} in ${where}`;
}

export function genericPick(index: number): string {
  return GENERIC_ANCHOR_POOL[index % GENERIC_ANCHOR_POOL.length];
}

export interface AnchorPair {
  keyword: string;
  link: string;
}

export function anchorTextFor(
  type: AnchorType,
  pair: AnchorPair,
  moneySite: string,
  niche: string,
  location: string,
  index: number,
): string {
  switch (type) {
    case 'exact':
      return pair.keyword.trim();
    case 'partial':
      return partialFromKeyword(pair.keyword);
    case 'branded': {
      const brand = brandFromMoneySite(moneySite);
      return brand || pair.keyword.trim();
    }
    case 'generic':
      return genericPick(index);
    case 'topical':
      return topicalFromKeyword(pair.keyword, niche, index);
    case 'geo':
      return geoFromKeyword(pair.keyword, location, niche);
    case 'naked':
      return extractDomain(pair.link || moneySite);
    case 'url':
      return (pair.link || moneySite).trim();
    default:
      return pair.keyword.trim();
  }
}
