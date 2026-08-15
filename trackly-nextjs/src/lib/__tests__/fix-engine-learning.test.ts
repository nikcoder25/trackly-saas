/**
 * Fix Engine — baseline-adjusted outcomes, the learned prior, and the
 * approval gate that keeps automation off live pages.
 */

import { describe, expect, it } from 'vitest';

import { adjustedCtrDelta, ctrDelta, REVERT_CTR_DROP } from '@/lib/fix-engine/outcomes';
import {
  HOLDOUT_FRACTION,
  MIN_SAMPLE,
  isHeldOut,
  priorWeight,
  shrink,
} from '@/lib/fix-engine/learning';

describe('adjustedCtrDelta', () => {
  const page = (ctr: number, impressions = 1000, siteCtr?: number) => ({
    ctr, impressions, ...(siteCtr !== undefined ? { site: { ctr: siteCtr } } : {}),
  });

  it('subtracts the site-wide trend from the page delta', () => {
    // Page CTR fell 20%; the whole site fell 30%. The page outperformed.
    const r = adjustedCtrDelta(page(0.10, 1000, 0.05), page(0.08), { ctr: 0.035 });
    expect(r.adjusted).toBe(true);
    expect(r.siteDelta).toBeCloseTo(-0.3, 5);
    expect(r.delta).toBeCloseTo(0.1, 5); // -0.2 - (-0.3)
    expect(r.delta!).toBeGreaterThan(0);
  });

  it('rescues a fix that a raw delta would have condemned', () => {
    // This is the whole point: a core update drags every page down, and the
    // raw delta trips the auto-revert on a fix that actually beat the site.
    const before = page(0.10, 1000, 0.05);
    const after = page(0.075);
    const raw = ctrDelta(before, after)!;
    expect(raw).toBeLessThanOrEqual(REVERT_CTR_DROP); // raw would auto-revert

    const adj = adjustedCtrDelta(before, after, { ctr: 0.0325 })!; // site -35%
    expect(adj.delta!).toBeGreaterThan(REVERT_CTR_DROP);          // adjusted does not
    expect(adj.delta!).toBeGreaterThan(0);
  });

  it('still condemns a page that fell while the site rose', () => {
    const r = adjustedCtrDelta(page(0.10, 1000, 0.05), page(0.09), { ctr: 0.06 });
    expect(r.delta).toBeCloseTo(-0.3, 5); // -0.1 - (+0.2)
    expect(r.delta!).toBeLessThan(REVERT_CTR_DROP);
  });

  it('falls back to the raw delta when no site baseline was captured', () => {
    const r = adjustedCtrDelta(page(0.10), page(0.12), { ctr: 0.05 });
    expect(r.adjusted).toBe(false);
    expect(r.siteDelta).toBeNull();
    expect(r.delta).toBeCloseTo(0.2, 5);
  });

  it('falls back when the site "after" is missing', () => {
    const r = adjustedCtrDelta(page(0.10, 1000, 0.05), page(0.12), null);
    expect(r.adjusted).toBe(false);
    expect(r.delta).toBeCloseTo(0.2, 5);
  });

  it('stays null when the underlying sample is too thin to measure', () => {
    const r = adjustedCtrDelta(page(0.10, 10, 0.05), page(0.12, 10), { ctr: 0.04 });
    expect(r.delta).toBeNull();
    expect(r.adjusted).toBe(false);
  });
});

describe('priorWeight', () => {
  it('is exactly neutral below the minimum sample', () => {
    expect(priorWeight(1, 0.5, MIN_SAMPLE - 1)).toBe(1);
    expect(priorWeight(0, -0.5, MIN_SAMPLE - 1)).toBe(1);
  });

  it('rewards a module that wins and punishes one that loses', () => {
    const good = priorWeight(0.9, 0.25, 40);
    const bad = priorWeight(0.1, -0.25, 40);
    expect(good).toBeGreaterThan(1);
    expect(bad).toBeLessThan(1);
    expect(good).toBeGreaterThan(bad);
  });

  it('never swings more than ±50%, so nothing gets buried', () => {
    expect(priorWeight(1, 5, 10_000)).toBeLessThanOrEqual(1.5);
    expect(priorWeight(0, -5, 10_000)).toBeGreaterThanOrEqual(0.5);
  });

  it('trusts a thin sample less than a thick one', () => {
    const thin = priorWeight(1, 0.3, MIN_SAMPLE);
    const thick = priorWeight(1, 0.3, 200);
    expect(thin).toBeGreaterThan(1);
    expect(thick).toBeGreaterThan(thin); // more evidence, more movement
  });

  it('treats a coin-flip record as neutral however large the sample', () => {
    expect(priorWeight(0.5, 0, 500)).toBeCloseTo(1, 5);
  });
});

describe('shrink', () => {
  it('returns nothing without evidence', () => {
    expect(shrink(0.9, 0)).toBe(0);
  });

  it('approaches the observed value as evidence accumulates', () => {
    expect(shrink(1, 1)).toBeLessThan(shrink(1, 10));
    expect(shrink(1, 10)).toBeLessThan(shrink(1, 1000));
    expect(shrink(1, 1_000_000)).toBeCloseTo(1, 3);
  });
});

describe('isHeldOut', () => {
  it('is stable for a given id', () => {
    const id = 'a3f1c2d4-0000-4000-8000-000000000001';
    expect(isHeldOut(id)).toBe(isHeldOut(id));
  });

  it('holds out roughly the configured fraction', () => {
    const ids = Array.from({ length: 4000 }, (_, i) => `fix-${i}-${(i * 7919) % 104729}`);
    const held = ids.filter((id) => isHeldOut(id)).length / ids.length;
    // Wide tolerance: this asserts the sampler isn't broken, not that a hash
    // is perfectly uniform.
    expect(held).toBeGreaterThan(HOLDOUT_FRACTION * 0.5);
    expect(held).toBeLessThan(HOLDOUT_FRACTION * 1.8);
  });

  it('holds out everything at fraction 1 and nothing at 0', () => {
    expect(isHeldOut('anything', 1)).toBe(true);
    expect(isHeldOut('anything', 0)).toBe(false);
  });
});
