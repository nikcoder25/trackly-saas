/**
 * NAP Verification engine tests. Covers the two extraction layers
 * (LocalBusiness JSON-LD and regex fallback), per-field normalization,
 * comparison/tagging, and the scoring aggregates.
 */
import { describe, expect, it } from 'vitest';
import {
  compareNap,
  consistencyScore,
  detectDuplicates,
  extractFromSchema,
  extractNap,
  extractUrlsFromText,
  extractWithRegex,
  detectRegression,
  extractionStrength,
  findCitationGaps,
  isWeakExtraction,
  generateLocalBusinessSchema,
  generateSchemaScriptTag,
  normalizeName,
  normalizePhone,
  normalizePostcode,
  phonesMatch,
  registrableDomain,
  type CanonicalNap,
  type ExtractedNap,
} from '../nap-verify';

const CANONICAL: CanonicalNap = {
  name: 'Acme Dental Care',
  phone: '020 7946 0123',
  street: '12 High Street',
  suite: 'Suite 4',
  city: 'London',
  postcode: 'SW1A 1AA',
};

describe('normalization', () => {
  it('strips company suffixes and punctuation from names', () => {
    expect(normalizeName('Acme Dental Care Ltd')).toBe('acme dental care');
    expect(normalizeName('Acme Dental Care')).toBe('acme dental care');
    expect(normalizeName('Acme & Co.')).toBe('acme and');
  });

  it('normalizes UK phone country codes to a leading zero', () => {
    expect(normalizePhone('+44 20 7946 0123')).toBe('02079460123');
    expect(normalizePhone('020 7946 0123')).toBe('02079460123');
    expect(normalizePhone('0044 20 7946 0123')).toBe('02079460123');
  });

  it('matches phones across formatting and country-code variance', () => {
    expect(phonesMatch('020 7946 0123', '+442079460123')).toBe(true);
    expect(phonesMatch('020 7946 0123', '020 7946 9999')).toBe(false);
    expect(phonesMatch('020 7946 0123', undefined)).toBe(false);
  });

  it('normalizes postcodes ignoring case and spacing', () => {
    expect(normalizePostcode('sw1a 1aa')).toBe('SW1A1AA');
    expect(normalizePostcode('SW1A1AA')).toBe('SW1A1AA');
  });
});

describe('extractUrlsFromText — paste + bulk CSV import', () => {
  it('parses a newline-separated paste and adds https://', () => {
    const out = extractUrlsFromText('yelp.com/biz/x\nhttps://yell.com/y');
    expect(out).toEqual(['https://yelp.com/biz/x', 'https://yell.com/y']);
  });

  it('extracts only URL cells from a multi-column CSV, skipping names/headers', () => {
    const csv = [
      'Directory,URL,Rating',
      'Yelp,https://www.yelp.com/biz/acme,4.5',
      'Yell,https://www.yell.com/acme,4.0',
      'Acme Dental Care,not-a-url,5',
    ].join('\n');
    const out = extractUrlsFromText(csv);
    expect(out).toEqual(['https://www.yelp.com/biz/acme', 'https://www.yell.com/acme']);
  });

  it('strips surrounding quotes from CSV cells', () => {
    expect(extractUrlsFromText('"https://example.com/a","Name"')).toEqual([
      'https://example.com/a',
    ]);
  });

  it('does not coerce plain text without a dotted host into a URL', () => {
    expect(extractUrlsFromText('Business Name\nSuite 4\nLondon')).toEqual([]);
  });

  it('de-duplicates and respects the max', () => {
    const out = extractUrlsFromText('a.com\na.com\nb.com\nc.com', 2);
    expect(out).toEqual(['https://a.com/', 'https://b.com/']);
  });
});

describe('Layer 2 — schema extraction', () => {
  const html = `
    <html><head>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "name": "Acme Dental Care",
      "telephone": "+44 20 7946 0123",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "12 High Street, Suite 4",
        "addressLocality": "London",
        "postalCode": "SW1A 1AA"
      }
    }
    </script></head><body>...</body></html>`;

  it('pulls name, phone and address from LocalBusiness JSON-LD', () => {
    const out = extractFromSchema(html);
    expect(out.name).toBe('Acme Dental Care');
    expect(out.phone).toBe('+44 20 7946 0123');
    expect(out.street).toBe('12 High Street, Suite 4');
    expect(out.city).toBe('London');
    expect(out.postcode).toBe('SW1A 1AA');
    expect(out.source?.name).toBe('schema');
  });

  it('handles @graph-wrapped nodes', () => {
    const graph = `<script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"WebSite","name":"Some Site"},
        {"@type":["Dentist","LocalBusiness"],"name":"Acme Dental Care","telephone":"02079460123"}
      ]}</script>`;
    const out = extractFromSchema(graph);
    expect(out.name).toBe('Acme Dental Care');
    expect(out.phone).toBe('02079460123');
  });

  it('returns empty when no business node is present', () => {
    const out = extractFromSchema('<script type="application/ld+json">{"@type":"Article"}</script>');
    expect(out.name).toBeUndefined();
  });
});

