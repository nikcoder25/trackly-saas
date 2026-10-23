/**
 * Plan ranking - the single source of truth for "is plan B an upgrade or a
 * downgrade from plan A". Used by the billing webhooks (confirmation email
 * template), the Account page and the Billing page's ComparePlansGrid so the
 * same pair of plans never reads "Upgrade" on one screen and "Downgrade" on
 * another.
 *
 * Dependency-free on purpose so client components can import it.
 */

/**
 * Numeric rank per plan.
 *
 * `trial` sits ABOVE `free` and below every paid tier: the first paid
 * checkout from a trial (`trial -> starter` etc.) is strictly an upgrade,
 * and `trial -> free` (trial expiry) is classified as a downgrade.
 *
 * `owner` is internal and never user-facing. It is mapped high so admin or
 * owner flips never get classified as a downgrade by accident; the UI treats
 * it as "nothing to switch to" via getPlanSwitchDirection.
 */
const PLAN_RANK: Record<string, number> = {
  free: 0,
  trial: 1,
  starter: 2,
  pro: 3,
  agency: 4,
  enterprise: 5,
  owner: 99,
};

/** Plans a customer pays for (and can therefore hold a subscription on). */
export const PAID_PLANS = ['starter', 'pro', 'agency', 'enterprise'] as const;

export function getPlanRank(plan: string | null | undefined): number {
  if (!plan) return 0;
  return PLAN_RANK[plan] ?? 0;
}

export function isPaidPlan(plan: string | null | undefined): boolean {
  return !!plan && (PAID_PLANS as readonly string[]).includes(plan);
}

export type PlanChangeKind = 'upgrade' | 'downgrade' | 'same';

/**
 * Compare two plans by rank. Returns 'same' if the plans rank equally,
 * 'upgrade' if `to` is higher, 'downgrade' if lower. Used to pick the
 * correct confirmation-email template after a webhook plan change.
 */
export function comparePlans(
  from: string | null | undefined,
  to: string | null | undefined,
): PlanChangeKind {
  const a = getPlanRank(from);
  const b = getPlanRank(to);
  if (b > a) return 'upgrade';
  if (b < a) return 'downgrade';
  return 'same';
}

/**
 * What a plan card's CTA should say for a user on `current` looking at
 * `target`:
 *   'current'      the user is on this plan
 *   'upgrade'      target ranks higher (trial -> any paid plan is an upgrade)
 *   'downgrade'    target ranks lower (trial -> free is a downgrade)
 *   'unavailable'  owner accounts already have everything and no billing,
 *                  so no switch CTA is offered at all
 */
export type PlanSwitchDirection = 'current' | 'upgrade' | 'downgrade' | 'unavailable';

export function getPlanSwitchDirection(
  current: string | null | undefined,
  target: string | null | undefined,
): PlanSwitchDirection {
  const cur = current || 'free';
  const tgt = target || 'free';
  if (cur === tgt) return 'current';
  if (cur === 'owner') return 'unavailable';
  // Unknown plans rank like free; a tie between two different plans is
  // treated as an upgrade so the user is never told a paid tier is a step
  // down.
  return comparePlans(cur, tgt) === 'downgrade' ? 'downgrade' : 'upgrade';
}

/**
 * True only when the user is on a paid plan AND holds a provider
 * subscription that can actually be cancelled. Owner, trial, free and
 * admin-granted paid plans without a subscription id return false, so the
 * UI never offers "Cancel subscription" where there is nothing to cancel.
 */
export function hasActivePaidSubscription(
  plan: string | null | undefined,
  settings: Record<string, unknown> | null | undefined,
): boolean {
  if (!isPaidPlan(plan)) return false;
  const subId = settings?.subscription_id;
  if (typeof subId !== 'string' || !subId) return false;
  const status = settings?.subscription_status;
  return status !== 'cancelled' && status !== 'expired' && status !== 'not_found';
}
