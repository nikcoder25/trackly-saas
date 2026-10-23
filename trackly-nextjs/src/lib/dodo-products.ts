// DodoPayments product ids per plan and billing cycle, plus the checkout
// rules that decide which product a user may buy. Env is read at call time
// so tests (and a hot env change) see the current values.

export type BillingCycle = 'monthly' | 'annual';

export const ANNUAL_PLANS = ['starter', 'pro', 'agency'] as const;

export function monthlyProductIds(): Record<string, string | undefined> {
  return {
    starter: process.env.DODO_STARTER_PRODUCT_ID,
    pro: process.env.DODO_PRO_PRODUCT_ID,
    agency: process.env.DODO_AGENCY_PRODUCT_ID,
    enterprise: process.env.DODO_ENTERPRISE_PRODUCT_ID,
  };
}

export function annualProductIds(): Record<string, string | undefined> {
  return {
    starter: process.env.DODO_STARTER_ANNUAL_PRODUCT_ID,
    pro: process.env.DODO_PRO_ANNUAL_PRODUCT_ID,
    agency: process.env.DODO_AGENCY_ANNUAL_PRODUCT_ID,
  };
}

/** Which plans can be bought on annual billing right now. */
export function annualAvailability(): Record<string, boolean> {
  const annual = annualProductIds();
  const out: Record<string, boolean> = {};
  for (const p of ANNUAL_PLANS) out[p] = Boolean(annual[p]);
  return out;
}

/** Billing cycle of a stored Dodo product id, or null when unknown. */
export function billingCycleForProduct(productId: unknown): BillingCycle | null {
  if (typeof productId !== 'string' || !productId) return null;
  if (Object.values(annualProductIds()).includes(productId)) return 'annual';
  if (Object.values(monthlyProductIds()).includes(productId)) return 'monthly';
  return null;
}

/** Parses the optional `billing` body field. undefined/null means monthly. */
export function parseBillingCycle(raw: unknown): BillingCycle | null {
  if (raw === undefined || raw === null) return 'monthly';
  if (raw === 'monthly' || raw === 'annual') return raw;
  return null;
}

const PLAN_TIER: Record<string, number> = {
  free: 0, starter: 1, pro: 2, agency: 3, enterprise: 4, owner: 5,
};

export type CheckoutDecision =
  | { ok: true; productId: string }
  | { ok: false; error: string };

/**
 * Picks the product to check out, or the reason the checkout is refused.
 * Same plan is allowed only as a monthly -> annual switch; anything at or
 * below the current tier is otherwise a downgrade and goes through cancel.
 */
export function resolveCheckout(opts: {
  plan: string;
  billing: BillingCycle;
  currentPlan: string | null | undefined;
  currentProductId?: unknown;
}): CheckoutDecision {
  const { plan, billing } = opts;
  const currentPlan = opts.currentPlan || 'free';
  const monthlyId = monthlyProductIds()[plan];
  if (!monthlyId) return { ok: false, error: 'Invalid plan' };

  let productId = monthlyId;
  if (billing === 'annual') {
    const annualId = annualProductIds()[plan];
    if (!annualId) return { ok: false, error: 'Annual billing is not available for this plan' };
    productId = annualId;
  }

  if (currentPlan === 'free') return { ok: true, productId };

  const currentTier = PLAN_TIER[currentPlan] || 0;
  const targetTier = PLAN_TIER[plan] || 0;
  if (targetTier === currentTier && plan === currentPlan && billing === 'annual') {
    if (opts.currentProductId === productId) {
      return { ok: false, error: 'You are already on annual billing for this plan.' };
    }
    return { ok: true, productId };
  }
  if (targetTier <= currentTier) {
    return { ok: false, error: 'Cannot downgrade via checkout. Use the cancel option to downgrade.' };
  }
  return { ok: true, productId };
}
