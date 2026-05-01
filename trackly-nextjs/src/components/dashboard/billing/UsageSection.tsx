'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCredits } from '@/contexts/CreditsContext';
import { useBrands } from '@/contexts/BrandContext';
import { getPlanCredits } from '@/lib/plan-config';
import { PLAN_LIMITS, PLATFORM_COLORS, PRICING_PLANS } from '@/lib/constants';
import {
  bannerKind,
  buildForecastCopy,
  fmtDate,
  fmtDateUtc,
  fmtRelative,
} from './usage-state';
import type { UsageBreakdown } from '@/app/api/credits/usage/route';
import Sparkline from './usage/Sparkline';
import DailyCreditChart from './DailyCreditChart';

interface UsageSectionProps {
  numBrandsFromPage: number;
  resetDateLabel?: string;
}

const SURFACE = '#ffffff';
const SURFACE_BORDER = '#ececec';
const SURFACE_RADIUS = 14;

const TEXT_PRIMARY = '#161614';
const TEXT_BODY = '#3a3a3a';
const TEXT_SECONDARY = '#6b6b6b';
const TEXT_MUTED = '#9a9a9a';

const PROGRESS_TRACK = '#e7e7e2';
const PROGRESS_FILL_DEFAULT = '#3b6ed4';
const PROGRESS_FILL_WARN = '#7c4a1f';
const PROGRESS_FILL_DANGER = '#b94a3a';
const PROGRESS_FILL_GRAY = '#bdbdb8';

const PILL_OK_BG = '#dde9d4';
const PILL_OK_FG = '#264a2a';
const PILL_RISK_BG = '#f7e0c2';
const PILL_RISK_FG = '#6e3f17';

const STRIP_OK_BG = '#e2ecd8';
const STRIP_OK_FG = '#264a2a';
const STRIP_OK_DOT = '#3a6a3a';
const STRIP_PAUSED_BG = '#f5e3c4';
const STRIP_PAUSED_FG = '#6e3f17';
const STRIP_PAUSED_DOT = '#a06b1f';

const BANNER_INFO_BG = '#dee5f0';
const BANNER_INFO_FG = '#1f3a8a';
const BANNER_DANGER_BG = '#f6dcd6';
const BANNER_DANGER_FG = '#7a1f1f';
const BANNER_WARN_BG = '#f7e0c2';
const BANNER_WARN_FG = '#6e3f17';

const UPGRADE_BTN_BG = '#e1e3f4';
const UPGRADE_BTN_FG = '#3f3dbb';
const UPGRADE_BTN_BORDER = '#cbcdf0';

