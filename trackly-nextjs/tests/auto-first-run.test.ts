import { describe, it, expect } from 'vitest';
import { resolveFirstRunDispatch } from '@/contexts/RunContext';

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
