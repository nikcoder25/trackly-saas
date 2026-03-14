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

  // Competitor matchers — pre-compile
  const compRes = [];
  if (brand.competitors && brand.competitors.length) {
    for (const comp of brand.competitors) {
      const cLower = comp.toLowerCase().trim();
      if (cLower.length < 2) continue;
      const cEsc = cLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      compRes.push({ name: comp, re: new RegExp('\\b' + cEsc + '\\b', 'i') });
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
  // Use pre-compiled matchers if available
  if (matcher && matcher.compRes.length) {
    const found = [];
    for (const c of matcher.compRes) {
      if (c.re.test(text)) found.push(c.name);
    }
    return found;
  }
  // Fallback for calls without matcher
  if (!competitors || !competitors.length) return [];
  const found = [];
  for (const comp of competitors) {
    const compLower = comp.toLowerCase().trim();
    if (compLower.length < 2) continue;
    const compEsc = compLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\b' + compEsc + '\\b', 'i');
    if (re.test(text)) found.push(comp);
  }
  return found;
}

module.exports = { parseResponse, detectCompetitors, buildBrandMatcher };
