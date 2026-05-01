'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCredits } from '@/contexts/CreditsContext';
import { useBrands } from '@/contexts/BrandContext';
import { getPlanCredits } from '@/lib/plan-config';
import {
  bannerKind,
  buildForecastCopy,
  fmtDate,
  fmtDateUtc,
  fmtRelative,
} from './usage-state';
import type { UsageBreakdown } from '@/app/api/credits/usage/route';
import Sparkline from './usage/Sparkline';
import PlatformChips from './usage/PlatformChips';
import AvatarStack from './usage/AvatarStack';

interface UsageSectionProps {
  numBrandsFromPage: number;
  resetDateLabel?: string;
}

/* ──────────────────────────────────────────────────────────────
 *  Modern SaaS redesign of the "Usage This Period" section.
 *
 *  Visual language: Linear / Stripe / Vercel — single flat panel
 *  with hairline dividers, generous whitespace, monospace numerals
 *  for tabular alignment, subtle status indicators, and minimal
 *  chrome. Hooks into the *exact same data* as the previous version
 *  (CreditsContext, BrandContext, /api/credits/usage) and preserves
 *  all behaviour: View ledger, Add prompt, Manage links, at-risk
 *  warning logic, daily auto-tracking status, projection logic,
 *  Agency plan name (via `status.label`), banners, and copy.
 *
 *  Sub-components (defined below): HeaderStrip, CreditsHero,
 *  ProjectionStrip, MetricCard, PlatformBreakdown, AutoTrackingStrip,
 *  GeoAuditsStrip, UsageBanner, PlanBadge, StatusDot.
 * ──────────────────────────────────────────────────────────── */

// Small style helpers reused across sub-components.
const MONO: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontVariantNumeric: 'tabular-nums',
};
const EYEBROW: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: 'var(--muted)',
};
const ACTION_LINK: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text)',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

