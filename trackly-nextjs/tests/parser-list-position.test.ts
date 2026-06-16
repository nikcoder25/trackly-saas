import { describe, expect, it } from 'vitest';
import { parseResponse, type BrandInput } from '../src/lib/parser';

/**
 * Coverage for `parseResponse().listPosition`.
 *
 * Bug context: Gemini's "Position" column on /dashboard/mentions was always
 * N/A even on FOUND rows. Root cause was the position regex only matching
 * `1. **BrandName**`-shaped lines. Gemini prefers `**1. BrandName**` (bold
 * around the whole label) and `**1.** BrandName`, both of which slid past
 * the old pattern. The expanded regex now allows optional bold/italic
 * emphasis around the marker AND adds a second pattern for parenthesised
 * / hash-style markers - `(1) Brand`, `[1] Brand`, `#1: Brand`.
 */

const brand: BrandInput = { name: 'Acme Widgets' };

describe('parseResponse() - list position extraction', () => {
  describe('legacy patterns (must still work)', () => {
    it.each([
      ['1. Acme Widgets - top pick', 1],
      ['2. **Acme Widgets** is great', 2],
      ['3) Acme Widgets is recommended', 3],
      ['4- Acme Widgets', 4],
      ['  5. Acme Widgets indented', 5],
    ])('matches %j → position %i', (text, pos) => {
      expect(parseResponse(text, brand, 'q').listPosition).toBe(pos);
    });
  });

  describe('Gemini bold-around-whole-label variants', () => {
    it.each([
      ['**1. Acme Widgets** - description', 1],
      ['**2. Acme Widgets**\nMore prose underneath.', 2],
      ['**3.** Acme Widgets - description', 3],
      ['**4)** **Acme Widgets**', 4],
      ['**5. Acme Widgets, Inc.** - full legal name', 5],
      ['__6. Acme Widgets__ underscore-style bold', 6],
      ['*7. Acme Widgets* italic-style', 7],
    ])('matches %j → position %i', (text, pos) => {
      expect(parseResponse(text, brand, 'q').listPosition).toBe(pos);
    });
  });

  describe('parenthesised / hash markers', () => {
    it.each([
      ['(1) Acme Widgets', 1],
      ['(2) **Acme Widgets**', 2],
      ['[3] Acme Widgets', 3],
      ['#4 Acme Widgets', 4],
      ['#5: Acme Widgets', 5],
      ['**(6)** Acme Widgets', 6],
    ])('matches %j → position %i', (text, pos) => {
      expect(parseResponse(text, brand, 'q').listPosition).toBe(pos);
    });
  });

  describe('multi-line lists pick the first matching number', () => {
    it('returns the position where the brand actually appears, not the first list item', () => {
      const text = [
        '1. CompetitorA - irrelevant',
        '2. CompetitorB - also irrelevant',
        '3. **Acme Widgets** - the one we care about',
        '4. CompetitorD',
      ].join('\n');
      expect(parseResponse(text, brand, 'q').listPosition).toBe(3);
    });

    it('handles the bold-whole-label variant in a real-looking ranked answer', () => {
      const text = [
        'Here are the top providers:',
        '',
        '**1. CompetitorA** - large incumbent.',
        '**2. CompetitorB** - newer entrant.',
        '**3. Acme Widgets** - niche specialist.',
        '**4. CompetitorD** - also worth a look.',
      ].join('\n');
      expect(parseResponse(text, brand, 'q').listPosition).toBe(3);
    });
  });

  describe('correctly-negative cases (no list position to extract)', () => {
    it('returns null when the brand is mentioned in prose without ranking', () => {
      const text = 'Acme Widgets is a great choice for this use case.';
      const r = parseResponse(text, brand, 'q');
      expect(r.mentioned).toBe(true);
      expect(r.listPosition).toBeNull();
    });

    it('returns null when brand is on its own line with no number', () => {
      const text = '- Acme Widgets\n- CompetitorA\n- CompetitorB';
      const r = parseResponse(text, brand, 'q');
      expect(r.mentioned).toBe(true);
      expect(r.listPosition).toBeNull();
    });

    it('returns null when the brand is not mentioned at all', () => {
      const text = '1. CompetitorA\n2. CompetitorB';
      expect(parseResponse(text, brand, 'q').listPosition).toBeNull();
    });
  });

  describe('alias-based matching', () => {
    const branded: BrandInput = { name: 'Acme Widgets', aliases: ['acmewidgets', 'acme'] };

    it('uses an alias when the canonical name is bold-wrapped differently', () => {
      const text = '**2. acmewidgets** is the slug-style alias.';
      expect(parseResponse(text, branded, 'q').listPosition).toBe(2);
    });
  });
});
