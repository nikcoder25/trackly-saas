import { describe, it, expect } from 'vitest';
import { normalizeAuditUrl, decodeHtmlEntities, geoFindingTone, pickCategoryFinding, scoreTone } from '@/lib/geo-audit-utils';

describe('normalizeAuditUrl', () => {
  it('prepends https:// to a bare domain', () => {
    expect(normalizeAuditUrl('livesov.com')).toBe('https://livesov.com');
    expect(normalizeAuditUrl('  livesov.com/pricing ')).toBe('https://livesov.com/pricing');
    expect(normalizeAuditUrl('//livesov.com')).toBe('https://livesov.com');
  });
  it('leaves URLs with a protocol alone', () => {
    expect(normalizeAuditUrl('http://livesov.com')).toBe('http://livesov.com');
    expect(normalizeAuditUrl('https://livesov.com')).toBe('https://livesov.com');
    expect(normalizeAuditUrl('')).toBe('');
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes named and numeric references', () => {
    expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decodeHtmlEntities('It&#39;s &quot;here&quot; &#x2013; now')).toBe('It\'s "here" – now');
    expect(decodeHtmlEntities('a &lt;b&gt;')).toBe('a <b>');
  });
  it('decodes only once and leaves unknown entities', () => {
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeHtmlEntities('&bogus; & plain')).toBe('&bogus; & plain');
  });
});

describe('finding tones', () => {
  it('classifies findings', () => {
    expect(geoFindingTone('Has clear H1 heading')).toBe('pos');
    expect(geoFindingTone('No excessive ad indicators detected')).toBe('pos');
    expect(geoFindingTone('Missing H1 heading')).toBe('neg');
    expect(geoFindingTone('Has only 1 H2 section - consider adding more')).toBe('warn');
    expect(geoFindingTone('Slow page load (4000ms) - aim for under 3 seconds')).toBe('warn');
  });
  it('maps scores to tones', () => {
    expect(scoreTone(85)).toBe('pos');
    expect(scoreTone(55)).toBe('warn');
    expect(scoreTone(10)).toBe('neg');
  });
  it('picks a finding that agrees with the score', () => {
    expect(pickCategoryFinding(90, ['Missing H1 heading', 'Has 3 H2 sections'])).toBe('Has 3 H2 sections');
    expect(pickCategoryFinding(50, ['Has clear H1 heading', 'Missing H2 headings for content structure'])).toBe('Missing H2 headings for content structure');
    expect(pickCategoryFinding(50, [])).toBe('');
  });
});
