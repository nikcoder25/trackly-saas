/**
 * Response parsing - brand detection, sentiment analysis, competitor detection
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

// ── Domain-aware competitor matching ─────────────────────────────
// Competitors may be stored as domain names (e.g. "www.metrocars.com")
// but AI models write natural business names ("Metro Cars").
// These utilities bridge that gap with multi-strategy matching.

const COMMON_TLDS = /\.(com|net|org|co|io|biz|info|us|uk|ca|au|de|fr|nz|edu|gov)$/i;

const TRAILING_SUFFIXES = /(?:llc|inc|corp|ltd|group|usa|hq|tx|ca|ny|fl|az|oh|pa|nj|il|va|ma|ga|nc|mi|wa|md|mn|wi|mo|tn|la|ky|or|ok|ct|ia|ms|ar|ks|ut|nv|nm|ne|wv|id|hi|nh|me|mt|ri|de|sd|nd|ak|vt|wy|dc)$/i;

function isDomainLike(str: string): boolean {
  return COMMON_TLDS.test(str);
}

const SEGMENT_WORDS = [
  'construction', 'installation', 'landscaping', 'restoration', 'remodeling',
  'maintenance', 'enterprises', 'engineering', 'performance', 'improvement',
  'residential', 'commercial', 'contracting', 'mechanical', 'foundation',
  'demolition', 'excavation', 'insulation', 'management', 'consulting',
  'blacktopping', 'refinishing', 'waterproof', 'transportation',
  'neighbors', 'financial', 'insurance', 'mortgage', 'property',
  'airport', 'transport', 'transfer', 'shuttle', 'limousine', 'dispatch',
  'sealcoat', 'services', 'brothers', 'painting', 'plumbing', 'cleaning',
  'flooring', 'concrete', 'driveway', 'masonry', 'roofing', 'fencing',
  'grading', 'hauling', 'towing', 'heating', 'cooling', 'removal',
  'outdoor', 'kitchen', 'premium', 'quality', 'classic', 'express',
  'precise', 'supreme', 'premier', 'diamond', 'western', 'eastern',
  'pacific', 'america', 'country', 'capital', 'central', 'weather',
  'trusted', 'patriot', 'liberty', 'freedom', 'comfort', 'coastal',
  'service', 'parking', 'overlay', 'striping', 'sealing', 'curbing',
  'milling', 'patching', 'marking', 'coating', 'surfing', 'cutting',
  'funding', 'lending', 'banking', 'housing', 'finance', 'trading',
  'asphalt', 'paving', 'repair', 'custom', 'design', 'supply',
  'source', 'master', 'expert', 'golden', 'silver', 'garage',
  'window', 'garden', 'valley', 'island', 'harbor', 'forest',
  'bridge', 'spring', 'estate', 'market', 'realty', 'rental',
  'austin', 'dallas', 'houston',
  'denver', 'phoenix', 'tampa', 'vegas', 'miami', 'portland',
  'credit', 'invest', 'equity', 'wealth',
  'texas', 'texan', 'north', 'south', 'metro', 'stone', 'creek',
  'maple', 'cedar', 'eagle', 'royal', 'solar', 'power', 'house',
  'smart', 'rapid', 'steel', 'hydro', 'green', 'clean', 'water',
  'black', 'white', 'trust', 'prime', 'local', 'grand', 'great',
  'super', 'elite', 'level', 'point', 'ridge', 'haven', 'plaza',
  'crown', 'crest', 'right', 'craft', 'works', 'build',
  'modern', 'total', 'alpha', 'omega', 'delta', 'sigma', 'offer',
  'pave', 'seal', 'line', 'roof', 'tree', 'lawn', 'hvac', 'bath',
  'door', 'pool', 'rock', 'lake', 'hill', 'peak', 'pine', 'wolf',
  'bear', 'hawk', 'bull', 'star', 'lone', 'best', 'fast', 'true',
  'sure', 'safe', 'home', 'land', 'city', 'town', 'east', 'west',
  'king', 'duke', 'iron', 'flex', 'apex', 'core', 'edge', 'mark',
  'tech', 'link', 'plus', 'blue', 'gold', 'gray', 'grey',
  'bank', 'fund', 'loan',
  'cars', 'auto', 'motor', 'ride', 'fleet', 'drive', 'cargo',
  'lukes', 'johns', 'mikes', 'daves', 'bobs', 'jacks', 'steves',
  'scotts', 'franks', 'adams', 'nicks', 'tonys', 'bills', 'ricks',
  'jeffs', 'gregs', 'brads', 'alans', 'garys', 'carls', 'dales',
  'deans', 'todds', 'matts', 'pauls', 'marks', 'ryans',
  'luke', 'john', 'mike', 'dave', 'jack', 'pete', 'scott', 'brian',
  'steve', 'chris', 'james', 'frank', 'adam', 'eric', 'nick', 'tony',
  'bill', 'rick', 'jeff', 'greg', 'brad', 'alan', 'gary', 'carl',
  'dale', 'dean', 'todd', 'troy', 'neil', 'kurt', 'glen', 'andy',
  'matt', 'paul', 'ryan', 'jose', 'juan', 'luis', 'jose',
  'max', 'pro', 'new', 'top', 'one', 'two', 'tri', 'big', 'red',
  'sun', 'bay', 'oak', 'elm', 'air', 'all', 'ace',
].sort((a, b) => b.length - a.length);

function _greedySegment(str: string): string[] {
  const result: string[] = [];
  let remaining = str;
  let unmatched = '';
  while (remaining.length > 0) {
    let found = false;
    for (const word of SEGMENT_WORDS) {
      if (word.length <= remaining.length && remaining.startsWith(word)) {
        if (unmatched.length >= 3) result.push(unmatched);
        unmatched = '';
        result.push(word);
        remaining = remaining.substring(word.length);
        found = true;
        break;
      }
    }
    if (!found) { unmatched += remaining[0]; remaining = remaining.substring(1); }
  }
  if (unmatched.length >= 3) result.push(unmatched);
  return result;
}

function segmentDomainWords(competitor: string): string[] {
  let base = competitor.toLowerCase().trim()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    .replace(/^www\./, '').replace(COMMON_TLDS, '');
  if (base.includes('-')) {
    // Split on hyphens, then greedily segment any compound parts
    const allWords: string[] = [];
    for (const part of base.split('-').filter(w => w.length >= 2)) {
      // Strip leading digits from compound parts (e.g. "1airportcars" → "airportcars")
      const alpha = part.replace(/^\d+/, '');
      if (alpha.length >= 5) {
        const sub = _greedySegment(alpha);
        const covered = sub.reduce((sum, w) => sum + w.length, 0);
        if (sub.length >= 2 && covered >= alpha.length * 0.5) {
          allWords.push(...sub.filter(w => w.length >= 3));
          continue;
        }
      }
      if (part.length >= 2) allWords.push(part);
    }
    return allWords.length >= 2 ? allWords : [base.replace(/-/g, '')];
  }
  const cleaned = base.replace(TRAILING_SUFFIXES, '');
  if (cleaned.length <= 2) return [base];
  const segments = _greedySegment(cleaned);
  const covered = segments.reduce((sum, w) => sum + w.length, 0);
  if (segments.length === 0 || covered < cleaned.length * 0.5) return [cleaned];
  return segments.filter(w => w.length >= 3);
}

function _makeWordRegex(word: string): RegExp {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (word.length >= 4 && word.endsWith('s')) {
    const baseEsc = word.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + baseEsc + "[''']?s\\b", 'i');
  }
  return new RegExp('\\b' + esc + '\\b', 'i');
}

interface CompetitorMatcher {
  name: string;
  exactRe: RegExp;
  baseDomain: string | null;
  baseDomainClean: string | null;
  baseRe: RegExp | null;
  domainWordRes: RegExp[];
}

function _buildCompetitorMatcher(comp: string): CompetitorMatcher | null {
  const cLower = comp.toLowerCase().trim();
  if (cLower.length < 2) return null;
  const cEsc = cLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactRe = new RegExp('\\b' + cEsc + '\\b', 'i');

  let baseDomain: string | null = null;
  let baseDomainClean: string | null = null;
  let baseRe: RegExp | null = null;
  let domainWordRes: RegExp[] = [];

  if (isDomainLike(cLower)) {
    baseDomain = cLower.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      .replace(/^www\./, '').replace(COMMON_TLDS, '');
    if (baseDomain.length >= 3) {
      const baseEsc = baseDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      baseRe = new RegExp('\\b' + baseEsc + '\\b', 'i');
    }
    const stripped = baseDomain.replace(TRAILING_SUFFIXES, '');
    if (stripped.length >= 3 && stripped !== baseDomain) baseDomainClean = stripped;
    const words = segmentDomainWords(comp);
    if (words.length >= 2) domainWordRes = words.filter(w => w.length >= 3).map(w => _makeWordRegex(w));
  }

  return { name: comp, exactRe, baseDomain, baseDomainClean, baseRe, domainWordRes };
}

function _matchCompetitors(text: string, compMatchers: CompetitorMatcher[]): string[] {
  const found: string[] = [];
  let _collapsed: string | null = null;
  function getCollapsed() {
    if (_collapsed === null) _collapsed = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    return _collapsed;
  }
  for (const c of compMatchers) {
    if (c.exactRe.test(text)) { found.push(c.name); continue; }
    if (c.baseRe && c.baseRe.test(text)) { found.push(c.name); continue; }
    if (c.baseDomain && c.baseDomain.length >= 5) {
      const collapsed = getCollapsed();
      // Also strip hyphens/special chars from baseDomain for fair comparison
      const collapsedBase = c.baseDomain.replace(/[^a-z0-9]/g, '');
      if (collapsed.includes(collapsedBase)) { found.push(c.name); continue; }
      if (c.baseDomainClean) {
        const collapsedClean = c.baseDomainClean.replace(/[^a-z0-9]/g, '');
        if (collapsed.includes(collapsedClean)) { found.push(c.name); continue; }
      }
    }
    if (c.domainWordRes.length >= 2) {
      const positions: number[] = [];
      let allFound = true;
      for (const rx of c.domainWordRes) {
        const m = rx.exec(text);
        if (m) { positions.push(m.index); }
        else { allFound = false; break; }
      }
      if (allFound && positions.length >= 2) {
        const span = Math.max(...positions) - Math.min(...positions);
        if (span <= 120) { found.push(c.name); }
      }
    }
  }
  return found;
}

export interface BrandInput {
  name: string;
  website?: string;
  aliases?: string[];
  city?: string;
  nearbyAreas?: string[];
  competitors?: string[];
}

export interface BrandMatcher {
  nameLower: string; exactRe: RegExp; noPuncRe: RegExp | null;
  nameNoSpace: string; firstWord: string;
  sigWords: string[]; sigWordRes: RegExp[];
  domain: string | null; aliasMatchers: Array<{ exact: RegExp; noPunc: RegExp | null }>;
  positionRes: RegExp[]; allLocations: string[];
  compRes: CompetitorMatcher[]; hasCity: boolean;
}

export function buildBrandMatcher(brand: BrandInput): BrandMatcher {
  // Limit length and strip regex-dangerous patterns to prevent ReDoS
  const name = (brand.name || '').trim().slice(0, 200).replace(/[(){}|\\]/g, '');
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

  // List-position regexes. The original pattern only matched the bare
  // `1. **BrandName**` shape. Gemini in particular tends to emit
  // `**1. BrandName**` (bold around the whole label), `**1.** BrandName`,
  // `(1) BrandName`, and similar variants — every one of which slid past
  // the old regex and surfaced as Position N/A on the Mentions page.
  // Two patterns now run in order; the first match wins (parseResponse
  // breaks on first hit), so the more specific markdown variant comes
  // before the parenthesised/hash one.
  //
  // Both patterns require: line-start, optional whitespace, then a marker
  // group (number with surrounding emphasis), then optional emphasis +
  // optional spaces, then the brand name on the SAME LINE — that
  // last-line-anchor is what keeps false-positive risk near zero.
  const positionRes: RegExp[] = [];
  const allNames = [name, ...(brand.aliases || [])].filter(Boolean);
  // Optional bold/italic emphasis: `**`, `__`, or `*`.
  const EMPH = '(?:\\*\\*|__|\\*)?';
  for (const bn of allNames) {
    const bnEsc = bn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Pattern 1: `1.`, `2)`, `3-`, with optional emphasis before the digit,
    // after the punctuation, and immediately before the brand name. Covers
    // `1. Brand`, `**1. Brand**`, `**1.** Brand`, `1. **Brand**`, etc.
    positionRes.push(new RegExp(
      '(?:^|\\n)\\s*' + EMPH + '\\s*(\\d{1,2})[.)\\-]\\s*' + EMPH + '\\s*' + EMPH + '\\s*' + bnEsc,
      'im',
    ));
    // Pattern 2: `(1)`, `[1]`, `#1:`, `#4 Brand` and bold variants
    // (`**(6)**`, `**(1) Brand**`, etc.). Emphasis can sit either side
    // of the marker group, and the closing bracket/colon is optional.
    // When it's omitted at least one whitespace separates the digit
    // from the brand, so the brand-on-same-line invariant still holds.
    positionRes.push(new RegExp(
      '(?:^|\\n)\\s*' + EMPH + '\\s*[(\\[#]\\s*(\\d{1,2})\\s*[)\\]:.\\-]?' + EMPH + '\\s+' + EMPH + '\\s*' + EMPH + '\\s*' + bnEsc,
      'im',
    ));
  }

  const allLocations: string[] = [];
  if (brand.city) {
    allLocations.push(brand.city.toLowerCase().trim());
    if (brand.nearbyAreas?.length) brand.nearbyAreas.forEach((a: string) => allLocations.push(a.toLowerCase().trim()));
  }

  const compRes: CompetitorMatcher[] = [];
  if (brand.competitors?.length) {
    for (const comp of brand.competitors) {
      const m = _buildCompetitorMatcher(comp);
      if (m) compRes.push(m);
    }
  }

  return { nameLower, exactRe, noPuncRe, nameNoSpace, firstWord, sigWords, sigWordRes, domain, aliasMatchers, positionRes, allLocations, compRes, hasCity: !!brand.city };
}

export function parseResponse(text: string, brand: BrandInput, query: string, matcher?: BrandMatcher) {
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
  return _matchCompetitors(text, matcher.compRes);
}

/** Aggregate competitorMentions arrays into a count map. */
export function aggregateCompetitorCounts(results: Array<{ competitorMentions?: string[] }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of results) {
    for (const c of (r.competitorMentions || [])) { counts[c] = (counts[c] || 0) + 1; }
  }
  return counts;
}