export default function UsageSection({ numBrandsFromPage, resetDateLabel }: UsageSectionProps) {
  const { status } = useCredits();
  const { brands } = useBrands();
  const [usage, setUsage] = useState<UsageBreakdown | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/credits/usage', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setUsage(d as UsageBreakdown); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!status) {
    return (
      <section
        aria-busy="true"
        style={{
          marginTop: 16, height: 360, borderRadius: 'var(--radius)',
          background: 'var(--bg2)', border: '1px solid var(--border)',
        }}
      />
    );
  }

  const cfg = getPlanCredits(status.plan);
  const isUnlimited = status.monthlyCap >= 99999 || status.plan === 'owner';

  // Banner state (exhausted / low / manual_cap / null).
  const banner = bannerKind({
    remaining: status.remaining,
    monthlyCap: status.monthlyCap,
    manualRemainingToday: status.manualRemainingToday,
    lowBalance: status.lowBalance,
    plan: status.plan,
  });

  // Forecast (drives the at-risk warning + projection text).
  const dailyCredits = (usage?.dailyUsageLast14Days ?? []).map((p) => p.credits);
  const avgDaily = usage?.avgDailyCredits ?? 0;
  const projectedMonthEnd = usage?.projectedMonthEnd ?? status.monthlyUsed;
  const daysRemaining = usage?.daysRemainingInMonth ?? 0;
  const forecastCopy = buildForecastCopy(
    {
      monthlyUsed: status.monthlyUsed, monthlyCap: status.monthlyCap,
      avgDailyCredits: avgDaily, projectedMonthEnd,
      daysRemainingInMonth: daysRemaining, remaining: status.remaining,
    },
    status.nextResetAt,
  );

  const numBrands = usage?.numBrands ?? numBrandsFromPage;
  const numActiveBrands = usage?.numActiveBrands ?? 0;
  const configuredPrompts = usage?.configuredPrompts ?? 0;
  const activePlatforms = usage?.activePlatforms ?? [];
  const lastRun = usage?.lastRun ?? null;
  const nextRun = usage?.nextScheduledRun ?? null;
  const autoRunPaused = !cfg.scheduledRuns || status.remaining <= 0;
  const brandList = (brands ?? []).map((b) => ({
    id: (b as { id?: string }).id ?? '',
    name: (b as { name?: string }).name ?? 'Brand',
  }));

  return (
    <section style={{ marginTop: 16 }}>
      {/* ════════════════════════════════════════════════════════
          Primary panel — single surface, sectioned by hairlines.
          ════════════════════════════════════════════════════════ */}
      <div style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        boxShadow: 'var(--app-shadow)',
      }}>
        <HeaderStrip
          planLabel={status.label}
          unlimited={isUnlimited}
          nextResetAt={status.nextResetAt}
        />

        <CreditsHero
          monthlyUsed={status.monthlyUsed}
          monthlyCap={status.monthlyCap}
          remaining={status.remaining}
          manualUsedToday={status.manualDailyCap - status.manualRemainingToday}
          manualDailyCap={status.manualDailyCap}
          unlimited={isUnlimited}
          planLabel={status.label}
          dailyCredits={dailyCredits}
          avgDaily={avgDaily}
        />

        {!isUnlimited && (
          <ProjectionStrip
            state={forecastCopy.state}
            text={forecastCopy.text}
          />
        )}

        <div className="usage-stats-band" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          borderTop: '1px solid var(--border)',
        }}>
          <MetricCard
            label="Tracked prompts"
            number={configuredPrompts}
            cap={isUnlimited || cfg.trackedPromptsPerAccount >= 9999 ? null : cfg.trackedPromptsPerAccount}
            sub={`Account-wide · across ${numBrands} brand${numBrands === 1 ? '' : 's'}`}
            action={<Link href="/dashboard/setup" style={ACTION_LINK} className="usage-action-link">Add prompt →</Link>}
            withRightBorder
          />
          <MetricCard
            label="Active platforms"
            number={activePlatforms.length}
            cap={isUnlimited ? null : cfg.maxPlatforms}
            sub={null}
            visual={<PlatformBreakdown platforms={activePlatforms} />}
            action={<Link href="/dashboard/setup" style={ACTION_LINK} className="usage-action-link">Manage links →</Link>}
            withRightBorder
          />
          <MetricCard
            label="Brands"
            number={numBrands}
            cap={null}
            capLabel="∞"
            sub={`${numActiveBrands} active`}
            visual={brandList.length > 0
              ? <AvatarStack brands={brandList} maxVisible={4} size={26} />
              : null}
            action={<Link href="/dashboard/setup" style={ACTION_LINK} className="usage-action-link">Manage →</Link>}
          />
        </div>
      </div>

      {/* Status row: auto-tracking + GEO audits side-by-side. */}
      <div className="usage-status-row" style={{
        marginTop: 12,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
      }}>
        <AutoTrackingStrip
          paused={autoRunPaused}
          plan={status.label}
          scheduled={cfg.scheduledRuns}
          nextRun={nextRun}
          lastRun={lastRun}
          nextResetAt={status.nextResetAt}
          remaining={status.remaining}
        />
        <GeoAuditsStrip
          used={usage?.geoAuditsThisMonth ?? 0}
          cap={isUnlimited ? null : null}
          resetAt={usage?.geoAuditsResetAt ?? status.nextResetAt}
          resetDateLabel={resetDateLabel}
        />
      </div>

      {banner && (
        <UsageBanner
          kind={banner}
          monthlyCap={status.monthlyCap}
          remaining={status.remaining}
          nextResetAt={status.nextResetAt}
          nextDailyResetAt={status.nextDailyResetAt}
        />
      )}

      <style>{`
        .usage-action-link { transition: color 150ms ease; }
        .usage-action-link:hover { color: var(--primary) !important; }
        @keyframes usagePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(2.2); }
        }
        @keyframes usageShift {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @media (max-width: 880px) {
          .usage-hero-row { grid-template-columns: 1fr !important; align-items: flex-start !important; }
          .usage-hero-spark { align-items: flex-start !important; }
          .usage-stats-band { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .usage-stat-cell:nth-child(2) { border-right: none !important; }
          .usage-stat-cell:nth-child(3) {
            grid-column: 1 / -1;
            border-top: 1px solid var(--border) !important;
            border-right: none !important;
          }
          .usage-status-row { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .usage-header-strip { padding: 14px 16px !important; }
          .usage-hero-block { padding: 18px 16px !important; }
          .usage-hero-num { font-size: 36px !important; }
          .usage-stats-band { grid-template-columns: 1fr !important; }
          .usage-stat-cell {
            border-right: none !important;
            border-top: 1px solid var(--border) !important;
          }
          .usage-stat-cell:first-child { border-top: none !important; }
          .usage-stat-cell:nth-child(3) { grid-column: auto; }
        }
      `}</style>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  HeaderStrip — eyebrow, plan badge, reset date, ledger button.
 * ════════════════════════════════════════════════════════════ */
