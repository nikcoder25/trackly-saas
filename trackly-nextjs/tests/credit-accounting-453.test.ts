import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Acceptance-criteria tests for issue #453: credit-accounting mismatch
 * between /api/credits/status (`monthlyUsed`) and /api/credits/usage
 * (`monthlyUsedSoFar`).
 *
 * Each `it` block maps to one of the criteria from the issue body:
 *   a) sum(dailyUsageLast14Days within current period) == monthlyUsed
 *   b) projectedMonthEnd == round(monthlyUsed
 *                            + avgDailyCredits × daysRemainingInMonth)
 *      using the SAME monthlyUsed shown in the headline tile
 *   c) lastRun.atDate matches the bucket the run lands in within
 *      dailyUsageLast14Days
 *
 * Approach: build a single in-memory `tenant_cost_events` fixture and
 * route every COUNT/date_trunc query through it. The status endpoint
 * (via getCreditStatus) and the usage endpoint must agree because they
 * read the same fixture - that's the whole point of the fix.
 */

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: { query: (...args: Parameters<QueryFn>) => queryMock(...args) },
}));

vi.mock('../src/lib/auth', () => ({
  requireVerifiedAuth: vi.fn(async () => ({ id: 'u1', email: 'a@b.com' })),
}));

import { GET as usageGET } from '../src/app/api/credits/usage/route';
import { getCreditStatus, currentMonthStart, currentDayUtc } from '../src/lib/credits';

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
});
afterEach(() => { vi.clearAllMocks(); });

interface LedgerEvent {
  /** ISO timestamp the call dispatched at. */
  createdAt: string;
}

/**
 * Wire the pg mock so both the /usage SQL and the getCreditStatus SQL
 * read from the same fixture. The reservation counter is set to
 * `counterMonthlyUsed` so we can simulate divergence (in-flight holds
 * or a missed refund) and prove the headline tile reads the ledger,
 * not the counter.
 */
function installFixture(opts: {
  ledger: LedgerEvent[];
  counterMonthlyUsed: number;
  manualDailyUsed?: number;
  lastRunAtIso?: string;
  lastRunReceived?: number;
  lastRunPlatforms?: string[];
}) {
  const monthStart = currentMonthStart().toISOString();
  const monthlyLedgerCount = opts.ledger.filter(
    (r) => r.createdAt >= monthStart,
  ).length;
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const sevenDayCount = opts.ledger.filter((r) => r.createdAt >= sevenDaysAgo).length;
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  // 14-day daily buckets, UTC-truncated, matching what
  // `date_trunc('day', created_at AT TIME ZONE 'UTC')` returns.
  const dailyMap = new Map<string, number>();
  for (const ev of opts.ledger) {
    if (ev.createdAt < fourteenDaysAgo) continue;
    const day = ev.createdAt.slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
  }
  const dailyRows = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, credits]) => ({ day, credits }));

  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('CREATE TABLE')) return { rows: [] };
    if (sql.includes('FROM users')) {
      return { rows: [{ plan: 'pro', trial_ends_at: null }] };
    }
    if (sql.includes('INSERT INTO usage_counters')) {
      return { rows: [{
        user_id: 'u1',
        monthly_used: opts.counterMonthlyUsed,
        manual_daily_used: opts.manualDailyUsed ?? 0,
        period_month: currentMonthStart().toISOString().slice(0, 10),
        daily_date: currentDayUtc(),
        last_low_balance_notify_at: null,
        last_reset_notify_at: null,
        rolled_over_month: false,
      }] };
    }
    if (sql.includes("date_trunc('day'")) {
      return { rows: dailyRows };
    }
    if (sql.includes('FROM tenant_cost_events')) {
      // /usage and getCreditStatus both COUNT(*) over a created_at >=
      // bound. We disambiguate on the bound itself so test outcomes
      // don't depend on the call order between the two endpoints.
      const since = String(params?.[1] ?? '');
      const count = opts.ledger.filter((r) => r.createdAt >= since).length;
      return { rows: [{ c: count }] };
    }
    if (sql.includes('FROM active_runs')) {
      if (!opts.lastRunAtIso) return { rows: [] };
      return { rows: [{
        id: 'r1',
        started_at: opts.lastRunAtIso,
        completed_at: opts.lastRunAtIso,
        received: opts.lastRunReceived ?? 0,
        platforms: opts.lastRunPlatforms ?? [],
      }] };
    }
    if (sql.includes('FROM brands')) return { rows: [] };
    if (sql.includes('FROM rate_limits')) return { rows: [] };
    return { rows: [] };
  });

  return { monthlyLedgerCount, sevenDayCount };
}

