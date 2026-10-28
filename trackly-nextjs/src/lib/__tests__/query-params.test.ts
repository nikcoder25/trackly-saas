/**
 * Tests for intParam (src/lib/query-params.ts).
 *
 * This helper exists because of a bug that shipped and was only caught by
 * rendering the page: `Number(null)` is `0`, not `NaN`, so the usual
 *
 *   const n = Number(sp.get('limit'));
 *   if (!Number.isFinite(n)) return fallback;
 *
 * never reaches the fallback for an absent parameter. It clamps 0 up to the
 * minimum instead, which turned a default limit of 200 into 1 and a 30-day
 * window into 1 day. The endpoints did not error - they quietly returned a
 * single row, which reads as "no data" rather than as a defect.
 *
 * The first two cases below are the regression; the rest keep the clamp
 * honest.
 */
import { describe, expect, it } from 'vitest';

import { intParam } from '../query-params';

describe('intParam', () => {
  it('returns the fallback when the parameter is absent', () => {
    // The regression: Number(null) === 0, which is finite.
    expect(intParam(null, 200, 1, 500)).toBe(200);
    expect(intParam(undefined, 30, 1, 365)).toBe(30);
  });

  it('returns the fallback for an empty or whitespace value', () => {
    // `?limit=` is absent in spirit; Number('') is also 0.
    expect(intParam('', 200, 1, 500)).toBe(200);
    expect(intParam('   ', 200, 1, 500)).toBe(200);
  });

  it('returns the fallback for a non-numeric value', () => {
    expect(intParam('abc', 90, 7, 365)).toBe(90);
    expect(intParam('NaN', 90, 7, 365)).toBe(90);
  });

  it('uses a supplied value inside the range', () => {
    expect(intParam('45', 30, 1, 365)).toBe(45);
  });

  it('clamps to the bounds', () => {
    expect(intParam('9999', 30, 1, 365)).toBe(365);
    expect(intParam('-5', 30, 1, 365)).toBe(1);
  });

  it('honours an explicit zero by clamping it, not by falling back', () => {
    // A caller who really passed ?days=0 asked for the minimum; only an
    // ABSENT value should mean "use the default".
    expect(intParam('0', 30, 1, 365)).toBe(1);
  });

  it('truncates rather than rounding a fractional value', () => {
    expect(intParam('30.9', 10, 1, 365)).toBe(30);
  });

  it('accepts a value with surrounding whitespace', () => {
    expect(intParam(' 45 ', 30, 1, 365)).toBe(45);
  });

  it('rejects Infinity rather than clamping it to max', () => {
    expect(intParam('Infinity', 30, 1, 365)).toBe(30);
  });
});
