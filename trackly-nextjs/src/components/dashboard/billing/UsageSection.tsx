'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCredits } from '@/contexts/CreditsContext';
import { getPlanCredits } from '@/lib/plan-config';
import {
  bannerKind,
  buildForecastCopy,
  creditTileState,
  fmtDate,
  fmtRelative,
  type CreditTileState,
} from './usage-state';
import type { UsageBreakdown, DailyUsagePoint } from '@/app/api/credits/usage/route';

/**
 * Billing → "Usage This Period" section, redesigned for the v2 credit
 * model. Linear/Vercel aesthetic: hairline borders, no chunky colored
 * top borders, monospace numbers, generous padding. Layout (top→bot):
 *
 *   1. Status strip:  Plan · Resets · Auto-tracking · View ledger →
 *   2. Burn-rate forecast (sparkline + projected month-end copy)
 *   3. KPI tile row (4 tiles): Credits · Prompts · Platforms · Brands
 *   4. Auto-run status card
 *   5. GEO Audits card (smaller, below the fold)
 *   6. Contextual banner: exhausted / low / manual_cap / none
 *
 * Page-load fetch from /api/credits/usage; CreditsContext provides the
 * lighter status payload the dashboard already polls.
 */

interface UsageSectionProps {
  numBrandsFromPage: number;
  resetDateLabel?: string;
}

const HAIRLINE = '1px solid var(--border)';
const CARD: React.CSSProperties = {
  background: 'var(--bg)',
  border: HAIRLINE,
  borderRadius: 14,
  padding: 24,
};
const LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  color: 'var(--muted)',
};
const NUM_BIG: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  fontFamily: 'var(--mono)',
  color: 'var(--text)',
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.1,
};
const SUBLINE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
  fontFamily: 'var(--mono)',
  fontVariantNumeric: 'tabular-nums',
};
const FOOTER_LINK: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--primary)',
  fontWeight: 600,
  textDecoration: 'none',
  letterSpacing: 0.2,
};

function tileFillColor(state: CreditTileState): string {
  if (state === 'danger') return '#ef4444';
  if (state === 'warn') return '#f59e0b';
  return '#10b981';
}

