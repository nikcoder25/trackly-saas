import { describe, it, expect } from 'vitest';
import { resolveFirstRunDispatch, resolveAutoFirstScan } from '@/contexts/RunContext';

const NONE = new Set<string>();

/**
 * Onboarding auto-first-scan: after a brand is created the modal flags it via
 * markPendingFirstRun, and the persistent <AutoFirstRun> effect dispatches the
 * scan once the brand lands in context. These cover the pure decision the
 * effect runs on, so the "first scan starts on its own" behaviour can't
 * silently regress again.
 */
describe('resolveFirstRunDispatch', () => {
  it('does nothing when no brand is flagged', () => {
    expect(resolveFirstRunDispatch(null, [{ id: 'b1' }], false)).toEqual({ action: 'idle' });
  });

  it('waits when the flagged brand has not loaded into context yet', () => {
    // Brand was just created; refreshBrands hasn't surfaced it yet.
    expect(resolveFirstRunDispatch('b1', [], false)).toEqual({ action: 'wait' });
    expect(resolveFirstRunDispatch('b1', [{ id: 'other' }], false)).toEqual({ action: 'wait' });
  });

  it('dispatches the first scan for a freshly created brand with no runs', () => {
    expect(resolveFirstRunDispatch('b1', [{ id: 'b1' }], false)).toEqual({ action: 'run', brandId: 'b1' });
    // runs present but empty array still counts as "never run"
    expect(resolveFirstRunDispatch('b1', [{ id: 'b1', runs: [] }], false)).toEqual({ action: 'run', brandId: 'b1' });
  });

  it('targets the flagged brand even when it is not first in the list', () => {
    const brands = [{ id: 'a' }, { id: 'b1' }, { id: 'c' }];
    expect(resolveFirstRunDispatch('b1', brands, false)).toEqual({ action: 'run', brandId: 'b1' });
  });

  it('clears the flag instead of re-running when the brand already has data', () => {
    const brands = [{ id: 'b1', runs: [{ id: 'r1' }] }];
    expect(resolveFirstRunDispatch('b1', brands, false)).toEqual({ action: 'clear' });
  });

  it('waits (does not double-dispatch) while a run is already in flight', () => {
    expect(resolveFirstRunDispatch('b1', [{ id: 'b1' }], true)).toEqual({ action: 'wait' });
  });
});

/**
 * resolveAutoFirstScan adds the durable fallback on top of the creation flag:
 * the first scan also kicks off for the brand the user is looking at when it
 * has prompts but no results and was never auto-scanned. This is what makes the
 * scan start on its own even when the one-shot creation flag was lost (refresh,
 * new tab, verification redirect, an errored dispatch), without ever looping.
 */
describe('resolveAutoFirstScan', () => {
  const withQ = (id: string, extra: Record<string, unknown> = {}) => ({ id, queries: ['q1', 'q2'], ...extra });

  it('never stacks a second scan while one is running', () => {
    expect(resolveAutoFirstScan('b1', 'b1', [withQ('b1')], true, NONE)).toEqual({ action: 'wait' });
    expect(resolveAutoFirstScan(null, 'b1', [withQ('b1')], true, NONE)).toEqual({ action: 'wait' });
  });

  it('honours the explicit creation flag first (fast path)', () => {
    expect(resolveAutoFirstScan('b1', null, [withQ('b1')], false, NONE)).toEqual({ action: 'run', brandId: 'b1' });
    expect(resolveAutoFirstScan('b1', 'other', [withQ('b1'), withQ('other')], false, NONE)).toEqual({ action: 'run', brandId: 'b1' });
  });

  it('waits for a flagged brand that has not loaded into context yet', () => {
    expect(resolveAutoFirstScan('b1', null, [], false, NONE)).toEqual({ action: 'wait' });
  });

  it('clears the flag (and does not re-run) when the flagged brand already has data or was auto-run', () => {
    expect(resolveAutoFirstScan('b1', null, [withQ('b1', { runs: [{ id: 'r1' }] })], false, NONE)).toEqual({ action: 'clear' });
    expect(resolveAutoFirstScan('b1', null, [withQ('b1')], false, new Set(['b1']))).toEqual({ action: 'clear' });
  });

  it('FALLBACK: auto-runs the selected brand with prompts but no runs when no flag is set', () => {
    expect(resolveAutoFirstScan(null, 'b1', [withQ('b1')], false, NONE)).toEqual({ action: 'run', brandId: 'b1' });
  });

  it('FALLBACK: does not auto-run a brand that already has results', () => {
    expect(resolveAutoFirstScan(null, 'b1', [withQ('b1', { runs: [{ id: 'r1' }] })], false, NONE)).toEqual({ action: 'idle' });
  });

  it('FALLBACK: does not auto-run a brand with no tracked prompts', () => {
    expect(resolveAutoFirstScan(null, 'b1', [{ id: 'b1', queries: [] }], false, NONE)).toEqual({ action: 'idle' });
  });

  it('FALLBACK: fires only once per brand — the persistent guard prevents loops', () => {
    expect(resolveAutoFirstScan(null, 'b1', [withQ('b1')], false, new Set(['b1']))).toEqual({ action: 'idle' });
  });

  it('does nothing when there is no flag and no selected brand', () => {
    expect(resolveAutoFirstScan(null, null, [withQ('b1')], false, NONE)).toEqual({ action: 'idle' });
  });
});
