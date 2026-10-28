/**
 * Finds the place a keyword names, so "ai consulting austin" is checked
 * from Austin and "ai consulting edinburgh" from Edinburgh, whatever
 * location the keywords were added with.
 *
 * The gazetteer is the bundled city list (data/cities.json, biggest
 * first) plus US states, UK nations, Canadian provinces, Australian
 * states and countries. Only a place at the end of the keyword counts
 * ("plumber austin", "plumber in austin"), or a big city at the start
 * ("austin plumber"). Names that are everyday words (mobile, reading,
 * bath, orange...) are skipped so "walk in bath" stays where it was put.
 */

/** Everyday words that are also city names. */
const STOP = new Set([
  'mobile', 'reading', 'bath', 'orange', 'best', 'central', 'hope', 'wells', 'deal', 'march', 'sale', 'street', 'plain',
  'liberty', 'independence', 'union', 'enterprise', 'progress', 'commerce', 'industry', 'normal', 'republic', 'eagle',
  'golden', 'university', 'college', 'home', 'media', 'marina', 'beach', 'park', 'lake', 'river', 'spring', 'springs',
  'valley', 'garden', 'gardens', 'harbour', 'harbor', 'bay', 'port', 'mission', 'paradise', 'victory', 'unity', 'opportunity',
  'pleasant', 'mountain', 'lakeside', 'center', 'centre', 'north', 'south', 'east', 'west', 'city', 'town', 'village',
  'county', 'state', 'national', 'royal', 'grand', 'turkey', 'chad', 'china', 'jordan', 'ideal', 'surprise', 'banning',
  'sandy', 'nice', 'split', 'battle', 'wise', 'price', 'power', 'post', 'boring', 'cash', 'moss', 'ware', 'guinea',
])

const REGION_COUNTRIES = new Set(['United States', 'United Kingdom', 'Canada', 'Australia']);
const COUNTRY_ALIAS: Record<string, string> = { uk: 'United Kingdom', usa: 'United States', 'u.s.': 'United States', 'u.k.': 'United Kingdom' };
const CITY_LIMIT = 20000;
const START_LIMIT = 5000;

interface Gazetteer {
  /** "austin" -> ["Austin,Texas,United States", "Austin,Minnesota,United States"], biggest first. */
  cities: Map<string, { name: string; index: number }[]>;
  /** "texas" -> "Texas,United States". */
  regions: Map<string, string>;
  /** "united kingdom" -> "United Kingdom". */
  countries: Map<string, string>;
  longest: number;
}

let gaz: Gazetteer | null = null;

export function buildGazetteer(rows: [string, string][]): Gazetteer {
  const cities = new Map<string, { name: string; index: number }[]>();
  const regions = new Map<string, string>();
  const countries = new Map<string, string>();
  let longest = 1;
  rows.forEach(([name], index) => {
    const parts = name.split(',').map((s) => s.trim());
    const country = parts[parts.length - 1];
    if (country && !countries.has(country.toLowerCase())) countries.set(country.toLowerCase(), country);
    if (parts.length === 3 && REGION_COUNTRIES.has(country) && !regions.has(parts[1].toLowerCase())) regions.set(parts[1].toLowerCase(), `${parts[1]},${country}`);
    if (index >= CITY_LIMIT) return;
    const key = parts[0].toLowerCase();
    if (key.length < 4 || STOP.has(key)) return;
    const list = cities.get(key) || [];
    list.push({ name, index });
    cities.set(key, list);
    longest = Math.max(longest, key.split(' ').length);
  });
  for (const [k, v] of Object.entries(COUNTRY_ALIAS)) countries.set(k, v);
  for (const k of STOP) { regions.delete(k); countries.delete(k); }
  // "the netherlands" style names also match without "the".
  for (const [k, v] of [...countries]) if (k.startsWith('the ')) countries.set(k.slice(4), v);
  return { cities, regions, countries, longest: Math.max(longest, 3) };
}

async function gazetteer(): Promise<Gazetteer> {
  if (!gaz) gaz = buildGazetteer((await import('./data/cities.json')).default as [string, string][]);
  return gaz;
}

/** Country of a stored location name ("Austin,Texas,United States" -> "United States"). */
const countryOf = (name: string | null | undefined) => String(name || '').split(',').map((s) => s.trim()).filter(Boolean).pop() || '';

/**
 * The place named in `keyword`, in the "City,Region,Country" form, or
 * null. `near` is the location the keywords were added with: a city name
 * found in several countries (London, England / London, Ontario) prefers
 * that country.
 */
export function placeIn(g: Gazetteer, keyword: string, near?: string | null): string | null {
  const words = keyword.toLowerCase().replace(/[^\p{L}\p{N}.'’\- ]+/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  const home = countryOf(near);
  const pickCity = (key: string, maxIndex: number): string | null => {
    const list = (g.cities.get(key) || []).filter((c) => c.index < maxIndex);
    if (!list.length) return null;
    return (list.find((c) => countryOf(c.name) === home) || list[0]).name;
  };
  // Longest name first at the end: "new york" before "york".
  for (let n = Math.min(g.longest, words.length - 1); n >= 1; n--) {
    const key = words.slice(words.length - n).join(' ');
    const hit = pickCity(key, CITY_LIMIT) || g.regions.get(key) || g.countries.get(key);
    if (hit) return hit;
  }
  for (let n = Math.min(g.longest, words.length - 1); n >= 1; n--) {
    const hit = pickCity(words.slice(0, n).join(' '), START_LIMIT);
    if (hit) return hit;
  }
  return null;
}

/** Keyword -> the place it names, for the keywords that name one. */
export async function placesIn(keywords: string[], near?: string | null): Promise<Map<string, string>> {
  const g = await gazetteer();
  const out = new Map<string, string>();
  for (const k of keywords) {
    const p = placeIn(g, k, near);
    if (p) out.set(k, p);
  }
  return out;
}
