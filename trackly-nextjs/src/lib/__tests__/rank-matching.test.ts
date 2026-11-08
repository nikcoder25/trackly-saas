/** Rank matching against real-shaped DataForSEO SERPs (Google-wrapped links) and the one-off location fixes. */
import { describe, expect, it } from 'vitest';
import { findRank, matchesDomain } from '../rank-tracking/domain';
import { checkTaskBody, isGoogleWrapper, parseOrganic, urlFromBreadcrumb } from '../rank-tracking/providers/dataforseo';
import { RANK_DATA_FIXES, ruleFor } from '../rank-tracking/data-fixes';

// Shape of a real answer for "miniml", United Kingdom, 2026-11-08.
const WRAPPED = [
  { type: 'organic', rank_group: 1, domain: 'google.com', url: 'https://google.com/goto?url=CAESjQEBxCJF10C9', breadcrumb: 'https://www.amazon.co.uk › stores › Miniml › page' },
  { type: 'organic', rank_group: 2, domain: 'google.com', url: 'https://google.com/goto?url=CAESaAHEIkXXzh2x', breadcrumb: 'https://minimlrefills.co.uk › pages › stockists' },
  { type: 'organic', rank_group: 3, domain: 'google.com', url: 'https://google.com/goto?url=CAESaAHEIkXX7uBW', breadcrumb: '4k+ followers' },
  { type: 'ai_overview', rank_group: 1 },
  { type: 'organic', rank_group: 4, domain: 'google.com', url: 'https://google.com/goto?url=CAESdwHEIkXX', breadcrumb: 'https://minimlrefills.co.uk › products › laundry-liquid-r...' },
  { type: 'organic', rank_group: 5, domain: 'www.miniml.ai', url: 'https://www.miniml.ai/about/' },
];

describe('Google-wrapped results', () => {
  it('spots the wrapper', () => {
    expect(isGoogleWrapper('https://google.com/goto?url=abc', 'google.com')).toBe(true);
    expect(isGoogleWrapper('https://www.google.co.uk/url?q=https://x.com', 'google.co.uk')).toBe(true);
    expect(isGoogleWrapper('https://support.google.com/foo', 'support.google.com')).toBe(false);
    expect(isGoogleWrapper('https://www.google.com/maps/place/x', 'google.com')).toBe(false);
  });
  it('reads the site from the breadcrumb', () => {
    expect(urlFromBreadcrumb('https://minimlrefills.co.uk › pages › stockists')).toBe('https://minimlrefills.co.uk/pages/stockists');
    expect(urlFromBreadcrumb('https://minimlrefills.co.uk › products › laundry-liquid-r...')).toBe('https://minimlrefills.co.uk/products');
    expect(urlFromBreadcrumb('https://uk.trustpilot.com › ... › Toiletries Shop')).toBe('https://uk.trustpilot.com/');
    expect(urlFromBreadcrumb('4k+ followers')).toBeNull();
  });
  it('parses real domains and matches url or domain', () => {
    const org = parseOrganic(WRAPPED, 1);
    expect(org.map((o) => o.domain)).toEqual(['amazon.co.uk', 'minimlrefills.co.uk', '', 'minimlrefills.co.uk', 'miniml.ai']);
    expect(findRank(org, 'minimlrefills.co.uk')?.position).toBe(2);
    expect(findRank(org, 'https://miniml.ai/')?.position).toBe(5);
    expect(findRank(org, 'miniml.ai', 4)).toBeNull();
    expect(findRank(org, 'google.com')).toBeNull();
    // url matches even when the domain field is something else
    expect(findRank([{ position: 7, url: 'http://blog.miniml.ai/x/', domain: 'cdn.net', title: '' }], 'miniml.ai')?.position).toBe(7);
  });
  it('treats www, http(s), subdomains and trailing slashes alike', () => {
    for (const c of ['miniml.ai', 'www.miniml.ai', 'http://miniml.ai', 'https://www.miniml.ai/', 'https://app.miniml.ai/path/?q=1', 'MINIML.AI.']) {
      expect(matchesDomain(c, 'https://www.miniml.ai/')).toBe(true);
    }
    expect(matchesDomain('minimlrefills.co.uk', 'miniml.ai')).toBe(false);
    expect(matchesDomain('notminiml.ai', 'miniml.ai')).toBe(false);
  });
});

