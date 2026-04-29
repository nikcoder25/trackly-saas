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
import CreditsRing from './usage/CreditsRing';
import Sparkline from './usage/Sparkline';
import PlatformChips from './usage/PlatformChips';
import AvatarStack from './usage/AvatarStack';

interface UsageSectionProps {
  numBrandsFromPage: number;
  resetDateLabel?: string;
}

const PANEL: React.CSSProperties = {
  background: 'linear-gradient(180deg, #ffffff 0%, #fafbff 100%)',
  border: '1px solid #e2e8f0',
  borderRadius: 20,
  padding: 24,
  boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(99,102,241,.06)',
};
const TILE_LABEL: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 11, fontWeight: 700, letterSpacing: 1.1,
  textTransform: 'uppercase', color: '#64748b',
};
const TILE_NUMBER: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums',
  fontSize: 30, fontWeight: 700, color: '#0f172a', lineHeight: 1.1,
  letterSpacing: -0.5,
};
const SUBLINE: React.CSSProperties = {
  fontSize: 12, color: '#64748b', fontFamily: 'var(--font)',
};
const FOOTER_LINK: React.CSSProperties = {
  fontSize: 11, color: '#4f46e5', fontWeight: 600,
  textDecoration: 'none', letterSpacing: 0.2,
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
    return <div style={{ marginTop: 16, ...PANEL, height: 320 }} aria-busy="true" />;
  }

  const cfg = getPlanCredits(status.plan);
  const isUnlimited = status.monthlyCap >= 99999 || status.plan === 'owner';
  const banner = bannerKind({
    remaining: status.remaining,
    monthlyCap: status.monthlyCap,
    manualRemainingToday: status.manualRemainingToday,
    lowBalance: status.lowBalance,
    plan: status.plan,
  });

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
      {/* ── Hero panel ────────────────────────────────────────── */}
      <div style={PANEL}>
        {/* Header strip */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12, marginBottom: 24,
        }}>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 1.4,
              textTransform: 'uppercase', color: '#6366f1', marginBottom: 6,
            }}>
              Usage this period
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              fontSize: 14, color: '#334155',
            }}>
              <span><strong style={{ color: '#0f172a' }}>{status.label}</strong> plan</span>
              <span style={{ color: '#cbd5e1' }}>·</span>
              <span>Resets <strong style={{ color: '#0f172a' }}>{fmtDate(status.nextResetAt)}</strong></span>
              {isUnlimited && (
                <span style={{
                  padding: '2px 10px', borderRadius: 999,
                  background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
                  color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
                  textTransform: 'uppercase',
                }}>
                  Unlimited
                </span>
              )}
            </div>
          </div>
          <Link href="/dashboard/billing/ledger" style={{
            ...FOOTER_LINK, padding: '8px 14px', borderRadius: 10,
            border: '1px solid #e2e8f0', background: '#fff',
            transition: 'all 150ms ease',
          }}>
            View ledger →
          </Link>
        </div>

        {/* KPI row */}
        <div className="usage-v2-grid" style={{
          display: 'grid', gridTemplateColumns: 'minmax(220px, 1.2fr) repeat(3, 1fr)', gap: 16,
        }}>
          {/* Credits */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
            <CreditsRing
              used={status.monthlyUsed}
              cap={status.monthlyCap}
              unlimited={isUnlimited}
              size={156}
              label={isUnlimited
                ? 'Unlimited credits on this plan'
                : `Credits used ${status.monthlyUsed} of ${status.monthlyCap}`}
            />
            <div>
              <div style={TILE_LABEL}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 2v20M2 12h20" />
                </svg>
                Credits used
              </div>
              <div style={{ ...TILE_NUMBER, marginTop: 6 }}>
                {status.monthlyUsed.toLocaleString()}
                <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 18 }}>
                  {' '}/ {isUnlimited ? '∞' : status.monthlyCap.toLocaleString()}
                </span>
                {isUnlimited && <span className="sr-only"> Unlimited</span>}
              </div>
              <div style={{ ...SUBLINE, marginTop: 6 }}>
                {isUnlimited
                  ? 'No monthly cap'
                  : `${status.remaining.toLocaleString()} remaining · resets ${fmtDate(status.nextResetAt)}`}
              </div>
              {!isUnlimited && (
                <div style={{ ...SUBLINE, fontSize: 11, marginTop: 2, opacity: 0.85 }}>
                  Manual today: {(status.manualDailyCap - status.manualRemainingToday).toLocaleString()} / {status.manualDailyCap.toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {/* Tracked prompts (account-wide cap, v3 spec). Per-brand
              breakdown is informational in the sub-line. */}
          <KpiTile
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            }
            label="Tracked prompts"
            number={configuredPrompts}
            cap={isUnlimited || cfg.trackedPromptsPerAccount >= 9999 ? null : cfg.trackedPromptsPerAccount}
            sub={`Account-wide · ${configuredPrompts.toLocaleString()} across ${numBrands} brand${numBrands === 1 ? '' : 's'}`}
            footer={<Link href="/dashboard/setup" style={FOOTER_LINK}>Add prompt →</Link>}
            visual={<Sparkline data={dailyCredits} width={108} height={32} />}
          />

          {/* Platforms */}
          <KpiTile
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
              </svg>
            }
            label="Active platforms"
            number={activePlatforms.length}
            cap={isUnlimited ? null : cfg.maxPlatforms}
            sub={null}
            footer={<Link href="/dashboard/setup" style={FOOTER_LINK}>Manage →</Link>}
            visual={<PlatformChips platforms={activePlatforms} maxVisible={3} />}
          />

          {/* Brands */}
          <KpiTile
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 7h18M3 12h18M3 17h18" />
              </svg>
            }
            label="Brands"
            number={numBrands}
            cap={null}
            capLabel={isUnlimited ? '∞' : '∞'}
            sub={`${numActiveBrands} active`}
            footer={<Link href="/dashboard/setup" style={FOOTER_LINK}>Manage →</Link>}
            visual={<AvatarStack brands={brandList} maxVisible={4} size={28} />}
          />
        </div>

        {/* Burn-rate forecast (hidden for unlimited) */}
        {!isUnlimited && (
          <div style={{
            marginTop: 24, paddingTop: 18, borderTop: '1px solid #eef2f7',
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <span style={{
              padding: '4px 10px', borderRadius: 999, fontSize: 10,
              fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
              background: forecastCopy.state === 'at_risk' ? 'rgba(245,158,11,.12)' : 'rgba(16,185,129,.12)',
              color: forecastCopy.state === 'at_risk' ? '#b45309' : '#047857',
            }}>
              {forecastCopy.state === 'at_risk' ? '⚠ At risk' : '✓ On track'}
            </span>
            <span style={{ flex: 1, minWidth: 240, fontSize: 13, color: '#334155', lineHeight: 1.55 }}>
              {forecastCopy.text}
            </span>
            <Sparkline
              data={dailyCredits}
              width={120}
              height={28}
              color={forecastCopy.state === 'at_risk' ? '#f59e0b' : '#6366f1'}
            />
          </div>
        )}
      </div>

      {/* ── Auto-tracking pill ────────────────────────────────── */}
      <AutoTrackingPill
        paused={autoRunPaused}
        plan={status.label}
        scheduled={cfg.scheduledRuns}
        nextRun={nextRun}
        lastRun={lastRun}
        nextResetAt={status.nextResetAt}
        remaining={status.remaining}
      />

      {/* ── GEO Audits ────────────────────────────────────────── */}
      <GeoAuditsCard
        used={usage?.geoAuditsThisMonth ?? 0}
        cap={isUnlimited ? null : null}
        resetAt={usage?.geoAuditsResetAt ?? status.nextResetAt}
        resetDateLabel={resetDateLabel}
      />

      {/* ── Banner ────────────────────────────────────────────── */}
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
        @media (max-width: 980px) {
          .usage-v2-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 600px) {
          .usage-v2-grid { grid-template-columns: 1fr 1fr !important; gap: 12px !important; }
        }
        @keyframes usagePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.4); }
        }
      `}</style>
    </section>
  );
  void fmtRelative;
}

function KpiTile({
  icon, label, number, cap, capLabel, sub, footer, visual,
}: {
  icon: React.ReactNode;
  label: string;
  number: number;
  cap: number | null;
  capLabel?: string;
  sub: string | null;
  footer?: React.ReactNode;
  visual?: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: 16, borderRadius: 14, background: '#ffffff',
      border: '1px solid #eef2f7', minHeight: 168,
      transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
    }}>
      <div style={TILE_LABEL}>{icon}{label}</div>
      <div style={TILE_NUMBER}>
        {number.toLocaleString()}
        <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 18 }}>
          {' '}/ {cap === null ? (capLabel ?? '∞') : cap.toLocaleString()}
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>{visual}</div>
      {sub && <div style={SUBLINE}>{sub}</div>}
      {footer && <div>{footer}</div>}
    </div>
  );
}

function AutoTrackingPill({
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
        marginTop: 12, padding: '12px 18px', borderRadius: 14,
        background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.25)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13,
      }}>
        <span aria-hidden="true" style={{
          width: 8, height: 8, borderRadius: '50%', background: '#f59e0b',
        }} />
        <span style={{ flex: 1, color: '#334155', lineHeight: 1.55 }}>
          <strong style={{ color: '#b45309' }}>Auto-tracking paused</strong>
          {!scheduled
            ? ` — ${plan} plan doesn't include scheduled runs.`
            : remaining <= 0
              ? ' — credits exhausted.'
              : ''}
          {scheduled && remaining <= 0 && (
            <> Resumes <strong>{fmtDate(nextResetAt)}</strong>, or upgrade now.</>
          )}
        </span>
        <Link href="/dashboard/billing" style={{ ...FOOTER_LINK, color: '#b45309' }}>Upgrade →</Link>
      </div>
    );
  }
  return (
    <div style={{
      marginTop: 12, padding: '12px 18px', borderRadius: 14,
      background: 'linear-gradient(180deg, rgba(16,185,129,.06), rgba(16,185,129,.02))',
      border: '1px solid rgba(16,185,129,.22)',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13,
    }}>
      <span aria-hidden="true" style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10 }}>
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '50%', background: '#10b981',
          animation: 'usagePulse 1.8s ease-in-out infinite',
        }} />
        <span style={{
          position: 'relative', width: 10, height: 10, borderRadius: '50%', background: '#10b981',
        }} />
      </span>
      <span style={{ flex: 1, color: '#334155', lineHeight: 1.55 }}>
        <strong style={{ color: '#047857' }}>Daily auto-tracking active</strong>
        {nextRun && <> · Next run <strong>{fmtRelative(nextRun)}</strong> ({fmtDate(nextRun)})</>}
        {lastRun && (
          <>
            {' '}· Last run {fmtDateUtc(lastRun.atDate)} consumed{' '}
            <strong style={{ fontFamily: 'var(--mono)' }}>{lastRun.credits.toLocaleString()}</strong>{' '}
            credit{lastRun.credits === 1 ? '' : 's'} across {lastRun.platforms.length} platform{lastRun.platforms.length === 1 ? '' : 's'}.
          </>
        )}
      </span>
    </div>
  );
}

