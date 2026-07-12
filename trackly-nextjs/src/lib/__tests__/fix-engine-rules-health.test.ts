/**
 * Fix Engine - brand rules guardrails + GEO health score + CTR delta.
 * All pure functions: no mocks needed.
 */

import { describe, expect, it } from 'vitest';
import { applyBrandRules } from '@/lib/fix-engine/rules';
import { computeGeoHealthScore } from '@/lib/fix-engine/health';
import { ctrDelta } from '@/lib/fix-engine/outcomes';
import type { FixSeverity, FixStatus } from '@/lib/fix-engine/types';

describe('applyBrandRules', () => {
  it('appends the title suffix when absent (and not when present)', () => {
    const r = applyBrandRules({ title: 'Best Analytics Tools' }, { titleSuffix: '| Acme' });
    expect(r.generated.title).toBe('Best Analytics Tools | Acme');
    expect(r.applied).toContain('appended title suffix');

    const again = applyBrandRules({ title: 'Best Analytics Tools | Acme' }, { titleSuffix: '| Acme' });
    expect(again.generated.title).toBe('Best Analytics Tools | Acme');
    expect(again.applied).toHaveLength(0);
  });

  it('caps title length at a word boundary, making room for the suffix', () => {
    const long = 'A very long product title that keeps going and going beyond the cap';
    const r = applyBrandRules({ title: long }, { titleSuffix: '| Acme', titleMaxLen: 45 });
    expect((r.generated.title as string).length).toBeLessThanOrEqual(45);
    expect(r.generated.title as string).toMatch(/\| Acme$/);
    expect(r.generated.title as string).not.toMatch(/\s\s/);
  });

  it('strips banned phrases from title and description', () => {
    const r = applyBrandRules(
      { title: 'Game-changing analytics', description: 'A world-class, game-changing suite.' },
      { bannedPhrases: ['game-changing', 'world-class'] },
    );
    expect((r.generated.title as string).toLowerCase()).not.toContain('game-changing');
    expect((r.generated.description as string).toLowerCase()).not.toContain('world-class');
    expect(r.applied.length).toBeGreaterThanOrEqual(2);
  });

  it('caps meta description and is a no-op without rules', () => {
    const desc = 'x'.repeat(300);
    const r = applyBrandRules({ description: desc }, { metaMaxLen: 155 });
    expect((r.generated.description as string).length).toBeLessThanOrEqual(155);
    const noop = applyBrandRules({ title: 'T', description: 'D' }, null);
    expect(noop.generated).toEqual({ title: 'T', description: 'D' });
  });

  it('never touches non-title/description fields', () => {
    const r = applyBrandRules({ html: '<p>game-changing</p>', title: 'ok' }, { bannedPhrases: ['game-changing'] });
    expect(r.generated.html).toBe('<p>game-changing</p>');
  });
});

describe('computeGeoHealthScore', () => {
  const fx = (status: FixStatus, severity: FixSeverity) => ({ status, severity });

  it('is 100 with nothing open and drops per open issue by severity', () => {
    expect(computeGeoHealthScore([]).score).toBe(100);
    expect(computeGeoHealthScore([fx('verified', 'critical')]).score).toBe(100);
    const s = computeGeoHealthScore([fx('detected', 'critical'), fx('generated', 'high'), fx('approved', 'medium')]);
    expect(s.score).toBe(100 - 12 - 8 - 4);
    expect(s.openIssues).toBe(3);
  });

  it('floors at zero and counts resolved', () => {
    const many = Array.from({ length: 20 }, () => fx('detected', 'critical'));
    const s = computeGeoHealthScore([...many, fx('shipped', 'low')]);
    expect(s.score).toBe(0);
    expect(s.resolvedIssues).toBe(1);
  });
});

describe('ctrDelta', () => {
  it('computes relative CTR change with enough impressions', () => {
    expect(ctrDelta({ ctr: 0.05, impressions: 1000 }, { ctr: 0.06, impressions: 900 })).toBeCloseTo(0.2);
  });
  it('returns null on thin data or missing sides', () => {
    expect(ctrDelta({ ctr: 0.05, impressions: 50 }, { ctr: 0.06, impressions: 900 })).toBeNull();
    expect(ctrDelta({ ctr: 0, impressions: 1000 }, { ctr: 0.06, impressions: 900 })).toBeNull();
    expect(ctrDelta(null, { ctr: 0.06, impressions: 900 })).toBeNull();
  });
});
