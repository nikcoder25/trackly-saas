import { describe, it, expect } from 'vitest';
import { computeShareOfVoice, formatCountWithRate } from '@/lib/run-sov';

/**
 * The Competitors page showed share-of-voice slices summing to 61% because
 * each was mentions / queries (a mention rate). Shares must divide by total
 * mentions across the set and add up to exactly 100.
 */
describe('computeShareOfVoice', () => {
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

  it('divides by total mentions, not by queries', () => {
    expect(computeShareOfVoice({ me: 30, a: 20, b: 10 })).toEqual({ me: 50, a: 33, b: 17 });
  });

  it('always sums to 100 after rounding', () => {
    for (const input of [
      { me: 1, a: 1, b: 1 },
      { me: 7, a: 3, b: 3, c: 2 },
      { me: 13, a: 29, b: 0, c: 41, d: 5 },
      { me: 0, a: 1 },
    ]) {
      expect(sum(computeShareOfVoice(input))).toBe(100);
    }
  });

  it('is deterministic for ties', () => {
    // Three equal thirds: the spare point goes to the first key.
    expect(computeShareOfVoice({ me: 1, a: 1, b: 1 })).toEqual({ me: 34, a: 33, b: 33 });
  });

  it('returns zeros, not NaN, when nobody was mentioned', () => {
    expect(computeShareOfVoice({ me: 0, a: 0 })).toEqual({ me: 0, a: 0 });
    expect(computeShareOfVoice({})).toEqual({});
  });

  it('treats negative or garbage counts as zero', () => {
    expect(computeShareOfVoice({ me: -5, a: Number.NaN, b: 4 })).toEqual({ me: 0, a: 0, b: 100 });
  });
});

describe('formatCountWithRate', () => {
  it('separates the count from the percent so "1" and "65%" never read as "165%"', () => {
    expect(formatCountWithRate(13, 20)).toBe('13 (65%)');
    expect(formatCountWithRate(1, 20)).toBe('1 (5%)');
  });

  it('reports 0% when there were no answers', () => {
    expect(formatCountWithRate(0, 0)).toBe('0 (0%)');
  });

  it('groups thousands', () => {
    expect(formatCountWithRate(1200, 2400)).toBe('1,200 (50%)');
  });
});
