/**
 * Tests for the AI Volatility Index scoring maths (src/lib/volatility.ts).
 *
 * The whole index rests on one claim: that day-over-day movement in the
 * cross-tenant corpus reflects engines changing their answers, not tenants
 * changing which prompts they track. `scoreDay` is where that claim is
 * enforced (same-prompt cohort) and where a wrong weight or a mishandled
 * null would produce a number that looks authoritative and isn't.
 */
import { describe, expect, it } from 'vitest';

import { jaccardDistance, scoreDay, MIN_COHORT, type DayObservation } from '../volatility';

function obs(
  prompt: string,
  over: Partial<DayObservation> = {},
): DayObservation {
  return {
    prompt,
    platform: 'ChatGPT',
    mentioned: false,
    listPosition: null,
    domains: [],
    ...over,
  };
}

/** A cohort big enough to be scored, with every pair identical. */
function stableCohort(size = MIN_COHORT): { prev: DayObservation[]; curr: DayObservation[] } {
  const prev: DayObservation[] = [];
  const curr: DayObservation[] = [];
  for (let i = 0; i < size; i++) {
    prev.push(obs(`p${i}`, { domains: ['a.com'], mentioned: true, listPosition: 2 }));
    curr.push(obs(`p${i}`, { domains: ['a.com'], mentioned: true, listPosition: 2 }));
  }
  return { prev, curr };
}

describe('jaccardDistance', () => {
  it('is 0 for identical source sets and 1 for disjoint ones', () => {
    expect(jaccardDistance(['a.com', 'b.com'], ['b.com', 'a.com'])).toBe(0);
    expect(jaccardDistance(['a.com'], ['b.com'])).toBe(1);
  });

  it('measures partial overlap', () => {
    // {a,b} vs {b,c}: intersection 1, union 3 → 1 - 1/3
    expect(jaccardDistance(['a', 'b'], ['b', 'c'])).toBeCloseTo(2 / 3, 6);
  });

  it('ignores duplicates within a set', () => {
    expect(jaccardDistance(['a', 'a', 'b'], ['a', 'b'])).toBe(0);
  });

  it('treats two empty sets as no distance rather than dividing by zero', () => {
    expect(jaccardDistance([], [])).toBe(0);
  });
});

describe('scoreDay', () => {
  it('refuses to score a cohort below the minimum', () => {
    const prev = [obs('a'), obs('b')];
    const curr = [obs('a'), obs('b')];
    const result = scoreDay(prev, curr);
    expect(result.score).toBeNull();
    expect(result.cohortSize).toBe(2);
  });

  it('counts only prompts measured on BOTH days', () => {
    // This is the guard against panel churn: 40 prompts today, 40
    // yesterday, but only 5 in common - the cohort is 5, not 40.
    const prev = Array.from({ length: 40 }, (_, i) => obs(`old${i}`));
    const curr = Array.from({ length: 40 }, (_, i) => obs(i < 5 ? `old${i}` : `new${i}`));
    expect(scoreDay(prev, curr).cohortSize).toBe(5);
  });

  it('scores a completely stable day as 0', () => {
    const { prev, curr } = stableCohort();
    expect(scoreDay(prev, curr).score).toBe(0);
  });

  it('scores total upheaval as 100', () => {
    const prev: DayObservation[] = [];
    const curr: DayObservation[] = [];
    for (let i = 0; i < MIN_COHORT; i++) {
      prev.push(obs(`p${i}`, { domains: ['a.com'], mentioned: true, listPosition: 1 }));
      // Every source replaced, every mention flipped, position moved far
      // enough to saturate the normalizer.
      curr.push(obs(`p${i}`, { domains: ['z.com'], mentioned: false, listPosition: 9 }));
    }
    expect(scoreDay(prev, curr).score).toBe(100);
  });

  it('excludes citation-free pairs from source churn instead of scoring them as stable', () => {
    // Half the cohort never cites anything. Those pairs must not dilute
    // the churn average toward 0 - an engine we cannot observe is not an
    // engine we observed to be stable.
    const prev: DayObservation[] = [];
    const curr: DayObservation[] = [];
    for (let i = 0; i < MIN_COHORT; i++) {
      const cites = i % 2 === 0;
      prev.push(obs(`p${i}`, { domains: cites ? ['a.com'] : [] }));
      curr.push(obs(`p${i}`, { domains: cites ? ['z.com'] : [] }));
    }
    const result = scoreDay(prev, curr);
    // Every observable pair moved completely, so churn is 1, not 0.5.
    expect(result.sourceChurn).toBe(1);
  });

  it('re-normalizes weights when an engine never cites and never ranks', () => {
    // No citations and no positions anywhere: the score must rest wholly
    // on mention flips rather than being dragged down by two absent
    // components counting as zero.
    const prev: DayObservation[] = [];
    const curr: DayObservation[] = [];
    for (let i = 0; i < MIN_COHORT; i++) {
      prev.push(obs(`p${i}`, { mentioned: true }));
      curr.push(obs(`p${i}`, { mentioned: false }));
    }
    const result = scoreDay(prev, curr);
    expect(result.sourceChurn).toBeNull();
    expect(result.positionMove).toBeNull();
    expect(result.mentionFlip).toBe(1);
    expect(result.score).toBe(100);
  });

  it('reports mention flips as a share of the cohort', () => {
    // Sized so the expected share is exact regardless of MIN_COHORT.
    const size = MIN_COHORT * 4;
    const flips = MIN_COHORT;
    const prev: DayObservation[] = [];
    const curr: DayObservation[] = [];
    for (let i = 0; i < size; i++) {
      prev.push(obs(`p${i}`, { mentioned: true }));
      curr.push(obs(`p${i}`, { mentioned: i >= flips }));
    }
    expect(scoreDay(prev, curr).mentionFlip).toBeCloseTo(0.25, 6);
  });

  it('ignores position changes when either day had no position', () => {
    const prev: DayObservation[] = [];
    const curr: DayObservation[] = [];
    for (let i = 0; i < MIN_COHORT; i++) {
      prev.push(obs(`p${i}`, { listPosition: i === 0 ? 1 : null }));
      curr.push(obs(`p${i}`, { listPosition: i === 0 ? 4 : null }));
    }
    const result = scoreDay(prev, curr);
    // Only the single fully-observed pair contributes: |1-4|/5 = 0.6
    expect(result.positionMove).toBeCloseTo(0.6, 6);
  });

  it('caps a single huge position swing so one outlier cannot dominate', () => {
    const prev: DayObservation[] = [];
    const curr: DayObservation[] = [];
    for (let i = 0; i < MIN_COHORT; i++) {
      prev.push(obs(`p${i}`, { listPosition: 1 }));
      curr.push(obs(`p${i}`, { listPosition: 100 }));
    }
    expect(scoreDay(prev, curr).positionMove).toBe(1);
  });
});
