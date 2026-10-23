import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: { query: (...args: Parameters<QueryFn>) => queryMock(...args) },
}));

import { expireStaleTrials, isTrialExpired, EXPIRE_TRIALS_SQL } from '../src/lib/trial-expiry';
import { getEffectivePlan } from '../src/lib/constants';
import { toAdminUserRow } from '../src/lib/admin-user-row';

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
});
afterEach(() => { vi.clearAllMocks(); });

describe('isTrialExpired', () => {
  const now = new Date('2026-10-23T12:00:00Z');

  it('expires a trial whose end date has passed (stale April signup)', () => {
    expect(isTrialExpired('trial', '2026-04-10T00:00:00Z', now)).toBe(true);
    expect(isTrialExpired('trial', new Date(now.getTime() - 1), now)).toBe(true);
  });

  it('keeps a trial that is still running', () => {
    expect(isTrialExpired('trial', new Date(now.getTime() + 3 * DAY), now)).toBe(false);
  });

  it('expires trials with a missing or invalid end date (matches getEffectivePlan)', () => {
    expect(isTrialExpired('trial', null, now)).toBe(true);
    expect(isTrialExpired('trial', 'not a date', now)).toBe(true);
    expect(getEffectivePlan('trial', null)).toBe('free');
  });

  it('never touches non-trial plans', () => {
    for (const p of ['free', 'starter', 'pro', 'agency', 'owner']) {
      expect(isTrialExpired(p, '2020-01-01T00:00:00Z', now)).toBe(false);
    }
  });

  it('agrees with getEffectivePlan at request time', () => {
    const past = new Date(Date.now() - DAY).toISOString();
    const future = new Date(Date.now() + DAY).toISOString();
    expect(getEffectivePlan('trial', past)).toBe('free');
    expect(isTrialExpired('trial', past)).toBe(true);
    expect(getEffectivePlan('trial', future)).toBe('trial');
    expect(isTrialExpired('trial', future)).toBe(false);
  });
});

describe('expireStaleTrials', () => {
  it('moves only expired trial rows to free and stamps trialExpiredAt', async () => {
    queryMock.mockImplementation(async () => ({ rows: [{ id: 'u1' }, { id: 'u2' }] }));
    const now = new Date('2026-10-23T12:00:00Z');
    const res = await expireStaleTrials(now);

    expect(res).toEqual({ expired: 2, userIds: ['u1', 'u2'] });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toBe(EXPIRE_TRIALS_SQL);
    expect(sql).toMatch(/SET plan = 'free'/);
    expect(sql).toMatch(/WHERE plan = 'trial'/);
    expect(sql).toMatch(/trial_ends_at IS NULL OR trial_ends_at <= \$1/);
    expect(sql).toMatch(/trialExpiredAt/);
    // trial_ends_at is kept so the admin panel can still show the end date.
    expect(sql).not.toMatch(/trial_ends_at\s*=/);
    expect(params).toEqual([now.toISOString()]);
  });

  it('is a no-op when nothing is stale', async () => {
    const res = await expireStaleTrials();
    expect(res.expired).toBe(0);
  });
});

describe('toAdminUserRow', () => {
  it('reports the effective plan for an expired trial and keeps the end date', () => {
    const row = toAdminUserRow({
      id: 'u1', email: 'a@b.com', plan: 'trial', trial_ends_at: new Date('2026-04-12T00:00:00Z'),
    });
    expect(row.plan).toBe('free');
    expect(row.raw_plan).toBe('trial');
    expect(row.trial_ends_at).toBe('2026-04-12T00:00:00.000Z');
  });

  it('leaves live trials and paid plans alone', () => {
    const future = new Date(Date.now() + 2 * DAY);
    expect(toAdminUserRow({ plan: 'trial', trial_ends_at: future }).plan).toBe('trial');
    expect(toAdminUserRow({ plan: 'owner', trial_ends_at: null }).plan).toBe('owner');
    expect(toAdminUserRow({ plan: 'pro', trial_ends_at: null }).trial_ends_at).toBeNull();
  });
});
