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

import {
  jaccardDistance, scoreDay, MIN_COHORT, type DayObservation,
  buildBrandVolatilitySeries, brandSeriesSince, canonicalPlatform, type BrandDayRow,
} from '../volatility';

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

describe('canonicalPlatform', () => {
  it('folds provider keys and casing into the dashboard engine name', () => {
    expect(canonicalPlatform('ChatGPT')).toBe('ChatGPT');
    expect(canonicalPlatform('openai')).toBe('ChatGPT');
    expect(canonicalPlatform('chatgpt')).toBe('ChatGPT');
    expect(canonicalPlatform('anthropic')).toBe('Claude');
    expect(canonicalPlatform('Perplexity')).toBe('Perplexity');
  });

  it('leaves unknown engines alone', () => {
    expect(canonicalPlatform('Copilot')).toBe('Copilot');
  });
});

describe('brandSeriesSince', () => {
  const now = new Date('2026-10-23T12:00:00Z');

  it('clamps the window to the brand creation day', () => {
    expect(brandSeriesSince('2026-09-14T08:30:00Z', 90, now)).toBe('2026-09-14');
  });

  it('uses the window start when the brand is older than the window', () => {
    expect(brandSeriesSince('2025-01-01T00:00:00Z', 30, now)).toBe('2026-09-24');
  });

  it('falls back to the window start without a creation date', () => {
    expect(brandSeriesSince(null, 30, now)).toBe('2026-09-24');
  });
});

describe('buildBrandVolatilitySeries', () => {
  function row(day: string, prompt: string, over: Partial<BrandDayRow> = {}): BrandDayRow {
    return { day, platform: 'ChatGPT', prompt, mentioned: true, listPosition: 1, domains: ['a.com'], ...over };
  }
  const prompts = ['p1', 'p2', 'p3', 'p4'];

  it('scores runs every other day instead of reporting "needs 2 days"', () => {
    // Starter scans every 2 days, so there are never two consecutive
    // calendar days. Comparing against the previous measured day fixes it.
    const rows = ['2026-10-01', '2026-10-03', '2026-10-05']
      .flatMap(d => prompts.map(p => row(d, p)));
    const [chatgpt] = buildBrandVolatilitySeries(rows, { since: '2026-09-01' });
    expect(chatgpt.platform).toBe('ChatGPT');
    expect(chatgpt.points.map(p => p.day)).toEqual(['2026-10-01', '2026-10-03', '2026-10-05']);
    expect(chatgpt.points[0].score).toBeNull();
    expect(chatgpt.points[2]).toEqual({ day: '2026-10-05', score: 0, cohortSize: 4 });
    expect(chatgpt.latest).toBe(0);
  });

  it('merges an aliased platform key into one engine series', () => {
    const rows = [
      ...prompts.map(p => row('2026-10-01', p, { platform: 'openai' })),
      ...prompts.map(p => row('2026-10-02', p, { platform: 'ChatGPT', mentioned: false })),
    ];
    const series = buildBrandVolatilitySeries(rows, { since: '2026-09-01' });
    expect(series).toHaveLength(1);
    expect(series[0].platform).toBe('ChatGPT');
    expect(series[0].points[1].cohortSize).toBe(4);
    expect(series[0].latest).not.toBeNull();
  });

  it('drops days before the brand existed', () => {
    const rows = ['2026-08-20', '2026-08-21', '2026-09-15', '2026-09-16']
      .flatMap(d => prompts.map(p => row(d, p, { platform: 'Claude' })));
    const [claude] = buildBrandVolatilitySeries(rows, { since: '2026-09-14' });
    expect(claude.points.map(p => p.day)).toEqual(['2026-09-15', '2026-09-16']);
    // The first in-range day has nothing in range to compare against.
    expect(claude.points[0].score).toBeNull();
  });

  it('honours the per-brand cohort floor', () => {
    const rows = [row('2026-10-01', 'p1'), row('2026-10-02', 'p1')];
    const [s] = buildBrandVolatilitySeries(rows, { since: '2026-09-01', minCohort: 3 });
    expect(s.points[1]).toEqual({ day: '2026-10-02', score: null, cohortSize: 1 });
    expect(s.latest).toBeNull();
  });
});
