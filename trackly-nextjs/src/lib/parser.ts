/**
 * Response parsing — brand detection, sentiment analysis, competitor detection
 * Ported from Express app's lib/parser.js
 */

const RECOMMENDATION_RE = /\b(recommend|best|top\s+pick|top\s+choice|leading|solid choice|preferred|go.?with|first choice|suggest|worth considering|strong contender|stands out|highly recommend|top.?rated)\b/i;
const URL_RE = /https?:\/\/[^\s"')>\]]+/g;
const LOCATION_QUERY_RE = /\b(in|near|around|at)\s+[A-Z]/i;

const POS_WORDS = ['recommend', 'excellent', 'top pick', 'best', 'leading', 'reputable', 'trusted', 'high quality',
  'professional', 'reliable', 'great', 'highly rated', 'well-known', 'popular', 'outstanding',
  'praised', 'good reviews', 'well-regarded', 'strong reputation', 'solid', 'preferred', 'consistent',
  'top rated', 'award', 'certified', 'experienced', 'five star', '5 star', '4.5', '4.8', '4.9'];
const NEG_WORDS = ['avoid', 'complaint', 'poor', 'bad', 'worst', 'unreliable', 'scam', 'overpriced',
  'unprofessional', 'negative reviews', 'problems', 'issues', 'lawsuit', 'shut down', 'closed',
  'out of business', 'fraudulent', 'deceptive', 'disappointing', 'terrible'];

const POS_RE = new RegExp(POS_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
const NEG_RE = new RegExp(NEG_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');

export interface BrandMatcher {
  nameLower: string; exactRe: RegExp; noPuncRe: RegExp | null;
  nameNoSpace: string; firstWord: string;
  sigWords: string[]; sigWordRes: RegExp[];
  domain: string | null; aliasMatchers: Array<{ exact: RegExp; noPunc: RegExp | null }>;
  positionRes: RegExp[]; allLocations: string[];
  compRes: Array<{ name: string; re: RegExp }>; hasCity: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildBrandMatcher(brand: any): BrandMatcher {
  const name = (brand.name || '').trim();
  const nameLower = name.toLowerCase();
  const nameEsc = nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactRe = new RegExp('\\b' + nameEsc + '\\b', 'i');
  const nameNoPunc = nameLower.replace(/[''`\-.,&!]/g, '');
  const noPuncRe = nameNoPunc.length >= 3 ? new RegExp('\\b' + nameNoPunc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i') : null;
  const nameNoSpace = nameLower.replace(/[\s\-_]+/g, '');
  const firstWord = nameLower.split(/\s+/)[0];
  const sigWords = nameLower.split(/\s+/).filter((w: string) => w.length > 2);
  const sigWordRes = sigWords.map((w: string) => new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'));

  let domain: string | null = null;
  if (brand.website) {
    domain = brand.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    if (domain && domain.length <= 3) domain = null;
  }

  const aliasMatchers: Array<{ exact: RegExp; noPunc: RegExp | null }> = [];
  if (brand.aliases?.length) {
    for (const alias of brand.aliases) {
      const aLower = alias.toLowerCase().trim();
      if (aLower.length < 2) continue;
      const aEsc = aLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aNoPunc = aLower.replace(/[''`\-.,&!]/g, '');
      aliasMatchers.push({
        exact: new RegExp('\\b' + aEsc + '\\b', 'i'),
        noPunc: aNoPunc.length >= 3 ? new RegExp('\\b' + aNoPunc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i') : null,
      });
    }
  }

  const positionRes: RegExp[] = [];
  const allNames = [name, ...(brand.aliases || [])].filter(Boolean);
  for (const bn of allNames) {
    const bnEsc = bn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    positionRes.push(new RegExp('(?:^|\\n)\\s*(\\d{1,2})[.)\\-]\\s*\\*{0,2}' + bnEsc, 'im'));
  }

  const allLocations: string[] = [];
  if (brand.city) {
    allLocations.push(brand.city.toLowerCase().trim());
    if (brand.nearbyAreas?.length) brand.nearbyAreas.forEach((a: string) => allLocations.push(a.toLowerCase().trim()));
  }

  const compRes: Array<{ name: string; re: RegExp }> = [];
  if (brand.competitors?.length) {
    for (const comp of brand.competitors) {
      const cLower = comp.toLowerCase().trim();
      if (cLower.length < 2) continue;
      const cEsc = cLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      compRes.push({ name: comp, re: new RegExp('\\b' + cEsc + '\\b', 'i') });
    }
  }

  return { nameLower, exactRe, noPuncRe, nameNoSpace, firstWord, sigWords, sigWordRes, domain, aliasMatchers, positionRes, allLocations, compRes, hasCity: !!brand.city };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseResponse(text: string, brand: any, query: string, matcher?: BrandMatcher) {
  if (!text || !brand.name) return { mentioned: false, recommended: false, sentiment: 'neutral', cites: [] as string[], listPosition: null as number | null };

  const m = matcher || buildBrandMatcher(brand);
  const lower = text.toLowerCase();
  let mentioned = false;
  let matchPosition = -1;

  // Strategy 1-6: Brand detection (exact, no-punc, no-space, fuzzy, domain, aliases)
  const exactMatch = m.exactRe.exec(text);
  if (exactMatch) { mentioned = true; matchPosition = exactMatch.index; }

  if (!mentioned && m.noPuncRe) {
    const noPuncMatch = m.noPuncRe.exec(lower.replace(/[''`\-.,&!]/g, ''));
    if (noPuncMatch) { mentioned = true; matchPosition = noPuncMatch.index; }
  }

  if (!mentioned && m.nameNoSpace.length >= 6) {
    if (lower.replace(/[\s\-_]+/g, '').includes(m.nameNoSpace)) { mentioned = true; matchPosition = lower.indexOf(m.firstWord); }
  }

  if (!mentioned) {
    for (const am of m.aliasMatchers) {
      const am_ = am.exact.exec(text);
      if (am_) { mentioned = true; matchPosition = am_.index; break; }
    }
  }

  if (!mentioned && m.domain && lower.includes(m.domain)) { mentioned = true; matchPosition = lower.indexOf(m.domain); }

  const recommended = mentioned && RECOMMENDATION_RE.test(text);

  let sentiment = 'neutral';
  if (mentioned && matchPosition >= 0) {
    const start = Math.max(0, matchPosition - 200);
    const end = Math.min(lower.length, matchPosition + m.nameLower.length + 300);
    const context = lower.substring(start, end);
    const p = (context.match(POS_RE) || []).length;
    const n = (context.match(NEG_RE) || []).length;
    sentiment = p > n ? 'positive' : n > p ? 'negative' : 'neutral';
  }

  const cites: string[] = [];
  const urlMatches = text.match(URL_RE) || [];
  const seen = new Set<string>();
  for (const url of urlMatches) { if (!seen.has(url) && cites.length < 6) { seen.add(url); cites.push(url); } }

  let listPosition: number | null = null;
  if (mentioned) {
    for (const posRx of m.positionRes) {
      const posMatch = posRx.exec(text);
      if (posMatch) { listPosition = parseInt(posMatch[1], 10); break; }
    }
  }

  return { mentioned, recommended, sentiment, cites, listPosition };
}

export function detectCompetitors(text: string, matcher: BrandMatcher): string[] {
  if (!text || !matcher.compRes.length) return [];
  return matcher.compRes.filter(c => c.re.test(text)).map(c => c.name);
}
