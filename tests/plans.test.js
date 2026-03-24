import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../config/db', () => ({
  pool: { query: vi.fn() }
}));

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-at-least-16-chars-long';
  process.env.JWT_SECRET = 'test-jwt-secret-at-least-16-chars-long-32chars';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
});

const { getPlanLimits, PLAN_LIMITS } = await import('../lib/plans.js');

describe('getPlanLimits', () => {
  it('returns correct limits for the starter plan', () => {
    const limits = getPlanLimits('starter');
    expect(limits).toEqual(PLAN_LIMITS.starter);
    expect(limits.brands).toBe(1);
    expect(limits.prompts).toBe(30);
    expect(limits.apiAccess).toBe(false);
  });

  it('returns correct limits for the pro plan', () => {
    const limits = getPlanLimits('pro');
    expect(limits).toEqual(PLAN_LIMITS.pro);
    expect(limits.brands).toBe(5);
    expect(limits.prompts).toBe(250);
    expect(limits.sentiment).toBe(true);
  });

  it('returns correct limits for the agency plan', () => {
    const limits = getPlanLimits('agency');
    expect(limits).toEqual(PLAN_LIMITS.agency);
    expect(limits.brands).toBe(20);
    expect(limits.prompts).toBe(1000);
  });

  it('returns correct limits for the enterprise plan', () => {
    const limits = getPlanLimits('enterprise');
    expect(limits).toEqual(PLAN_LIMITS.enterprise);
    expect(limits.apiAccess).toBe(true);
    expect(limits.prioritySupport).toBe(true);
  });

  it('returns correct limits for the free plan', () => {
    const limits = getPlanLimits('free');
    expect(limits).toEqual(PLAN_LIMITS.free);
    expect(limits.brands).toBe(1);
    expect(limits.prompts).toBe(5);
    expect(limits.scheduledRuns).toBe(false);
  });

  it('falls back to free plan limits for unknown plans', () => {
    const limits = getPlanLimits('nonexistent');
    expect(limits).toEqual(PLAN_LIMITS.free);
  });

  it('falls back to free plan limits for undefined input', () => {
    const limits = getPlanLimits(undefined);
    expect(limits).toEqual(PLAN_LIMITS.free);
  });
});
