import { describe, it, expect } from 'vitest';

// Pure re-implementation of the plan resolution rules enforced in the
// DodoPayments webhook (src/app/api/payments/webhooks/dodopayments/route.ts).
// Keeps the test hermetic - we don't import the route (which would boot the
// Next runtime) but the allowlist and decision tree are intentionally
// identical.

const PLAN_MAP: Record<string, string> = {
  prod_starter: 'starter',
  prod_pro: 'pro',
  prod_agency: 'agency',
  prod_enterprise: 'enterprise',
};

const ALLOWED_WEBHOOK_PLANS = new Set(['starter', 'pro', 'agency', 'enterprise']);

function resolvePlan(
  productId: string | undefined | null,
  _metadata: { plan?: string } = {},
): string | null {
  // metadata.plan is intentionally NOT consulted. The function accepts it so
  // the test can demonstrate that attacker-controlled metadata does not
  // influence the resolved plan.
  const plan = productId ? PLAN_MAP[productId] : null;
  if (!plan || !ALLOWED_WEBHOOK_PLANS.has(plan)) return null;
  return plan;
}

describe('webhook plan resolution', () => {
  it('resolves starter/pro/agency/enterprise from a known product_id', () => {
    expect(resolvePlan('prod_starter')).toBe('starter');
    expect(resolvePlan('prod_pro')).toBe('pro');
    expect(resolvePlan('prod_agency')).toBe('agency');
    expect(resolvePlan('prod_enterprise')).toBe('enterprise');
  });

  it('returns null when product_id is unknown', () => {
    expect(resolvePlan('prod_unknown')).toBeNull();
  });

  it('returns null when product_id is missing', () => {
    expect(resolvePlan(undefined)).toBeNull();
    expect(resolvePlan(null)).toBeNull();
    expect(resolvePlan('')).toBeNull();
  });

  it('ignores metadata.plan entirely (no fallback)', () => {
    // The pre-fix code fell back to metadata.plan when product_id was absent.
    // After the fix this MUST be null - trusting metadata.plan was the plan-
    // hijack vector into users.plan = 'owner' -> admin-backend access.
    expect(resolvePlan(undefined, { plan: 'starter' })).toBeNull();
    expect(resolvePlan(null, { plan: 'pro' })).toBeNull();
    expect(resolvePlan('', { plan: 'enterprise' })).toBeNull();
  });

  it('rejects owner even if it somehow slipped into PLAN_MAP', () => {
    // Defense-in-depth: simulate a PLAN_MAP that mapped a product to owner
    // (e.g. via a future bug or misconfigured env var).
    const planMapWithOwner: Record<string, string> = {
      ...PLAN_MAP,
      prod_rogue: 'owner',
    };
    const resolved = planMapWithOwner['prod_rogue'];
    expect(resolved).toBe('owner');
    expect(ALLOWED_WEBHOOK_PLANS.has(resolved)).toBe(false);
  });

  it('rejects any plan string not in the paid-tier allowlist', () => {
    for (const bogus of ['owner', 'admin', 'trial', 'free', 'godmode', '']) {
      expect(ALLOWED_WEBHOOK_PLANS.has(bogus)).toBe(false);
    }
  });
});
