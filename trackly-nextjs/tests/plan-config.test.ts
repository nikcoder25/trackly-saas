import { describe, expect, it } from 'vitest';
import {
  PLAN_CREDITS,
  ECONOMY_MODEL_BY_PLATFORM,
  PREMIUM_MODEL_BY_PLATFORM,
  getPlanCredits,
  resolveModelForPlan,
  isLowBalance,
  LOW_BALANCE_THRESHOLD,
} from '../src/lib/plan-config';

describe('PLAN_CREDITS', () => {
  it('codifies the v2 spec for each tier', () => {
    expect(PLAN_CREDITS.pro).toMatchObject({
      monthlyCredits: 2500,
      manualDailyCap: 50,
      maxPlatforms: 3,
      maxPromptsPerBrand: 25,
      modelTier: 'economy',
      scheduledRuns: true,
    });
    expect(PLAN_CREDITS.agency).toMatchObject({
      monthlyCredits: 7000,
      manualDailyCap: 200,
      maxPlatforms: 6,
      maxPromptsPerBrand: 100,
      modelTier: 'premium',
    });
    expect(PLAN_CREDITS.free.scheduledRuns).toBe(false);
    expect(PLAN_CREDITS.free.modelTier).toBe('economy');
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
