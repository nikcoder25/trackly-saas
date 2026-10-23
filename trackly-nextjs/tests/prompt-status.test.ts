import { describe, it, expect } from 'vitest';
import {
  promptStatus, promptStatusFromRate, promptMentionRate, isWinningPrompt, WINNING_RATE, LOSING_RATE,
} from '@/lib/prompt-status';

describe('prompt status (shared by Query Tracker and Overview)', () => {
  it('has no status without answered results', () => {
    expect(promptStatus(0, 0)).toBe('none');
    expect(promptStatusFromRate(0, 0)).toBe('none');
    expect(promptMentionRate(3, 0)).toBe(0);
  });

  it('uses the 30% / 15% thresholds', () => {
    expect(WINNING_RATE).toBe(30);
    expect(LOSING_RATE).toBe(15);
    expect(promptStatusFromRate(30, 10)).toBe('winning');
    expect(promptStatusFromRate(29, 10)).toBe('tracking');
    expect(promptStatusFromRate(15, 10)).toBe('tracking');
    expect(promptStatusFromRate(14, 10)).toBe('losing');
    expect(promptStatusFromRate(0, 10)).toBe('losing');
  });

  it('calls 2 of 5 engines winning, matching the Query Tracker rate (40%)', () => {
    // The old Overview rule needed half the engines, so this read "Missing"
    // on the Overview while the Query Tracker said "Winning".
    expect(promptMentionRate(2, 5)).toBe(40);
    expect(promptStatus(2, 5)).toBe('winning');
    expect(isWinningPrompt(2, 5)).toBe(true);
  });

  it('gives the same answer from counts and from the rounded rate', () => {
    for (let answered = 1; answered <= 12; answered++) {
      for (let m = 0; m <= answered; m++) {
        expect(promptStatus(m, answered)).toBe(promptStatusFromRate(promptMentionRate(m, answered), answered));
      }
    }
  });

  it('treats 1 of 5 as at risk and 0 named as losing', () => {
    expect(promptStatus(1, 5)).toBe('tracking'); // 20%
    expect(promptStatus(1, 7)).toBe('losing'); // 14%
    expect(promptStatus(0, 5)).toBe('losing');
    expect(isWinningPrompt(1, 5)).toBe(false);
  });
});
