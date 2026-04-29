import { describe, expect, it } from 'vitest';
import {
  bannerKind,
  buildForecastCopy,
  creditTileState,
  fmtDate,
  fmtDateUtc,
  fmtRelative,
  forecastState,
} from '../src/components/dashboard/billing/usage-state';

/**
 * Pure-function tests for the Billing → Usage redesign. These are
 * intentionally renderer-agnostic (no @testing-library/react) so the
 * five state cases the spec calls out — healthy / low / exhausted /
 * manual-cap / owner-hidden — are pinned without spinning up a DOM.
 */

describe('creditTileState — color thresholds', () => {
  it('green under 60%', () => {
    expect(creditTileState({ monthlyUsed: 0,    monthlyCap: 2500 })).toBe('healthy');
    expect(creditTileState({ monthlyUsed: 1499, monthlyCap: 2500 })).toBe('healthy'); // 59.96%
  });
  it('amber 60–85%', () => {
    expect(creditTileState({ monthlyUsed: 1500, monthlyCap: 2500 })).toBe('warn'); // 60.0%
    expect(creditTileState({ monthlyUsed: 2125, monthlyCap: 2500 })).toBe('warn'); // 85.0%
  });
  it('red over 85%', () => {
    expect(creditTileState({ monthlyUsed: 2126, monthlyCap: 2500 })).toBe('danger'); // 85.04%
    expect(creditTileState({ monthlyUsed: 2500, monthlyCap: 2500 })).toBe('danger');
  });
  it('treats a missing cap as healthy (owner)', () => {
    expect(creditTileState({ monthlyUsed: 9_999_999, monthlyCap: 0 })).toBe('healthy');
  });
});

describe('bannerKind — priority order', () => {
  const base = {
    remaining: 1000,
    monthlyCap: 2500,
    manualRemainingToday: 50,
    lowBalance: false,
    plan: 'pro',
  };

  it('healthy — no banner', () => {
    expect(bannerKind(base)).toBe(null);
  });

  it('exhausted beats low-balance', () => {
    expect(bannerKind({ ...base, remaining: 0, lowBalance: true })).toBe('exhausted');
  });

  it('low-balance from API takes precedence over manual_cap-only', () => {
    expect(bannerKind({
      ...base, remaining: 200, lowBalance: true, manualRemainingToday: 0,
    })).toBe('low');
  });

  it('manual_cap fires only when remaining > 0 and lowBalance false', () => {
    expect(bannerKind({
      ...base, manualRemainingToday: 0, lowBalance: false,
    })).toBe('manual_cap');
  });

  it('owner plan never shows a banner — even at zero', () => {
    expect(bannerKind({
      ...base, remaining: 0, lowBalance: true, manualRemainingToday: 0, plan: 'owner',
    })).toBe(null);
  });
});

describe('forecastState — at-risk classification', () => {
  it('healthy when projected <= cap and remaining lasts the period', () => {
    const s = forecastState({
      monthlyUsed: 100, monthlyCap: 2500,
      avgDailyCredits: 5, projectedMonthEnd: 250,
      daysRemainingInMonth: 20, remaining: 2400,
    });
    expect(s).toBe('healthy');
  });

  it('at-risk when projected blows past the cap', () => {
    const s = forecastState({
      monthlyUsed: 1800, monthlyCap: 2500,
      avgDailyCredits: 60, projectedMonthEnd: 3000,
      daysRemainingInMonth: 20, remaining: 700,
    });
    expect(s).toBe('at_risk');
  });

  it('at-risk when remaining will hit zero before reset', () => {
    const s = forecastState({
      monthlyUsed: 2200, monthlyCap: 2500,
      avgDailyCredits: 100, projectedMonthEnd: 4200,
      daysRemainingInMonth: 20, remaining: 300,
    });
    expect(s).toBe('at_risk');
  });

  it('healthy when avgDailyCredits is zero (no recent runs)', () => {
    const s = forecastState({
      monthlyUsed: 100, monthlyCap: 2500,
      avgDailyCredits: 0, projectedMonthEnd: 100,
      daysRemainingInMonth: 20, remaining: 2400,
    });
    expect(s).toBe('healthy');
  });
});

describe('buildForecastCopy — message shape', () => {
  it('healthy message includes the avg/day and projection', () => {
    const c = buildForecastCopy({
      monthlyUsed: 100, monthlyCap: 2500,
      avgDailyCredits: 8, projectedMonthEnd: 250,
      daysRemainingInMonth: 20, remaining: 2400,
    }, '2026-05-01T00:00:00.000Z');
    expect(c.state).toBe('healthy');
    expect(c.text).toMatch(/On track/);
    expect(c.text).toMatch(/~8\/day/);
    expect(c.text).toMatch(/250 \/ 2,500/);
  });

  it('at-risk message names the day-count to zero', () => {
    const c = buildForecastCopy({
      monthlyUsed: 2200, monthlyCap: 2500,
      avgDailyCredits: 100, projectedMonthEnd: 4200,
      daysRemainingInMonth: 20, remaining: 300,
    }, new Date(Date.now() + 20 * 86_400_000).toISOString());
    expect(c.state).toBe('at_risk');
    // 300 / 100 = 3 days to zero — the copy must mention reaching 0.
    expect(c.text).toMatch(/reach 0/);
    expect(c.text).toMatch(/before reset/);
    expect(c.text).toMatch(/upgrading/);
  });
});

describe('fmtDate / fmtRelative', () => {
  it('formats ISO to short month-day', () => {
    expect(fmtDate('2026-05-01T00:00:00.000Z')).toMatch(/(Apr|May)/);
  });
  it('returns em-dash for invalid input', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('garbage')).toBe('—');
  });
  it('relative time bucket: in Nd / in Nh / overdue', () => {
    const now = new Date('2026-04-27T12:00:00Z');
    expect(fmtRelative(new Date(now.getTime() + 3 * 86_400_000).toISOString(), now)).toBe('in 3d');
    expect(fmtRelative(new Date(now.getTime() + 5 * 3_600_000).toISOString(), now)).toBe('in 5h');
    expect(fmtRelative(new Date(now.getTime() - 2 * 86_400_000).toISOString(), now)).toBe('overdue 2d');
  });
});

describe('fmtDateUtc — UTC-stable date label (#453)', () => {
  it('renders the same calendar day for an ISO timestamp and its UTC bucket key', () => {
    // 2026-04-28T23:30:00Z would render as Apr 29 in any tz east of
    // UTC and Apr 28 in any tz west of it under fmtDate. fmtDateUtc
    // forces UTC so it always matches the YYYY-MM-DD bucket.
    const iso = '2026-04-28T23:30:00.000Z';
    const bucket = '2026-04-28';
    expect(fmtDateUtc(iso)).toBe(fmtDateUtc(bucket));
  });
  it('returns em-dash for invalid input', () => {
    expect(fmtDateUtc(null)).toBe('—');
    expect(fmtDateUtc('garbage')).toBe('—');
  });
});
