/**
 * Livesov plan/credit configuration — single source of truth for the
 * credit-based pricing system. The legacy `PLAN_LIMITS` in `constants.ts`
 * still drives the per-brand quotas (queries/competitors/runsPerMonth)
 * that the older code paths depend on; this file augments those with the
 * credit, cooldown, and model-tier semantics introduced by the v2 system.
 *
 * One LLM call = one credit. A "run" reserves N = (queries × platforms)
 * credits up front. If providers fail mid-run we refund the unused
 * portion in the worker's terminal handler.
 */

export type ModelTier = 'economy' | 'premium';

/**
 * How often the auto-runner picks up brands on this plan. Maps to a
 * minimum scheduling interval — Free is weekly (every 7 days),
 * Starter every 2 days, Pro/Agency daily. The cron worker reads this
 * to decide whether a brand is eligible for an automated run.
 */
export type AutoRunFrequency = 'weekly' | 'every_2_days' | 'daily';

export interface PlanCreditConfig {
  /** Total credits replenished at the start of each UTC month. */
  monthlyCredits: number;
  /** Hard daily ceiling on manual ("Run Query") credit spend. */
  manualDailyCap: number;
  /** Per-prompt cooldown after a manual run, in seconds. */
  cooldownSeconds: number;
  /** Max platforms a brand can track on this plan. */
  maxPlatforms: number;
  /**
   * Account-wide cap on tracked prompts (sum across every brand the
   * account owns). Authoritative as of the v3 pricing spec
   * (2026-04-27).
   */
  trackedPromptsPerAccount: number;
  /**
   * @deprecated Read `trackedPromptsPerAccount` instead. The v3 spec
   * moved tracked prompts from per-brand to account-wide. This field
   * is kept for one deprecation cycle so any straggling caller still
   * compiles; it holds the same number as `trackedPromptsPerAccount`
   * and will be removed once the audit confirms no active reads.
   */
  maxPromptsPerBrand: number;
  /** Which model tier the AI platform call layer is allowed to use. */
  modelTier: ModelTier;
  /** Whether automated/scheduled runs are eligible on this plan. */
  scheduledRuns: boolean;
  /** Cadence of automated runs. Ignored when scheduledRuns is false. */
  autoRunFrequency: AutoRunFrequency;
  /** Maximum number of brands a user on this plan can own. */
  brandsCap: number;
  /** Display name (used by billing UI / emails). */
  label: string;
  /** Public price string (matches `PRICING_PLANS` in constants.ts). */
  price: string;
  /** Whether to show the "Featured" badge on the billing page. */
  featured?: boolean;
}

/**
 * Plan → credit config. Numbers come from the Livesov v3 spec
 * (see PRICING_V3.md — final pricing table approved 2026-04-27).
 * Tracked-prompt caps are ACCOUNT-WIDE (summed across all brands the
 * account owns), not per-brand:
 *
 *   - Free:    150 monthly,  5 manual/day,  5 min cooldown,  2 platforms,
 *              5 prompts (account),  1 brand,  weekly auto-run, economy
 *   - Starter: 750 monthly, 20 manual/day,  2 min cooldown,  2 platforms,
 *              15 prompts (account), 3 brands, every 2 days,  economy
 *   - Pro:    2,500 monthly, 50 manual/day, 60 sec cooldown, 3 platforms,
 *              25 prompts (account), ∞ brands, daily, economy (default)
 *   - Agency: 8,000 monthly,  ∞ manual/day, 30 sec cooldown, 5 platforms,
 *              100 prompts (account), ∞ brands, daily, premium unlocked
 *
 * Trial mirrors Starter limits with a tighter monthly cap so abusers
 * can't spin up an account and burn the Agency budget on day one.
 */
export const PLAN_CREDITS: Record<string, PlanCreditConfig> = {
  free: {
    monthlyCredits: 150,
    manualDailyCap: 5,
    cooldownSeconds: 300, // 5 min
    maxPlatforms: 2,
    trackedPromptsPerAccount: 5,
    maxPromptsPerBrand: 5,
    modelTier: 'economy',
    scheduledRuns: true,
    autoRunFrequency: 'weekly',
    brandsCap: 1,
    label: 'Free',
    price: '$0',
  },
  trial: {
    monthlyCredits: 200,
    manualDailyCap: 10,
    cooldownSeconds: 30,
    maxPlatforms: 5,
    trackedPromptsPerAccount: 30,
    maxPromptsPerBrand: 30,
    modelTier: 'economy',
    scheduledRuns: true,
    autoRunFrequency: 'daily',
    brandsCap: 9999,
    label: 'Trial',
    price: '$0',
  },
  starter: {
    monthlyCredits: 750,
    manualDailyCap: 20,
    cooldownSeconds: 120, // 2 min
    maxPlatforms: 2,
    trackedPromptsPerAccount: 15,
    maxPromptsPerBrand: 15,
    modelTier: 'economy',
    scheduledRuns: true,
    autoRunFrequency: 'every_2_days',
    brandsCap: 3,
    label: 'Starter',
    price: '$9',
  },
  pro: {
    monthlyCredits: 2500,
    manualDailyCap: 50,
    cooldownSeconds: 60,
    maxPlatforms: 3,
    trackedPromptsPerAccount: 25,
    maxPromptsPerBrand: 25,
    modelTier: 'economy',
    scheduledRuns: true,
    autoRunFrequency: 'daily',
    brandsCap: 9999,
    label: 'Pro',
    price: '$29',
    featured: true,
  },
  agency: {
    monthlyCredits: 8000,
    manualDailyCap: 9999, // Unlimited
    cooldownSeconds: 30,
    maxPlatforms: 5,
    trackedPromptsPerAccount: 100,
    maxPromptsPerBrand: 100,
    modelTier: 'premium',
    scheduledRuns: true,
    autoRunFrequency: 'daily',
    brandsCap: 9999,
    label: 'Agency',
    price: '$89',
  },
  enterprise: {
    monthlyCredits: 50000,
    manualDailyCap: 9999,
    cooldownSeconds: 0,
    maxPlatforms: 5,
    trackedPromptsPerAccount: 9999,
    maxPromptsPerBrand: 9999,
    modelTier: 'premium',
    scheduledRuns: true,
    autoRunFrequency: 'daily',
    brandsCap: 9999,
    label: 'Enterprise',
    price: 'Custom',
  },
  owner: {
    monthlyCredits: 999999,
    manualDailyCap: 99999,
    cooldownSeconds: 0,
    maxPlatforms: 5,
    trackedPromptsPerAccount: 99999,
    maxPromptsPerBrand: 99999,
    modelTier: 'premium',
    scheduledRuns: true,
    autoRunFrequency: 'daily',
    brandsCap: 9999,
    label: 'Owner',
    price: '-',
  },
};

