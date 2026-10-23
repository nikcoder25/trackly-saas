import { getEffectivePlan } from '@/lib/constants';

/**
 * Admin rows carry the EFFECTIVE plan as `plan` (an expired trial reads
 * 'free' even before the hourly trial-expiry sweep persists it), plus the
 * stored value as `raw_plan` and the trial end date for display.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toAdminUserRow(u: any) {
  const { trial_ends_at, ...rest } = u;
  return {
    ...rest,
    plan: getEffectivePlan(u.plan, trial_ends_at),
    raw_plan: u.plan || 'free',
    trial_ends_at: trial_ends_at ? new Date(trial_ends_at).toISOString() : null,
  };
}
