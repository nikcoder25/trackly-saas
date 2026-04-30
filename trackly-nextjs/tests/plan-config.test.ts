import { describe, expect, it } from 'vitest';
import {
  PLAN_CREDITS,
  ECONOMY_MODEL_BY_PLATFORM,
  PREMIUM_MODEL_BY_PLATFORM,
  getPlanCredits,
  resolveModelForPlan,
  isLowBalance,
  LOW_BALANCE_THRESHOLD,
  comparePlans,
  getPlanRank,
} from '../src/lib/plan-config';

describe('PLAN_CREDITS', () => {
  it('codifies the v3 spec for each tier (account-wide tracked prompts)', () => {
    expect(PLAN_CREDITS.free).toMatchObject({
      monthlyCredits: 150,
      manualDailyCap: 5,
      cooldownSeconds: 300,
      maxPlatforms: 2,
      trackedPromptsPerAccount: 5,
      modelTier: 'economy',
      scheduledRuns: true,
      autoRunFrequency: 'weekly',
      brandsCap: 1,
    });
    expect(PLAN_CREDITS.starter).toMatchObject({
      monthlyCredits: 750,
      manualDailyCap: 20,
      cooldownSeconds: 120,
      maxPlatforms: 2,
      trackedPromptsPerAccount: 15,
      modelTier: 'economy',
      autoRunFrequency: 'every_2_days',
      brandsCap: 3,
    });
    expect(PLAN_CREDITS.pro).toMatchObject({
      monthlyCredits: 2500,
      manualDailyCap: 50,
      cooldownSeconds: 60,
      maxPlatforms: 3,
      trackedPromptsPerAccount: 25,
      modelTier: 'economy',
      scheduledRuns: true,
      autoRunFrequency: 'daily',
      brandsCap: 9999,
    });
    expect(PLAN_CREDITS.agency).toMatchObject({
      monthlyCredits: 8000,
      manualDailyCap: 9999,
      cooldownSeconds: 30,
      // Trackly supports 5 AI platforms (ChatGPT, Perplexity, Claude,
      // Gemini, Grok). Pre-launch fix-up brought the cap down from 6
      // to 5 to match reality — see PR "chore(pre-launch): platform
      // count copy".
      maxPlatforms: 5,
      trackedPromptsPerAccount: 100,
      modelTier: 'premium',
      autoRunFrequency: 'daily',
      brandsCap: 9999,
    });
  });

  it('keeps the deprecated maxPromptsPerBrand alias in lockstep with trackedPromptsPerAccount', () => {
    // Removed in a follow-up release; for now both fields hold the
    // same number so straggling callers keep compiling.
    for (const plan of ['free', 'starter', 'pro', 'agency'] as const) {
      const cfg = PLAN_CREDITS[plan];
      expect(cfg.maxPromptsPerBrand).toBe(cfg.trackedPromptsPerAccount);
    }
  });

  it('falls back to free for unknown plans', () => {
    expect(getPlanCredits('mystery')).toBe(PLAN_CREDITS.free);
    expect(getPlanCredits(undefined)).toBe(PLAN_CREDITS.free);
    expect(getPlanCredits(null)).toBe(PLAN_CREDITS.free);
  });
});

describe('resolveModelForPlan', () => {
  it('clamps premium-requested models to economy on free/starter/pro', () => {
    expect(resolveModelForPlan('ChatGPT', 'pro', 'gpt-5-search-api'))
      .toBe(ECONOMY_MODEL_BY_PLATFORM.ChatGPT);
    expect(resolveModelForPlan('Claude', 'starter', 'claude-sonnet-4-20250514'))
      .toBe(ECONOMY_MODEL_BY_PLATFORM.Claude);
    expect(resolveModelForPlan('Gemini', 'free', 'gemini-2.5-pro'))
      .toBe(ECONOMY_MODEL_BY_PLATFORM.Gemini);
  });

  it('keeps an explicitly-requested economy model on a low-tier plan', () => {
    expect(resolveModelForPlan(
      'ChatGPT', 'pro', ECONOMY_MODEL_BY_PLATFORM.ChatGPT,
    )).toBe(ECONOMY_MODEL_BY_PLATFORM.ChatGPT);
  });

  it('falls back to economy when nothing is requested on a low-tier plan', () => {
    expect(resolveModelForPlan('ChatGPT', 'pro')).toBe(ECONOMY_MODEL_BY_PLATFORM.ChatGPT);
  });

  it('honors a premium request on agency / owner', () => {
    expect(resolveModelForPlan('ChatGPT', 'agency', 'gpt-5-search-api'))
      .toBe('gpt-5-search-api');
    expect(resolveModelForPlan('Claude', 'owner', 'claude-sonnet-4-20250514'))
      .toBe('claude-sonnet-4-20250514');
  });

  it('falls back to platform premium when nothing requested on agency', () => {
    expect(resolveModelForPlan('ChatGPT', 'agency'))
      .toBe(PREMIUM_MODEL_BY_PLATFORM.ChatGPT);
  });
});

