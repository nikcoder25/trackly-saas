/**
 * Response parsing — brand detection, sentiment analysis, competitor detection
 */

function parseResponse(text, brand, query) {
  if (!text || !brand.name) return { mentioned: false, recommended: false, sentiment: 'neutral', cites: [], simulated: false };

  const lower = text.toLowerCase();
  const brandLower = brand.name.toLowerCase().trim();

  let mentioned = false;
  let matchPosition = -1;

  // Strategy 1: Word-boundary exact match
  {
    const brandEsc = brandLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactRe = new RegExp('\\b' + brandEsc + '\\b', 'i');
    const exactMatch = exactRe.exec(text);
    if (exactMatch) {
      mentioned = true;
      matchPosition = exactMatch.index;
    }
  }

  // Strategy 2: Match without punctuation (McDonald's → McDonalds)
  if (!mentioned) {
    const brandNoPunc = brandLower.replace(/[''`\-.,&!]/g, '');
    const textNoPunc = lower.replace(/[''`\-.,&!]/g, '');
    if (brandNoPunc.length >= 3) {
      const noPuncEsc = brandNoPunc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const noPuncRe = new RegExp('\\b' + noPuncEsc + '\\b', 'i');
      const noPuncMatch = noPuncRe.exec(textNoPunc);
      if (noPuncMatch) {
        mentioned = true;
        matchPosition = noPuncMatch.index;
      }
    }
  }

  // Strategy 3: Match with separators collapsed (Cool Air Pro → CoolAirPro)
  if (!mentioned) {
    const brandNoSpace = brandLower.replace(/[\s\-_]+/g, '');
    const textNoSpace = lower.replace(/[\s\-_]+/g, '');
    if (brandNoSpace.length >= 6 && textNoSpace.includes(brandNoSpace)) {
      mentioned = true;
      matchPosition = lower.indexOf(brandLower.split(/\s+/)[0]);
    }
  }

  // Strategy 4: Word-boundary fuzzy — all significant words near each other in order
  if (!mentioned) {
    const words = brandLower.split(/\s+/).filter(w => w.length > 2);
    if (words.length >= 2) {
      const wordPositions = [];
      let searchFrom = 0;
      let allFound = true;
      for (const w of words) {
        const rx = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        const sub = lower.substring(searchFrom);
        const m = rx.exec(sub);
        if (m) {
          wordPositions.push(searchFrom + m.index);
          searchFrom = searchFrom + m.index + m[0].length;
        } else {
          allFound = false;
          break;
        }
      }
      if (allFound && wordPositions.length === words.length) {
        const minPos = wordPositions[0];
        const maxPos = wordPositions[wordPositions.length - 1];
        if (maxPos - minPos <= 120) {
          mentioned = true;
          matchPosition = minPos;
        }
      }
    }
  }

  // Strategy 5: Check website domain
  if (!mentioned && brand.website) {
    const domain = brand.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    if (domain && domain.length > 3 && lower.includes(domain)) {
      mentioned = true;
      matchPosition = lower.indexOf(domain);
    }
  }

  // Strategy 6: Check aliases
  if (!mentioned && brand.aliases && brand.aliases.length) {
    for (const alias of brand.aliases) {
      const aliasLower = alias.toLowerCase().trim();
      if (aliasLower.length < 2) continue;
      const aliasEsc = aliasLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aliasRe = new RegExp('\\b' + aliasEsc + '\\b', 'i');
      const aliasMatch = aliasRe.exec(text);
      if (aliasMatch) {
        mentioned = true;
        matchPosition = aliasMatch.index;
        break;
      }
      const aliasNoPunc = aliasLower.replace(/[''`\-.,&!]/g, '');
      if (aliasNoPunc.length >= 3) {
        const textNoPunc = lower.replace(/[''`\-.,&!]/g, '');
        const noPuncEsc = aliasNoPunc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const noPuncRe = new RegExp('\\b' + noPuncEsc + '\\b', 'i');
        const noPuncMatch = noPuncRe.exec(textNoPunc);
        if (noPuncMatch) {
          mentioned = true;
          matchPosition = noPuncMatch.index;
          break;
        }
      }
    }
  }

  // Location-aware detection
  let locationRelevant = true;
  let matchedLocation = '';

  if (mentioned && brand.city && query) {
    const queryLower = (query || '').toLowerCase();
    const cityLower = brand.city.toLowerCase().trim();
    const allLocations = [cityLower];
    if (brand.nearbyAreas && brand.nearbyAreas.length) {
      brand.nearbyAreas.forEach(a => allLocations.push(a.toLowerCase().trim()));
    }
    const queryHasLocation = allLocations.some(loc => queryLower.includes(loc)) ||
      /\b(in|near|around|at)\s+[A-Z]/i.test(query);
    if (!queryHasLocation) {
      const locationFound = allLocations.some(loc => {
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
  const recommended = mentioned && /\b(recommend|best|top\s+pick|top\s+choice|leading|solid choice|preferred|go.?with|first choice|suggest|worth considering|strong contender|stands out|highly recommend|top.?rated)\b/i.test(text);

  // Sentiment analysis
  let sentiment = 'neutral';
  if (mentioned && matchPosition >= 0) {
    const start = Math.max(0, matchPosition - 200);
    const end = Math.min(lower.length, matchPosition + brandLower.length + 300);
    const context = lower.substring(start, end);

    const pw = ['recommend','excellent','top pick','best','leading','reputable','trusted','high quality',
      'professional','reliable','great','highly rated','well-known','popular','outstanding',
      'praised','good reviews','well-regarded','strong reputation','solid','preferred','consistent',
      'top rated','award','certified','experienced','five star','5 star','4.5','4.8','4.9'];
    const nw = ['avoid','complaint','poor','bad','worst','unreliable','scam','overpriced',
      'unprofessional','negative reviews','problems','issues','lawsuit','shut down','closed',
      'out of business','fraudulent','deceptive','disappointing','terrible'];
    let p = 0, n = 0;
    pw.forEach(w => { if (context.includes(w)) p++; });
    nw.forEach(w => { if (context.includes(w)) n++; });
    sentiment = p > n ? 'positive' : n > p ? 'negative' : 'neutral';
  }

  // Extract URLs/citations
  const cites = [];
  const urlRx = /https?:\/\/[^\s"')>\]]+/g;
  const matches = text.match(urlRx) || [];
  [...new Set(matches)].slice(0, 6).forEach(u => cites.push(u));

  // Detect list rank position (e.g. "3. Brand Name" → position 3)
  let listPosition = null;
  if (mentioned) {
    const brandNames = [brand.name, ...(brand.aliases || [])].filter(Boolean);
    for (const bn of brandNames) {
      const bnEsc = bn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match "N. Brand", "N) Brand", "N - Brand" in numbered lists
      const posRx = new RegExp('(?:^|\\n)\\s*(\\d{1,2})[.)\\-]\\s*\\*{0,2}' + bnEsc, 'im');
      const posMatch = posRx.exec(text);
      if (posMatch) { listPosition = parseInt(posMatch[1], 10); break; }
    }
  }

  return { mentioned, recommended, sentiment, cites, simulated: false, locationRelevant, matchedLocation, listPosition };
}

function detectCompetitors(text, competitors) {
  if (!text || !competitors || !competitors.length) return [];
  const found = [];
  for (const comp of competitors) {
    const compLower = comp.toLowerCase().trim();
    if (compLower.length < 2) continue;
    const compEsc = compLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\b' + compEsc + '\\b', 'i');
    if (re.test(text)) {
      found.push(comp);
    }
  }
  return found;
}

module.exports = { parseResponse, detectCompetitors };
