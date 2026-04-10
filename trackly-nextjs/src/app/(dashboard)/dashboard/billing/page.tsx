'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PLAN_LIMITS, BILLING_PORTAL_URL, PRICING_PLANS } from '@/lib/constants';
import Link from 'next/link';
import { useBrands } from '@/contexts/BrandContext';

const PLAN_INFO: Record<string, { price: string; period: string; gradient: string }> = {
  free:       { price: '$0',     period: '',    gradient: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)' },
  starter:    { price: '$9',     period: '/mo', gradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)' },
  pro:        { price: '$29',    period: '/mo', gradient: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)' },
  agency:     { price: '$89',    period: '/mo', gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)' },
  enterprise: { price: 'Custom', period: '',    gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)' },
  owner:      { price: '—',      period: '',    gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)' },
};

const PLAN_PRICES: Record<string, string> = {
  free: '$0', starter: '$9', pro: '$29', agency: '$89', owner: '—',
};

const PLAN_ORDER = ['free', 'starter', 'pro', 'agency', 'enterprise'] as const;

const PLAN_FEATURES: Record<string, string | undefined>[] = [
  { feature: 'Price / month',    free: '$0',  starter: '$9',  pro: '$29',  agency: '$89',  owner: '—' },
  { feature: 'Brands',           free: '1',   starter: '2',   pro: '5',    agency: '20',   owner: '∞' },
  { feature: 'Queries / brand',  free: '5',   starter: '25',  pro: '50',   agency: '100',  owner: '∞' },
  { feature: 'Runs / month',     free: '5',   starter: '30',  pro: '90',   agency: '240',  owner: '∞' },
  { feature: 'Competitors',      free: '0',   starter: '3',   pro: '10',   agency: '30',   owner: '∞' },
  { feature: 'Platforms',        free: '2',   starter: '2',   pro: '5',    agency: '5',    owner: '5' },
  { feature: 'GEO Audits',       free: '3',   starter: '25',  pro: '100',  agency: '500',  owner: '∞' },
  { feature: 'Sentiment',        free: '—',   starter: '✓',   pro: '✓',    agency: '✓',    owner: '✓' },
  { feature: 'Scheduled Runs',   free: '—',   starter: '72h', pro: '24h',  agency: '12h',  owner: '1h' },
  { feature: 'API Access',       free: '—',   starter: '—',   pro: '—',    agency: '—',    owner: '✓' },
  { feature: 'Priority Support', free: '—',   starter: '—',   pro: '—',    agency: '✓',    owner: '✓' },
];

const METER_TOOLTIPS: Record<string, string> = {
  'Brands': 'Active brands: the number of brands you can track simultaneously.',
  'Queries': 'Queries per brand: maximum number of search queries you can configure for each brand.',
  'Runs This Month': 'Monthly runs: how many visibility scans you can perform across all brands per rolling 30-day period.',
  'Competitors': 'Competitors per brand: the number of competitor brands you can track alongside each of your brands.',
  'Platforms': 'AI platforms tracked: the number of AI platforms (ChatGPT, Gemini, etc.) monitored per run.',
  'GEO Audits': 'GEO audits per month: the number of geographic URL audits you can perform monthly.',
};

const ANNUAL_PRICE_MAP: Record<string, string> = { owner: '—' };
PRICING_PLANS.forEach(p => {
  ANNUAL_PRICE_MAP[p.name.toLowerCase()] = p.annualPrice || p.price;
});

interface BillingEntry { date: string; plan: string; amount: string; status: string; }

interface UsageMeter {
  label: string;
  sublabel?: string;
  used: number;
  max: number;
  icon: string;
  color: string;
  gradient: string;
}

function getStatus(used: number, max: number): 'good' | 'warning' | 'danger' | 'unlimited' {
  if (max >= 9999) return 'unlimited';
  const pct = (used / max) * 100;
  if (pct >= 100) return 'danger';
  if (pct >= 80) return 'warning';
  return 'good';
}