function GeoAuditsCard({
  used, cap, resetAt, resetDateLabel,
}: {
  used: number; cap: number | null; resetAt: string | null; resetDateLabel?: string;
}) {
  const pct = cap && cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div style={{
      marginTop: 12, padding: 18, borderRadius: 16,
      background: '#fff', border: '1px solid #e2e8f0',
      boxShadow: '0 1px 2px rgba(15,23,42,.04)',
      display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 16,
    }}>
      <div>
        <div style={TILE_LABEL}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="10" r="3" />
            <path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z" />
          </svg>
          GEO Audits
        </div>
        <div style={{ ...TILE_NUMBER, fontSize: 22, marginTop: 6 }}>
          {used.toLocaleString()}
          <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 14 }}>
            {' '}/ {cap === null ? '∞' : cap.toLocaleString()} this month
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: '#eef2f7', overflow: 'hidden', marginTop: 10 }}>
          <div style={{
            height: '100%', borderRadius: 999, width: `${pct}%`,
            background: 'linear-gradient(90deg, #10b981, #34d399)',
            transition: 'width .8s cubic-bezier(.16,1,.3,1)',
          }} />
        </div>
        <div style={{ ...SUBLINE, fontSize: 11, marginTop: 6 }}>
          Resets {fmtDate(resetAt ?? null)}{resetDateLabel ? ` · ${resetDateLabel}` : ''}
        </div>
      </div>
      <Link href="/dashboard/geo-audit" style={{
        padding: '10px 14px', borderRadius: 10,
        border: '1px solid #e2e8f0', color: '#0f172a',
        textDecoration: 'none', fontSize: 12, fontWeight: 600,
        background: '#fff', whiteSpace: 'nowrap',
      }}>
        Run new audit →
      </Link>
    </div>
  );
}

