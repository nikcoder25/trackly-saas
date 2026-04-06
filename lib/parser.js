/**
 * Response parsing — brand detection, sentiment analysis, competitor detection
 *
 * Performance: regex patterns are compiled once per brand via buildBrandMatcher()
 * and reused across all queries in a run, avoiding re-creation per call.
 */

// Pre-compiled static patterns (created once at module load)
const RECOMMENDATION_RE = /\b(recommend|best|top\s+pick|top\s+choice|leading|solid choice|preferred|go.?with|first choice|suggest|worth considering|strong contender|stands out|highly recommend|top.?rated)\b/i;
const LOCATION_QUERY_RE = /\b(in|near|around|at)\s+[A-Z]/i;
const URL_RE = /https?:\/\/[^\s"')>\]]+/g;

const POS_WORDS = ['recommend','excellent','top pick','best','leading','reputable','trusted','high quality',
  'professional','reliable','great','highly rated','well-known','popular','outstanding',
  'praised','good reviews','well-regarded','strong reputation','solid','preferred','consistent',
  'top rated','award','certified','experienced','five star','5 star','4.5','4.8','4.9'];
const NEG_WORDS = ['avoid','complaint','poor','bad','worst','unreliable','scam','overpriced',
  'unprofessional','negative reviews','problems','issues','lawsuit','shut down','closed',
  'out of business','fraudulent','deceptive','disappointing','terrible'];
// Pre-compiled regex for O(1) sentiment matching instead of O(n) per-word .includes() scans
const POS_RE = new RegExp(POS_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
const NEG_RE = new RegExp(NEG_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');

// ── Domain-aware competitor matching ─────────────────────────────
// Competitors may be stored as domain names (e.g. "lukesasphaltpaving.com")
// but AI models write natural business names ("Luke's Asphalt Paving").
// These utilities bridge that gap with multi-strategy matching.

const COMMON_TLDS = /\.(com|net|org|co|io|biz|info|us|uk|ca|au|de|fr|nz|edu|gov)$/i;

// Trailing state abbreviations and business suffixes to strip from domains
const TRAILING_SUFFIXES = /(?:llc|inc|corp|ltd|group|usa|hq|tx|ca|ny|fl|az|oh|pa|nj|il|va|ma|ga|nc|mi|wa|md|mn|wi|mo|tn|la|ky|or|ok|ct|ia|ms|ar|ks|ut|nv|nm|ne|wv|id|hi|nh|me|mt|ri|de|sd|nd|ak|vt|wy|dc)$/i;

function isDomainLike(str) {
  return COMMON_TLDS.test(str);
}

// Focused word set for splitting concatenated domain names into natural words.
// Sorted longest-first for greedy matching. Covers common US business domains.
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
].sort((a, b) => b.length - a.length); // longest first for greedy matching

/**
 * Segment a concatenated domain name base into likely English words.
 * Uses greedy longest-match against the SEGMENT_WORDS dictionary.
 * Unmatched residue of 3+ chars is kept as potential business names.
 */
function _greedySegment(str) {
  const result = [];
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
    if (!found) {
      unmatched += remaining[0];
      remaining = remaining.substring(1);
    }
  }
  if (unmatched.length >= 3) result.push(unmatched);
  return result;
}

/**
 * Extract matchable words from a domain-like competitor string.
 * e.g. "lukesasphaltpaving.com" → ["lukes", "asphalt", "paving"]
 *      "lone-star-paving.com"  → ["lone", "star", "paving"]
 */
function segmentDomainWords(competitor) {
  let base = competitor.toLowerCase().trim()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    .replace(/^www\./, '').replace(COMMON_TLDS, '');

  // Hyphenated domains: split, then segment compound parts
  if (base.includes('-')) {
    const allWords = [];
    for (const part of base.split('-').filter(w => w.length >= 2)) {
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

  // Strip trailing state/business suffixes before segmenting
  const cleaned = base.replace(TRAILING_SUFFIXES, '');
  if (cleaned.length <= 2) return [base];

  const segments = _greedySegment(cleaned);

  // If segmentation covered less than half the string, return base as-is
  const covered = segments.reduce((sum, w) => sum + w.length, 0);
  if (segments.length === 0 || covered < cleaned.length * 0.5) {
    return [cleaned];
  }
  return segments.filter(w => w.length >= 3);
}

/**
 * Build a regex for a domain word that handles possessives.
 * "lukes" matches "luke's", "lukes", "Luke's" etc.
 */
function _makeWordRegex(word) {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Handle possessive: "lukes" → matches "luke's" or "lukes"
  if (word.length >= 4 && word.endsWith('s')) {
    const baseEsc = word.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + baseEsc + "[''']?s\\b", 'i');
  }
  return new RegExp('\\b' + esc + '\\b', 'i');
}

/**
 * Build a single competitor matcher object with multiple strategies.
 * Works for both plain business names and domain-name competitors.
 */
function _buildCompetitorMatcher(comp) {
  const cLower = comp.toLowerCase().trim();
  if (cLower.length < 2) return null;
  const cEsc = cLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Strategy 1: exact word-boundary match (works for plain names + domains)
  const exactRe = new RegExp('\\b' + cEsc + '\\b', 'i');

  // Domain-specific strategies
  let baseDomain = null;       // TLD-stripped, for space-collapsed matching
  let baseDomainClean = null;  // also suffix-stripped, for collapsed matching
  let baseRe = null;           // word-boundary match on base domain
  let domainWordRes = [];      // word proximity regexes

  if (isDomainLike(cLower)) {
    baseDomain = cLower.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      .replace(/^www\./, '').replace(COMMON_TLDS, '');

    // Strategy 2: word-boundary match on base domain (e.g. "pavecon")
    if (baseDomain.length >= 3) {
      const baseEsc = baseDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      baseRe = new RegExp('\\b' + baseEsc + '\\b', 'i');
    }

    // Suffix-stripped version for collapsed matching
    const stripped = baseDomain.replace(TRAILING_SUFFIXES, '');
    if (stripped.length >= 3 && stripped !== baseDomain) {
      baseDomainClean = stripped;
    }

    // Strategy 4: segment domain into words for proximity matching
    const words = segmentDomainWords(comp);
    if (words.length >= 2) {
      domainWordRes = words.filter(w => w.length >= 3).map(w => _makeWordRegex(w));
    }
  }

  return { name: comp, exactRe, baseDomain, baseDomainClean, baseRe, domainWordRes };
}

/**
 * Match text against an array of competitor matchers.
 * Uses 4 strategies in order: exact → base domain → space-collapsed → word proximity.
 */
function _matchCompetitors(text, compMatchers) {
  const found = [];
  // Lazy-computed collapsed text (spaces/punctuation stripped) — shared across all matchers
  let _collapsed = null;
  function getCollapsed() {
    if (_collapsed === null) _collapsed = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    return _collapsed;
  }

  for (const c of compMatchers) {
    // Strategy 1: exact word-boundary match
    if (c.exactRe.test(text)) { found.push(c.name); continue; }

    // Strategy 2: base domain word-boundary (e.g. "pavecon" matches "Pavecon")
    if (c.baseRe && c.baseRe.test(text)) { found.push(c.name); continue; }

    // Strategy 3: space-collapsed match — "lukesasphaltpaving" found in
    // "Luke's Asphalt Paving" after collapsing to "lukesasphaltpaving"
    if (c.baseDomain && c.baseDomain.length >= 5) {
      const collapsed = getCollapsed();
      const collapsedBase = c.baseDomain.replace(/[^a-z0-9]/g, '');
      if (collapsed.includes(collapsedBase)) { found.push(c.name); continue; }
      if (c.baseDomainClean) {
        const collapsedClean = c.baseDomainClean.replace(/[^a-z0-9]/g, '');
        if (collapsed.includes(collapsedClean)) { found.push(c.name); continue; }
      }
    }

    // Strategy 4: word proximity — segmented domain words all appear within 120 chars
    // Handles reordered mentions (e.g. "For paving, Luke's Asphalt is great")
    if (c.domainWordRes.length >= 2) {
      const positions = [];
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

/**
 * Build a reusable brand matcher object — call once before a run,
 * then pass to parseResponse() for every query result in that run.
 * Avoids re-compiling 6-10 regex patterns × 80 calls.
 */
function buildBrandMatcher(brand) {
  const name = (brand.name || '').trim();
  const nameLower = name.toLowerCase();
  const nameEsc = nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Strategy 1: exact word-boundary
  const exactRe = new RegExp('\\b' + nameEsc + '\\b', 'i');

  // Strategy 2: punctuation-stripped
  const nameNoPunc = nameLower.replace(/[''`\-.,&!]/g, '');
  const noPuncRe = nameNoPunc.length >= 3
    ? new RegExp('\\b' + nameNoPunc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
    : null;

  // Strategy 3: space-collapsed
  const nameNoSpace = nameLower.replace(/[\s\-_]+/g, '');
  const firstWord = nameLower.split(/\s+/)[0];

  // Strategy 4: fuzzy word-proximity
  const sigWords = nameLower.split(/\s+/).filter(w => w.length > 2);
  const sigWordRes = sigWords.map(w => new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'));

  // Strategy 5: domain
  let domain = null;
  if (brand.website) {
    domain = brand.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    if (domain.length <= 3) domain = null;
  }

  // Strategy 6: aliases — pre-compile each
  const aliasMatchers = [];
  if (brand.aliases && brand.aliases.length) {
    for (const alias of brand.aliases) {
      const aLower = alias.toLowerCase().trim();
      if (aLower.length < 2) continue;
      const aEsc = aLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aExact = new RegExp('\\b' + aEsc + '\\b', 'i');
      const aNoPunc = aLower.replace(/[''`\-.,&!]/g, '');
      const aNoPuncRe = aNoPunc.length >= 3
        ? new RegExp('\\b' + aNoPunc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
        : null;
      aliasMatchers.push({ exact: aExact, noPunc: aNoPuncRe });
    }
  }

  // List position detection regex — pre-compile for each brand name + alias
  const positionRes = [];
  const allNames = [name, ...(brand.aliases || [])].filter(Boolean);
  for (const bn of allNames) {
    const bnEsc = bn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    positionRes.push(new RegExp('(?:^|\\n)\\s*(\\d{1,2})[.)\\-]\\s*\\*{0,2}' + bnEsc, 'im'));
  }

  // Location data
  const allLocations = [];
  if (brand.city) {
    allLocations.push(brand.city.toLowerCase().trim());
    if (brand.nearbyAreas && brand.nearbyAreas.length) {
      brand.nearbyAreas.forEach(a => allLocations.push(a.toLowerCase().trim()));
    }
  }

  // Competitor matchers — domain-aware multi-strategy matching
  const compRes = [];
  if (brand.competitors && brand.competitors.length) {
    for (const comp of brand.competitors) {
      const m = _buildCompetitorMatcher(comp);
      if (m) compRes.push(m);
    }
  }

  return {
    nameLower, exactRe, noPuncRe, nameNoSpace, firstWord,
    sigWords, sigWordRes, domain, aliasMatchers, positionRes,
    allLocations, compRes, hasCity: !!brand.city
  };
}

function parseResponse(text, brand, query, matcher) {
  if (!text || !brand.name) return { mentioned: false, recommended: false, sentiment: 'neutral', cites: [], simulated: false };

  // Use pre-compiled matcher if provided, otherwise build ad-hoc (backwards compat)
  const m = matcher || buildBrandMatcher(brand);
  const lower = text.toLowerCase();

  let mentioned = false;
  let matchPosition = -1;

  // Strategy 1: Word-boundary exact match
  {
    const exactMatch = m.exactRe.exec(text);
    if (exactMatch) { mentioned = true; matchPosition = exactMatch.index; }
  }

  // Strategy 2: Punctuation-stripped
  if (!mentioned && m.noPuncRe) {
    const textNoPunc = lower.replace(/[''`\-.,&!]/g, '');
    const noPuncMatch = m.noPuncRe.exec(textNoPunc);
    if (noPuncMatch) { mentioned = true; matchPosition = noPuncMatch.index; }
  }

  // Strategy 3: Space-collapsed
  if (!mentioned && m.nameNoSpace.length >= 6) {
    const textNoSpace = lower.replace(/[\s\-_]+/g, '');
    if (textNoSpace.includes(m.nameNoSpace)) {
      mentioned = true;
      matchPosition = lower.indexOf(m.firstWord);
    }
  }

  // Strategy 4: Fuzzy word-proximity
  if (!mentioned && m.sigWords.length >= 2) {
    const wordPositions = [];
    let searchFrom = 0;
    let allFound = true;
    for (const rx of m.sigWordRes) {
      const sub = lower.substring(searchFrom);
      const match = rx.exec(sub);
      if (match) {
        wordPositions.push(searchFrom + match.index);
        searchFrom = searchFrom + match.index + match[0].length;
      } else { allFound = false; break; }
    }
    if (allFound && wordPositions.length === m.sigWords.length) {
      if (wordPositions[wordPositions.length - 1] - wordPositions[0] <= 120) {
        mentioned = true;
        matchPosition = wordPositions[0];
      }
    }
  }

  // Strategy 5: Domain
  if (!mentioned && m.domain && lower.includes(m.domain)) {
    mentioned = true;
    matchPosition = lower.indexOf(m.domain);
  }

  // Strategy 6: Aliases
  if (!mentioned) {
    for (const am of m.aliasMatchers) {
      const exactMatch = am.exact.exec(text);
      if (exactMatch) { mentioned = true; matchPosition = exactMatch.index; break; }
      if (am.noPunc) {
        const textNoPunc = lower.replace(/[''`\-.,&!]/g, '');
        const noPuncMatch = am.noPunc.exec(textNoPunc);
        if (noPuncMatch) { mentioned = true; matchPosition = noPuncMatch.index; break; }
      }
    }
  }

  // Location-aware detection
  let locationRelevant = true;
  let matchedLocation = '';

  if (mentioned && m.hasCity && query) {
    const queryLower = (query || '').toLowerCase();
    const queryHasLocation = m.allLocations.some(loc => queryLower.includes(loc)) ||
      LOCATION_QUERY_RE.test(query);
    if (!queryHasLocation) {
      const locationFound = m.allLocations.some(loc => {
        if (loc.length >= 3 && lower.includes(loc)) {
          matchedLocation = loc;
          return true;
        }
        return false;
      });
      locationRelevant = locationFound;
    }
  }

  // Recommendation detection
  const recommended = mentioned && RECOMMENDATION_RE.test(text);

  // Sentiment analysis
  let sentiment = 'neutral';
  if (mentioned && matchPosition >= 0) {
    const start = Math.max(0, matchPosition - 200);
    const end = Math.min(lower.length, matchPosition + m.nameLower.length + 300);
    const context = lower.substring(start, end);
    // Use pre-compiled regex for efficient single-pass sentiment word counting
    const p = (context.match(POS_RE) || []).length;
    const n = (context.match(NEG_RE) || []).length;
    sentiment = p > n ? 'positive' : n > p ? 'negative' : 'neutral';
  }

  // Extract URLs/citations
  const cites = [];
  const matches = text.match(URL_RE) || [];
  const seen = new Set();
  for (let i = 0; i < matches.length && cites.length < 6; i++) {
    if (!seen.has(matches[i])) { seen.add(matches[i]); cites.push(matches[i]); }
  }

  // Detect list rank position
  let listPosition = null;
  if (mentioned) {
    for (const posRx of m.positionRes) {
      const posMatch = posRx.exec(text);
      if (posMatch) { listPosition = parseInt(posMatch[1], 10); break; }
    }
  }

  return { mentioned, recommended, sentiment, cites, simulated: false, locationRelevant, matchedLocation, listPosition };
}

function detectCompetitors(text, competitors, matcher) {
  if (!text) return [];
  // Use pre-compiled matchers if available (from buildBrandMatcher)
  if (matcher && matcher.compRes.length) {
    return _matchCompetitors(text, matcher.compRes);
  }
  // Fallback for calls without matcher — build matchers on the fly
  if (!competitors || !competitors.length) return [];
  const matchers = competitors.map(c => _buildCompetitorMatcher(c)).filter(Boolean);
  return _matchCompetitors(text, matchers);
}

module.exports = { parseResponse, detectCompetitors, buildBrandMatcher };