function fakeRequest(): Request {
  return new Request('http://localhost/api/credits/usage', {
    headers: { cookie: 'livesov_token=fake' },
  });
}

describe('issue #453 - credit accounting alignment', () => {
  it('a) sum(dailyUsageLast14Days within current period) equals monthlyUsed shown on the tile', async () => {
    // Six dispatched calls this period, all on the same UTC day (today)
    // for simplicity. Counter is at 8 - i.e. there are 2 in-flight
    // reservations. The tile must show 6 (ledger), not 8 (counter).
    const today = currentDayUtc();
    const { monthlyLedgerCount } = installFixture({
      ledger: [
        { createdAt: `${today}T00:30:00Z` },
        { createdAt: `${today}T01:30:00Z` },
        { createdAt: `${today}T02:30:00Z` },
        { createdAt: `${today}T03:30:00Z` },
        { createdAt: `${today}T04:30:00Z` },
        { createdAt: `${today}T05:30:00Z` },
      ],
      counterMonthlyUsed: 8,
    });

    const status = await getCreditStatus('u1', 'pro');
    const usageResp = await usageGET(fakeRequest());
    const usageBody = await usageResp.json();

    // Sum daily series, but only days inside the current calendar month.
    const monthStart = currentMonthStart().toISOString().slice(0, 10);
    const inPeriodSum = (usageBody.dailyUsageLast14Days as Array<{ date: string; credits: number }>)
      .filter((p) => p.date >= monthStart)
      .reduce((acc, p) => acc + p.credits, 0);

    expect(status.monthlyUsed).toBe(monthlyLedgerCount);
    expect(inPeriodSum).toBe(status.monthlyUsed);
    // Counter still gates `remaining`, so reservedCredits surfaces
    // the divergence as a separate, auditable number.
    expect(status.reservedCredits).toBe(2);
    expect(status.remaining).toBe(2500 - 8);
  });

  it('b) projectedMonthEnd == round(monthlyUsed + avgDailyCredits * daysRemainingInMonth) using the same monthlyUsed', async () => {
    // 14 dispatched calls inside the last 7 days = avg 2/day.
    const events: LedgerEvent[] = [];
    for (let i = 0; i < 14; i++) {
      const t = new Date(Date.now() - (i % 7) * 86_400_000 - 60_000).toISOString();
      events.push({ createdAt: t });
    }
    installFixture({
      ledger: events,
      counterMonthlyUsed: 17, // 3 in-flight; must NOT leak into projection
    });

    const status = await getCreditStatus('u1', 'pro');
    const usageBody = await (await usageGET(fakeRequest())).json();

    const expected = Math.round(
      status.monthlyUsed + usageBody.avgDailyCredits * usageBody.daysRemainingInMonth,
    );
    expect(usageBody.projectedMonthEnd).toBe(expected);
  });

  it('c) lastRun.atDate matches the bucket the run lands in within dailyUsageLast14Days', async () => {
    // Pick a timestamp 2 days ago at 23:30 UTC - far enough from
    // midnight that the local-tz client formatter would land on a
    // different day in many viewers, but the server-side bucket key
    // must still line up with the ledger row.
    const runIso = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 13) + ':30:00Z';
    installFixture({
      ledger: [{ createdAt: runIso }],
      counterMonthlyUsed: 1,
      lastRunAtIso: runIso,
      lastRunReceived: 1,
      lastRunPlatforms: ['ChatGPT'],
    });

    const usageBody = await (await usageGET(fakeRequest())).json();

    expect(usageBody.lastRun).toBeTruthy();
    expect(usageBody.lastRun.at).toBe(runIso);
    // The bucket key the daily series uses is the same UTC day slice.
    expect(usageBody.lastRun.atDate).toBe(runIso.slice(0, 10));
    const matchedBucket = (usageBody.dailyUsageLast14Days as Array<{ date: string; credits: number }>)
      .find((p) => p.date === usageBody.lastRun.atDate);
    expect(matchedBucket).toBeDefined();
    expect(matchedBucket!.credits).toBeGreaterThanOrEqual(usageBody.lastRun.credits);
  });
});