function statusColor(s: 'good' | 'warning' | 'danger' | 'unlimited'): string {
  if (s === 'danger') return '#ef4444';
  if (s === 'warning') return '#f59e0b';
  return '#10b981';
}

export default function BillingPage() {
  const { user } = useAuth();
  const { brands, selectedBrand, loading: brandsLoading } = useBrands();
  const [loading, setLoading] = useState(true);
  const [billingHistory, setBillingHistory] = useState<BillingEntry[]>([]);

  const currentPlan = user?.plan || 'free';
  const limits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;
  const planInfo = PLAN_INFO[currentPlan] || PLAN_INFO.free;

  const visiblePlans = currentPlan === 'owner'
    ? ['free', 'starter', 'pro', 'agency', 'owner'] as const
    : ['free', 'starter', 'pro', 'agency'] as const;

  // Usage state
  const [brandCount, setBrandCount] = useState(0);
  const [queryCount, setQueryCount] = useState(0);
  const [competitorCount, setCompetitorCount] = useState(0);
  const [platformCount, setPlatformCount] = useState(0);
  const [runsUsed, setRunsUsed] = useState(0);
  const [geoAuditCount, setGeoAuditCount] = useState(0);
  const [resetDate, setResetDate] = useState('');
  const [dailyAvg, setDailyAvg] = useState(0);
  const [projectedDaysLeft, setProjectedDaysLeft] = useState<number | null>(null);
  const [annualBilling, setAnnualBilling] = useState(false);
  const [apiCosts, setApiCosts] = useState<Record<string, number>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (brandsLoading) return;
    const b = selectedBrand as Record<string, unknown>;
    setBrandCount(brands.length);
    setQueryCount(b?.queries ? (b.queries as string[]).length : 0);
    setCompetitorCount(b?.competitors ? (b.competitors as string[]).length : 0);
    setPlatformCount((b?.selected_platforms as string[] || []).length || (Object.keys((b?.runs as Record<string, unknown>[] || []).slice(-1)[0]?.platforms as Record<string, unknown> || {}).length) || 0);
    setGeoAuditCount(0);

    // Fetch actual monthly run count from brand data
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        let count = 0;
        let oldestRunInWindow = Date.now();
        for (const brand of (d.brands || [])) {
          for (const run of (brand.runs || [])) {
            const runTime = new Date(run.time || run.date || 0).getTime();
            if (runTime >= thirtyDaysAgo) {
              count++;
              if (runTime < oldestRunInWindow) oldestRunInWindow = runTime;
            }
          }
        }
        setRunsUsed(count);
        // Reset date = when the oldest run in the 30-day window will "expire"
        if (count > 0) {
          const resetMs = oldestRunInWindow + 30 * 24 * 60 * 60 * 1000;
          setResetDate(new Date(resetMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
          // Calculate daily average and projected usage
          const daysSinceFirst = Math.max(1, (Date.now() - oldestRunInWindow) / (24 * 60 * 60 * 1000));
          const avg = count / daysSinceFirst;
          setDailyAvg(Math.round(avg * 10) / 10);
          const runsMax = (PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free).runsPerMonth;
          if (runsMax < 9999 && avg > 0) {
            const remaining = runsMax - count;
            setProjectedDaysLeft(remaining > 0 ? Math.round(remaining / avg) : 0);
          }
        }
      })
      .catch(() => {});
    setLoading(false);
  }, [brandsLoading, brands, selectedBrand, currentPlan, user]);

  useEffect(() => {
    fetch('/api/payments/history', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => {
        setBillingHistory((d.history || []).map((h: Record<string, unknown>) => ({
          date: (h.date || h.processed_at || h.created_at || '') as string,
          plan: (h.plan || (typeof h.event_type === 'string' ? h.event_type.replace(/_/g, ' ') : '') || '') as string,
          amount: (h.amount || '') as string,
          status: (h.status || (h.event_type ? 'processed' : '')) as string,
        })));
      })
      .catch(() => {});
  }, []);

  // Fetch API costs for owner/admin
  useEffect(() => {
    if (currentPlan !== 'owner') return;
    fetch('/api/api-logs', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const costs: Record<string, number> = {};
        for (const log of (d.logs || [])) {
          if (log.cost && log.platform) {
            costs[log.platform] = (costs[log.platform] || 0) + Number(log.cost);
          }
        }
        setApiCosts(costs);
      })
      .catch(() => {});
  }, [currentPlan]);

  const meters: UsageMeter[] = [
    { label: 'Brands',            sublabel: 'Active brands',                 used: brandCount,      max: limits.brands,       icon: '◆', color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)' },
    { label: 'Queries',           sublabel: 'Per brand (current)',           used: queryCount,       max: limits.queries,      icon: '⚡', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)' },
    { label: 'Runs This Month',   sublabel: resetDate ? `Resets ${resetDate}` : 'Rolling 30 days', used: runsUsed,           max: limits.runsPerMonth, icon: '▶', color: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1, #818cf8)' },
    { label: 'Competitors',       sublabel: 'Per brand (current)',           used: competitorCount,  max: limits.competitors,  icon: '⊘', color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' },
    { label: 'Platforms',         sublabel: 'AI platforms tracked',          used: platformCount || 5, max: limits.platforms,    icon: '●', color: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)' },
    { label: 'GEO Audits',        sublabel: 'This month',                   used: geoAuditCount,    max: limits.geoAudits,    icon: '◉', color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #34d399)' },
  ];

  // Separate runs meter for hero ring display
  const runsMeter = meters[2];
  const otherMeters = meters.filter((_, i) => i !== 2);
  const runsStatus = getStatus(runsMeter.used, runsMeter.max);
  const runsIsUnlimited = runsStatus === 'unlimited';
  const runsPct = runsIsUnlimited ? 0 : runsMeter.max > 0 ? Math.min((runsMeter.used / runsMeter.max) * 100, 100) : 0;
  const runsCircumference = 2 * Math.PI * 52;
  const runsOffset = runsCircumference - (runsPct / 100) * runsCircumference;
  const runsRingColor = runsStatus === 'danger' ? '#ef4444' : runsStatus === 'warning' ? '#f59e0b' : '#6366f1';

  // Determine next plan for upgrade nudge
  const currentPlanIndex = PLAN_ORDER.indexOf(currentPlan as typeof PLAN_ORDER[number]);
  const nextPlanKey = currentPlanIndex >= 0 && currentPlanIndex < PLAN_ORDER.length - 1 ? PLAN_ORDER[currentPlanIndex + 1] : null;
  const nextPlanLimits = nextPlanKey ? PLAN_LIMITS[nextPlanKey] : null;
  const nextPlanPricing = nextPlanKey ? PRICING_PLANS.find(p => p.name.toLowerCase() === nextPlanKey) : null;
  const recommendedPlan = nextPlanKey;

  // Dynamic plan features/prices for annual toggle
  const displayFeatures = annualBilling
    ? PLAN_FEATURES.map(row => row.feature === 'Price / month'
        ? { ...row, free: ANNUAL_PRICE_MAP.free, starter: ANNUAL_PRICE_MAP.starter, pro: ANNUAL_PRICE_MAP.pro, agency: ANNUAL_PRICE_MAP.agency, owner: '—' }
        : row)
    : PLAN_FEATURES;
  const displayPrices: Record<string, string> = annualBilling
    ? { free: ANNUAL_PRICE_MAP.free || '$0', starter: ANNUAL_PRICE_MAP.starter || '$7', pro: ANNUAL_PRICE_MAP.pro || '$23', agency: ANNUAL_PRICE_MAP.agency || '$71', owner: '—' }
    : PLAN_PRICES;

  const anyNearLimit = meters.some(m => {
    const s = getStatus(m.used, m.max);
    return s === 'warning' || s === 'danger';
  });
  const anyOverLimit = meters.some(m => getStatus(m.used, m.max) === 'danger');

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  );

  return (
    <div>
      <div className="view-title">Billing &amp; Usage</div>
      <div className="view-sub">Manage your subscription, track usage, and compare plans.</div>

      {/* ── Top Row: Plan Card + Quick Actions ── */}
      <div className="billing-top-grid">
        {/* Current Plan */}
        <div style={{
          background: planInfo.gradient,
          borderRadius: 'var(--radius)', padding: '28px 32px', color: '#fff',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ position: 'absolute', bottom: -20, right: 40, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.8, marginBottom: 4 }}>Current Plan</div>
            <div style={{ fontSize: 36, fontWeight: 800, marginBottom: 2 }}>{currentPlan.toUpperCase()}</div>
            <div style={{ fontSize: 24, fontWeight: 700, opacity: 0.9, marginBottom: 8 }}>
              {planInfo.price}<span style={{ fontSize: 14, fontWeight: 400, opacity: 0.7 }}>{planInfo.period}</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
          <div className="card-title" style={{ marginBottom: 2 }}>Quick Actions</div>
          <Link href="/dashboard/account" style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
            background: 'var(--primary)', color: '#fff', borderRadius: 'var(--radius-xs)',
            textDecoration: 'none', fontSize: 13, fontWeight: 700, transition: 'opacity .15s',
          }}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>&#8593;</span> Upgrade Plan
          </Link>
          {currentPlan !== 'free' && (
            <a href={BILLING_PORTAL_URL} target="_blank" rel="noopener" style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
              background: 'var(--bg3)', color: 'var(--text)', borderRadius: 'var(--radius-xs)',
              textDecoration: 'none', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 15, lineHeight: 1 }}>&#9776;</span> Manage Billing Portal
            </a>
          )}
          <Link href="/dashboard/account" style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
            background: 'var(--bg3)', color: 'var(--text)', borderRadius: 'var(--radius-xs)',
            textDecoration: 'none', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>&#9881;</span> Account Settings
          </Link>
        </div>
      </div>

      {/* ── Usage This Period ── */}
      <div className="card" style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px 0' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Usage This Period</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              Rolling 30-day window{resetDate ? ` · Next reset: ${resetDate}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {anyOverLimit && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 100, background: 'rgba(239,68,68,.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,.2)' }}>
                OVER LIMIT
              </span>
            )}
            {anyNearLimit && !anyOverLimit && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 100, background: 'rgba(245,158,11,.08)', color: '#f59e0b', border: '1px solid rgba(245,158,11,.2)' }}>
                APPROACHING LIMIT
              </span>
            )}
          </div>
        </div>

        {/* Runs Hero Ring */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '24px 24px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ position: 'relative', width: 140, height: 140 }}>
            <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%' }}>
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--bg3)" strokeWidth="8" />
              <circle cx="60" cy="60" r="52" fill="none" stroke={runsRingColor} strokeWidth="8"
                strokeDasharray={runsCircumference} strokeDashoffset={mounted ? runsOffset : runsCircumference}
                strokeLinecap="round" transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
            </svg>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)', color: runsStatus === 'danger' ? '#ef4444' : 'var(--text)', lineHeight: 1 }}>
                {runsIsUnlimited ? '∞' : `${Math.round(runsPct)}%`}
              </span>
              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>USED</span>
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Runs This Month</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: runsStatus === 'danger' ? '#ef4444' : 'var(--text)', marginTop: 4 }}>
              {runsMeter.used} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--muted)' }}>/ {runsIsUnlimited ? '∞' : runsMeter.max}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{runsMeter.sublabel}</div>
            {dailyAvg > 0 && !runsIsUnlimited && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>
                Averaging <strong style={{ color: 'var(--text)' }}>{dailyAvg} runs/day</strong>
                {projectedDaysLeft !== null && projectedDaysLeft > 0 && (
                  <span> · At this rate, you&apos;ll hit your limit in <strong style={{ color: projectedDaysLeft <= 3 ? '#ef4444' : projectedDaysLeft <= 7 ? '#f59e0b' : 'var(--text)' }}>{projectedDaysLeft} days</strong></span>
                )}
                {projectedDaysLeft === 0 && (
                  <span> · <strong style={{ color: '#ef4444' }}>Limit reached</strong></span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Meter Grid — remaining meters (3 on desktop, 2 on tablet, 1 on mobile) */}
        <div className="usage-meter-grid">
          {otherMeters.map(m => {
            const s = getStatus(m.used, m.max);
            const isUnlimited = s === 'unlimited';
            const pct = isUnlimited ? 0 : m.max > 0 ? Math.min((m.used / m.max) * 100, 100) : 0;
            const sc = statusColor(s);
            const isOver = s === 'danger';
            const isWarn = s === 'warning';

            return (
              <div key={m.label} style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
                position: 'relative',
                background: isOver ? 'rgba(239,68,68,.02)' : isWarn ? 'rgba(245,158,11,.02)' : 'transparent',
              }}>
                {/* Top: icon + label + badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div title={METER_TOOLTIPS[m.label] || ''} style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: `${m.color}12`, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 14, color: m.color, flexShrink: 0, cursor: 'help',
                    }}>{m.icon}</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{m.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>{m.sublabel}</div>
                    </div>
                  </div>
                  {!isUnlimited && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)',
                      padding: '2px 8px', borderRadius: 100,
                      background: isOver ? 'rgba(239,68,68,.1)' : isWarn ? 'rgba(245,158,11,.1)' : 'rgba(16,185,129,.1)',
                      color: sc,
                    }}>
                      {isOver ? 'OVER' : `${Math.round(pct)}%`}
                    </span>
                  )}
                </div>

                {/* Value */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)', color: isOver ? '#ef4444' : 'var(--text)', lineHeight: 1 }}>
                    {m.used}
                  </span>
                  <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}>
                    / {isUnlimited ? '∞' : m.max.toLocaleString()}
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{
                  height: 6, borderRadius: 3, background: 'var(--bg3)', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: isUnlimited ? '0%' : mounted ? `${Math.min(pct, 100)}%` : '0%',
                    background: isOver ? '#ef4444' : isWarn ? '#f59e0b' : m.gradient,
                    transition: 'width 0.5s ease',
                  }} />
                </div>

                {/* Remaining text */}
                {!isUnlimited && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, fontFamily: 'var(--mono)' }}>
                    {m.used >= m.max
                      ? <span style={{ color: '#ef4444', fontWeight: 600 }}>Limit reached</span>
                      : `${m.max - m.used} remaining`}
                  </div>
                )}
                {isUnlimited && (
                  <div style={{ fontSize: 10, color: '#10b981', marginTop: 6, fontFamily: 'var(--mono)', fontWeight: 600 }}>
                    Unlimited
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Upgrade Banner — shows when any meter is at 80%+ */}
        {anyNearLimit && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            padding: '14px 24px',
            background: anyOverLimit ? 'rgba(239,68,68,.04)' : 'rgba(99,102,241,.04)',
            borderTop: `1px solid ${anyOverLimit ? 'rgba(239,68,68,.15)' : 'rgba(99,102,241,.15)'}`,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: anyOverLimit ? '#ef4444' : 'var(--text)', marginBottom: 2 }}>
                {anyOverLimit ? 'You\'ve exceeded your plan limits' : 'You\'re approaching your plan limits'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                {meters.filter(m => { const s = getStatus(m.used, m.max); return s === 'warning' || s === 'danger'; }).map(m => (
                  <span key={m.label} style={{ marginRight: 12 }}>
                    <strong>{m.label}:</strong> {m.used}/{m.max >= 9999 ? '∞' : m.max}
                  </span>
                ))}
              </div>
            </div>
            <Link href="/dashboard/account" style={{
              padding: '9px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: anyOverLimit ? '#ef4444' : 'var(--primary)', color: '#fff',
              textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              Upgrade Plan
            </Link>
          </div>
        )}
      </div>

      {/* ── Upgrade Nudge ── */}
      {nextPlanKey && nextPlanLimits && nextPlanPricing && currentPlan !== 'owner' && (
        <div style={{
          marginTop: 16, padding: '20px 28px',
          background: 'linear-gradient(135deg, rgba(99,102,241,.04) 0%, rgba(139,92,246,.04) 100%)',
          border: '1px solid rgba(99,102,241,.15)', borderRadius: 'var(--radius)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              What&apos;s included in your next upgrade
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              Upgrade to <strong style={{ color: 'var(--primary)', textTransform: 'capitalize' }}>{nextPlanKey}</strong> for{' '}
              <strong>{nextPlanLimits.brands} brands</strong>,{' '}
              <strong>{nextPlanLimits.queries} queries/brand</strong>, and{' '}
              <strong>{nextPlanLimits.runsPerMonth} runs/mo</strong>
              {nextPlanPricing.price !== 'Custom'
                ? <> — just <strong style={{ color: 'var(--primary)' }}>{nextPlanPricing.price}/mo</strong></>
                : <> — <strong style={{ color: 'var(--primary)' }}>contact us for pricing</strong></>}
            </div>
          </div>
          <Link href="/dashboard/account" style={{
            padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: 'var(--primary)', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {nextPlanPricing.price === 'Custom' ? 'Contact Sales' : `Upgrade to ${nextPlanKey.charAt(0).toUpperCase() + nextPlanKey.slice(1)}`}
          </Link>
        </div>
      )}

      {/* ── Billing History ── */}
      {billingHistory.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Recent Transactions</div>
            <a href={BILLING_PORTAL_URL} target="_blank" rel="noopener" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--primary)', textDecoration: 'none', letterSpacing: '.5px', fontWeight: 600 }}>
              VIEW ALL &rarr;
            </a>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Event</th>
                  <th className="th">Amount</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {billingHistory.slice(0, 5).map((b, i) => (
                  <tr key={i} className="trow">
                    <td className="td" style={{ fontFamily: 'var(--mono)' }}>
                      {b.date && !isNaN(new Date(b.date).getTime())
                        ? new Date(b.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="td" style={{ textTransform: 'uppercase', fontWeight: 600 }}>{b.plan}</td>
                    <td className="td" style={{ fontFamily: 'var(--mono)' }}>{b.amount}</td>
                    <td className="td">
                      <span style={{
                        fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)',
                        padding: '3px 8px', borderRadius: 100, textTransform: 'uppercase',
                        background: b.status === 'succeeded' ? 'rgba(16,185,129,.08)' : 'var(--bg3)',
                        color: b.status === 'succeeded' ? 'var(--green)' : 'var(--muted)',
                      }}>{b.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Plan Comparison Table ── */}
      <div className="card" style={{ marginTop: 16 }} id="plan-comparison">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Plan Comparison</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: annualBilling ? 400 : 700, color: annualBilling ? 'var(--muted)' : 'var(--text)' }}>Monthly</span>
            <button
              onClick={() => setAnnualBilling(!annualBilling)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: annualBilling ? 'var(--primary)' : 'var(--bg3)', position: 'relative', transition: 'background .2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: annualBilling ? 23 : 3,
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.15)',
              }} />
            </button>
            <span style={{ fontSize: 12, fontWeight: annualBilling ? 700 : 400, color: annualBilling ? 'var(--text)' : 'var(--muted)' }}>
              Annual <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981', padding: '2px 6px', borderRadius: 100, background: 'rgba(16,185,129,.08)' }}>save 20%</span>
            </span>
          </div>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'center', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '20%' }} />
              {visiblePlans.map(p => (
                <col key={p} style={{ width: `${80 / visiblePlans.length}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 600, color: 'var(--text)' }}>Feature</th>
                {visiblePlans.map(p => {
                  const isCurrent = p === currentPlan;
                  const isRecommended = p === recommendedPlan && p !== currentPlan;
                  return (
                    <th key={p} style={{
                      padding: '12px 8px', fontWeight: 700,
                      textTransform: 'uppercase', fontSize: 11, letterSpacing: .5,
                      color: isCurrent ? 'var(--primary)' : isRecommended ? '#10b981' : 'var(--muted)',
                      background: isCurrent ? 'rgba(99,102,241,.04)' : isRecommended ? 'rgba(16,185,129,.04)' : 'transparent',
                      borderRadius: isCurrent || isRecommended ? '8px 8px 0 0' : '0',
                      boxShadow: isRecommended ? 'inset 0 2px 0 0 #10b981' : 'none',
                    }}>
                      <div>{p}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: isCurrent ? 'var(--primary)' : isRecommended ? '#10b981' : 'var(--text)', marginTop: 2 }}>
                        {displayPrices[p]}<span style={{ fontSize: 9, fontWeight: 400, color: 'var(--muted)' }}>{p !== 'free' && p !== 'owner' ? '/mo' : ''}</span>
                      </div>
                      {isCurrent && (
                        <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: 'var(--primary)', color: '#fff', display: 'inline-block', marginTop: 4 }}>
                          CURRENT
                        </span>
                      )}
                      {isRecommended && (
                        <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: '#10b981', color: '#fff', display: 'inline-block', marginTop: 4 }}>
                          RECOMMENDED
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayFeatures.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ textAlign: 'left', padding: '11px 14px', fontWeight: 500, color: 'var(--text)', fontSize: 12 }}>{row.feature}</td>
                  {visiblePlans.map(p => {
                    const val = row[p];
                    const isCheck = val === '✓';
                    const isDash = val === '—';
                    const isCurrent = p === currentPlan;
                    const isRecommended = p === recommendedPlan && p !== currentPlan;
                    return (
                      <td key={p} style={{
                        padding: '11px 8px',
                        color: isCheck ? 'var(--green)' : isDash ? 'var(--muted)' : isCurrent ? 'var(--primary)' : isRecommended ? '#10b981' : 'var(--text)',
                        fontWeight: isCurrent || isRecommended ? 700 : isCheck ? 600 : 400,
                        fontFamily: !isCheck && !isDash ? 'var(--mono)' : 'var(--font)',
                        fontSize: isCheck ? 16 : 13,
                        background: isCurrent ? 'rgba(99,102,241,.04)' : isRecommended ? 'rgba(16,185,129,.04)' : 'transparent',
                      }}>
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ textAlign: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <Link href="/dashboard/account" style={{
            display: 'inline-block', padding: '10px 32px', background: 'var(--primary)', color: '#fff',
            borderRadius: 'var(--radius-xs)', fontSize: 13, fontWeight: 700, textDecoration: 'none',
          }}>
            Change Plan
          </Link>
        </div>
      </div>

      {/* ── API Cost Breakdown (Owner only) ── */}
      {currentPlan === 'owner' && Object.keys(apiCosts).length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">API Cost Breakdown</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="th">Platform</th>
                  <th className="th" style={{ textAlign: 'right' }}>Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(apiCosts).sort((a, b) => b[1] - a[1]).map(([platform, cost]) => (
                  <tr key={platform} className="trow">
                    <td className="td" style={{ fontWeight: 600 }}>{platform}</td>
                    <td className="td" style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>${cost.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="trow" style={{ borderTop: '2px solid var(--border)' }}>
                  <td className="td" style={{ fontWeight: 700 }}>Total</td>
                  <td className="td" style={{ fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right' }}>
                    ${Object.values(apiCosts).reduce((a, b) => a + b, 0).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        .usage-meter-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0;
        }
        @media (max-width: 900px) {
          .usage-meter-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 540px) {
          .usage-meter-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