describe('comparePlans / PLAN_RANK', () => {
  // Pre-fix, trial and free both lived at rank 0 so a trial -> free
  // transition resolved to 'same' and silently suppressed any downgrade
  // email a future trial-expiry path would want to send. Trial now sits
  // strictly above free and below every paid tier.

  it('(a) ranks trial higher than free: comparePlans(trial -> free) is a downgrade', () => {
    expect(getPlanRank('trial')).toBeGreaterThan(getPlanRank('free'));
    expect(comparePlans('trial', 'free')).toBe('downgrade');
  });

  it('(b) ranks free lower than trial: comparePlans(free -> trial) is an upgrade', () => {
    expect(getPlanRank('free')).toBeLessThan(getPlanRank('trial'));
    expect(comparePlans('free', 'trial')).toBe('upgrade');
  });

  it('(c) preserves every existing paid-tier comparison', () => {
    // free -> paid still upgrades.
    expect(comparePlans('free', 'starter')).toBe('upgrade');
    expect(comparePlans('free', 'pro')).toBe('upgrade');
    expect(comparePlans('free', 'agency')).toBe('upgrade');
    expect(comparePlans('free', 'enterprise')).toBe('upgrade');

    // The crucial pre-fix invariant: the first paid checkout from
    // trial still classifies as an upgrade. We didn't break this.
    expect(comparePlans('trial', 'starter')).toBe('upgrade');
    expect(comparePlans('trial', 'pro')).toBe('upgrade');
    expect(comparePlans('trial', 'agency')).toBe('upgrade');
    expect(comparePlans('trial', 'enterprise')).toBe('upgrade');

    // Adjacent paid-tier moves.
    expect(comparePlans('starter', 'pro')).toBe('upgrade');
    expect(comparePlans('pro', 'agency')).toBe('upgrade');
    expect(comparePlans('agency', 'enterprise')).toBe('upgrade');

    // Downgrades.
    expect(comparePlans('agency', 'free')).toBe('downgrade');
    expect(comparePlans('agency', 'starter')).toBe('downgrade');
    expect(comparePlans('pro', 'free')).toBe('downgrade');
    expect(comparePlans('enterprise', 'agency')).toBe('downgrade');

    // Same plan.
    expect(comparePlans('free', 'free')).toBe('same');
    expect(comparePlans('pro', 'pro')).toBe('same');
    expect(comparePlans('agency', 'agency')).toBe('same');

    // Owner is mapped high so admin/owner flips never accidentally
    // classify as a downgrade.
    expect(comparePlans('free', 'owner')).toBe('upgrade');
    expect(comparePlans('agency', 'owner')).toBe('upgrade');
  });

  it('(d) at the (would-be) trial-expiry decision point, comparePlans returns "downgrade"', () => {
    // Pins the contract for any future code path that flips a trial
    // user to free (cron, /auth/me hook, webhook, etc.) and decides
    // whether to dispatch a downgrade-style email by routing through
    // `comparePlans(previousPlan, newPlan)`. Today this path doesn't
    // exist yet (audit items C/D track adding it); this test ensures
    // that when it lands, the rank model already classifies the
    // transition correctly without any further plan-config change.
    const previousPlan = 'trial';
    const newPlan = 'free';
    const direction = comparePlans(previousPlan, newPlan);
    expect(direction).toBe('downgrade');
  });

  it('treats null/undefined "from" as free for safe defaulting', () => {
    expect(comparePlans(null, 'starter')).toBe('upgrade');
    expect(comparePlans(undefined, 'starter')).toBe('upgrade');
    expect(comparePlans(null, 'free')).toBe('same');
  });
});

describe('isLowBalance', () => {
  it('flags below the 20% threshold', () => {
    expect(LOW_BALANCE_THRESHOLD).toBe(0.2);
    expect(isLowBalance(400, 2500)).toBe(true);
    expect(isLowBalance(499, 2500)).toBe(true);
  });

  it('does not flag at or above the threshold', () => {
    expect(isLowBalance(500, 2500)).toBe(false);
    expect(isLowBalance(1000, 2500)).toBe(false);
  });

  it('does not flag at zero (zero is "out", a separate state)', () => {
    expect(isLowBalance(0, 2500)).toBe(false);
  });

  it('does not flag when monthlyCap is zero or negative', () => {
    expect(isLowBalance(10, 0)).toBe(false);
    expect(isLowBalance(10, -5)).toBe(false);
  });
});
