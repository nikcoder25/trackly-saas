/**
 * NAP Verification engine — the extraction + matching core for the local
 * SEO citation auditor. Everything in this file is pure (no network, no DB)
 * so it can be unit-tested in isolation. The route layer (api/tools/
 * nap-checker) is responsible for fetching pages with safeFetch and feeding
 * the raw HTML in here.
 *
 * Two extraction layers, applied per field with schema winning over regex:
 *   Layer 2 — LocalBusiness JSON-LD (cleanest, structured).
 *   Layer 1 — regex over raw HTML (tel: links, microdata, postcode/phone).
 * A Layer 3 (headless browser) is intentionally out of scope here.
 */

export type ExtractLayer = 'schema' | 'regex';

export type FieldStatus = 'match' | 'variation' | 'mismatch' | 'missing';

/** The client's known-good NAP. Address is split so we can flag a missing suite. */
export interface CanonicalNap {
  name: string;
  phone?: string;
  street?: string;
  suite?: string;
  city?: string;
  postcode?: string;
}

/** What we managed to pull off a citation page. */
export interface ExtractedNap {
  name?: string;
  phone?: string;
  street?: string;
  city?: string;
  postcode?: string;
  /** Which layer produced each field, for transparency in the UI. */
  source: Partial<Record<'name' | 'phone' | 'street' | 'city' | 'postcode', ExtractLayer>>;
}

export interface FieldResult {
  status: FieldStatus;
  expected?: string;
  found?: string;
}

export interface CompareResult {
  fields: {
    name: FieldResult;
    phone: FieldResult;
    address: FieldResult;
    postcode: FieldResult;
    suite: FieldResult;
  };
  /** Human-readable mismatch tags, e.g. "wrong phone", "missing suite". */
  tags: string[];
  /** 0-100 match score for this single citation. */
  matchScore: number;
}

export interface UrlResult extends CompareResult {
  url: string;
  httpStatus: number | null;
  reachable: boolean;
  error?: string;
  extracted: ExtractedNap;
  /** True when the page was re-fetched through the headless render service (Layer 3). */
  rendered?: boolean;
}

/** Count of populated NAP fields — used to decide whether Layer 3 is worth trying. */
export function extractionStrength(e: ExtractedNap): number {
  return (['name', 'phone', 'street', 'city', 'postcode'] as const).filter((k) => e[k]).length;
}

/** True when an extraction is weak enough to justify a headless re-render. */
export function isWeakExtraction(e: ExtractedNap): boolean {
  return extractionStrength(e) < 2 || !Object.values(e.source).includes('schema');
}

// ── URL list parsing (paste + bulk CSV import) ───────────────────────────────