function UsageBanner({
  kind, monthlyCap, remaining, nextResetAt, nextDailyResetAt,
}: {
  kind: 'exhausted' | 'low' | 'manual_cap';
  monthlyCap: number; remaining: number;
  nextResetAt: string; nextDailyResetAt: string;
}) {
  if (kind === 'exhausted') {
    return (
      <div style={{
        marginTop: 12, padding: '14px 20px', borderRadius: 14,
        background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)',
        display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, flexWrap: 'wrap',
      }}>
        <span style={{ color: '#ef4444', fontWeight: 700 }}>● Out of credits.</span>
        <span style={{ flex: 1, color: '#0f172a' }}>
          Auto-tracking paused. Resumes <strong>{fmtDate(nextResetAt)}</strong>.
        </span>
        <Link href="/dashboard/billing" style={{
          padding: '8px 14px', borderRadius: 10, background: '#ef4444',
          color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 700,
        }}>Upgrade Plan</Link>
      </div>
    );
  }
  if (kind === 'low') {
    const pct = Math.round((remaining / Math.max(1, monthlyCap)) * 100);
    return (
      <div style={{
        marginTop: 12, padding: '14px 20px', borderRadius: 14,
        background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.25)',
        display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, flexWrap: 'wrap',
      }}>
        <span style={{ color: '#b45309', fontWeight: 700 }}>⚠</span>
        <span style={{ flex: 1, color: '#0f172a' }}>
          You&apos;re at <strong>{pct}%</strong> of monthly credits.
        </span>
        <Link href="/dashboard/billing/ledger" style={FOOTER_LINK}>View ledger →</Link>
        <Link href="/dashboard/billing" style={{
          padding: '8px 14px', borderRadius: 10, background: '#f59e0b',
          color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 700,
        }}>Upgrade</Link>
      </div>
    );
  }
  return (
    <div style={{
      marginTop: 12, padding: '14px 20px', borderRadius: 14,
      background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.25)',
      display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, flexWrap: 'wrap',
    }}>
      <span style={{ color: '#1d4ed8', fontWeight: 700 }}>ℹ</span>
      <span style={{ flex: 1, color: '#0f172a' }}>
        Daily manual run cap reached. Auto-runs continue. Resets{' '}
        <strong>{fmtDate(nextDailyResetAt)}</strong>.
      </span>
    </div>
  );
}
