/**
 * Rank tracking credits.
 *
 *   1 credit  = one keyword check to the top 30
 *   2 credits = one check to the top 100
 *   weekly    = 4 checks a month, daily = 30
 *
 * A plan's monthly allowance is a commitment ceiling: the credits every
 * tracked keyword will use in a month at its frequency and depth must fit
 * inside it, so adding keywords past it is refused with an upgrade prompt.
 * What a month actually used is the sum of rt_checks.credits (the ledger).
 *
 * Kept apart from the AI-visibility credits in lib/credits.ts on purpose:
 * one LLM call and one SERP check cost very different amounts, and the
 * pricing sells them as two allowances.
 */
export type Frequency = 'weekly' | 'daily';
export type Depth = 30 | 100;

export const CHECKS_PER_MONTH: Record<Frequency, number> = { weekly: 4, daily: 30 };

export const RANK_CREDITS_BY_PLAN: Record<string, number> = {
  free: 0,
  trial: 200,
  starter: 1000,
  pro: 4000,
  agency: 20000,
  enterprise: 100000,
  owner: 1000000,
};

/** Plans that may check the top 100 or check daily. */
export const TOP100_PLANS = new Set(['pro', 'agency', 'enterprise', 'owner', 'trial']);
export const DAILY_PLANS = new Set(['agency', 'enterprise', 'owner']);

export function rankCreditsForPlan(plan: string | null | undefined): number {
  return RANK_CREDITS_BY_PLAN[String(plan || 'free').toLowerCase()] ?? 0;
}

export function creditsPerCheck(depth: number): number {
  return depth === 100 ? 2 : 1;
}

export function monthlyCreditsFor(freq: Frequency, depth: number): number {
  return CHECKS_PER_MONTH[freq] * creditsPerCheck(depth);
}

export interface KeywordLoad { frequency: Frequency; depth: number; count?: number }

/** Credits a set of keywords commits to each month. */
export function monthlyCommitment(rows: KeywordLoad[]): number {
  return rows.reduce((s, r) => s + monthlyCreditsFor(r.frequency, r.depth) * (r.count ?? 1), 0);
}

export interface AddCheck {
  ok: boolean;
  needed: number;
  committed: number;
  allowance: number;
  remaining: number;
  reason?: 'over_limit' | 'plan_no_daily' | 'plan_no_top100' | 'plan_no_rank_tracking';
}

/** Whether `count` new keywords at this frequency/depth fit the plan. */
export function canAddKeywords(plan: string, committed: number, count: number, freq: Frequency, depth: number): AddCheck {
  const allowance = rankCreditsForPlan(plan);
  const needed = monthlyCreditsFor(freq, depth) * count;
  const base = { needed, committed, allowance, remaining: Math.max(0, allowance - committed) };
  const p = String(plan || 'free').toLowerCase();
  if (allowance <= 0) return { ...base, ok: false, reason: 'plan_no_rank_tracking' };
  if (freq === 'daily' && !DAILY_PLANS.has(p)) return { ...base, ok: false, reason: 'plan_no_daily' };
  if (depth === 100 && !TOP100_PLANS.has(p)) return { ...base, ok: false, reason: 'plan_no_top100' };
  if (committed + needed > allowance) return { ...base, ok: false, reason: 'over_limit' };
  return { ...base, ok: true };
}

export function addRefusalMessage(c: AddCheck): string {
  switch (c.reason) {
    case 'plan_no_rank_tracking': return 'Rank tracking is not part of your plan. Upgrade to start tracking keywords.';
    case 'plan_no_daily': return 'Daily checks are on the Agency plan. Pick weekly, or upgrade.';
    case 'plan_no_top100': return 'Top 100 checks start on the Pro plan. Pick top 30, or upgrade.';
    case 'over_limit': return `These keywords need ${c.needed.toLocaleString('en-US')} credits a month and you have ${c.remaining.toLocaleString('en-US')} left of ${c.allowance.toLocaleString('en-US')}. Remove some keywords, check less often, or upgrade.`;
    default: return '';
  }
}
