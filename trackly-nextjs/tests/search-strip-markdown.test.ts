import { describe, it, expect } from 'vitest';
import { stripMarkdown } from '@/lib/search';

describe('search snippet markdown stripping', () => {
  it('removes bold, citation markers and links', () => {
    expect(stripMarkdown('**Legend Oz Transportation** is a top pick [3] for Detroit.'))
      .toBe('Legend Oz Transportation is a top pick for Detroit.');
    expect(stripMarkdown('See [their site](https://example.com) and __reviews__ [1, 2].'))
      .toBe('See their site and reviews.');
  });

  it('drops headings, bullets, inline code and emphasis', () => {
    expect(stripMarkdown('## Best options - Acme `fast` and *reliable*'))
      .toBe('Best options - Acme fast and reliable');
    expect(stripMarkdown('1. Acme\n2. Beta\n- Gamma')).toBe('Acme Beta Gamma');
  });

  it('leaves plain text alone', () => {
    expect(stripMarkdown('Cool Breeze HVAC is rated 4.8 stars.')).toBe('Cool Breeze HVAC is rated 4.8 stars.');
  });
});
