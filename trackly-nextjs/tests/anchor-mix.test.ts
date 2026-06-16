import { describe, expect, it } from 'vitest';

import {
  ANCHOR_TYPES,
  DEFAULT_ANCHOR_MIX,
  type AnchorType,
  anchorTextFor,
  assignAnchorTypes,
  brandFromMoneySite,
  extractDomain,
  geoFromKeyword,
  normaliseMix,
  partialFromKeyword,
  planAnchorAssignments,
  topicalFromKeyword,
} from '../src/lib/anchor-mix';

function countByType(arr: AnchorType[]): Record<AnchorType, number> {
  const out = ANCHOR_TYPES.reduce((acc, t) => ({ ...acc, [t]: 0 }), {} as Record<AnchorType, number>);
  for (const t of arr) out[t] += 1;
  return out;
}

describe('planAnchorAssignments', () => {
  it('returns zeros when the batch is empty', () => {
    const plan = planAnchorAssignments(0, DEFAULT_ANCHOR_MIX);
    for (const t of ANCHOR_TYPES) expect(plan[t]).toBe(0);
  });

  it('matches the default mix exactly at count=100', () => {
    const plan = planAnchorAssignments(100, DEFAULT_ANCHOR_MIX);
    expect(plan).toEqual(DEFAULT_ANCHOR_MIX);
    expect(Object.values(plan).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('uses largest-remainder rounding so totals always equal count', () => {
    // 7 articles across a default mix exercises fractional remainders.
    const plan = planAnchorAssignments(7, DEFAULT_ANCHOR_MIX);
    const total = Object.values(plan).reduce((a, b) => a + b, 0);
    expect(total).toBe(7);
  });

  it('honours a single-type 100% mix (exact-only legacy)', () => {
    const mix: Record<AnchorType, number> = {
      exact: 100, partial: 0, branded: 0, generic: 0, topical: 0, geo: 0, naked: 0, url: 0,
    };
    const plan = planAnchorAssignments(50, mix);
    expect(plan.exact).toBe(50);
    for (const t of ANCHOR_TYPES) if (t !== 'exact') expect(plan[t]).toBe(0);
  });

  it('proportionally normalises a mix that does not sum to 100', () => {
    const mix: Record<AnchorType, number> = {
      exact: 50, partial: 50, branded: 0, generic: 0, topical: 0, geo: 0, naked: 0, url: 0,
    };
    const plan = planAnchorAssignments(40, mix);
    expect(plan.exact + plan.partial).toBe(40);
    expect(Math.abs(plan.exact - plan.partial)).toBeLessThanOrEqual(1);
  });
});

describe('assignAnchorTypes', () => {
  it('returns an array of length count', () => {
    const seq = assignAnchorTypes(42, DEFAULT_ANCHOR_MIX);
    expect(seq).toHaveLength(42);
  });

  it('matches the per-type plan exactly', () => {
    const seq = assignAnchorTypes(80, DEFAULT_ANCHOR_MIX);
    const counts = countByType(seq);
    expect(counts).toEqual(planAnchorAssignments(80, DEFAULT_ANCHOR_MIX));
  });

  it('interleaves types rather than emitting runs (first 10 are not all branded)', () => {
    const seq = assignAnchorTypes(100, DEFAULT_ANCHOR_MIX);
    const firstTen = new Set(seq.slice(0, 10));
    // With the default mix, the first 10 slots should touch ≥3 distinct
    // types - proves we're cycling buckets, not draining 'branded' first.
    expect(firstTen.size).toBeGreaterThanOrEqual(3);
  });
});

describe('normaliseMix', () => {
  it('clamps out-of-range values', () => {
    const out = normaliseMix({
      exact: 150, partial: -5, branded: 0, generic: 0, topical: 0, geo: 0, naked: 0, url: 0,
    } as Record<AnchorType, number>);
    expect(out.exact).toBe(100);
    expect(out.partial).toBe(0);
  });

  it('falls back to the default when total is zero', () => {
    const out = normaliseMix(ANCHOR_TYPES.reduce((acc, t) => ({ ...acc, [t]: 0 }), {} as Record<AnchorType, number>));
    expect(out).toEqual(DEFAULT_ANCHOR_MIX);
  });
});

describe('anchor text derivation', () => {
  const pair = { keyword: 'hvac repair near me', link: 'https://www.acme-hvac.com/services/repair' };

  it('exact returns the keyword verbatim', () => {
    expect(anchorTextFor('exact', pair, '', '', '', 0)).toBe('hvac repair near me');
  });

  it('partial drops modifiers / tails', () => {
    expect(partialFromKeyword('hvac repair near me')).toBe('hvac repair');
  });

  it('branded extracts a tidy brand from the money site', () => {
    expect(brandFromMoneySite('https://www.acme-hvac.com')).toBe('Acme Hvac');
  });

  it('naked returns the bare hostname without www', () => {
    expect(extractDomain('https://www.Acme-HVAC.com/foo')).toBe('acme-hvac.com');
    expect(anchorTextFor('naked', pair, '', '', '', 0)).toBe('acme-hvac.com');
  });

  it('url returns the link verbatim', () => {
    expect(anchorTextFor('url', pair, '', '', '', 0)).toBe(pair.link);
  });

  it('topical leads with a trusted-style adjective and strips banned modifiers', () => {
    const t = topicalFromKeyword('hvac repair near me', 'hvac', 0);
    expect(t).toMatch(/^(professional|trusted|reliable|local|expert|experienced|top-rated|qualified) /);
    expect(t).not.toMatch(/near me/);
  });

  it('geo appends "in <location>" and removes "near me" tail', () => {
    expect(geoFromKeyword('hvac repair near me', 'Detroit MI', 'hvac')).toBe('hvac repair in Detroit MI');
  });

  it('geo with no location falls back to the bare keyword', () => {
    expect(geoFromKeyword('hvac repair', '', 'hvac')).toBe('hvac repair');
  });

  it('generic anchors cycle through the pool deterministically', () => {
    const g0 = anchorTextFor('generic', pair, '', '', '', 0);
    const g1 = anchorTextFor('generic', pair, '', '', '', 1);
    expect(g0).not.toBe(g1);
  });

  it('falls back to the keyword when link + money site are both blank for URL anchors', () => {
    const blank = { keyword: 'hvac repair', link: '' };
    expect(anchorTextFor('url', blank, '', '', '', 0)).toBe('hvac repair');
    expect(anchorTextFor('naked', blank, '', '', '', 0)).toBe('hvac repair');
  });

  it('falls back to the keyword when branded source is unknown', () => {
    expect(anchorTextFor('branded', pair, '', '', '', 0)).toBe('hvac repair near me');
  });

  it('always returns a non-empty string for every anchor type', () => {
    const blank = { keyword: 'hvac repair', link: '' };
    for (const t of [
      'exact', 'partial', 'branded', 'generic', 'topical', 'geo', 'naked', 'url',
    ] as const) {
      const out = anchorTextFor(t, blank, '', '', '', 0);
      expect(out, `type=${t}`).toBeTruthy();
      expect(out.length, `type=${t}`).toBeGreaterThan(0);
    }
  });
});
