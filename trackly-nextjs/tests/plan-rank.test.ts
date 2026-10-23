import { describe, expect, it } from 'vitest';
import {
  comparePlans,
  getPlanRank,
  getPlanSwitchDirection,
  hasActivePaidSubscription,
  isPaidPlan,
} from '../src/lib/plan-rank';
import * as planConfig from '../src/lib/plan-config';

describe('plan ranking', () => {
  it('orders free < trial < starter < pro < agency < enterprise < owner', () => {
    const order = ['free', 'trial', 'starter', 'pro', 'agency', 'enterprise', 'owner'];
    for (let i = 1; i < order.length; i++) {
      expect(getPlanRank(order[i])).toBeGreaterThan(getPlanRank(order[i - 1]));
    }
  });

  it('is re-exported unchanged from plan-config', () => {
    expect(planConfig.comparePlans).toBe(comparePlans);
    expect(planConfig.getPlanRank).toBe(getPlanRank);
  });

  it('classifies trial -> free as a downgrade and trial -> paid as an upgrade', () => {
    expect(comparePlans('trial', 'free')).toBe('downgrade');
    expect(comparePlans('trial', 'starter')).toBe('upgrade');
  });
});

describe('getPlanSwitchDirection', () => {
  it('returns current for the same plan', () => {
    expect(getPlanSwitchDirection('pro', 'pro')).toBe('current');
    expect(getPlanSwitchDirection(null, 'free')).toBe('current');
  });

  it('agrees for every pair across paid tiers (no Upgrade/Downgrade mismatch)', () => {
    expect(getPlanSwitchDirection('pro', 'starter')).toBe('downgrade');
    expect(getPlanSwitchDirection('pro', 'agency')).toBe('upgrade');
    expect(getPlanSwitchDirection('agency', 'pro')).toBe('downgrade');
    expect(getPlanSwitchDirection('starter', 'free')).toBe('downgrade');
    expect(getPlanSwitchDirection('free', 'starter')).toBe('upgrade');
  });

  it('treats every paid plan as an upgrade from trial', () => {
    for (const p of ['starter', 'pro', 'agency', 'enterprise']) {
      expect(getPlanSwitchDirection('trial', p)).toBe('upgrade');
    }
    expect(getPlanSwitchDirection('trial', 'free')).toBe('downgrade');
  });

  it('offers no switch for owner accounts', () => {
    for (const p of ['free', 'starter', 'pro', 'agency', 'enterprise']) {
      expect(getPlanSwitchDirection('owner', p)).toBe('unavailable');
    }
    expect(getPlanSwitchDirection('owner', 'owner')).toBe('current');
  });

  it('never labels a paid tier a downgrade from an unknown plan', () => {
    expect(getPlanSwitchDirection('legacy_x', 'starter')).toBe('upgrade');
  });
});

describe('hasActivePaidSubscription', () => {
  const sub = { subscription_id: 'sub_123', subscription_status: 'active' };

  it('is true only for a paid plan with a live subscription', () => {
    expect(hasActivePaidSubscription('pro', sub)).toBe(true);
    expect(hasActivePaidSubscription('pro', { subscription_id: 'sub_1' })).toBe(true);
  });

  it('is false for owner, trial and free even with stray settings', () => {
    expect(hasActivePaidSubscription('owner', sub)).toBe(false);
    expect(hasActivePaidSubscription('trial', sub)).toBe(false);
    expect(hasActivePaidSubscription('free', sub)).toBe(false);
  });

  it('is false without a subscription id or once cancelled', () => {
    expect(hasActivePaidSubscription('pro', {})).toBe(false);
    expect(hasActivePaidSubscription('pro', null)).toBe(false);
    expect(hasActivePaidSubscription('pro', { subscription_id: 'sub_1', subscription_status: 'cancelled' })).toBe(false);
  });

  it('isPaidPlan covers only billable tiers', () => {
    expect(['starter', 'pro', 'agency', 'enterprise'].every(isPaidPlan)).toBe(true);
    expect(['free', 'trial', 'owner', '', null].some((p) => isPaidPlan(p))).toBe(false);
  });
});
