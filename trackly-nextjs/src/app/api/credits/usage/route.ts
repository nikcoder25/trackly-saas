/**
 * GET /api/credits/usage
 *
 * Companion to /api/credits/status. Where /status returns the small
 * payload the dashboard polls every 60s, /usage returns the heavier
 * shape the Billing & Usage page needs to render its tiles, the
 * burn-rate sparkline, and the auto-run status card. Page-load only.
 *
 * Sources:
 *   - dailyUsageLast14Days, avgDailyCredits, projectedMonthEnd:
 *     `tenant_cost_events` (the LLM-call ledger; one row = one credit
 *     consumed, the same accounting `reserveCredits` charges against).
 *   - lastRun, nextScheduledRun: `active_runs` + brand `data.schedule`.
 *   - configuredPrompts, numBrands, numActiveBrands, activePlatforms:
 *     `brands` table (single owner-scoped query).
 *   - geoAuditsThisMonth: `rate_limits` keyed by the monthly bucket
 *     `geo-audit-monthly:<userId>` that /api/geo-audit increments.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getEffectivePlan, PLATFORM_COLORS } from '@/lib/constants';
import {
  currentMonthStart,
  nextMonthStart,
} from '@/lib/credits';

export interface DailyUsagePoint {
  date: string; // YYYY-MM-DD (UTC)
  credits: number;
}

export interface LastRunSummary {
  at: string;
  /**
   * UTC-day bucket of `at`, formatted YYYY-MM-DD. This is the same key
   * `dailyUsageLast14Days[i].date` uses, so the dashboard can highlight
   * the matching bar without re-deriving the bucket on the client (which
   * would do it in the browser's local timezone and drift across the
   * UTC midnight boundary — see #453).
   */
  atDate: string;
  credits: number;
  platforms: string[];
}

export interface UsageBreakdown {
  dailyUsageLast14Days: DailyUsagePoint[];
  avgDailyCredits: number;
  projectedMonthEnd: number;
  daysIntoMonth: number;
  daysRemainingInMonth: number;
  lastRun: LastRunSummary | null;
  nextScheduledRun: string | null;
  configuredPrompts: number;
  numBrands: number;
  numActiveBrands: number;
  activePlatforms: string[];
  geoAuditsThisMonth: number;
  geoAuditsResetAt: string | null;
}

