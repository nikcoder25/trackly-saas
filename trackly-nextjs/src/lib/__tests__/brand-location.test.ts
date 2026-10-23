import { describe, it, expect } from 'vitest';
import { splitCityRegion, brandDefaultCountry, matchCountry } from '@/lib/brand-location';

describe('splitCityRegion', () => {
  it('splits "City, Region"', () => {
    expect(splitCityRegion('Hatfield, England')).toEqual({ city: 'Hatfield', region: 'England', country: '' });
  });
  it('keeps a value without commas as the city', () => {
    expect(splitCityRegion('Austin TX')).toEqual({ city: 'Austin TX', region: '', country: '' });
  });
  it('handles a trailing country and stray whitespace', () => {
    expect(splitCityRegion(' Austin ,  TX , USA ')).toEqual({ city: 'Austin', region: 'TX', country: 'USA' });
  });
  it('handles empty input', () => {
    expect(splitCityRegion(null)).toEqual({ city: '', region: '', country: '' });
  });
});

describe('brandDefaultCountry', () => {
  it('prefers the saved country', () => {
    expect(brandDefaultCountry({ country: 'united kingdom', city: 'Austin, TX' })).toBe('United Kingdom');
  });
  it('infers the country from the location', () => {
    expect(brandDefaultCountry({ city: 'Hatfield, England' })).toBe('United Kingdom');
    expect(brandDefaultCountry({ city: 'Toronto, ON, Canada' })).toBe('Canada');
  });
  it('falls back to the first country', () => {
    expect(brandDefaultCountry({ city: 'Austin TX' })).toBe('United States');
    expect(brandDefaultCountry(null)).toBe('United States');
  });
  it('maps common aliases', () => {
    expect(matchCountry('UK')).toBe('United Kingdom');
    expect(matchCountry('USA')).toBe('United States');
    expect(matchCountry('Narnia')).toBeNull();
  });
});