/** How many hours between auto-runs for each frequency tier. */
export const AUTO_RUN_HOURS: Record<AutoRunFrequency, number> = {
  weekly: 168,
  every_2_days: 48,
  daily: 24,
};

/** Plans rendered in the billing comparison table, in display order. */
export const PLAN_DISPLAY_ORDER = [
  'free',
  'starter',
  'pro',
  'agency',
  'enterprise',
] as const;

/**
 * Numeric rank used to decide whether a plan transition is an upgrade or
 * a downgrade (e.g. for the post-checkout confirmation email).
 *
 * `trial` sits ABOVE `free` and below every paid tier. The previous
 * model collapsed `trial` and `free` to the same rank so the first paid
 * checkout from either state would still classify as an upgrade — but
 * that also made the trial → free transition register as `'same'`,
 * which silently suppresses any downgrade email a future trial-expiry
 * code path would want to send. With `trial = 1`, `free = 0`, the
 * first paid checkout (`trial → starter` etc.) is still strictly an
 * upgrade (1 < 2/3/4/5) and `trial → free` is now correctly classified
 * as a downgrade (1 → 0).
 *
 * `owner` is internal and never user-facing, but we map it high so
 * admin/owner flips never get classified as a downgrade by accident.
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

export function getPlanRank(plan: string | null | undefined): number {
  if (!plan) return 0;
  return PLAN_RANK[plan] ?? 0;
}

export type PlanChangeKind = 'upgrade' | 'downgrade' | 'same';

/**
 * Compare two plans by rank. Returns 'same' if the plans rank equally
 * (e.g. free ↔ trial), 'upgrade' if `to` is higher, 'downgrade' if
 * lower. Used to pick the correct confirmation-email template after a
 * webhook plan change.
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

export function getPlanCredits(plan: string | undefined | null): PlanCreditConfig {
  if (!plan) return PLAN_CREDITS.free;
  return PLAN_CREDITS[plan] || PLAN_CREDITS.free;
}

/**
 * Economy → premium model resolution. The default for every plan is the
 * platform's economy model; agencies and above can override to premium
 * via brand settings, but free/starter/pro are clamped to economy
 * regardless of what the user selected.
 *
 * Premium models cost up to 25× more per token (gpt-5 vs gpt-4o-mini,
 * sonnet vs haiku) so silently downgrading lower tiers is the difference
 * between a $200/mo SaaS and a runaway provider bill.
 */
export const ECONOMY_MODEL_BY_PLATFORM: Record<string, string> = {
  ChatGPT: 'gpt-4o-mini-search-preview',
  Claude: 'claude-haiku-4-5-20251001',
  Gemini: 'gemini-2.5-flash-lite',
  Grok: 'grok-3-mini',
  Perplexity: 'sonar',
};

export const PREMIUM_MODEL_BY_PLATFORM: Record<string, string> = {
  ChatGPT: 'gpt-5-search-api',
  Claude: 'claude-sonnet-4-20250514',
  Gemini: 'gemini-2.5-pro',
  Grok: 'grok-4',
  Perplexity: 'sonar-pro',
};

/**
 * Resolve the model the AI layer should actually use for a given
 * platform + plan. `requestedModel` is what the admin/user picked;
 * we honor it only if the plan permits the tier it belongs to.
 * Returns the platform's economy model when a lower-tier plan requests
 * a premium model.
 */
export function resolveModelForPlan(
  platform: string,
  plan: string | undefined | null,
  requestedModel?: string,
): string {
  const cfg = getPlanCredits(plan || 'free');
  const economy = ECONOMY_MODEL_BY_PLATFORM[platform];
  const premium = PREMIUM_MODEL_BY_PLATFORM[platform];

  if (cfg.modelTier === 'premium') {
    return requestedModel || premium || economy || '';
  }
  // Economy tier: clamp. If the requested model is the platform's
  // economy model (or unset), keep it; otherwise downgrade.
  if (!requestedModel) return economy || premium || '';
  if (requestedModel === economy) return economy;
  // The requested model is a premium one — clamp to economy.
  return economy || requestedModel;
}

/**
 * 20% threshold for the low-balance banner / email warning. Returning
 * the boolean from one place keeps the UI and the email scheduler in
 * agreement on what counts as "low".
 */
export const LOW_BALANCE_THRESHOLD = 0.2;

export function isLowBalance(remaining: number, monthlyCap: number): boolean {
  if (!Number.isFinite(monthlyCap) || monthlyCap <= 0) return false;
  return remaining > 0 && remaining / monthlyCap < LOW_BALANCE_THRESHOLD;
}
