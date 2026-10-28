import { describe, expect, it } from 'vitest';
import { cleanCitationCounts, isRedirectCitationHost, looksLikeDomain } from '../citation-hosts';

describe('isRedirectCitationHost', () => {
  it('matches Google grounding redirect hosts and URLs', () => {
    expect(isRedirectCitationHost('vertexaisearch.cloud.google.com')).toBe(true);
    expect(isRedirectCitationHost('https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC')).toBe(true);
    expect(isRedirectCitationHost('https://example.com/grounding-api-redirect/x')).toBe(true);
    expect(isRedirectCitationHost('https://www.google.com/url?q=https://example.com')).toBe(true);
    expect(isRedirectCitationHost('google.com/url?q=x')).toBe(true);
  });

  it('does not match real publisher hosts', () => {
    expect(isRedirectCitationHost('yelp.com')).toBe(false);
    expect(isRedirectCitationHost('https://www.google.com/maps')).toBe(false);
    expect(isRedirectCitationHost('https://cloud.google.com/vertex-ai')).toBe(false);
    expect(isRedirectCitationHost('')).toBe(false);
  });
});

describe('looksLikeDomain', () => {
  it('accepts bare domains', () => {
    expect(looksLikeDomain('yelp.com')).toBe(true);
    expect(looksLikeDomain('Sub.Example.co.uk')).toBe(true);
  });

  it('rejects titles, URLs and junk', () => {
    expect(looksLikeDomain('Best HVAC in Auburn')).toBe(false);
    expect(looksLikeDomain('https://yelp.com')).toBe(false);
    expect(looksLikeDomain('localhost')).toBe(false);
    expect(looksLikeDomain('')).toBe(false);
  });
});

describe('cleanCitationCounts', () => {
  it('drops redirect hosts and keeps the rest', () => {
    expect(cleanCitationCounts({ 'vertexaisearch.cloud.google.com': 12, 'yelp.com': 3, 'bbb.org': 1 }))
      .toEqual({ 'yelp.com': 3, 'bbb.org': 1 });
  });

  it('handles null and undefined', () => {
    expect(cleanCitationCounts(null)).toEqual({});
    expect(cleanCitationCounts(undefined)).toEqual({});
  });
});
