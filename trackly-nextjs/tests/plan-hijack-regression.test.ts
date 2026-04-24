import { describe, it, expect } from 'vitest';

// Regression tests for plan-hijack enforcement on the highest-traffic
// plan-scoped code paths:
//   1. Admin-backend user create/update (only `admin` role can touch plans;
//      plan values are allowlisted).
//   2. /api/settings PUT (blocked-keys allowlist strips plan/role/subscription
//      before touching users.settings).
//   3. /api/payments/checkout (downgrade-via-checkout is blocked, plan string
//      must be in the product-id allowlist).
//   4. /api/payments/webhooks/dodopayments (subscription_id and customer_id
//      mismatch guards reject cross-user plan flips).
//
// These are pure re-implementations of the rules enforced by the route
// handlers. The webhook/signature tests already follow this pattern so the
// suite stays hermetic and doesn't boot the Next runtime.

// ─── 1. Admin-backend user plan allowlist ───────────────────────────────────
//
// Mirrors src/app/api/admin-backend/users/route.ts (POST) and
// src/app/api/admin-backend/users/[id]/route.ts (PUT). Both use the same
// allowlist so typos or hostile input can't land an unknown plan value.
// 'owner' is intentionally allowed for admin-created accounts but is still
// gated by requireAdmin() before reaching this validation.

const ADMIN_PLAN_ALLOWLIST = ['free', 'starter', 'pro', 'agency', 'enterprise', 'owner'];

function validateAdminPlan(plan: unknown): { ok: true; plan: string } | { ok: false; error: string } {
  if (typeof plan !== 'string') return { ok: false, error: 'Invalid plan' };
  if (!ADMIN_PLAN_ALLOWLIST.includes(plan)) return { ok: false, error: 'Invalid plan' };
  return { ok: true, plan };
}

describe('admin-backend user plan allowlist', () => {
  it('accepts every billing tier', () => {
    for (const p of ['free', 'starter', 'pro', 'agency', 'enterprise']) {
      expect(validateAdminPlan(p)).toEqual({ ok: true, plan: p });
    }
  });

  it('accepts owner (admin-created only; still gated by requireAdmin upstream)', () => {
    expect(validateAdminPlan('owner')).toEqual({ ok: true, plan: 'owner' });
  });

  it('rejects unknown plan strings', () => {
    for (const bogus of ['admin', 'godmode', 'Owner', 'OWNER', 'trial_extended', '']) {
      expect(validateAdminPlan(bogus).ok).toBe(false);
    }
  });

  it('rejects non-string input (prototype pollution / type confusion)', () => {
    for (const bogus of [null, undefined, 42, true, {}, [], { toString: () => 'owner' }]) {
      expect(validateAdminPlan(bogus).ok).toBe(false);
    }
  });
});

// ─── 2. Settings PUT blocked-keys enforcement ────────────────────────────────
//
// Mirrors src/app/api/settings/route.ts. The route builds its update from an
// allowlist (theme, emailNotifications, timezone, ...) AND strips any blocked
// key that may have bypassed the allowlist. Either layer alone would block a
// plan-hijack via /api/settings, but the defense-in-depth is the point: if a
// new allowed key ever accidentally collides with a blocked name, the strip
// pass is the backstop.

const SETTINGS_BLOCKED_KEYS = new Set([
  'totp_secret', 'totp_enabled', 'totp_backup_codes', 'totp_secret_pending',
  'dodo_subscription_id', 'dodo_customer_id', 'password_hash', 'role', 'plan', 'id', 'email',
  'subscription_id', 'subscription_status', 'failed_login_attempts', 'last_failed_login',
]);