// A token is "URL-ish" only if it has a dotted host (and optional scheme/path).
// Requiring the dot is what stops CSV junk like a "Business Name" cell from
// being coerced into https://Business%20Name.
const URLISH_RE =
  /^(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;

/**
 * Extract citation URLs from free-form text or CSV. Splits on newlines and
 * commas so a pasted list, a single-column CSV, or a multi-column CSV export
 * all work — non-URL cells (names, ratings, headers) are simply skipped.
 * Bare domains get an https:// scheme; results are normalized and de-duped.
 */
export function extractUrlsFromText(text: string, max = 50): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawCell of text.split(/[\n,]+/)) {
    let cell = rawCell.trim().replace(/^["']+|["']+$/g, '').trim();
    if (!cell || !URLISH_RE.test(cell)) continue;
    if (!/^https?:\/\//i.test(cell)) cell = 'https://' + cell;
    try {
      const u = new URL(cell);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      const norm = u.toString();
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push(norm);
    } catch {
      /* skip unparseable cell */
    }
    if (out.length >= max) break;
  }
  return out;
}

// ── Normalization helpers ────────────────────────────────────────────────────

const COMPANY_SUFFIXES = [
  'ltd', 'limited', 'llc', 'inc', 'incorporated', 'co', 'corp', 'corporation',
  'plc', 'llp', 'gmbh', 'company',
];

export function normalizeName(raw: string | undefined): string {
  if (!raw) return '';
  let s = raw.toLowerCase();
  s = s.replace(/&/g, ' and ');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // Drop trailing company suffixes ("Acme Ltd" === "Acme").
  const parts = s.split(' ');
  while (parts.length > 1 && COMPANY_SUFFIXES.includes(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts.join(' ');
}

/**
 * Reduce a phone number to comparable digits. Handles UK-style country codes
 * (+44 / 0044 → leading 0) and falls back to a last-significant-digits compare
 * at the call site for international variance.
 */
export function normalizePhone(raw: string | undefined): string {
  if (!raw) return '';
  let digits = raw.replace(/[^\d+]/g, '');
  digits = digits.replace(/^00/, '+');
  if (digits.startsWith('+44')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('+1')) digits = digits.slice(2);
  else if (digits.startsWith('+')) digits = digits.slice(1);
  return digits.replace(/\D/g, '');
}

export function phonesMatch(a: string | undefined, b: string | undefined): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Tolerate country-code/trunk-prefix variance by comparing the last 9 digits.
  const tail = (s: string) => s.slice(-9);
  return na.length >= 9 && nb.length >= 9 && tail(na) === tail(nb);
}

export function normalizePostcode(raw: string | undefined): string {
  if (!raw) return '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeAddressLine(raw: string | undefined): string {
  if (!raw) return '';
  let s = raw.toLowerCase();
  s = s.replace(/[.,#]/g, ' ');
  s = s.replace(/\b(street|st)\b/g, 'st');
  s = s.replace(/\b(road|rd)\b/g, 'rd');
  s = s.replace(/\b(avenue|ave)\b/g, 'ave');
  s = s.replace(/\b(suite|ste|unit|apt|apartment|floor|fl)\b/g, 'suite');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

/** True when every token of the smaller set appears in the larger set. */
function isTokenSubset(a: string, b: string): boolean {
  const ta = a.split(' ').filter(Boolean);
  const tb = b.split(' ').filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return false;
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const set = new Set(large);
  return small.every((t) => set.has(t));
}

/** Classic Levenshtein, used only for short business-name comparison. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

// ── Layer 2: schema (JSON-LD) extraction ─────────────────────────────────────

const BUSINESS_TYPE_RE = /(LocalBusiness|Organization|Store|Restaurant|Hotel|Dentist|Physician|ProfessionalService|Corporation|MedicalBusiness|FoodEstablishment|HomeAndConstructionBusiness|AutomotiveBusiness|LegalService|FinancialService)/i;

function typeMatches(type: unknown): boolean {
  if (typeof type === 'string') return BUSINESS_TYPE_RE.test(type);
  if (Array.isArray(type)) return type.some((t) => typeof t === 'string' && BUSINESS_TYPE_RE.test(t));
  return false;
}

function collectNodes(node: unknown, out: Record<string, unknown>[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectNodes(n, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  out.push(obj);
  if (Array.isArray(obj['@graph'])) collectNodes(obj['@graph'], out);
}

function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = asString(item);
      if (s) return s;
    }
  }
  return undefined;
}

export function extractFromSchema(html: string): Partial<ExtractedNap> {
  const out: Partial<ExtractedNap> = { source: {} };
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const nodes: Record<string, unknown>[] = [];
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      collectNodes(JSON.parse(raw), nodes);
    } catch {
      // Some sites emit multiple JSON objects in one block or trailing junk.
      // Be lenient: try to recover the first valid object.
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          collectNodes(JSON.parse(raw.slice(firstBrace, lastBrace + 1)), nodes);
        } catch {
          /* give up on this block */
        }
      }
    }
  }

  const biz = nodes.find((n) => typeMatches(n['@type']));
  if (!biz) return out;

  const name = asString(biz.name) || asString(biz.legalName);
  if (name) {
    out.name = name;
    out.source!.name = 'schema';
  }
  const phone = asString(biz.telephone);
  if (phone) {
    out.phone = phone;
    out.source!.phone = 'schema';
  }

  const addr = biz.address;
  if (addr && typeof addr === 'object' && !Array.isArray(addr)) {
    const a = addr as Record<string, unknown>;
    const street = asString(a.streetAddress);
    const city = asString(a.addressLocality);
    const postcode = asString(a.postalCode);
    if (street) { out.street = street; out.source!.street = 'schema'; }
    if (city) { out.city = city; out.source!.city = 'schema'; }
    if (postcode) { out.postcode = postcode; out.source!.postcode = 'schema'; }
  } else {
    const flat = asString(addr);
    if (flat) { out.street = flat; out.source!.street = 'schema'; }
  }

  return out;
}

// ── Layer 1: regex extraction ────────────────────────────────────────────────

// UK postcode, then a looser US ZIP fallback.
const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/i;
const US_ZIP_RE = /\b(\d{5}(?:-\d{4})?)\b/;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function extractWithRegex(html: string): Partial<ExtractedNap> {
  const out: Partial<ExtractedNap> = { source: {} };

  // Phone: prefer an explicit tel: link, then a microdata itemprop, then a
  // loose number pattern in the body.
  const tel = html.match(/href=["']tel:([+\d][\d\s().\-]{6,})["']/i);
  if (tel) {
    out.phone = decodeEntities(tel[1].trim());
    out.source!.phone = 'regex';
  } else {
    const ip = html.match(/itemprop=["']telephone["'][^>]*>\s*([+\d][\d\s().\-]{6,})/i);
    if (ip) {
      out.phone = decodeEntities(ip[1].trim());
      out.source!.phone = 'regex';
    } else {
      const text = stripTags(html);
      const loose = text.match(/(\+?\d[\d\s().\-]{8,}\d)/);
      if (loose && normalizePhone(loose[1]).length >= 9) {
        out.phone = loose[1].trim();
        out.source!.phone = 'regex';
      }
    }
  }

  // Postcode.
  const text = stripTags(html);
  const uk = text.match(UK_POSTCODE_RE);
  if (uk) {
    out.postcode = uk[1].toUpperCase().replace(/\s+/g, ' ').trim();
    out.source!.postcode = 'regex';
  } else {
    const zip = text.match(US_ZIP_RE);
    if (zip) {
      out.postcode = zip[1];
      out.source!.postcode = 'regex';
    }
  }

  // Microdata street, if present.
  const street = html.match(/itemprop=["']streetAddress["'][^>]*>\s*([^<]{3,120})</i);
  if (street) {
    out.street = decodeEntities(street[1].trim());
    out.source!.street = 'regex';
  }

  return out;
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

/** Merge both layers, schema winning field-by-field. */
export function extractNap(html: string): ExtractedNap {
  const schema = extractFromSchema(html);
  const regex = extractWithRegex(html);
  const merged: ExtractedNap = { source: {} };
  for (const key of ['name', 'phone', 'street', 'city', 'postcode'] as const) {
    if (schema[key]) {
      merged[key] = schema[key];
      merged.source[key] = 'schema';
    } else if (regex[key]) {
      merged[key] = regex[key];
      merged.source[key] = 'regex';
    }
  }
  return merged;
}

// ── Matching & scoring ───────────────────────────────────────────────────────

// Per-field weight when computing the score. Phone and name carry the most
// signal for a citation; suite is a soft signal so it's weighted lightest.
const WEIGHTS = { name: 30, phone: 30, address: 20, postcode: 15, suite: 5 } as const;

function compareName(canonical: string, found: string | undefined): FieldResult {
  if (!found) return { status: 'missing', expected: canonical };
  const a = normalizeName(canonical);
  const b = normalizeName(found);
  if (a === b) return { status: 'match', expected: canonical, found };
  const sim = nameSimilarity(a, b);
  if (sim >= 0.8 || a.includes(b) || b.includes(a)) {
    return { status: 'variation', expected: canonical, found };
  }
  return { status: 'mismatch', expected: canonical, found };
}

function comparePhone(canonical: string, found: string | undefined): FieldResult {
  if (!found) return { status: 'missing', expected: canonical };
  return phonesMatch(canonical, found)
    ? { status: 'match', expected: canonical, found }
    : { status: 'mismatch', expected: canonical, found };
}

function comparePostcode(canonical: string, found: string | undefined): FieldResult {
  if (!found) return { status: 'missing', expected: canonical };
  return normalizePostcode(canonical) === normalizePostcode(found)
    ? { status: 'match', expected: canonical, found }
    : { status: 'mismatch', expected: canonical, found };
}

function compareAddress(canonicalStreet: string, found: string | undefined): FieldResult {
  if (!found) return { status: 'missing', expected: canonicalStreet };
  const a = normalizeAddressLine(canonicalStreet);
  const b = normalizeAddressLine(found);
  if (a === b) return { status: 'match', expected: canonicalStreet, found };
  // The found value often carries extra tokens (e.g. an appended suite). If
  // every token of one side is present in the other, treat it as a match.
  if (isTokenSubset(a, b)) return { status: 'match', expected: canonicalStreet, found };
  const overlap = tokenOverlap(a, b);
  if (overlap >= 0.6) return { status: 'variation', expected: canonicalStreet, found };
  return { status: 'mismatch', expected: canonicalStreet, found };
}

function compareSuite(suite: string, foundStreet: string | undefined): FieldResult {
  const norm = normalizeAddressLine(foundStreet);
  const suiteNorm = normalizeAddressLine(suite);
  // Match if any meaningful suite token (e.g. the unit number) survives.
  const tokens = suiteNorm.split(' ').filter((t) => t && t !== 'suite');
  const present = tokens.length > 0 && tokens.every((t) => norm.includes(t));
  return present
    ? { status: 'match', expected: suite, found: foundStreet }
    : { status: 'missing', expected: suite, found: foundStreet };
}

/**
 * Compare one extracted NAP against the canonical record. `reachable` is the
 * dead-link signal from the fetch layer; an unreachable page short-circuits to
 * a zero score with a single "dead link" tag.
 */
export function compareNap(
  canonical: CanonicalNap,
  extracted: ExtractedNap,
  reachable: boolean,
): CompareResult {
  if (!reachable) {
    const dead: FieldResult = { status: 'missing' };
    return {
      fields: { name: dead, phone: dead, address: dead, postcode: dead, suite: dead },
      tags: ['dead link'],
      matchScore: 0,
    };
  }

  const fields: CompareResult['fields'] = {
    name: compareName(canonical.name, extracted.name),
    phone: canonical.phone
      ? comparePhone(canonical.phone, extracted.phone)
      : { status: 'missing' },
    address: canonical.street
      ? compareAddress(canonical.street, extracted.street)
      : { status: 'missing' },
    postcode: canonical.postcode
      ? comparePostcode(canonical.postcode, extracted.postcode)
      : { status: 'missing' },
    suite: canonical.suite
      ? compareSuite(canonical.suite, extracted.street)
      : { status: 'match' }, // no suite to check → not a penalty
  };

  const tags: string[] = [];
  if (fields.name.status === 'variation') tags.push('name variation');
  if (fields.name.status === 'mismatch') tags.push('wrong name');
  if (fields.name.status === 'missing') tags.push('missing name');
  if (fields.phone.status === 'mismatch') tags.push('wrong phone');
  if (fields.phone.status === 'missing' && canonical.phone) tags.push('missing phone');
  if (fields.address.status === 'mismatch') tags.push('old address');
  if (fields.address.status === 'variation') tags.push('address variation');
  if (fields.address.status === 'missing' && canonical.street) tags.push('missing address');
  if (fields.postcode.status === 'mismatch') tags.push('wrong postcode');
  if (canonical.suite && fields.suite.status === 'missing') tags.push('missing suite');

  // Score: weighted sum over only the fields the canonical record defines.
  let earned = 0;
  let possible = 0;
  const credit = (status: FieldStatus): number =>
    status === 'match' ? 1 : status === 'variation' ? 0.5 : 0;

  const consider: Array<[keyof typeof WEIGHTS, boolean, FieldResult]> = [
    ['name', true, fields.name],
    ['phone', !!canonical.phone, fields.phone],
    ['address', !!canonical.street, fields.address],
    ['postcode', !!canonical.postcode, fields.postcode],
    ['suite', !!canonical.suite, fields.suite],
  ];
  for (const [key, defined, fr] of consider) {
    if (!defined) continue;
    possible += WEIGHTS[key];
    earned += WEIGHTS[key] * credit(fr.status);
  }

  const matchScore = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  return { fields, tags, matchScore };
}

/** Average per-citation score across every result (dead links count as 0). */
export function consistencyScore(results: Array<{ matchScore: number }>): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + r.matchScore, 0);
  return Math.round(sum / results.length);
}

// ── Citation gap finder (Phase 3) ────────────────────────────────────────────

export interface RecommendedDirectory {
  domain: string;
  reason?: string;
}

export interface CitationGapResult {
  /** Registrable domains the business is already cited on. */
  covered: string[];
  /** Recommended directories the business already covers. */
  present: RecommendedDirectory[];
  /** Recommended directories the business is missing — the build worklist. */
  missing: RecommendedDirectory[];
}

function toRegistrable(s: string): string {
  return registrableDomain(/^https?:\/\//i.test(s) ? s : `https://${s}`);
}

/**
 * Diff a set of recommended/competitor directories against the directories the
 * business is already cited on. Domains are compared at the registrable level
 * so "www.yelp.com/biz/x" matches a recommended "yelp.com".
 */
export function findCitationGaps(
  coveredUrls: string[],
  recommended: RecommendedDirectory[],
): CitationGapResult {
  const covered = new Set(coveredUrls.map(toRegistrable).filter(Boolean));
  const present: RecommendedDirectory[] = [];
  const missing: RecommendedDirectory[] = [];
  const seen = new Set<string>();
  for (const rec of recommended) {
    const domain = toRegistrable(rec.domain);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    const entry: RecommendedDirectory = { domain, reason: rec.reason };
    (covered.has(domain) ? present : missing).push(entry);
  }
  return { covered: Array.from(covered).sort(), present, missing };
}

// ── Schema generator (Phase 3) ───────────────────────────────────────────────

/**
 * Build a LocalBusiness JSON-LD object from a canonical NAP. For directories
 * (or the client's own site) that ship no structured data, this is the snippet
 * to paste so future extraction lands on the clean Layer-2 path. Only fields
 * that are present are emitted — no empty keys.
 */
export function generateLocalBusinessSchema(c: CanonicalNap): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: c.name,
  };
  if (c.phone) schema.telephone = c.phone;

  const address: Record<string, unknown> = { '@type': 'PostalAddress' };
  const streetAddress = [c.street, c.suite].filter(Boolean).join(', ');
  if (streetAddress) address.streetAddress = streetAddress;
  if (c.city) address.addressLocality = c.city;
  if (c.postcode) address.postalCode = c.postcode;
  // Only attach address if it carries more than the @type.
  if (Object.keys(address).length > 1) schema.address = address;

  return schema;
}

/** The full <script> tag, ready to paste into a page <head>. */
export function generateSchemaScriptTag(c: CanonicalNap): string {
  const json = JSON.stringify(generateLocalBusinessSchema(c), null, 2);
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

// ── Duplicate listing detection ──────────────────────────────────────────────

// Common multi-label public suffixes, so "shop.example.co.uk" collapses to
// "example.co.uk" rather than "co.uk". Not the full PSL — just the suffixes a
// UK/AU/etc. local business is realistically listed under.
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au', 'co.nz', 'co.za', 'com.br', 'co.in', 'co.jp',
]);

/** Best-effort registrable domain (eTLD+1) for grouping citations by directory. */
export function registrableDomain(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return parts.slice(-3).join('.');
  return lastTwo;
}

export interface DuplicateGroup {
  /** The directory/domain hosting more than one of the supplied citations. */
  domain: string;
  urls: string[];
  /** True when the duplicate listings disagree on phone, name or postcode. */
  conflicting: boolean;
}

/**
 * Flag directories that appear more than once in the citation set — a likely
 * duplicate listing, which dilutes ranking signal and is a priority cleanup in
 * any local SEO audit. Duplicates that also disagree on NAP are flagged
 * `conflicting`, the most damaging variant.
 */
export function detectDuplicates(
  results: Array<{ url: string; reachable: boolean; extracted: ExtractedNap }>,
): DuplicateGroup[] {
  const byDomain = new Map<string, typeof results>();
  for (const r of results) {
    const domain = registrableDomain(r.url);
    if (!domain) continue;
    const bucket = byDomain.get(domain);
    if (bucket) bucket.push(r);
    else byDomain.set(domain, [r]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [domain, rs] of byDomain) {
    if (rs.length < 2) continue;
    const live = rs.filter((r) => r.reachable);
    const phones = new Set(live.map((r) => normalizePhone(r.extracted.phone)).filter(Boolean));
    const names = new Set(live.map((r) => normalizeName(r.extracted.name)).filter(Boolean));
    const postcodes = new Set(live.map((r) => normalizePostcode(r.extracted.postcode)).filter(Boolean));
    const conflicting = phones.size > 1 || names.size > 1 || postcodes.size > 1;
    groups.push({ domain, urls: rs.map((r) => r.url), conflicting });
  }
  // Most-duplicated first, then conflicting ahead of clean.
  return groups.sort(
    (a, b) => b.urls.length - a.urls.length || Number(b.conflicting) - Number(a.conflicting),
  );
}