export default function UsageSection({ numBrandsFromPage, resetDateLabel }: UsageSectionProps) {
  const { status } = useCredits();
  const { brands } = useBrands();
  const [usage, setUsage] = useState<UsageBreakdown | null>(null);
  const [platformTotals, setPlatformTotals] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/credits/usage', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setUsage(d as UsageBreakdown); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Aggregate per-platform credit usage from the credit ledger over the
  // last 30 days. The ledger endpoint already exists (no backend change);
  // we just sum `rows[].credits` keyed by `platform` to power the
  // "Prompts by AI platform" chart.
  useEffect(() => {
    let cancelled = false;
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const url = `/api/credits/ledger?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=200`;
    fetch(url, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const totals: Record<string, number> = {};
        for (const row of (d.rows || []) as { platform: string; credits: number }[]) {
          if (!row.platform) continue;
          totals[row.platform] = (totals[row.platform] || 0) + (row.credits || 1);
        }
        setPlatformTotals(totals);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!status) {
    return (
      <div
        aria-busy="true"
        style={{
          marginTop: 16,
          background: SURFACE,
          border: `1px solid ${SURFACE_BORDER}`,
          borderRadius: SURFACE_RADIUS,
          height: 320,
        }}
      />
    );
  }

  const cfg = getPlanCredits(status.plan);
  const limits = PLAN_LIMITS[status.plan] || PLAN_LIMITS.free;
  const isUnlimited = status.monthlyCap >= 99999 || status.plan === 'owner';
  const banner = bannerKind({
    remaining: status.remaining,
    monthlyCap: status.monthlyCap,
    manualRemainingToday: status.manualRemainingToday,
    lowBalance: status.lowBalance,
    plan: status.plan,
  });

  // Use the 30-day series; UsageSection's sparkline is decorative and
  // size-agnostic, so a longer trail just adds resolution.
  const dailyCredits = (usage?.dailyUsageLast30Days ?? usage?.dailyUsageLast14Days ?? []).map((p) => p.credits);
  const avgDaily = usage?.avgDailyCredits ?? 0;
  const projectedMonthEnd = usage?.projectedMonthEnd ?? status.monthlyUsed;
  const daysIntoMonth = usage?.daysIntoMonth ?? 0;
  const daysRemaining = usage?.daysRemainingInMonth ?? 0;
  const forecastCopy = buildForecastCopy(
    {
      monthlyUsed: status.monthlyUsed,
      monthlyCap: status.monthlyCap,
      avgDailyCredits: avgDaily,
      projectedMonthEnd,
      daysRemainingInMonth: daysRemaining,
      remaining: status.remaining,
    },
    status.nextResetAt,
  );

  const numBrands = usage?.numBrands ?? numBrandsFromPage;
  const configuredPrompts = usage?.configuredPrompts ?? 0;
  const lastRun = usage?.lastRun ?? null;
  const nextRun = usage?.nextScheduledRun ?? null;
  const autoRunPaused = !cfg.scheduledRuns || status.remaining <= 0;
  const geoAuditsThisMonth = usage?.geoAuditsThisMonth ?? 0;
  const geoAuditsCap = limits?.geoAudits ?? 0;

  // Competitors aren't returned by /api/credits/usage; we derive the
  // total from the brand context (each brand carries its competitors
  // array on the client) so we don't add a new API contract.
  let competitorCount = 0;
  for (const b of brands ?? []) {
    const arr = (b as { competitors?: unknown[] }).competitors;
    if (Array.isArray(arr)) competitorCount += arr.length;
  }
  const competitorsCap = limits?.competitors ?? 0;

  // Period start/end derived from the existing payload — no new API.
  const periodEnd = new Date(status.nextResetAt);
  const periodStartMs = Number.isFinite(periodEnd.getTime())
    ? periodEnd.getTime() - (daysIntoMonth + daysRemaining) * 86_400_000
    : Date.now() - 30 * 86_400_000;
  const periodStart = new Date(periodStartMs);
  const fmtRange = (d: Date) =>
    Number.isFinite(d.getTime())
      ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '—';

  // Plan recommendation for the bottom CTA. We surface the most-saturated
  // metric and pair it with the next plan that lifts that cap.
  const PLAN_ORDER = ['free', 'starter', 'pro', 'agency', 'enterprise'] as const;
  const currentIdx = PLAN_ORDER.indexOf(status.plan as typeof PLAN_ORDER[number]);
  const nextPlanKey = currentIdx >= 0 && currentIdx < PLAN_ORDER.length - 1
    ? PLAN_ORDER[currentIdx + 1]
    : null;
  const nextPlanCfg = nextPlanKey ? getPlanCredits(nextPlanKey) : null;
  const nextPlanLimits = nextPlanKey ? PLAN_LIMITS[nextPlanKey] : null;
  const nextPlanPricing = nextPlanKey
    ? PRICING_PLANS.find((p) => p.name.toLowerCase() === nextPlanKey)
    : null;

  type CardSpec = {
    label: string;
    used: number;
    cap: number;
    unlimited: boolean;
  };
  const cards: CardSpec[] = [
    {
      label: 'Prompts tracked',
      used: configuredPrompts,
      cap: cfg.trackedPromptsPerAccount,
      unlimited: cfg.trackedPromptsPerAccount >= 9999,
    },
    {
      label: 'Brands monitored',
      used: numBrands,
      cap: cfg.brandsCap,
      unlimited: cfg.brandsCap >= 9999,
    },
    {
      label: 'Competitors',
      used: competitorCount,
      cap: competitorsCap,
      unlimited: competitorsCap >= 9999,
    },
    {
      label: 'GEO Audits',
      used: geoAuditsThisMonth,
      cap: geoAuditsCap,
      unlimited: geoAuditsCap >= 9999,
    },
  ];

  const tightestCard = cards
    .filter((c) => !c.unlimited && c.cap > 0)
    .sort((a, b) => b.used / b.cap - a.used / a.cap)[0];

  // Platform totals for the breakdown chart. Sorted high → low so the
  // stacked bar reads largest segment first.
  const totalsObj = platformTotals ?? {};
  const breakdownTotal = Object.values(totalsObj).reduce((a, b) => a + b, 0);
  const platformList = Object.entries(totalsObj)
    .filter(([, c]) => c > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({
      name,
      count,
      pct: breakdownTotal > 0 ? (count / breakdownTotal) * 100 : 0,
      color: PLATFORM_COLORS[name] ?? '#9a9a9a',
    }));

  return (
    <section className="usage-redesign" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Header strip ─────────────────────────────────────── */}
      <HeaderStrip
        periodLabel={`${fmtRange(periodStart)} to ${fmtRange(periodEnd)}`}
        manualRemaining={status.manualRemainingToday}
        manualCap={status.manualDailyCap}
        isUnlimited={isUnlimited}
        modelTier={cfg.modelTier}
      />

      {/* ── Forecast card (hidden for unlimited plans) ────────── */}
      {!isUnlimited && (
        <ForecastCard
          state={forecastCopy.state}
          text={forecastCopy.text}
          spark={dailyCredits}
        />
      )}

      {/* ── Auto-tracking strip ──────────────────────────────── */}
      <AutoTrackingStrip
        paused={autoRunPaused}
        plan={status.label}
        scheduled={cfg.scheduledRuns}
        nextRun={nextRun}
        lastRun={lastRun}
        nextResetAt={status.nextResetAt}
        remaining={status.remaining}
      />

      {/* ── 4 metric cards ───────────────────────────────────── */}
      <div className="usage-cards-row" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 14,
      }}>
        {cards.map((c) => <MetricCard key={c.label} {...c} />)}
      </div>

      {/* ── Daily credit usage (30 days) ─────────────────────── */}
      <DailyCreditChart series={usage?.dailyUsageLast30Days ?? []} />

      {/* ── Platform breakdown ───────────────────────────────── */}
      <PlatformBreakdownCard
        capLabel={isUnlimited ? '∞' : status.monthlyCap.toLocaleString()}
        usedLabel={status.monthlyUsed.toLocaleString()}
        platforms={platformList}
        loading={platformTotals === null}
      />

      {/* ── Banner (exhausted / low / manual cap) ────────────── */}
      {banner && (
        <UsageBanner
          kind={banner}
          monthlyCap={status.monthlyCap}
          remaining={status.remaining}
          nextResetAt={status.nextResetAt}
          nextDailyResetAt={status.nextDailyResetAt}
          tightestCardLabel={tightestCard?.label}
          nextPlanKey={nextPlanKey}
          nextPlanBrands={nextPlanCfg?.brandsCap}
          nextPlanPrompts={nextPlanLimits?.trackedPromptsPerAccount}
          nextPlanPrice={nextPlanPricing?.price}
        />
      )}

      {/* Soft upgrade nudge — only when the tightest cap crosses 70%
          saturation and no harder banner is firing. Same blue CTA
          look as the screenshot's "Running low on brand slots" row. */}
      {!banner && tightestCard && (tightestCard.used / tightestCard.cap) >= 0.7 && nextPlanKey && (
        <SoftUpgradeBanner
          tightLabel={tightestCard.label}
          nextPlanKey={nextPlanKey}
          nextPlanBrands={nextPlanCfg?.brandsCap}
          nextPlanPrompts={nextPlanLimits?.trackedPromptsPerAccount}
          nextPlanPrice={nextPlanPricing?.price}
        />
      )}

      <style>{`
        @media (max-width: 980px) {
          .usage-cards-row { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 560px) {
          .usage-cards-row { grid-template-columns: 1fr !important; }
        }
        @keyframes usageDotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
        @media (prefers-reduced-motion: reduce) {
          .usage-redesign * { animation: none !important; transition: none !important; }
        }
      `}</style>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Header
// ────────────────────────────────────────────────────────────────────

function HeaderStrip({
  periodLabel, manualRemaining, manualCap, isUnlimited, modelTier,
}: {
  periodLabel: string;
  manualRemaining: number; manualCap: number;
  isUnlimited: boolean; modelTier: string;
}) {
  return (
    <header style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <h2 style={{
            fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY,
            margin: 0, letterSpacing: -0.2, lineHeight: 1.2,
          }}>
            Usage this period
          </h2>
          {isUnlimited && (
            <span style={{
              padding: '3px 10px', borderRadius: 999, fontSize: 10,
              fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
              background: 'linear-gradient(135deg, #6366f1, #7c3aed)', color: '#fff',
            }}>
              Unlimited
            </span>
          )}
          {modelTier === 'premium' && (
            <span style={{
              padding: '3px 9px', borderRadius: 6, fontSize: 10,
              fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
              background: '#f0eef9', color: '#5a4fcf', fontFamily: 'var(--mono)',
            }}>
              Premium model
            </span>
          )}
        </div>
        <div style={{
          fontSize: 13, color: TEXT_SECONDARY, marginTop: 6, lineHeight: 1.55,
        }}>
          <span>{periodLabel}</span>
          {!isUnlimited && manualCap > 0 && (
            <>
              <span style={{ color: TEXT_MUTED, margin: '0 8px' }}>·</span>
              <span>
                <strong style={{ color: TEXT_BODY, fontWeight: 600 }}>
                  {manualRemaining.toLocaleString()}
                </strong>{' '}
                manual run{manualRemaining === 1 ? '' : 's'} left today
              </span>
            </>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
        <a href="#plan-comparison" style={headerLinkStyle}>
          Top up credits
        </a>
        <Link href="/dashboard/billing/ledger" style={headerLinkStyle}>
          View ledger →
        </Link>
      </div>
    </header>
  );
}

const headerLinkStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#4f46e5',
  fontWeight: 600,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

const secondaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '8px 14px', borderRadius: 10,
  background: SURFACE, border: `1px solid ${SURFACE_BORDER}`,
  color: TEXT_PRIMARY, fontSize: 13, fontWeight: 600,
  textDecoration: 'none', whiteSpace: 'nowrap',
  transition: 'border-color 150ms ease, background 150ms ease',
};

const upgradeBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '8px 16px', borderRadius: 10,
  background: UPGRADE_BTN_BG, border: `1px solid ${UPGRADE_BTN_BORDER}`,
  color: UPGRADE_BTN_FG, fontSize: 13, fontWeight: 600,
  textDecoration: 'none', whiteSpace: 'nowrap',
  transition: 'background 150ms ease',
};

// ────────────────────────────────────────────────────────────────────
// Forecast card
// ────────────────────────────────────────────────────────────────────

function ForecastCard({
  state, text, spark,
}: { state: 'healthy' | 'at_risk'; text: string; spark: number[] }) {
  const isAtRisk = state === 'at_risk';
  return (
    <div style={{
      background: SURFACE, border: `1px solid ${SURFACE_BORDER}`,
      borderRadius: SURFACE_RADIUS, padding: '16px 20px',
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 999,
        background: isAtRisk ? PILL_RISK_BG : PILL_OK_BG,
        color: isAtRisk ? PILL_RISK_FG : PILL_OK_FG,
        fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
        textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}>
        <span aria-hidden="true">{isAtRisk ? '⚠' : '✓'}</span>
        {isAtRisk ? 'At risk' : 'On track'}
      </span>
      <div style={{
        flex: 1, minWidth: 220,
        fontSize: 14, color: TEXT_BODY, lineHeight: 1.55,
      }}>
        {text}
      </div>
      <div style={{ flexShrink: 0 }}>
        <Sparkline
          data={spark.length ? spark : [0]}
          width={120}
          height={32}
          color={isAtRisk ? '#c0822d' : '#6b5dd6'}
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Auto-tracking strip
// ────────────────────────────────────────────────────────────────────

function AutoTrackingStrip({
  paused, plan, scheduled, nextRun, lastRun, nextResetAt, remaining,
}: {
  paused: boolean; plan: string; scheduled: boolean;
  nextRun: string | null;
  lastRun: { at: string; atDate: string; credits: number; platforms: string[] } | null;
  nextResetAt: string; remaining: number;
}) {
  if (paused) {
    return (
      <div style={{
        background: STRIP_PAUSED_BG, borderRadius: SURFACE_RADIUS,
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13,
      }}>
        <span aria-hidden="true" style={{
          width: 10, height: 10, borderRadius: '50%', background: STRIP_PAUSED_DOT,
          flexShrink: 0,
        }} />
        <span style={{ color: STRIP_PAUSED_FG, fontWeight: 700 }}>
          Auto-tracking paused
        </span>
        <span style={{ color: STRIP_PAUSED_DOT, opacity: 0.6 }}>·</span>
        <span style={{ color: STRIP_PAUSED_FG, lineHeight: 1.55, flex: 1, minWidth: 220 }}>
          {!scheduled
            ? `${plan} plan doesn't include scheduled runs.`
            : remaining <= 0
              ? <>Credits exhausted — resumes <strong>{fmtDate(nextResetAt)}</strong>.</>
              : 'Currently inactive.'}
        </span>
        <a href="#plan-comparison" style={{
          color: STRIP_PAUSED_FG, fontSize: 12, fontWeight: 600,
          textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap',
        }}>
          Upgrade plan
        </a>
      </div>
    );
  }
  return (
    <div style={{
      background: STRIP_OK_BG, borderRadius: SURFACE_RADIUS,
      padding: '14px 20px',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13,
    }}>
      <span aria-hidden="true" style={{
        position: 'relative', display: 'inline-flex',
        width: 10, height: 10, flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: STRIP_OK_DOT, animation: 'usageDotPulse 1.8s ease-in-out infinite',
        }} />
        <span style={{
          position: 'relative', width: 10, height: 10,
          borderRadius: '50%', background: STRIP_OK_DOT,
        }} />
      </span>
      <span style={{ color: STRIP_OK_FG, fontWeight: 700 }}>
        Daily auto-tracking active
      </span>
      {(nextRun || lastRun) && (
        <span style={{ color: STRIP_OK_DOT, opacity: 0.5 }}>·</span>
      )}
      <span style={{ color: STRIP_OK_FG, lineHeight: 1.55, flex: 1, minWidth: 220 }}>
        {nextRun && (
          <>Next run <strong>{fmtRelative(nextRun)}</strong> ({fmtDate(nextRun)})</>
        )}
        {nextRun && lastRun && (
          <span style={{ color: STRIP_OK_DOT, opacity: 0.5 }}> · </span>
        )}
        {lastRun && (
          <>
            Last run {fmtDateUtc(lastRun.atDate)} consumed{' '}
            <strong>{lastRun.credits.toLocaleString()}</strong> credit{lastRun.credits === 1 ? '' : 's'}{' '}
            across {lastRun.platforms.length} platform{lastRun.platforms.length === 1 ? '' : 's'}.
          </>
        )}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Metric card
// ────────────────────────────────────────────────────────────────────

function MetricCard({
  label, used, cap, unlimited,
}: {
  label: string; used: number; cap: number; unlimited: boolean;
}) {
  const pct = unlimited
    ? 0
    : cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  const fill = unlimited
    ? PROGRESS_FILL_GRAY
    : pct >= 100 ? PROGRESS_FILL_DANGER
    : pct >= 80 ? PROGRESS_FILL_WARN
    : PROGRESS_FILL_DEFAULT;
  const usedDisplay = used.toLocaleString();
  const capDisplay = unlimited ? 'unlimited' : cap.toLocaleString();
  const subline = unlimited ? 'No limit' : `${Math.round(pct)}% used`;

  return (
    <div style={{
      background: SURFACE, border: `1px solid ${SURFACE_BORDER}`,
      borderRadius: SURFACE_RADIUS, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 10, minHeight: 132,
    }}>
      <div style={{
        fontSize: 13, color: TEXT_SECONDARY, fontWeight: 500,
        letterSpacing: 0.1,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontSize: 30, fontWeight: 700, color: TEXT_PRIMARY,
          lineHeight: 1, letterSpacing: -0.6,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {usedDisplay}
        </span>
        <span style={{
          fontSize: 15, color: TEXT_SECONDARY, fontWeight: 400,
          fontVariantNumeric: 'tabular-nums',
        }}>
          / {capDisplay}
        </span>
      </div>
      <div style={{ marginTop: 'auto' }}>
        <div style={{
          height: 4, borderRadius: 999, background: PROGRESS_TRACK, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: unlimited ? '40%' : `${pct}%`,
            background: fill, borderRadius: 999,
            transition: 'width 1s cubic-bezier(.16,1,.3,1)',
            opacity: unlimited ? 0.45 : 1,
          }} />
        </div>
        <div style={{
          fontSize: 12, color: TEXT_MUTED, marginTop: 8,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {subline}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Platform breakdown card
// ────────────────────────────────────────────────────────────────────

interface PlatformItem {
  name: string;
  count: number;
  pct: number;
  color: string;
}

function PlatformBreakdownCard({
  capLabel, usedLabel, platforms, loading,
}: {
  capLabel: string; usedLabel: string; platforms: PlatformItem[]; loading: boolean;
}) {
  const hasData = platforms.length > 0;
  return (
    <div style={{
      background: SURFACE, border: `1px solid ${SURFACE_BORDER}`,
      borderRadius: SURFACE_RADIUS, padding: '20px 22px',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 4,
          }}>
            Credits by AI platform
          </div>
          <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>
            {usedLabel} of {capLabel} credits used this period
          </div>
        </div>
        <div style={{ fontSize: 12, color: TEXT_MUTED }}>Last 30 days</div>
      </div>

      {/* Stacked bar */}
      <div style={{
        height: 8, borderRadius: 999, background: PROGRESS_TRACK, overflow: 'hidden',
        display: 'flex',
      }}>
        {hasData
          ? platforms.map((p, i) => (
              <div
                key={p.name}
                style={{
                  width: `${p.pct}%`,
                  background: p.color,
                  marginRight: i === platforms.length - 1 ? 0 : 1,
                  transition: 'width 1s cubic-bezier(.16,1,.3,1)',
                }}
                title={`${p.name}: ${p.count.toLocaleString()} (${p.pct.toFixed(1)}%)`}
              />
            ))
          : null}
      </div>

      {/* Legend */}
      {hasData ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          rowGap: 12, columnGap: 16,
        }}>
          {platforms.map((p) => (
            <div key={p.name} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden="true" style={{
                  width: 8, height: 8, borderRadius: '50%', background: p.color,
                }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>
                  {p.name}
                </span>
              </div>
              <div style={{
                fontSize: 12, color: TEXT_SECONDARY, paddingLeft: 16,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {p.count.toLocaleString()} <span style={{ color: TEXT_MUTED }}>· {p.pct.toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: TEXT_MUTED, paddingTop: 4 }}>
          {loading ? 'Loading platform breakdown…' : 'No platform activity in the last 30 days.'}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Banner (exhausted / low / manual cap) + soft upgrade
// ────────────────────────────────────────────────────────────────────

function UsageBanner({
  kind, monthlyCap, remaining, nextResetAt, nextDailyResetAt,
  tightestCardLabel, nextPlanKey, nextPlanBrands, nextPlanPrompts, nextPlanPrice,
}: {
  kind: 'exhausted' | 'low' | 'manual_cap';
  monthlyCap: number; remaining: number;
  nextResetAt: string; nextDailyResetAt: string;
  tightestCardLabel?: string;
  nextPlanKey: string | null;
  nextPlanBrands?: number;
  nextPlanPrompts?: number;
  nextPlanPrice?: string;
}) {
  if (kind === 'exhausted') {
    return (
      <div style={{
        background: BANNER_DANGER_BG, borderRadius: SURFACE_RADIUS,
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: BANNER_DANGER_FG, marginBottom: 2 }}>
            Out of credits
          </div>
          <div style={{ fontSize: 13, color: BANNER_DANGER_FG, opacity: 0.85 }}>
            Auto-tracking paused. Resumes <strong>{fmtDate(nextResetAt)}</strong>.
          </div>
        </div>
        <a href="#plan-comparison" style={{
          ...upgradeBtnStyle,
          background: '#fff', color: BANNER_DANGER_FG, borderColor: '#e6c5bd',
        }}>
          Upgrade plan
        </a>
      </div>
    );
  }
  if (kind === 'low') {
    const pct = Math.round((remaining / Math.max(1, monthlyCap)) * 100);
    return (
      <div style={{
        background: BANNER_WARN_BG, borderRadius: SURFACE_RADIUS,
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: BANNER_WARN_FG, marginBottom: 2 }}>
            Running low on {tightestCardLabel?.toLowerCase() ?? 'credits'}
          </div>
          <div style={{ fontSize: 13, color: BANNER_WARN_FG, opacity: 0.9 }}>
            {nextPlanKey && nextPlanPrice
              ? <>{capitalize(nextPlanKey)} plan adds {fmtNumOrInf(nextPlanBrands)} brands and {fmtNumOrInf(nextPlanPrompts)} prompts for {nextPlanPrice}/mo.</>
              : <>You&apos;re at {pct}% remaining of monthly credits.</>}
          </div>
        </div>
        <a href="#plan-comparison" style={{
          ...upgradeBtnStyle,
          background: '#fff', color: BANNER_WARN_FG, borderColor: '#e6cba0',
        }}>
          Compare plans
        </a>
      </div>
    );
  }
  return (
    <div style={{
      background: BANNER_INFO_BG, borderRadius: SURFACE_RADIUS,
      padding: '14px 20px',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: BANNER_INFO_FG, marginBottom: 2 }}>
          Daily manual run cap reached
        </div>
        <div style={{ fontSize: 13, color: BANNER_INFO_FG, opacity: 0.85 }}>
          Auto-runs continue. Resets <strong>{fmtDate(nextDailyResetAt)}</strong>.
        </div>
      </div>
    </div>
  );
}

function SoftUpgradeBanner({
  tightLabel, nextPlanKey, nextPlanBrands, nextPlanPrompts, nextPlanPrice,
}: {
  tightLabel: string; nextPlanKey: string;
  nextPlanBrands?: number; nextPlanPrompts?: number; nextPlanPrice?: string;
}) {
  return (
    <div style={{
      background: BANNER_INFO_BG, borderRadius: SURFACE_RADIUS,
      padding: '14px 20px',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: BANNER_INFO_FG, marginBottom: 2 }}>
          Running low on {tightLabel.toLowerCase()}
        </div>
        <div style={{ fontSize: 13, color: BANNER_INFO_FG, opacity: 0.85 }}>
          {nextPlanPrice
            ? <>{capitalize(nextPlanKey)} plan adds {fmtNumOrInf(nextPlanBrands)} brands and {fmtNumOrInf(nextPlanPrompts)} prompts for {nextPlanPrice}/mo.</>
            : <>{capitalize(nextPlanKey)} plan unlocks higher caps — contact us for pricing.</>}
        </div>
      </div>
      <a href="#plan-comparison" style={{
        ...secondaryBtnStyle, background: '#fff', color: BANNER_INFO_FG, borderColor: '#c5cee5',
      }}>
        Compare plans
      </a>
    </div>
  );
}

function capitalize(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function fmtNumOrInf(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  return n >= 9999 ? '∞' : n.toLocaleString();
}