const SETTINGS_ALLOWED_ENUMS: Record<string, string[]> = {
  theme: ['light', 'dark', 'system'],
  emailNotifications: ['true', 'false'],
  timezone: [],
  language: ['en', 'es', 'fr', 'de', 'ja', 'ko', 'zh', 'hi'],
  emailReportSchedule: ['off', 'weekly', 'monthly'],
  notifyInApp: ['true', 'false'],
  notifyEmail: ['true', 'false'],
  notifyWebhook: ['true', 'false'],
  webhookUrl: [],
  webhookStatus: ['none', 'active', 'error'],
};

function buildSettingsUpdate(body: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const [key, validValues] of Object.entries(SETTINGS_ALLOWED_ENUMS)) {
    if (body[key] === undefined) continue;
    const val = String(body[key]).slice(0, 500);
    if (validValues.length > 0 && !validValues.includes(val)) continue;
    updates[key] = val;
  }
  for (const key of SETTINGS_BLOCKED_KEYS) {
    delete updates[key];
  }
  return updates;
}

describe('settings PUT plan/role/subscription cannot be hijacked', () => {
  it('strips plan, role, and subscription_id from the update', () => {
    const out = buildSettingsUpdate({
      plan: 'owner',
      role: 'admin',
      subscription_id: 'sub_attacker',
      dodo_customer_id: 'cus_attacker',
      theme: 'dark',
    });
    expect(out.plan).toBeUndefined();
    expect(out.role).toBeUndefined();
    expect(out.subscription_id).toBeUndefined();
    expect(out.dodo_customer_id).toBeUndefined();
    // Legitimate fields still pass through
    expect(out.theme).toBe('dark');
  });

  it('silently drops keys outside the enum allowlist', () => {
    const out = buildSettingsUpdate({ theme: 'hacker_mode' });
    expect(out.theme).toBeUndefined();
  });

  it('returns empty object when ONLY blocked keys are sent', () => {
    const out = buildSettingsUpdate({
      plan: 'enterprise',
      role: 'admin',
      password_hash: '$2a$12$fake',
      email: 'new@example.com',
      id: 'other-user',
    });
    expect(Object.keys(out)).toHaveLength(0);
  });
});

// ─── 3. Checkout plan validation + downgrade prevention ──────────────────────
//
// Mirrors src/app/api/payments/checkout/route.ts. Two protections:
//   (a) plan must map to a configured PRODUCT_ID, so arbitrary strings are
//       rejected before any outbound Dodo call is made.
//   (b) PLAN_TIER comparison blocks same-tier and lower-tier checkouts so a
//       user can't "downgrade via checkout" to reset their billing state.

const PRODUCT_IDS: Record<string, string | undefined> = {
  starter: 'prod_starter_abc',
  pro: 'prod_pro_abc',
  agency: 'prod_agency_abc',
  enterprise: 'prod_enterprise_abc',
};

const PLAN_TIER: Record<string, number> = {
  free: 0, starter: 1, pro: 2, agency: 3, enterprise: 4, owner: 5,
};

function canCheckout(
  requestedPlan: unknown,
  currentUserPlan: string,
): { ok: true } | { ok: false; error: string } {
  const plan = typeof requestedPlan === 'string' ? requestedPlan.toLowerCase() : '';
  if (!plan || !PRODUCT_IDS[plan]) return { ok: false, error: 'Invalid plan' };

  const currentTier = PLAN_TIER[currentUserPlan] ?? 0;
  const targetTier = PLAN_TIER[plan] ?? 0;
  // Allow upgrading from free; block same-tier or lower-tier checkouts.
  if (targetTier <= currentTier && currentUserPlan !== 'free') {
    return { ok: false, error: 'Cannot downgrade via checkout.' };
  }
  return { ok: true };
}

