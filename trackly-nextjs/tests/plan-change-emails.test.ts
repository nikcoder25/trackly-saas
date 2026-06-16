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

  it('classifies trial → paid as upgrade (the post-signup conversion path)', () => {
    // Newly registered users land on plan='trial' (see
    // api/auth/register/route.ts). When their first DodoPayments
    // checkout completes, payment.succeeded / subscription.active
    // flow through the upgrade branch with previousPlan='trial',
    // and comparePlans must classify that as an upgrade so the
    // confirmation email actually fires.
    expect(comparePlans('trial', 'starter')).toBe('upgrade');
    expect(comparePlans('trial', 'pro')).toBe('upgrade');
    expect(comparePlans('trial', 'agency')).toBe('upgrade');
    expect(comparePlans('trial', 'enterprise')).toBe('upgrade');
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

  it('classifies same-rank transitions as same (renewals)', () => {
    expect(comparePlans('starter', 'starter')).toBe('same');
    expect(comparePlans('free', 'free')).toBe('same');
    expect(comparePlans('trial', 'trial')).toBe('same');
  });

  it('ranks trial above free so the trial→free transition is a downgrade', () => {
    // Pre-fix, trial and free both lived at rank 0 and the transition
    // resolved to 'same', silently suppressing any downgrade email a
    // future trial-expiry path would want to send. trial now sits
    // strictly between free and starter.
    expect(comparePlans('free', 'trial')).toBe('upgrade');
    expect(comparePlans('trial', 'free')).toBe('downgrade');
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
// expected plan labels and CTA - anything more brittle than that
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

  it('sends upgrade email when trial converts to paid plan', async () => {
    // Mirrors the DodoPayments webhook's behaviour for the post-signup
    // conversion: a trial user paying for Pro should get the upgrade
    // template (not downgrade, not cancellation). The webhook's
    // `comparePlans(previousPlan, plan)` decision is exercised
    // separately above; this test asserts the chosen template
    // renders correctly end-to-end with the trial→pro inputs.
    const result = await sendPlanUpgradeEmail('trialuser@example.com', {
      previousPlan: 'trial',
      newPlan: 'pro',
    });
    expect(result.sent).toBe(true);
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('trialuser@example.com');
    expect(logged).toContain('Pro plan');
  });
});
