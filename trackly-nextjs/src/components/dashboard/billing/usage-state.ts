/**
 * Pure state-decision helpers for the Billing & Usage section.
 *
 * Lives outside the React component so the (healthy / low / exhausted /
 * manual-cap / owner) states can be unit-tested without spinning up a
 * DOM or React renderer. The component imports these and composes the
 * UI; tests import them and assert directly.
 */

export type CreditTileState = 'healthy' | 'warn' | 'danger';

export interface CreditTileInput {
  monthlyUsed: number;
  monthlyCap: number;
}

/**
 * Threshold buckets for the credit tile's progress-bar fill colour.
 *   green  <60%
 *   amber  60–85%
 *   red    >85%
 */
export function creditTileState({ monthlyUsed, monthlyCap }: CreditTileInput): CreditTileState {
  if (monthlyCap <= 0) return 'healthy';
  const pct = (monthlyUsed / monthlyCap) * 100;
  if (pct > 85) return 'danger';
  if (pct >= 60) return 'warn';
  return 'healthy';
}

export type BannerKind = 'exhausted' | 'low' | 'manual_cap' | null;

export interface BannerInput {
  remaining: number;
  monthlyCap: number;
  manualRemainingToday: number;
  lowBalance: boolean;
  plan: string;
}

/**
 * Single contextual banner shown at the bottom of the section.
 * Priority order matters: exhausted always wins; low-balance suppresses
 * the manual-cap-only state because the user is already going to upgrade.
 * Owner plan never triggers any of these (effectively unlimited).
 */
export function bannerKind(input: BannerInput): BannerKind {
  if (input.plan === 'owner') return null;
  if (input.remaining <= 0) return 'exhausted';
  if (input.lowBalance) return 'low';
  if (input.manualRemainingToday <= 0 && input.remaining > 0) return 'manual_cap';
  return null;
}

export type ForecastState = 'healthy' | 'at_risk';

export interface ForecastInput {
  monthlyUsed: number;
  monthlyCap: number;
  avgDailyCredits: number;
  projectedMonthEnd: number;
  daysRemainingInMonth: number;
  remaining: number;
}

/**
 * The burn-rate forecast bar has two visual states. We classify based
 * on whichever signal fires first: "will run out before reset" beats
 * "will exceed cap on schedule" because the former is closer.
 */
export function forecastState(input: ForecastInput): ForecastState {
  if (input.monthlyCap <= 0) return 'healthy';
  // Will the user hit zero before the month rolls?
  if (input.avgDailyCredits > 0) {
    const daysToZero = input.remaining / input.avgDailyCredits;
    if (daysToZero < input.daysRemainingInMonth) return 'at_risk';
  }
  // Classify against the unrounded projection so accounts sitting on the
  // cap boundary don't flip state from a 0.5-credit rounding swing (#456).
  const projectedRaw = input.monthlyUsed + input.avgDailyCredits * input.daysRemainingInMonth;
  if (projectedRaw > input.monthlyCap) return 'at_risk';
  return 'healthy';
}

/**
 * Pretty date helpers — kept here so tests can assert formatting
 * without importing the React component.
 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * UTC-aware date label. Used for `lastRun.atDate` and the
 * `dailyUsageLast14Days` bucket labels so the two never disagree
 * across the UTC midnight boundary in non-UTC viewers (#453).
 *
 * Accepts either a YYYY-MM-DD bucket string or a full ISO timestamp.
 */
export function fmtDateUtc(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/**
 * "in 3 days" / "in 2h" / "today" — used by the auto-run card. Negative
 * values become "overdue".
 */
export function fmtRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = t - now.getTime();
  const abs = Math.abs(diff);
  const sign = diff < 0 ? 'overdue ' : 'in ';
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  if (days >= 1) return `${sign}${days}d`;
  if (hours >= 1) return `${sign}${hours}h`;
  return diff < 0 ? 'overdue' : 'soon';
}

/**
 * "On track" / "At risk" copy generators — pulled out so the same
 * strings are testable and the component just renders them.
 */
export interface ForecastCopy {
  state: ForecastState;
  text: string;
}

export function buildForecastCopy(input: ForecastInput, nextResetAt: string): ForecastCopy {
  const state = forecastState(input);
  if (state === 'healthy') {
    return {
      state,
      text: `On track. At ~${input.avgDailyCredits}/day, projected month-end: ` +
        `${input.projectedMonthEnd.toLocaleString()} / ${input.monthlyCap.toLocaleString()}.`,
    };
  }
  // At risk path. If we'll hit zero before reset, surface the date.
  if (input.avgDailyCredits > 0 && input.remaining > 0) {
    const daysToZero = Math.floor(input.remaining / input.avgDailyCredits);
    const zeroAt = new Date(Date.now() + daysToZero * 86_400_000);
    const reset = new Date(nextResetAt);
    const daysBeforeReset = Math.max(
      0,
      Math.floor((reset.getTime() - zeroAt.getTime()) / 86_400_000),
    );
    return {
      state,
      text: `At ~${input.avgDailyCredits} credits/day, you'll reach 0 on ${fmtDate(zeroAt.toISOString())} — ` +
        `${daysBeforeReset} day${daysBeforeReset === 1 ? '' : 's'} before reset. ` +
        `Consider upgrading or pausing manual runs.`,
    };
  }
  // Otherwise cap-overshoot framing.
  return {
    state,
    text: `At ~${input.avgDailyCredits}/day, projected month-end: ` +
      `${input.projectedMonthEnd.toLocaleString()} — over your ${input.monthlyCap.toLocaleString()} cap. ` +
      `Consider upgrading.`,
  };
}
