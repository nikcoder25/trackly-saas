import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ pool: { query: vi.fn() } }));
vi.mock('@/lib/email', () => ({ enqueueEmail: vi.fn() }));
vi.mock('@/lib/cron-lock', () => ({ acquireCronLock: vi.fn() }));

import {
  pickDueStep,
  renderStep,
  unsubscribeToken,
  verifyUnsubscribeToken,
  type NurtureContext,
} from '@/lib/trial-nurture';

const H = 60 * 60 * 1000;
const signup = new Date('2026-10-01T00:00:00Z');
const trialEnd = new Date(signup.getTime() + 7 * 24 * H);
const at = (h: number) => new Date(signup.getTime() + h * H);

describe('pickDueStep', () => {
  it('walks the full 7-day sequence', () => {
    expect(pickDueStep(at(0.5), signup, trialEnd, {})).toBeNull();
    expect(pickDueStep(at(2), signup, trialEnd, {})).toBe('welcome');
    expect(pickDueStep(at(30), signup, trialEnd, {})).toBe('results');
    expect(pickDueStep(at(80), signup, trialEnd, {})).toBe('competitors');
    expect(pickDueStep(at(130), signup, trialEnd, {})).toBe('ending_soon');
    expect(pickDueStep(at(150), signup, trialEnd, {})).toBe('last_day');
    expect(pickDueStep(at(170), signup, trialEnd, {})).toBe('expired');
    expect(pickDueStep(at(168 + 200), signup, trialEnd, {})).toBe('winback');
    expect(pickDueStep(at(168 + 300), signup, trialEnd, {})).toBeNull();
  });

  it('does not resend a step already sent', () => {
    expect(pickDueStep(at(2), signup, trialEnd, { welcome: 'x' })).toBeNull();
  });

  it('never sends an earlier step after a later one went out', () => {
    // Trial extended: user is back in the "results" window but already got ending_soon.
    expect(pickDueStep(at(30), signup, trialEnd, { ending_soon: 'x' })).toBeNull();
  });

  it('prefers the later step when windows overlap on a short trial', () => {
    const shortEnd = new Date(signup.getTime() + 24 * H);
    expect(pickDueStep(at(2), signup, shortEnd, {})).toBe('last_day');
  });
});

const base: NurtureContext = {
  userId: 'u1',
  firstName: 'Sam',
  brandName: 'Acme',
  totalAnswers: 20,
  mentions: 5,
  recommended: 2,
  topCompetitor: 'Globex',
  trialEndsAt: trialEnd,
};

describe('renderStep', () => {
  it('nudges setup when no brand exists', () => {
    const r = renderStep('welcome', { ...base, brandName: null, totalAnswers: 0 });
    expect(r.html).toContain('/dashboard/setup');
  });

  it('shows real numbers once scans exist', () => {
    const r = renderStep('results', base);
    expect(r.subject).toContain('25%');
    expect(r.html).toContain('<strong>20</strong>');
  });

  it('names the top competitor', () => {
    expect(renderStep('competitors', base).subject).toContain('Globex');
  });

  it('escapes user-controlled values', () => {
    const r = renderStep('last_day', { ...base, brandName: '<script>x</script>', firstName: '<b>' });
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
  });

  it('every step carries an unsubscribe link', () => {
    for (const s of ['welcome', 'results', 'competitors', 'ending_soon', 'last_day', 'expired', 'winback'] as const) {
      expect(renderStep(s, base).html).toContain('/api/email/unsubscribe?u=u1');
    }
  });
});

describe('unsubscribe token', () => {
  it('verifies its own token and rejects others', () => {
    expect(verifyUnsubscribeToken('u1', unsubscribeToken('u1'))).toBe(true);
    expect(verifyUnsubscribeToken('u2', unsubscribeToken('u1'))).toBe(false);
    expect(verifyUnsubscribeToken('u1', 'short')).toBe(false);
  });
});