/** Display a domain-based competitor as a friendly name using the parser's segmentation. */
export function friendlyCompetitorName(comp: string): string {
  if (!COMMON_TLDS.test(comp)) return comp;
  const words = segmentDomainWords(comp);
  if (words.length === 0) return comp;
  // Reconstruct with hyphens preserved for numeric prefixes (e.g. "a-1")
  let base = comp.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    .replace(/^www\./, '').replace(COMMON_TLDS, '');
  const hasHyphen = base.includes('-');
  const parts: string[] = [];
  if (hasHyphen) {
    for (const part of base.split('-')) {
      if (!part) continue;
      const alpha = part.replace(/^\d+/, '');
      const prefix = part.slice(0, part.length - alpha.length);
      // Purely numeric or short alphanumeric like "a", "1" - keep as-is
      if (part.length <= 2) { parts.push(part.toUpperCase()); continue; }
      if (prefix && alpha.length < 3) { parts.push(part.toUpperCase()); continue; }
      if (prefix) parts.push(prefix);
      const sub = alpha.length >= 5 ? _greedySegment(alpha).filter(w => w.length >= 3) : [alpha];
      parts.push(...sub);
    }
  } else {
    parts.push(...words);
  }
  // Join short parts with hyphens (e.g. "A", "1" → "A-1") then title-case the rest
  const merged: string[] = [];
  for (const w of parts) {
    if (w.length <= 2 && merged.length > 0 && merged[merged.length - 1].length <= 2) {
      merged[merged.length - 1] += '-' + w;
    } else {
      merged.push(w);
    }
  }
  return merged.map(w => w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || comp;
}
