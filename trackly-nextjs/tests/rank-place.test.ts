import { describe, it, expect } from 'vitest';
import rows from '../src/lib/rank-tracking/data/cities.json';
import { buildGazetteer, placeIn } from '../src/lib/rank-tracking/place';

const g = buildGazetteer(rows as [string, string][]);
const at = (k: string, near = 'United Kingdom') => placeIn(g, k, near);

describe('placeIn: the place a keyword names', () => {
  it('finds a city at the end of the keyword', () => {
    expect(at('ai consulting austin')).toBe('Austin,Texas,United States');
    expect(at('ai consulting edinburgh')).toBe('Edinburgh,Scotland,United Kingdom');
    expect(at('ai consulting in london')).toBe('London,England,United Kingdom');
    expect(at('seo agency new york')).toMatch(/^New York,/);
  });

  it('prefers the country the keywords were added in', () => {
    expect(at('ai consulting london', 'Ontario,Canada')).toBe('London,Ontario,Canada');
  });

  it('finds a big city at the start', () => {
    expect(at('austin plumber')).toBe('Austin,Texas,United States');
  });

  it('finds states, nations and countries', () => {
    expect(at('plumber texas')).toBe('Texas,United States');
    expect(at('solar panels scotland')).toBe('Scotland,United Kingdom');
    expect(at('ai consulting uk')).toBe('United Kingdom');
    expect(at('cloud consulting germany')).toBe('Germany');
  });

  it('leaves keywords without a place alone', () => {
    for (const k of ['walk in bath', 'ai agent development companies', 'top ai consulting companies', 'business intelligence in insurance industry',
      'genai consulting services', 'composite ai', 'ai consultants for small business', 'mobile app development', 'best seo tools',
      'top digital transformation companies', 'hvac repair near me', 'ai for real estate', 'austin']) {
      expect(at(k), k).toBeNull();
    }
  });
});
