import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  recordDispatchOutcome,
  _resetDispatchAlertStateForTests,
} from '../src/lib/cron-dispatch-alert';

describe('recordDispatchOutcome', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetDispatchAlertStateForTests();
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it('first all-failed tick increments streak silently (no log)', () => {
    const result = recordDispatchOutcome({
      eligible: 13,
      processed: 0,
      errors: ['brand-1: HTTP 403'],
      tick: '2026-04-27T00:00:00.000Z',
    });
    expect(result).toEqual({ alerted: false, streak: 1 });
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('second consecutive all-failed tick logs cron.dispatch_all_failed and resets streak', () => {
    recordDispatchOutcome({
      eligible: 13,
      processed: 0,
      errors: [],
      tick: '2026-04-27T00:00:00.000Z',
    });
    const result = recordDispatchOutcome({
      eligible: 12,
      processed: 0,
      errors: ['brand-1: HTTP 403', 'brand-2: HTTP 403'],
      tick: '2026-04-27T01:00:00.000Z',
    });
    expect(result).toEqual({ alerted: true, streak: 2 });
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith('cron.dispatch_all_failed', {
      tick: '2026-04-27T01:00:00.000Z',
      eligible: 12,
      processed: 0,
      errors: ['brand-1: HTTP 403', 'brand-2: HTTP 403'],
    });

    // After firing, the streak is back to 0 - a single subsequent
    // all-failed tick should increment to 1, not re-fire immediately.
    const next = recordDispatchOutcome({
      eligible: 5,
      processed: 0,
      errors: [],
      tick: '2026-04-27T02:00:00.000Z',
    });
    expect(next).toEqual({ alerted: false, streak: 1 });
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it('a tick with processed>0 resets the streak', () => {
    recordDispatchOutcome({
      eligible: 13,
      processed: 0,
      errors: [],
      tick: '2026-04-27T00:00:00.000Z',
    });

    const recovered = recordDispatchOutcome({
      eligible: 13,
      processed: 13,
      errors: [],
      tick: '2026-04-27T01:00:00.000Z',
    });
    expect(recovered).toEqual({ alerted: false, streak: 0 });

    // A subsequent all-failed tick must NOT alert - streak was reset.
    const after = recordDispatchOutcome({
      eligible: 13,
      processed: 0,
      errors: [],
      tick: '2026-04-27T02:00:00.000Z',
    });
    expect(after).toEqual({ alerted: false, streak: 1 });
    expect(errSpy).not.toHaveBeenCalled();
  });
});