describe('checkout plan-hijack protections', () => {
  it('rejects unknown / non-string plan values', () => {
    for (const bogus of ['owner', 'admin', 'godmode', '', 'ENTERPRISE ', null, undefined, 42]) {
      expect(canCheckout(bogus as unknown, 'free').ok).toBe(false);
    }
  });

  it('blocks downgrade via checkout (same or lower tier on a paid plan)', () => {
    expect(canCheckout('starter', 'pro').ok).toBe(false);
    expect(canCheckout('pro', 'pro').ok).toBe(false);
    expect(canCheckout('pro', 'agency').ok).toBe(false);
    expect(canCheckout('starter', 'enterprise').ok).toBe(false);
  });

  it('allows legitimate upgrades and free -> any paid tier', () => {
    expect(canCheckout('pro', 'starter').ok).toBe(true);
    expect(canCheckout('enterprise', 'agency').ok).toBe(true);
    expect(canCheckout('starter', 'free').ok).toBe(true);
    expect(canCheckout('enterprise', 'free').ok).toBe(true);
  });

  it('rejects "owner" at the product-id layer (no owner product exists)', () => {
    // Even if PLAN_TIER has an entry for owner, PRODUCT_IDS does not, so
    // the request is rejected before any tier comparison happens. This is
    // the primary defense against self-service owner-plan hijack.
    expect(canCheckout('owner', 'free').ok).toBe(false);
  });
});

// ─── 4. Dodo webhook subscription/customer mismatch guards ──────────────────
//
// Mirrors src/app/api/payments/webhooks/dodopayments/route.ts. For events
// that MUTATE an existing subscription, if the user already has a different
// subscription_id or customer_id bound, the webhook must be rejected - that
// blocks a replayed/forged webhook from flipping another user's plan.

const SUBSCRIPTION_UPDATE_EVENTS = new Set([
  'subscription.renewed',
  'subscription.updated',
  'subscription.plan_changed',
]);

function webhookAcceptsPlanChange(opts: {
  eventType: string;
  userId: string;
  webhookSubscriptionId?: string;
  webhookCustomerId?: string;
  dbSubscriptionId?: string;
  dbCustomerId?: string;
}): boolean {
  if (
    SUBSCRIPTION_UPDATE_EVENTS.has(opts.eventType)
    && opts.dbSubscriptionId
    && opts.webhookSubscriptionId
    && opts.dbSubscriptionId !== opts.webhookSubscriptionId
  ) {
    return false;
  }
  if (
    opts.dbCustomerId
    && opts.webhookCustomerId
    && opts.dbCustomerId !== opts.webhookCustomerId
  ) {
    return false;
  }
  return true;
}

describe('dodo webhook cross-user plan-flip guards', () => {
  it('rejects subscription.updated when webhook subscription_id != db subscription_id', () => {
    expect(webhookAcceptsPlanChange({
      eventType: 'subscription.updated',
      userId: 'user_a',
      webhookSubscriptionId: 'sub_victim',
      dbSubscriptionId: 'sub_attacker',
    })).toBe(false);
  });

  it('rejects subscription.plan_changed when webhook customer_id != db customer_id', () => {
    expect(webhookAcceptsPlanChange({
      eventType: 'subscription.plan_changed',
      userId: 'user_a',
      webhookSubscriptionId: 'sub_same',
      dbSubscriptionId: 'sub_same',
      webhookCustomerId: 'cus_attacker',
      dbCustomerId: 'cus_victim',
    })).toBe(false);
  });

  it('accepts matching subscription_id + customer_id', () => {
    expect(webhookAcceptsPlanChange({
      eventType: 'subscription.updated',
      userId: 'user_a',
      webhookSubscriptionId: 'sub_x',
      dbSubscriptionId: 'sub_x',
      webhookCustomerId: 'cus_x',
      dbCustomerId: 'cus_x',
    })).toBe(true);
  });

  it('accepts first-activation events (payment.succeeded) without a subscription_id yet', () => {
    // Initial activation: user has no subscription_id in db yet, webhook
    // carries one. The subscription-id guard only kicks in on UPDATE events.
    expect(webhookAcceptsPlanChange({
      eventType: 'payment.succeeded',
      userId: 'user_a',
      webhookSubscriptionId: 'sub_new',
      dbSubscriptionId: undefined,
    })).toBe(true);
  });
});
