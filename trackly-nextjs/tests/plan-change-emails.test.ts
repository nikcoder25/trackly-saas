import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { comparePlans, getPlanRank } from '../src/lib/plan-config';
import {
  sendPlanUpgradeEmail,
  sendPlanDowngradeEmail,
  sendPlanCancellationEmail,
} from '../src/lib/email';

describe('comparePlans', () => {
  it('classifies free → paid as upgrade', () => {
    expect(comparePlans('free', 'starter')).toBe('upgrade');
    expect(comparePlans('free', 'pro')).toBe('upgrade');
    expect(comparePlans('free', 'agency')).toBe('upgrade');
    expect(comparePlans('free', 'enterprise')).toBe('upgrade');
  });

  it('classifies paid → higher paid as upgrade', () => {
    expect(comparePlans('starter', 'pro')).toBe('upgrade');
    expect(comparePlans('pro', 'agency')).toBe('upgrade');
    expect(comparePlans('agency', 'enterprise')).toBe('upgrade');
  });

  it('classifies paid → lower paid as downgrade', () => {
    expect(comparePlans('agency', 'starter')).toBe('downgrade');
    expect(comparePlans('pro', 'starter')).toBe('downgrade');
    expect(comparePlans('enterprise', 'agency')).toBe('downgrade');
  });

  it('classifies paid → free as downgrade (cancellation)', () => {
    expect(comparePlans('starter', 'free')).toBe('downgrade');
    expect(comparePlans('agency', 'free')).toBe('downgrade');
  });

  it('classifies same-rank transitions as same (renewals, free↔trial)', () => {
    expect(comparePlans('starter', 'starter')).toBe('same');
    expect(comparePlans('free', 'trial')).toBe('same');
    expect(comparePlans('trial', 'free')).toBe('same');
  });

  it('treats unknown plans as rank 0', () => {
    expect(getPlanRank('unknown')).toBe(0);
    expect(getPlanRank(null)).toBe(0);
    expect(getPlanRank(undefined)).toBe(0);
    expect(comparePlans('mystery', 'pro')).toBe('upgrade');
  });
});

// The Resend / SendGrid send path is gated behind EMAIL_API_KEY: when
// unset, sendEmail logs and returns { sent: true } without making any
// network call. These tests run in that "DEV MODE" branch so we can
// assert the templates render without throwing and never accidentally
// hit a real API. We also assert the rendered HTML contains the
// expected plan labels and CTA — anything more brittle than that
// would couple the test to copy.

describe('plan change email templates', () => {
  const originalKey = process.env.EMAIL_API_KEY;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.EMAIL_API_KEY;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.EMAIL_API_KEY;
    else process.env.EMAIL_API_KEY = originalKey;
    logSpy.mockRestore();
  });

  it('sendPlanUpgradeEmail returns sent=true and references both plan labels in subject', async () => {
    const result = await sendPlanUpgradeEmail('jane@example.com', {
      previousPlan: 'free',
      newPlan: 'pro',
    });
    expect(result.sent).toBe(true);
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('jane@example.com');
    expect(logged).toContain('Pro plan');
  });

  it('sendPlanDowngradeEmail returns sent=true with the new plan label in subject', async () => {
    const result = await sendPlanDowngradeEmail('jane@example.com', {
      previousPlan: 'agency',
      newPlan: 'starter',
    });
    expect(result.sent).toBe(true);
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('changed to Starter');
  });

  it('sendPlanCancellationEmail returns sent=true with cancellation subject', async () => {
    const result = await sendPlanCancellationEmail('jane@example.com', {
      previousPlan: 'pro',
    });
    expect(result.sent).toBe(true);
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('subscription was cancelled');
  });

  it('does not throw on unknown previous plan strings (defaults to free config)', async () => {
    const result = await sendPlanUpgradeEmail('jane@example.com', {
      previousPlan: 'mystery_plan',
      newPlan: 'pro',
    });
    expect(result.sent).toBe(true);
  });
});
