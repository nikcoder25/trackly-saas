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

export interface PlanCreditConfig {
  /** Total credits replenished at the start of each UTC month. */
  monthlyCredits: number;
  /** Hard daily ceiling on manual ("Run Query") credit spend. */
  manualDailyCap: number;
  /** Per-prompt cooldown after a manual run, in seconds. */
  cooldownSeconds: number;
  /** Max platforms a brand can track on this plan. */
  maxPlatforms: number;
  /** Max prompts per brand. */
  maxPromptsPerBrand: number;
  /** Which model tier the AI platform call layer is allowed to use. */
  modelTier: ModelTier;
  /** Whether automated/scheduled runs are eligible on this plan. */
  scheduledRuns: boolean;
  /** Display name (used by billing UI / emails). */
  label: string;
  /** Public price string (matches `PRICING_PLANS` in constants.ts). */
  price: string;
  /** Whether to show the "Featured" badge on the billing page. */
  featured?: boolean;
}

/**
 * Plan → credit config. Numbers come from the Livesov v2 spec:
 *   - Pro: 2,500 monthly, 50 manual/day, 3 platforms, 25 prompts, economy
 *   - Agency: 10,000 monthly, 200 manual/day, 6 platforms, 100 prompts,
 *     premium (only tier allowed to hit large/search-preview models)
 *
 * Trial mirrors Starter with a tighter monthly cap so abusers can't
 * spin up an account and burn the Agency budget on day one.
 */
export const PLAN_CREDITS: Record<string, PlanCreditConfig> = {
  free: {
    monthlyCredits: 50,
    manualDailyCap: 5,
    cooldownSeconds: 60,
    maxPlatforms: 2,
    maxPromptsPerBrand: 5,
    modelTier: 'economy',
    scheduledRuns: false,
    label: 'Free',
    price: '$0',
  },
  trial: {
    monthlyCredits: 200,
    manualDailyCap: 10,
    cooldownSeconds: 30,
    maxPlatforms: 5,
    maxPromptsPerBrand: 30,
    modelTier: 'economy',
    scheduledRuns: true,
    label: 'Trial',
    price: '$0',
  },
  starter: {
    monthlyCredits: 500,
    manualDailyCap: 25,
    cooldownSeconds: 30,
    maxPlatforms: 2,
    maxPromptsPerBrand: 30,
    modelTier: 'economy',
    scheduledRuns: true,
    label: 'Starter',
    price: '$9',
  },
  pro: {
    monthlyCredits: 2500,
    manualDailyCap: 50,
    cooldownSeconds: 30,
    maxPlatforms: 3,
    maxPromptsPerBrand: 25,
    modelTier: 'economy',
    scheduledRuns: true,
    label: 'Pro',
    price: '$29',
    featured: true,
  },
  agency: {
    monthlyCredits: 10000,
    manualDailyCap: 200,
    cooldownSeconds: 15,
    maxPlatforms: 6,
    maxPromptsPerBrand: 100,
    modelTier: 'premium',
    scheduledRuns: true,
    label: 'Agency',
    price: '$89',
  },
  enterprise: {
    monthlyCredits: 50000,
    manualDailyCap: 9999,
    cooldownSeconds: 0,
    maxPlatforms: 6,
    maxPromptsPerBrand: 9999,
    modelTier: 'premium',
    scheduledRuns: true,
    label: 'Enterprise',
    price: 'Custom',
  },
  owner: {
    monthlyCredits: 999999,
    manualDailyCap: 99999,
    cooldownSeconds: 0,
    maxPlatforms: 6,
    maxPromptsPerBrand: 99999,
    modelTier: 'premium',
    scheduledRuns: true,
    label: 'Owner',
    price: '-',
  },
};

/** Plans rendered in the billing comparison table, in display order. */
export const PLAN_DISPLAY_ORDER = [
  'free',
  'starter',
  'pro',
  'agency',
  'enterprise',
] as const;

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