describe('Layer 1 — regex extraction', () => {
  it('extracts a tel: link and a UK postcode from raw HTML', () => {
    const html = `<a href="tel:+442079460123">Call us</a><p>12 High Street, London SW1A 1AA</p>`;
    const out = extractWithRegex(html);
    expect(out.phone).toBe('+442079460123');
    expect(normalizePostcode(out.postcode)).toBe('SW1A1AA');
  });

  it('falls back to microdata telephone', () => {
    const html = `<span itemprop="telephone">020 7946 0123</span>`;
    const out = extractWithRegex(html);
    expect(normalizePhone(out.phone)).toBe('02079460123');
  });
});

describe('merge — schema wins over regex', () => {
  it('prefers schema phone but keeps regex postcode when schema lacks it', () => {
    const html = `
      <script type="application/ld+json">
      {"@type":"LocalBusiness","name":"Acme Dental Care","telephone":"02079460123"}
      </script>
      <a href="tel:01234567890">other</a>
      <p>SW1A 1AA</p>`;
    const out = extractNap(html);
    expect(normalizePhone(out.phone)).toBe('02079460123');
    expect(out.source.phone).toBe('schema');
    expect(normalizePostcode(out.postcode)).toBe('SW1A1AA');
    expect(out.source.postcode).toBe('regex');
  });
});

describe('comparison & tagging', () => {
  it('scores a fully matching citation 100 with no tags', () => {
    const extracted = extractNap(`
      <script type="application/ld+json">
      {"@type":"LocalBusiness","name":"Acme Dental Care","telephone":"+442079460123",
       "address":{"@type":"PostalAddress","streetAddress":"12 High Street, Suite 4",
       "addressLocality":"London","postalCode":"SW1A 1AA"}}
      </script>`);
    const cmp = compareNap(CANONICAL, extracted, true);
    expect(cmp.matchScore).toBe(100);
    expect(cmp.tags).toEqual([]);
    expect(cmp.fields.suite.status).toBe('match');
  });

  it('tags a wrong phone', () => {
    const cmp = compareNap(CANONICAL, { phone: '020 7946 9999', source: {} }, true);
    expect(cmp.fields.phone.status).toBe('mismatch');
    expect(cmp.tags).toContain('wrong phone');
  });

  it('tags a name variation for a dropped suffix', () => {
    const cmp = compareNap(CANONICAL, { name: 'Acme Dental Care Ltd', source: {} }, true);
    expect(cmp.fields.name.status).toBe('match');
  });

  it('tags a genuine name mismatch', () => {
    const cmp = compareNap(CANONICAL, { name: 'Different Dentist Group', source: {} }, true);
    expect(cmp.fields.name.status).toBe('mismatch');
    expect(cmp.tags).toContain('wrong name');
  });

  it('tags a missing suite when the address drops the unit', () => {
    const cmp = compareNap(CANONICAL, { street: '12 High Street', source: {} }, true);
    expect(cmp.fields.suite.status).toBe('missing');
    expect(cmp.tags).toContain('missing suite');
  });

  it('tags a wrong postcode', () => {
    const cmp = compareNap(CANONICAL, { postcode: 'EC1A 1BB', source: {} }, true);
    expect(cmp.fields.postcode.status).toBe('mismatch');
    expect(cmp.tags).toContain('wrong postcode');
  });

  it('short-circuits unreachable pages to a dead-link result', () => {
    const cmp = compareNap(CANONICAL, { source: {} }, false);
    expect(cmp.matchScore).toBe(0);
    expect(cmp.tags).toEqual(['dead link']);
  });

  it('only scores fields the canonical record defines', () => {
    const minimal: CanonicalNap = { name: 'Acme Dental Care' };
    const cmp = compareNap(minimal, { name: 'Acme Dental Care', source: {} }, true);
    expect(cmp.matchScore).toBe(100);
  });
});

describe('findCitationGaps', () => {
  it('splits recommended directories into present vs missing by registrable domain', () => {
    const covered = ['https://www.yelp.com/biz/acme', 'https://yell.com/acme'];
    const recommended = [
      { domain: 'yelp.com', reason: 'big' },
      { domain: 'www.bing.com/maps', reason: 'maps' },
      { domain: 'thomsonlocal.com' },
    ];
    const gaps = findCitationGaps(covered, recommended);
    expect(gaps.present.map((d) => d.domain)).toEqual(['yelp.com']);
    expect(gaps.missing.map((d) => d.domain).sort()).toEqual(['bing.com', 'thomsonlocal.com']);
    expect(gaps.covered).toContain('yelp.com');
  });

  it('de-duplicates recommended domains', () => {
    const gaps = findCitationGaps([], [{ domain: 'yelp.com' }, { domain: 'www.yelp.com' }]);
    expect(gaps.missing).toHaveLength(1);
  });
});