export default function UsageSection({ numBrandsFromPage, resetDateLabel }: UsageSectionProps) {
  const { status } = useCredits();
  const [usage, setUsage] = useState<UsageBreakdown | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/credits/usage', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setUsage(d as UsageBreakdown); })
      .catch(() => { /* tile sub-stats degrade gracefully to '—' */ });
    return () => { cancelled = true; };
  }, []);

  if (!status) {
    // Loading skeleton — keeps the layout from shifting.
    return (
      <div style={{ marginTop: 16, ...CARD, height: 320 }} aria-busy="true" />
    );
  }

  const cfg = getPlanCredits(status.plan);
  const isOwner = status.plan === 'owner';
  const tileState = creditTileState({
    monthlyUsed: status.monthlyUsed,
    monthlyCap: status.monthlyCap,
  });
  const fillColor = tileFillColor(tileState);
  const banner = bannerKind({
    remaining: status.remaining,
    monthlyCap: status.monthlyCap,
    manualRemainingToday: status.manualRemainingToday,
    lowBalance: status.lowBalance,
    plan: status.plan,
  });

  const dailySeries: DailyUsagePoint[] = usage?.dailyUsageLast14Days ?? [];
  const avgDaily = usage?.avgDailyCredits ?? 0;
  const projectedMonthEnd = usage?.projectedMonthEnd ?? status.monthlyUsed;
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
  const numActiveBrands = usage?.numActiveBrands ?? 0;
  const configuredPrompts = usage?.configuredPrompts ?? 0;
  const activePlatforms = usage?.activePlatforms ?? [];
  const lastRun = usage?.lastRun ?? null;
  const nextRun = usage?.nextScheduledRun ?? null;

  // Auto-run paused either because credits are exhausted, or because
  // the plan literally doesn't include scheduled runs (Free).
  const autoRunPaused = !cfg.scheduledRuns || status.remaining <= 0;

  return (
    <section style={{ marginTop: 16 }}>
      {/* ── 1. Status strip ── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          padding: '10px 4px',
          marginBottom: 12,
          fontSize: 12,
          color: 'var(--muted)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>
            <span style={{ color: 'var(--muted)' }}>Plan: </span>
            <strong style={{ color: 'var(--text)' }}>{status.label}</strong>
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={SUBLINE}>
            Resets {fmtDate(status.nextResetAt)}
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>
            Daily auto-tracking{' '}
            <strong style={{ color: cfg.scheduledRuns ? '#10b981' : 'var(--muted)' }}>
              {cfg.scheduledRuns ? 'on' : 'off'}
            </strong>
          </span>
        </div>
        <Link
          href="/dashboard/billing/ledger"
          style={{ marginLeft: 'auto', ...FOOTER_LINK }}
        >
          View ledger →
        </Link>
      </div>

      {/* ── 2. Burn-rate forecast (hidden for owner — not meaningful) ── */}
      {!isOwner && status.monthlyCap > 0 && (
        <div
          style={{
            ...CARD,
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            marginBottom: 12,
            background: forecastCopy.state === 'at_risk'
              ? 'rgba(245,158,11,.04)'
              : 'rgba(16,185,129,.03)',
            borderColor: forecastCopy.state === 'at_risk'
              ? 'rgba(245,158,11,.25)'
              : 'rgba(16,185,129,.2)',
            padding: '16px 20px',
          }}
        >
          <Sparkline
            data={dailySeries}
            color={forecastCopy.state === 'at_risk' ? '#f59e0b' : '#10b981'}
          />
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.55, color: 'var(--text)' }}>
            <span
              style={{
                display: 'inline-block',
                marginRight: 8,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: forecastCopy.state === 'at_risk' ? '#b45309' : '#047857',
              }}
            >
              {forecastCopy.state === 'at_risk' ? '⚠ At risk' : '✓ Healthy'}
            </span>
            {forecastCopy.text}
          </div>
        </div>
      )}

      {/* ── 3. KPI tiles ── */}
      <div
        className="usage-v2-tiles"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
        }}
      >
        {/* Tile 1: Credits used this month */}
        <div style={CARD}>
          <div style={LABEL}>Credits used this month</div>
          <div style={{ ...NUM_BIG, marginTop: 12 }}>
            {status.monthlyUsed.toLocaleString()}
            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 18 }}>
              {' '}/ {isOwner ? '∞' : status.monthlyCap.toLocaleString()}
            </span>
          </div>
          {/* Thin progress bar */}
          {!isOwner && status.monthlyCap > 0 && (
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: 'var(--bg3)',
                overflow: 'hidden',
                marginTop: 12,
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 999,
                  width: `${Math.min(100, (status.monthlyUsed / status.monthlyCap) * 100)}%`,
                  background: fillColor,
                  transition: 'width .8s cubic-bezier(.4,0,.2,1)',
                }}
              />
            </div>
          )}
          <div style={{ ...SUBLINE, marginTop: 12 }}>
            {isOwner
              ? 'Unlimited on owner plan'
              : `${status.remaining.toLocaleString()} remaining · resets ${fmtDate(status.nextResetAt)}`}
          </div>
          <div style={{ ...SUBLINE, fontSize: 11, marginTop: 4, opacity: 0.75 }}>
            Manual today: {(status.manualDailyCap - status.manualRemainingToday).toLocaleString()} / {isOwner ? '∞' : status.manualDailyCap.toLocaleString()}
          </div>
        </div>

        {/* Tile 2: Tracked prompts */}
        <div style={CARD}>
          <div style={LABEL}>Tracked prompts</div>
          <div style={{ ...NUM_BIG, marginTop: 12 }}>
            {configuredPrompts.toLocaleString()}
            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 18 }}>
              {' '}/ {isOwner ? '∞' : cfg.maxPromptsPerBrand.toLocaleString()}
            </span>
          </div>
          <div style={{ ...SUBLINE, marginTop: 12 }}>
            {configuredPrompts.toLocaleString()} across {numBrands} brand{numBrands === 1 ? '' : 's'}
          </div>
          <div style={{ marginTop: 12 }}>
            <Link href="/dashboard/setup" style={FOOTER_LINK}>Add prompt →</Link>
          </div>
        </div>

        {/* Tile 3: Active platforms */}
        <div style={CARD}>
          <div style={LABEL}>Active platforms</div>
          <div style={{ ...NUM_BIG, marginTop: 12 }}>
            {activePlatforms.length}
            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 18 }}>
              {' '}/ {isOwner ? '∞' : cfg.maxPlatforms}
            </span>
          </div>
          <div style={{ ...SUBLINE, marginTop: 12, fontFamily: 'var(--font)' }}>
            {activePlatforms.length > 0 ? activePlatforms.join(', ') : '—'}
          </div>
          <div style={{ marginTop: 12 }}>
            <Link href="/dashboard/setup" style={FOOTER_LINK}>Manage →</Link>
          </div>
        </div>

        {/* Tile 4: Brands */}
        <div style={CARD}>
          <div style={LABEL}>Brands</div>
          <div style={{ ...NUM_BIG, marginTop: 12 }}>
            {numBrands}
            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 18 }}>
              {' '}/ ∞
            </span>
          </div>
          <div style={{ ...SUBLINE, marginTop: 12 }}>
            {numActiveBrands} active
          </div>
          <div style={{ marginTop: 12 }}>
            <Link href="/dashboard/setup" style={FOOTER_LINK}>Manage →</Link>
          </div>
        </div>
      </div>

      {/* ── 4. Auto-run status ── */}
      <div
        style={{
          ...CARD,
          marginTop: 12,
          padding: '14px 20px',
          background: autoRunPaused ? 'rgba(245,158,11,.04)' : 'var(--bg)',
          borderColor: autoRunPaused ? 'rgba(245,158,11,.25)' : 'var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          fontSize: 13,
        }}
      >
        {autoRunPaused ? (
          <>
            <span style={{ color: '#b45309', fontWeight: 600 }}>⚠</span>
            <span style={{ flex: 1, lineHeight: 1.5 }}>
              Auto-tracking paused
              {!cfg.scheduledRuns
                ? ` — ${status.label} plan doesn't include scheduled runs.`
                : ' — credits exhausted.'}
              {cfg.scheduledRuns && status.remaining <= 0 && (
                <> Resumes <strong>{fmtDate(status.nextResetAt)}</strong>, or upgrade now.</>
              )}
            </span>
            <Link href="/dashboard/billing" style={FOOTER_LINK}>Upgrade →</Link>
          </>
        ) : (
          <>
            <span style={{ color: '#10b981', fontWeight: 600 }}>✓</span>
            <span style={{ flex: 1, lineHeight: 1.5 }}>
              Daily auto-tracking active
              {nextRun && (
                <> · Next run <strong>{fmtRelative(nextRun)}</strong> ({fmtDate(nextRun)})</>
              )}
              {lastRun && (
                <>
                  {' '}· Last run {fmtDate(lastRun.at)} consumed{' '}
                  <strong style={{ fontFamily: 'var(--mono)' }}>{lastRun.credits.toLocaleString()}</strong>{' '}
                  credit{lastRun.credits === 1 ? '' : 's'} across {lastRun.platforms.length} platform{lastRun.platforms.length === 1 ? '' : 's'}.
                </>
              )}
            </span>
          </>
        )}
      </div>

      {/* ── 5. GEO Audits card ── */}
      <div
        style={{
          ...CARD,
          marginTop: 12,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ ...LABEL, fontSize: 10, marginBottom: 6 }}>GEO Audits</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ ...NUM_BIG, fontSize: 22 }}>
              {(usage?.geoAuditsThisMonth ?? 0).toLocaleString()}
            </span>
            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 14 }}>
              / {isOwner ? '∞' : '—'} this month
            </span>
          </div>
          <div style={{ ...SUBLINE, fontSize: 11, marginTop: 4 }}>
            Resets {fmtDate(usage?.geoAuditsResetAt ?? status.nextResetAt)}
            {resetDateLabel ? ` · ${resetDateLabel}` : ''}
          </div>
        </div>
        <Link
          href="/dashboard/geo-audit"
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            color: 'var(--text)',
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 600,
            background: 'var(--bg2)',
          }}
        >
          Run new audit →
        </Link>
      </div>

      {/* ── 6. Contextual banner (single, priority-ordered) ── */}
      {banner && <UsageBanner kind={banner} status={status} />}

      <style>{`
        @media (max-width: 980px) {
          .usage-v2-tiles { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 600px) {
          .usage-v2-tiles { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function UsageBanner({
  kind,
  status,
}: {
  kind: 'exhausted' | 'low' | 'manual_cap';
  status: NonNullable<ReturnType<typeof useCredits>['status']>;
}) {
  if (kind === 'exhausted') {
    return (
      <div style={{
        marginTop: 12,
        padding: '14px 20px',
        borderRadius: 12,
        background: 'rgba(239,68,68,.06)',
        border: '1px solid rgba(239,68,68,.25)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 13,
        flexWrap: 'wrap',
      }}>
        <span style={{ color: '#ef4444', fontWeight: 700 }}>● Out of credits.</span>
        <span style={{ flex: 1, color: 'var(--text)' }}>
          Auto-tracking paused. Resumes{' '}
          <strong>{fmtDate(status.nextResetAt)}</strong>.
        </span>
        <Link href="/dashboard/billing" style={{
          padding: '8px 14px', borderRadius: 8,
          background: '#ef4444', color: '#fff',
          textDecoration: 'none', fontSize: 12, fontWeight: 700,
        }}>
          Upgrade Plan
        </Link>
      </div>
    );
  }
  if (kind === 'low') {
    const pct = Math.round((status.remaining / Math.max(1, status.monthlyCap)) * 100);
    return (
      <div style={{
        marginTop: 12,
        padding: '14px 20px',
        borderRadius: 12,
        background: 'rgba(245,158,11,.06)',
        border: '1px solid rgba(245,158,11,.25)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 13,
        flexWrap: 'wrap',
      }}>
        <span style={{ color: '#b45309', fontWeight: 700 }}>⚠</span>
        <span style={{ flex: 1, color: 'var(--text)' }}>
          You&apos;re at <strong>{pct}%</strong> of monthly credits.
        </span>
        <Link href="/dashboard/billing/ledger" style={FOOTER_LINK}>View ledger →</Link>
        <Link href="/dashboard/billing" style={{
          padding: '8px 14px', borderRadius: 8,
          background: '#f59e0b', color: '#fff',
          textDecoration: 'none', fontSize: 12, fontWeight: 700,
        }}>
          Upgrade
        </Link>
      </div>
    );
  }
  // manual_cap
  return (
    <div style={{
      marginTop: 12,
      padding: '14px 20px',
      borderRadius: 12,
      background: 'rgba(59,130,246,.06)',
      border: '1px solid rgba(59,130,246,.25)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 13,
      flexWrap: 'wrap',
    }}>
      <span style={{ color: '#1d4ed8', fontWeight: 700 }}>ℹ</span>
      <span style={{ flex: 1, color: 'var(--text)' }}>
        Daily manual run cap reached. Auto-runs continue. Resets{' '}
        <strong>{fmtDate(status.nextDailyResetAt)}</strong>.
      </span>
    </div>
  );
}

/**
 * Inline SVG sparkline. 60×24, single-color stroke, optional last-value
 * dot. No chart library: a 14-point series is small enough that a hand
 * rolled polyline is faster than importing recharts.
 */
function Sparkline({ data, color }: { data: DailyUsagePoint[]; color: string }) {
  const W = 60;
  const H = 24;
  if (!data.length) {
    return (
      <svg width={W} height={H} aria-hidden="true">
        <line x1="0" y1={H - 1} x2={W} y2={H - 1} stroke="var(--border)" strokeWidth="1" />
      </svg>
    );
  }
  const max = Math.max(1, ...data.map((p) => p.credits));
  const stepX = data.length > 1 ? W / (data.length - 1) : 0;
  const points = data.map((p, i) => {
    const x = i * stepX;
    const y = H - (p.credits / max) * (H - 2) - 1;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const last = data[data.length - 1];
  const lastX = (data.length - 1) * stepX;
  const lastY = H - (last.credits / max) * (H - 2) - 1;
  return (
    <svg
      width={W}
      height={H}
      role="img"
      aria-label={`Last 14 days credit usage; latest ${last.credits} credits`}
      style={{ flexShrink: 0 }}
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
      <circle cx={lastX.toFixed(2)} cy={lastY.toFixed(2)} r="2" fill={color} />
    </svg>
  );
}