function HeaderStrip({
  planLabel, unlimited, nextResetAt,
}: { planLabel: string; unlimited: boolean; nextResetAt: string }) {
  return (
    <div className="usage-header-strip" style={{
      padding: '16px 22px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={EYEBROW}>Usage this period</span>
        <PlanBadge label={planLabel} unlimited={unlimited} />
        <span style={{ fontSize: 12, color: 'var(--muted)', ...MONO }}>
          Resets {fmtDate(nextResetAt)}
        </span>
      </div>
      <Link
        href="/dashboard/billing/ledger"
        style={{
          ...ACTION_LINK,
          padding: '7px 12px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: 'var(--bg2)',
        }}
        className="usage-action-link"
      >
        View ledger
        <Arrow />
      </Link>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  CreditsHero — primary credits stat, progress bar, sparkline,
 *  manual-today line.
 * ════════════════════════════════════════════════════════════ */
function CreditsHero({
  monthlyUsed, monthlyCap, remaining, manualUsedToday, manualDailyCap,
  unlimited, planLabel, dailyCredits, avgDaily,
}: {
  monthlyUsed: number; monthlyCap: number; remaining: number;
  manualUsedToday: number; manualDailyCap: number;
  unlimited: boolean; planLabel: string;
  dailyCredits: number[]; avgDaily: number;
}) {
  const usedPct = unlimited
    ? 0
    : monthlyCap > 0 ? Math.min(100, (monthlyUsed / monthlyCap) * 100) : 0;
  const usageColor = unlimited
    ? 'var(--primary)'
    : usedPct > 85 ? 'var(--red)' : usedPct >= 60 ? 'var(--amber)' : 'var(--text)';
  const sparkColor = unlimited
    ? '#6366f1'
    : usedPct > 85 ? '#ef4444' : usedPct >= 60 ? '#f59e0b' : '#6366f1';

  return (
    <div className="usage-hero-block" style={{ padding: '22px' }}>
      <div className="usage-hero-row" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 24, alignItems: 'flex-end',
      }}>
        <div>
          <div style={{ ...EYEBROW, marginBottom: 8 }}>Credits used</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="usage-hero-num" style={{
              ...MONO, fontSize: 44, fontWeight: 700, lineHeight: 1,
              letterSpacing: -1, color: usageColor,
            }}>
              {monthlyUsed.toLocaleString()}
            </span>
            <span style={{ ...MONO, fontSize: 18, fontWeight: 400, color: 'var(--muted)' }}>
              / {unlimited ? '∞' : monthlyCap.toLocaleString()}
            </span>
            {!unlimited && (
              <span style={{
                ...MONO, marginLeft: 4,
                fontSize: 11, fontWeight: 600,
                color: 'var(--muted)',
                padding: '3px 8px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-xs)',
              }}>
                {Math.round(usedPct)}%
              </span>
            )}
          </div>

          {/* Hairline progress bar */}
          <div style={{
            marginTop: 14, height: 4, borderRadius: 'var(--radius-full)',
            background: 'var(--bg3)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: unlimited ? '100%' : `${usedPct}%`,
              background: unlimited
                ? 'linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1)'
                : usedPct > 85
                  ? 'var(--red)'
                  : usedPct >= 60
                    ? 'var(--amber)'
                    : 'var(--text)',
              backgroundSize: unlimited ? '200% 100%' : undefined,
              animation: unlimited ? 'usageShift 8s linear infinite' : undefined,
              borderRadius: 'var(--radius-full)',
              transition: 'width 1s cubic-bezier(.16,1,.3,1)',
            }} />
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
            {unlimited ? (
              <>No monthly cap on the {planLabel} plan.</>
            ) : (
              <>
                <span style={MONO}>{remaining.toLocaleString()}</span> credits remaining
                <span style={{ color: 'var(--muted)', opacity: 0.5, margin: '0 6px' }}>·</span>
                Manual today <span style={MONO}>{manualUsedToday.toLocaleString()}</span>
                <span style={{ color: 'var(--muted)', opacity: 0.5 }}> / </span>
                <span style={MONO}>{manualDailyCap.toLocaleString()}</span>
              </>
            )}
          </div>
        </div>

        {/* Sparkline cluster — last 14 days */}
        <div className="usage-hero-spark" style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
        }}>
          <span style={{ ...EYEBROW, fontSize: 10 }}>Last 14 days</span>
          <Sparkline
            data={dailyCredits}
            width={172}
            height={44}
            color={sparkColor}
          />
          <span style={{ fontSize: 11, color: 'var(--muted)', ...MONO }}>
            avg {avgDaily.toLocaleString()}/day
          </span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  ProjectionStrip — On track / At risk inline forecast.
 * ════════════════════════════════════════════════════════════ */
function ProjectionStrip({
  state, text,
}: { state: 'healthy' | 'at_risk'; text: string }) {
  const atRisk = state === 'at_risk';
  return (
    <div style={{
      margin: '0 22px 22px',
      padding: '10px 14px',
      borderRadius: 'var(--radius-sm)',
      border: `1px solid ${atRisk ? 'rgba(239,68,68,.25)' : 'var(--border)'}`,
      background: atRisk ? 'rgba(239,68,68,.04)' : 'var(--bg3)',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <StatusDot color={atRisk ? 'var(--red)' : 'var(--green)'} />
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
        textTransform: 'uppercase',
        color: atRisk ? 'var(--red)' : 'var(--green)',
      }}>
        {atRisk ? 'At risk' : 'On track'}
      </span>
      <span style={{ flex: 1, minWidth: 240, fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
        {text}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  MetricCard — one cell of the 3-up stats band.
 * ════════════════════════════════════════════════════════════ */
function MetricCard({
  label, number, cap, capLabel, sub, visual, action, withRightBorder,
}: {
  label: string;
  number: number;
  cap: number | null;
  capLabel?: string;
  sub: string | null;
  visual?: React.ReactNode;
  action?: React.ReactNode;
  withRightBorder?: boolean;
}) {
  return (
    <div className="usage-stat-cell" style={{
      padding: '20px 22px',
      borderRight: withRightBorder ? '1px solid var(--border)' : 'none',
      display: 'flex', flexDirection: 'column', gap: 10, minHeight: 144,
    }}>
      <div style={EYEBROW}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{
          ...MONO, fontSize: 26, fontWeight: 700, lineHeight: 1,
          letterSpacing: -0.5, color: 'var(--text)',
        }}>
          {number.toLocaleString()}
        </span>
        <span style={{ ...MONO, fontSize: 14, fontWeight: 400, color: 'var(--muted)' }}>
          / {cap === null ? (capLabel ?? '∞') : cap.toLocaleString()}
        </span>
      </div>
      {visual && (
        <div style={{ minHeight: 28, display: 'flex', alignItems: 'center' }}>
          {visual}
        </div>
      )}
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div>}
      <div style={{ flex: 1 }} />
      {action && <div>{action}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  PlatformBreakdown — chips of active platforms with a fallback.
 * ════════════════════════════════════════════════════════════ */
function PlatformBreakdown({ platforms }: { platforms: string[] }) {
  if (platforms.length === 0) {
    return <span style={{ fontSize: 12, color: 'var(--muted)' }}>No platforms enabled yet.</span>;
  }
  return <PlatformChips platforms={platforms} maxVisible={5} />;
}

/* ══════════════════════════════════════════════════════════════
 *  AutoTrackingStrip — green pulse when active, amber when paused.
 * ════════════════════════════════════════════════════════════ */
function AutoTrackingStrip({
  paused, plan, scheduled, nextRun, lastRun, nextResetAt, remaining,
}: {
  paused: boolean; plan: string; scheduled: boolean;
  nextRun: string | null;
  lastRun: { at: string; atDate: string; credits: number; platforms: string[] } | null;
  nextResetAt: string; remaining: number;
}) {
  const cardBase: React.CSSProperties = {
    padding: '14px 18px',
    borderRadius: 'var(--radius)',
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', gap: 8,
    minHeight: 88,
    boxShadow: 'var(--app-shadow)',
  };

  if (paused) {
    return (
      <div style={{
        ...cardBase,
        background: 'rgba(245,158,11,.04)',
        border: '1px solid rgba(245,158,11,.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden="true" style={{
            width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)',
          }} />
          <span style={{ ...EYEBROW, color: 'var(--amber)' }}>
            Auto-tracking paused
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
          {!scheduled
            ? <>The {plan} plan doesn&apos;t include scheduled runs.</>
            : remaining <= 0
              ? <>Credits exhausted. Resumes <strong>{fmtDate(nextResetAt)}</strong>, or upgrade now.</>
              : <>Awaiting next scheduled run.</>}
        </div>
        <div>
          <Link href="/dashboard/billing" style={{
            fontSize: 12, fontWeight: 700,
            color: 'var(--amber)', textDecoration: 'none',
          }} className="usage-action-link">
            Upgrade plan →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={cardBase}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusDot color="var(--green)" pulsing />
        <span style={{ ...EYEBROW, color: 'var(--green)' }}>
          Daily auto-tracking active
        </span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
        {nextRun && (
          <>
            Next run <strong style={MONO}>{fmtRelative(nextRun)}</strong>
            <span style={{ color: 'var(--muted)', opacity: 0.6 }}> · </span>
            <span style={MONO}>{fmtDate(nextRun)}</span>
          </>
        )}
        {lastRun && (
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
            Last run <span style={MONO}>{fmtDateUtc(lastRun.atDate)}</span>
            <span style={{ opacity: 0.6 }}> · </span>
            <span style={MONO}>{lastRun.credits.toLocaleString()}</span> credit{lastRun.credits === 1 ? '' : 's'} across {lastRun.platforms.length} platform{lastRun.platforms.length === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  GeoAuditsStrip — count + thin bar + reset + run-audit CTA.
 * ════════════════════════════════════════════════════════════ */
function GeoAuditsStrip({
  used, cap, resetAt, resetDateLabel,
}: {
  used: number; cap: number | null; resetAt: string | null; resetDateLabel?: string;
}) {
  const pct = cap && cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div style={{
      padding: '14px 18px',
      borderRadius: 'var(--radius)',
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'center', gap: 16,
      minHeight: 88,
      boxShadow: 'var(--app-shadow)',
    }}>
      <div>
        <div style={EYEBROW}>GEO Audits</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
          <span style={{
            ...MONO, fontSize: 22, fontWeight: 700, lineHeight: 1,
            letterSpacing: -0.5, color: 'var(--text)',
          }}>
            {used.toLocaleString()}
          </span>
          <span style={{ ...MONO, fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>
            / {cap === null ? '∞' : cap.toLocaleString()} this month
          </span>
        </div>
        {cap !== null && (
          <div style={{
            height: 3, borderRadius: 'var(--radius-full)', background: 'var(--bg3)',
            overflow: 'hidden', marginTop: 10,
          }}>
            <div style={{
              height: '100%', borderRadius: 'var(--radius-full)', width: `${pct}%`,
              background: 'var(--green)',
              transition: 'width .8s cubic-bezier(.16,1,.3,1)',
            }} />
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, ...MONO }}>
          Resets {fmtDate(resetAt ?? null)}{resetDateLabel ? ` · ${resetDateLabel}` : ''}
        </div>
      </div>
      <Link href="/dashboard/geo-audit" style={{
        padding: '8px 12px', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)', color: 'var(--text)',
        textDecoration: 'none', fontSize: 12, fontWeight: 600,
        background: 'var(--bg2)', whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }} className="usage-action-link">
        Run audit
        <Arrow />
      </Link>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  UsageBanner — exhausted / low / manual_cap.
 * ════════════════════════════════════════════════════════════ */
function UsageBanner({
  kind, monthlyCap, remaining, nextResetAt, nextDailyResetAt,
}: {
  kind: 'exhausted' | 'low' | 'manual_cap';
  monthlyCap: number; remaining: number;
  nextResetAt: string; nextDailyResetAt: string;
}) {
  const wrap: React.CSSProperties = {
    marginTop: 12, padding: '12px 16px', borderRadius: 'var(--radius)',
    display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, flexWrap: 'wrap',
  };
  const eyebrowMini: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
  };

  if (kind === 'exhausted') {
    return (
      <div style={{ ...wrap,
        background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.25)',
      }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} />
        <span style={{ ...eyebrowMini, color: 'var(--red)' }}>Out of credits</span>
        <span style={{ flex: 1, color: 'var(--text)', minWidth: 200 }}>
          Auto-tracking paused. Resumes <strong style={MONO}>{fmtDate(nextResetAt)}</strong>.
        </span>
        <Link href="/dashboard/billing" style={{
          padding: '7px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--red)',
          color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 700,
        }}>Upgrade plan</Link>
      </div>
    );
  }
  if (kind === 'low') {
    const pct = Math.round((remaining / Math.max(1, monthlyCap)) * 100);
    return (
      <div style={{ ...wrap,
        background: 'rgba(245,158,11,.04)', border: '1px solid rgba(245,158,11,.25)',
      }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />
        <span style={{ ...eyebrowMini, color: 'var(--amber)' }}>Low balance</span>
        <span style={{ flex: 1, color: 'var(--text)', minWidth: 200 }}>
          You&apos;re at <strong style={MONO}>{pct}%</strong> of monthly credits.
        </span>
        <Link href="/dashboard/billing/ledger" style={{ ...ACTION_LINK, color: 'var(--muted)' }} className="usage-action-link">
          View ledger →
        </Link>
        <Link href="/dashboard/billing" style={{
          padding: '7px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--amber)',
          color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 700,
        }}>Upgrade</Link>
      </div>
    );
  }
  return (
    <div style={{ ...wrap,
      background: 'rgba(59,130,246,.04)', border: '1px solid rgba(59,130,246,.25)',
    }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)' }} />
      <span style={{ ...eyebrowMini, color: 'var(--blue)' }}>Daily cap reached</span>
      <span style={{ flex: 1, color: 'var(--text)', minWidth: 200 }}>
        Manual run cap reached. Auto-runs continue. Resets <strong style={MONO}>{fmtDate(nextDailyResetAt)}</strong>.
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  Tiny shared atoms.
 * ════════════════════════════════════════════════════════════ */
function PlanBadge({ label, unlimited }: { label: string; unlimited: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 9px',
      fontSize: 11, fontWeight: 700,
      borderRadius: 'var(--radius-xs)',
      color: unlimited ? '#fff' : 'var(--text)',
      background: unlimited
        ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
        : 'var(--bg3)',
      border: unlimited ? 'none' : '1px solid var(--border)',
    }}>
      <span aria-hidden="true" style={{
        width: 5, height: 5, borderRadius: '50%',
        background: unlimited ? '#fff' : 'var(--text)',
      }} />
      {label}
      {unlimited && (
        <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.85, marginLeft: 2 }}>
          · UNLIMITED
        </span>
      )}
    </span>
  );
}

function StatusDot({ color, pulsing = false }: { color: string; pulsing?: boolean }) {
  return (
    <span aria-hidden="true" style={{
      position: 'relative', display: 'inline-flex', width: 8, height: 8,
    }}>
      {pulsing && (
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '50%', background: color,
          animation: 'usagePulse 2.4s ease-in-out infinite',
        }} />
      )}
      <span style={{
        position: 'relative', width: 8, height: 8, borderRadius: '50%', background: color,
      }} />
    </span>
  );
}

function Arrow() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