describe('extractionStrength / isWeakExtraction (Layer 3 gating)', () => {
  it('counts populated fields', () => {
    expect(extractionStrength({ source: {} })).toBe(0);
    expect(extractionStrength({ name: 'A', phone: '1', source: {} })).toBe(2);
  });
  it('treats a schema-rich extraction as strong', () => {
    const e = { name: 'A', phone: '1', source: { name: 'schema' as const } };
    expect(isWeakExtraction(e)).toBe(false);
  });
  it('treats a thin or schema-less extraction as weak', () => {
    expect(isWeakExtraction({ name: 'A', source: { name: 'regex' } })).toBe(true);
    expect(isWeakExtraction({ name: 'A', phone: '1', source: { name: 'regex', phone: 'regex' } })).toBe(true);
  });
});

describe('generateLocalBusinessSchema', () => {
  it('builds a LocalBusiness node combining street + suite', () => {
    const s = generateLocalBusinessSchema(CANONICAL) as Record<string, unknown>;
    expect(s['@type']).toBe('LocalBusiness');
    expect(s.name).toBe('Acme Dental Care');
    expect(s.telephone).toBe('020 7946 0123');
    expect(s.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: '12 High Street, Suite 4',
      addressLocality: 'London',
      postalCode: 'SW1A 1AA',
    });
  });

  it('omits absent fields and drops an empty address', () => {
    const s = generateLocalBusinessSchema({ name: 'Solo Co' }) as Record<string, unknown>;
    expect(s.name).toBe('Solo Co');
    expect(s.telephone).toBeUndefined();
    expect(s.address).toBeUndefined();
  });

  it('wraps the snippet in a ld+json script tag', () => {
    const tag = generateSchemaScriptTag(CANONICAL);
    expect(tag).toContain('<script type="application/ld+json">');
    expect(tag).toContain('"@type": "LocalBusiness"');
    expect(tag.trim().endsWith('</script>')).toBe(true);
  });
});

describe('registrableDomain', () => {
  it('strips www and subdomains to eTLD+1', () => {
    expect(registrableDomain('https://www.yelp.com/biz/x')).toBe('yelp.com');
    expect(registrableDomain('https://en.shop.example.com/p')).toBe('example.com');
  });
  it('keeps multi-part UK suffixes intact', () => {
    expect(registrableDomain('https://www.example.co.uk/listing')).toBe('example.co.uk');
    expect(registrableDomain('https://sub.example.co.uk')).toBe('example.co.uk');
  });
});

describe('detectDuplicates', () => {
  const mk = (url: string, extracted: Partial<ExtractedNap> = {}, reachable = true) => ({
    url,
    reachable,
    extracted: { source: {}, ...extracted } as ExtractedNap,
  });

  it('groups multiple URLs on the same directory domain', () => {
    const groups = detectDuplicates([
      mk('https://www.yelp.com/biz/acme-1'),
      mk('https://www.yelp.com/biz/acme-2'),
      mk('https://www.yell.com/acme'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].domain).toBe('yelp.com');
    expect(groups[0].urls).toHaveLength(2);
    expect(groups[0].conflicting).toBe(false);
  });

  it('flags duplicates with disagreeing phone numbers as conflicting', () => {
    const groups = detectDuplicates([
      mk('https://www.yelp.com/biz/acme-1', { phone: '020 7946 0123' }),
      mk('https://www.yelp.com/biz/acme-2', { phone: '020 7946 9999' }),
    ]);
    expect(groups[0].conflicting).toBe(true);
  });

  it('returns nothing when every directory is unique', () => {
    expect(
      detectDuplicates([mk('https://a.com/x'), mk('https://b.com/y')]),
    ).toEqual([]);
  });
});

describe('detectRegression (scheduled monitoring)', () => {
  it('flags a meaningful score drop', () => {
    const r = detectRegression({ score: 90, deadLinks: 0, withIssues: 1 }, { score: 80, deadLinks: 0, withIssues: 1 });
    expect(r.regressed).toBe(true);
    expect(r.reasons[0]).toMatch(/dropped/);
  });
  it('flags new dead links and new issues', () => {
    const r = detectRegression({ score: 90, deadLinks: 0, withIssues: 1 }, { score: 90, deadLinks: 2, withIssues: 3 });
    expect(r.regressed).toBe(true);
    expect(r.reasons).toHaveLength(2);
  });
  it('does not flag a small dip or an improvement', () => {
    expect(detectRegression({ score: 90, deadLinks: 0, withIssues: 0 }, { score: 88, deadLinks: 0, withIssues: 0 }).regressed).toBe(false);
    expect(detectRegression({ score: 70, deadLinks: 2, withIssues: 3 }, { score: 95, deadLinks: 0, withIssues: 0 }).regressed).toBe(false);
  });
});

describe('consistencyScore', () => {
  it('averages per-citation scores', () => {
    expect(consistencyScore([{ matchScore: 100 }, { matchScore: 50 }, { matchScore: 0 }])).toBe(50);
  });
  it('returns 0 for an empty set', () => {
    expect(consistencyScore([])).toBe(0);
  });
});