export async function GET(request: Request): Promise<Response> {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  // Effective plan: matches /api/credits/status so the page never
  // sees a different plan label between the two calls.
  const planRow = await pool.query(
    'SELECT plan, trial_ends_at FROM users WHERE id = $1 LIMIT 1',
    [user.id],
  );
  if (!planRow.rows.length) {
    return Response.json({ error: 'User not found' }, { status: 401 });
  }
  void getEffectivePlan(planRow.rows[0].plan, planRow.rows[0].trial_ends_at);

  const now = new Date();
  const monthStart = currentMonthStart(now);
  const monthEnd = nextMonthStart(now);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Run the independent reads in parallel — they don't depend on each
  // other and the page is page-load critical, so latency matters.
  const [
    dailyRes,
    avg7Res,
    monthSpentRes,
    lastRunRes,
    brandsRes,
    geoAuditRes,
  ] = await Promise.all([
    // 14-day series, grouped by UTC day. We zero-fill missing days
    // client-side so the SQL stays simple and the response is bounded.
    pool.query(
      `SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS credits
         FROM tenant_cost_events
        WHERE tenant_id = $1
          AND created_at >= $2
        GROUP BY 1
        ORDER BY 1`,
      [user.id, fourteenDaysAgo.toISOString()],
    ).catch(() => ({ rows: [] as Array<{ day: string; credits: number }> })),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM tenant_cost_events
        WHERE tenant_id = $1 AND created_at >= $2`,
      [user.id, sevenDaysAgo.toISOString()],
    ).catch(() => ({ rows: [{ c: 0 }] })),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM tenant_cost_events
        WHERE tenant_id = $1 AND created_at >= $2`,
      [user.id, monthStart.toISOString()],
    ).catch(() => ({ rows: [{ c: 0 }] })),
    pool.query(
      `SELECT id, started_at, completed_at, received, platforms
         FROM active_runs
        WHERE user_id = $1 AND status = 'done'
        ORDER BY COALESCE(completed_at, started_at) DESC
        LIMIT 1`,
      [user.id],
    ).catch(() => ({ rows: [] as Array<{
      id: string;
      started_at: string;
      completed_at: string | null;
      received: number;
      platforms: unknown;
    }> })),
    pool.query(
      `SELECT id, data, updated_at FROM brands WHERE user_id = $1`,
      [user.id],
    ).catch(() => ({ rows: [] as Array<{ id: string; data: Record<string, unknown>; updated_at: string }> })),
    pool.query(
      `SELECT count, reset_at FROM rate_limits WHERE key = $1 LIMIT 1`,
      [`geo-audit-monthly:${user.id}`],
    ).catch(() => ({ rows: [] as Array<{ count: number | string; reset_at: string | number }> })),
  ]);

  // ── Build 14-day series, zero-filling missing days ─────────────
  const seriesMap = new Map<string, number>();
  for (const row of dailyRes.rows as Array<{ day: string; credits: number }>) {
    seriesMap.set(row.day, Number(row.credits) || 0);
  }
  const dailyUsageLast14Days: DailyUsagePoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dailyUsageLast14Days.push({ date: key, credits: seriesMap.get(key) || 0 });
  }

  // ── Avg + projection ──────────────────────────────────────────
  const credits7d = Number((avg7Res.rows[0] as { c: number } | undefined)?.c || 0);
  const avgDailyCredits = Math.round((credits7d / 7) * 10) / 10;
  const monthlyUsedSoFar = Number((monthSpentRes.rows[0] as { c: number } | undefined)?.c || 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const daysIntoMonth = Math.max(1, Math.ceil((now.getTime() - monthStart.getTime()) / dayMs));
  const daysRemainingInMonth = Math.max(
    0,
    Math.ceil((monthEnd.getTime() - now.getTime()) / dayMs),
  );
  const projectedMonthEnd = Math.round(
    monthlyUsedSoFar + avgDailyCredits * daysRemainingInMonth,
  );

  // ── Last run summary ──────────────────────────────────────────
  let lastRun: LastRunSummary | null = null;
  if (lastRunRes.rows.length) {
    const r = lastRunRes.rows[0] as {
      started_at: string;
      completed_at: string | null;
      received: number;
      platforms: unknown;
    };
    let platforms: string[] = [];
    if (Array.isArray(r.platforms)) platforms = r.platforms as string[];
    else if (typeof r.platforms === 'string') {
      try { platforms = JSON.parse(r.platforms) || []; } catch { platforms = []; }
    }
    const atIso = r.completed_at || r.started_at;
    // Bucket on the same UTC calendar day the daily-series SQL groups
    // by (`date_trunc('day', created_at AT TIME ZONE 'UTC')`). Using
    // toISOString().slice(0, 10) on a Date is the JS equivalent.
    const atDate = new Date(atIso).toISOString().slice(0, 10);
    lastRun = {
      at: atIso,
      atDate,
      credits: Number(r.received) || 0,
      platforms,
    };
  }

  // ── Brand-derived tile data ───────────────────────────────────
  interface BrandData {
    queries?: string[];
    platforms?: string[];
    schedule?: number | string;
    runs?: Array<{ time?: string; date?: string }>;
  }
  const brandRows = brandsRes.rows as Array<{ id: string; data: BrandData; updated_at: string }>;
  const numBrands = brandRows.length;
  let configuredPrompts = 0;
  const platformSet = new Set<string>();
  // Canonical 5-platform allowlist. Trackly supports ChatGPT,
  // Perplexity, Claude, Gemini, Grok — anything else in
  // brand.data.platforms is stale data from earlier iterations
  // (e.g. provider names that got renamed) and must not surface in
  // the Active Platforms tile or its chip list, otherwise the count
  // can read 6 even though no 6th provider exists.
  const SUPPORTED_PLATFORMS = new Set(Object.keys(PLATFORM_COLORS));
  const thirtyDaysAgo = now.getTime() - 30 * dayMs;
  let numActiveBrands = 0;
  let nextScheduledRun: string | null = null;

  for (const b of brandRows) {
    const data = b.data || {};
    if (Array.isArray(data.queries)) configuredPrompts += data.queries.length;
    if (Array.isArray(data.platforms)) {
      for (const p of data.platforms) {
        if (SUPPORTED_PLATFORMS.has(p)) platformSet.add(p);
      }
    }
    // Active = at least one run in the last 30 days. Using the
    // brand-data runs array so we don't have to round-trip another
    // query; brand.runs is the dashboard's source of truth here.
    const runs = Array.isArray(data.runs) ? data.runs : [];
    if (runs.some((run) => {
      const t = new Date(run.time || run.date || 0).getTime();
      return Number.isFinite(t) && t >= thirtyDaysAgo;
    })) {
      numActiveBrands++;
    }
    // Next scheduled run: lastRunTime + scheduleHours, take the
    // earliest across brands. Skip brands with no schedule field.
    const scheduleHours = data.schedule !== undefined && data.schedule !== null
      ? parseInt(String(data.schedule), 10)
      : NaN;
    if (Number.isFinite(scheduleHours) && scheduleHours > 0 && runs.length) {
      const lastRunStamp = runs[runs.length - 1];
      const lastT = new Date(lastRunStamp.time || lastRunStamp.date || 0).getTime();
      if (Number.isFinite(lastT)) {
        const nextT = lastT + scheduleHours * 60 * 60 * 1000;
        const nextIso = new Date(nextT).toISOString();
        if (!nextScheduledRun || nextIso < nextScheduledRun) {
          nextScheduledRun = nextIso;
        }
      }
    }
  }
  const activePlatforms = Array.from(platformSet);

  // ── GEO audits this month ─────────────────────────────────────
  // /api/geo-audit increments rate_limits with a 30-day window keyed
  // `geo-audit-monthly:<userId>`. Reading the row directly gives us
  // a count without exposing the rate-limit module's internals.
  const auditRow = (geoAuditRes.rows as Array<{ count: number | string; reset_at: string | number }>)[0];
  const geoAuditsThisMonth = auditRow ? Number(auditRow.count) || 0 : 0;
  const geoAuditsResetAt = auditRow?.reset_at
    ? new Date(Number(auditRow.reset_at) || Date.parse(String(auditRow.reset_at)))
        .toISOString()
    : null;

  const body: UsageBreakdown = {
    dailyUsageLast14Days,
    avgDailyCredits,
    projectedMonthEnd,
    daysIntoMonth,
    daysRemainingInMonth,
    lastRun,
    nextScheduledRun,
    configuredPrompts,
    numBrands,
    numActiveBrands,
    activePlatforms,
    geoAuditsThisMonth,
    geoAuditsResetAt,
  };

  return Response.json(body, {
    headers: { 'Cache-Control': 'private, max-age=15' },
  });
}
