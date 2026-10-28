/**
 * Tests for dedupePrompts (src/lib/prompt-discovery.ts).
 *
 * This is the stage that keeps a generated prompt set from being padded
 * with the same question five ways. It runs before the plan-cap slice, so
 * a weak dedupe directly costs the user tracked-prompt slots - and an
 * over-eager one silently drops prompts they'd have wanted.
 */
import { describe, expect, it } from 'vitest';

import { dedupePrompts } from '../prompt-discovery';

describe('dedupePrompts', () => {
  it('keeps distinct prompts in their original order', () => {
    expect(dedupePrompts([
      'best hvac company',
      'emergency ac repair',
      'heat pump cost',
    ])).toEqual([
      'best hvac company',
      'emergency ac repair',
      'heat pump cost',
    ]);
  });

  it('collapses prompts differing only in case or punctuation', () => {
    expect(dedupePrompts([
      'Best HVAC company',
      'best hvac company?',
      'BEST HVAC COMPANY!',
    ])).toEqual(['Best HVAC company']);
  });

  it('collapses prompts differing only in filler words', () => {
    expect(dedupePrompts([
      'best hvac company near me',
      'the best hvac company',
    ])).toEqual(['best hvac company near me']);
  });

  it('strips list numbering and wrapping quotes a model adds', () => {
    expect(dedupePrompts([
      '1. best hvac company',
      '"emergency ac repair"',
    ])).toEqual(['best hvac company', 'emergency ac repair']);
  });

  it('normalizes internal whitespace', () => {
    expect(dedupePrompts(['best   hvac    company'])).toEqual(['best hvac company']);
  });

  it('drops entries that are too short or too long to be prompts', () => {
    expect(dedupePrompts(['ok', '', '   ', 'a'.repeat(301)])).toEqual([]);
  });

  it('does not merge genuinely different prompts that share words', () => {
    const out = dedupePrompts([
      'ac repair cost',
      'ac installation cost',
    ]);
    expect(out).toHaveLength(2);
  });

  it('never returns an entry that is only filler after normalization', () => {
    // "the a an" reduces to an empty key; keeping it would put a
    // meaningless prompt into someone's tracked set.
    expect(dedupePrompts(['the a an'])).toEqual([]);
  });
});
