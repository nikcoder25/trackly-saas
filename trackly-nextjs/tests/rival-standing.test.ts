import { describe, it, expect } from 'vitest';
import { buildRivalRows, leadsRivals, rivalMentionRates, cleanCompetitorList } from '@/lib/rival-standing';

/** 20 answered results; the brand is named in `me` of them, each rival in its own count. */
function results(me: number, rivals: Record<string, number>, total = 20) {
  return Array.from({ length: total }, (_, i) => ({
    mentioned: i < me,
    competitorMentions: Object.entries(rivals).filter(([, n]) => i < n).map(([name]) => name),
  }));
}

describe('rival standing', () => {
  it('lists every configured competitor even with no mentions in the last run', () => {
    const rows = buildRivalRows({
      brandName: 'Acme', brandSov: 25,
      competitors: ['Linear', 'Asana', 'Monday', 'Notion'],
      results: results(5, {}), fallbackCounts: {},
    });
    expect(rows).toHaveLength(5);
    expect(rows.filter(r => !r.me).map(r => r.name).sort()).toEqual(['Asana', 'Linear', 'Monday', 'Notion']);
  });

  it('returns no rows when no competitors are tracked', () => {
    expect(buildRivalRows({ brandName: 'Acme', brandSov: 40, competitors: [], results: results(8, { X: 3 }) })).toEqual([]);
  });

  it('keeps the brand row on the visibility scale, not a share of a mention pool', () => {
    // 31% visibility, rivals rarely named. The old pool share put the brand at ~91%.
    const rows = buildRivalRows({
      brandName: 'Acme', brandSov: 31,
      competitors: ['Linear'],
      results: results(6, { Linear: 1 }),
    });
    const me = rows.find(r => r.me)!;
    expect(me.sov).toBe(31);
    expect(rows.find(r => !r.me)!.sov).toBe(5);
  });

  it('only claims leadership when strictly ahead of every rival', () => {
    const ahead = buildRivalRows({ brandName: 'Acme', brandSov: 30, competitors: ['A', 'B'], results: results(6, { A: 4, B: 2 }) });
    expect(leadsRivals(ahead)).toBe(true);
    expect(ahead[0].me).toBe(true);

    const behind = buildRivalRows({ brandName: 'Acme', brandSov: 25, competitors: ['A', 'B'], results: results(5, { A: 10, B: 2 }) });
    expect(leadsRivals(behind)).toBe(false);
    expect(behind[0].name).toBe('A');

    const tied = buildRivalRows({ brandName: 'Acme', brandSov: 20, competitors: ['A'], results: results(4, { A: 4 }) });
    expect(leadsRivals(tied)).toBe(false);
    expect(tied[0].me).toBeFalsy();

    expect(leadsRivals([{ sov: 0, me: true }, { sov: 0 }])).toBe(false);
    expect(leadsRivals([{ sov: 50, me: true }])).toBe(false);
  });

  it('matches competitor names case-insensitively and ignores errored results', () => {
    const rs = [
      { competitorMentions: ['linear'] },
      { competitorMentions: ['LINEAR', 'asana'] },
      { competitorMentions: [] },
      { error: 'timeout', competitorMentions: ['Linear'] },
    ];
    expect(rivalMentionRates(['Linear', 'Asana'], rs)).toEqual({ Linear: 67, Asana: 33 });
  });

  it('falls back to the run count map when results carry no per-result mentions', () => {
    const rs = Array.from({ length: 10 }, () => ({ mentioned: false }));
    expect(rivalMentionRates(['Linear'], rs, { linear: 3 })).toEqual({ Linear: 30 });
  });

  it('computes deltas against the previous run when there is one', () => {
    const rows = buildRivalRows({
      brandName: 'Acme', brandSov: 30, prevBrandSov: 20,
      competitors: ['A'],
      results: results(6, { A: 2 }), prevResults: results(4, { A: 4 }),
    });
    expect(rows.find(r => r.me)!.d).toBe(10);
    expect(rows.find(r => !r.me)!.d).toBe(-10);
  });

  it('dedupes and trims the configured list', () => {
    expect(cleanCompetitorList([' Linear ', 'linear', '', 3, 'Asana'])).toEqual(['Linear', 'Asana']);
    expect(cleanCompetitorList(undefined)).toEqual([]);
  });
});