describe('Standard queue task', () => {
  it('is one depth-30 priority-1 task tagged with the keyword id', () => {
    expect(checkTaskBody({ tag: 'kw1', keyword: 'miniml', locationCode: 2826, locationName: 'United Kingdom', device: 'desktop', language: 'en', depth: 30 }))
      .toEqual({ keyword: 'miniml', language_code: 'en', device: 'desktop', depth: 30, priority: 1, tag: 'kw1', location_code: 2826 });
  });
});

describe('location fixes', () => {
  const easy = RANK_DATA_FIXES.find((f) => f.domain === 'easypump.co.uk')!;
  const miniml = RANK_DATA_FIXES.find((f) => f.domain === 'miniml.ai')!;
  const town = (kw: string) => ruleFor(easy, kw)?.name.split(',')[0] ?? 'London';
  it('moves easypump town keywords to their town and keeps London ones', () => {
    // The live keyword list on 2026-11-08.
    expect(Object.fromEntries([
      'cement pump hire', 'concrete boom', 'concrete boom pump hire london', 'concrete leighton buzzard', 'concrete line pump hire london',
      'concrete pump hatfield', 'concrete pump hire amersham', 'concrete pump hire aylesbury', 'concrete pump hire bedford',
      'concrete pump hire bedfordshire', 'concrete pump hire buckinghamshire', 'concrete pump hire chelmsford', 'concrete pump hire chesham',
      'concrete pump hire dunstable', 'concrete pump hire essex', 'concrete pump hire harlow', 'concrete pump hire hatfield',
      'concrete pump hire hertfordshire', 'concrete pump hire kettering', 'concrete pump hire london', 'concrete pump hire luton',
      'concrete pump hire stevenage', 'concrete pump hire watford', 'concrete pump hire wembley', 'concrete pumping luton',
      'concrete pumping st albans', 'concrete pumping stevenage', 'concrete pumping welwyn garden city', 'line pumps hertfordshire',
      'static concrete pump hire', 'mini concrete pump hire london',
    ].map((k) => [k, town(k)]))).toEqual({
      'cement pump hire': 'London', 'concrete boom': 'London', 'concrete boom pump hire london': 'London', 'concrete leighton buzzard': 'Leighton Buzzard',
      'concrete line pump hire london': 'London', 'concrete pump hatfield': 'Hatfield', 'concrete pump hire amersham': 'Amersham',
      'concrete pump hire aylesbury': 'Aylesbury', 'concrete pump hire bedford': 'Bedford', 'concrete pump hire bedfordshire': 'Bedford',
      'concrete pump hire buckinghamshire': 'Aylesbury', 'concrete pump hire chelmsford': 'Chelmsford', 'concrete pump hire chesham': 'Chesham',
      'concrete pump hire dunstable': 'Dunstable', 'concrete pump hire essex': 'Chelmsford', 'concrete pump hire harlow': 'Harlow',
      'concrete pump hire hatfield': 'Hatfield', 'concrete pump hire hertfordshire': 'Hertford', 'concrete pump hire kettering': 'Kettering',
      'concrete pump hire london': 'London', 'concrete pump hire luton': 'Luton', 'concrete pump hire stevenage': 'Stevenage',
      'concrete pump hire watford': 'Watford', 'concrete pump hire wembley': 'Wembley', 'concrete pumping luton': 'Luton',
      'concrete pumping st albans': 'St Albans', 'concrete pumping stevenage': 'Stevenage', 'concrete pumping welwyn garden city': 'Welwyn Garden City',
      'line pumps hertfordshire': 'Hertford', 'static concrete pump hire': 'London', 'mini concrete pump hire london': 'London',
    });
    expect(ruleFor(easy, 'concrete pump hatfield')?.name).toBe('Hatfield,Hertfordshire,England,United Kingdom');
  });
  it('moves the four miniml.ai US keywords only', () => {
    expect(ruleFor(miniml, 'ai visibility consultants washington dc')?.code).toBe(1014895);
    expect(ruleFor(miniml, 'nlp ai consulting companies ny')?.name).toBe('New York,New York,United States');
    expect(ruleFor(miniml, 'ai consulting')).toBeNull();
  });
});
