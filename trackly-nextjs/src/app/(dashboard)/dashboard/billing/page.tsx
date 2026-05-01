'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PLAN_LIMITS, BILLING_PORTAL_URL, PRICING_PLANS } from '@/lib/constants';
import { PLAN_CREDITS, PLAN_DISPLAY_ORDER, AUTO_RUN_HOURS } from '@/lib/plan-config';
import type { AutoRunFrequency } from '@/lib/plan-config';
import { useCredits } from '@/contexts/CreditsContext';
import Link from 'next/link';
import { useBrands } from '@/contexts/BrandContext';
import UsageSection from '@/components/dashboard/billing/UsageSection';

const PLAN_INFO: Record<string, { price: string; period: string; gradient: string }> = {
  free:       { price: '$0',     period: '',    gradient: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)' },
  starter:    { price: '$9',     period: '/mo', gradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)' },
  pro:        { price: '$29',    period: '/mo', gradient: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)' },
  agency:     { price: '$89',    period: '/mo', gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)' },
  enterprise: { price: 'Custom', period: '',    gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)' },
  owner:      { price: '-',      period: '',    gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)' },
};

const PLAN_PRICES: Record<string, string> = {
  free: '$0', starter: '$9', pro: '$29', agency: '$89', owner: '-',
};

const PLAN_ORDER = ['free', 'starter', 'pro', 'agency', 'enterprise'] as const;

// Plan comparison table is generated from PLAN_CREDITS + PLAN_LIMITS so a
// change to plan-config.ts / constants.ts automatically flows into this UI
// without keeping two sources of truth in sync. Row order and labels mirror
// the v3 pricing spec (2026-04-27).
function buildPlanFeatures(): Record<string, string | undefined>[] {
  const tiers = ['free', 'starter', 'pro', 'agency', 'owner'] as const;
  const num = (n: number) => (n >= 99999 ? '∞' : n.toLocaleString());
  const cooldownLabel = (s: number) => {
    if (s === 0) return 'None';
    if (s >= 60 && s % 60 === 0) {
      const m = s / 60;
      return m === 1 ? '1 min' : `${m} min`;
    }
    return `${s} sec`;
  };
  const autoRunLabel = (f: AutoRunFrequency | undefined) => {
    if (!f) return '-';
    if (f === 'weekly') return 'Weekly';
    if (f === 'every_2_days') return 'Every 2 days';
    return 'Daily';
  };
  const modelTierLabel = (p: string) => {
    const cfg = PLAN_CREDITS[p];
    if (!cfg) return '-';
    if (cfg.modelTier === 'premium') return 'Premium unlocked';
    if (p === 'pro') return 'Economy (default)';
    return 'Economy only';
  };
  const platformsLabel = (p: string) => {
    const n = PLAN_CREDITS[p]?.maxPlatforms ?? 0;
    // Trackly supports exactly 5 AI platforms (ChatGPT, Perplexity,
    // Claude, Gemini, Grok). When a plan's cap reaches 5, render
    // "5 (all)" to reinforce that the user is at the ceiling.
    return n >= 5 ? `${n} (all)` : String(n);
  };
  const manualCapLabel = (p: string) => {
    const n = PLAN_CREDITS[p]?.manualDailyCap ?? 0;
    return n >= 9999 ? 'Unlimited' : `${n} / day`;
  };
  const brandsLabel = (p: string) => {
    const n = PLAN_CREDITS[p]?.brandsCap ?? 0;
    return n >= 9999 ? 'Unlimited' : String(n);
  };
  const competitorsLabel = (p: string) => num(PLAN_LIMITS[p]?.competitors ?? 0);
  const geoAuditsLabel = (p: string) => num(PLAN_LIMITS[p]?.geoAudits ?? 0);
  const sentimentLabel = (p: string) => (PLAN_LIMITS[p]?.sentiment ? '✓' : '✗');
  const priorityLabel = (p: string) => (PLAN_LIMITS[p]?.prioritySupport ? '✓' : '✗');
  // API access: explicit per-plan flag rather than hard-coding owner.
  // Agency unlocks API access in the v3 spec; owner always has it.
  const apiAccessLabel = (p: string) => (p === 'agency' || p === 'owner' ? '✓' : '✗');

  const row = (
    feature: string,
    project: (plan: string) => string | undefined,
  ): Record<string, string | undefined> => {
    const r: Record<string, string | undefined> = { feature };
    for (const t of tiers) r[t] = project(t);
    return r;
  };

  // Row order mirrors the v3 spec table — facts first (price, prompts,
  // platforms, brands, competitors), then quotas (credits, auto-run,
  // manual cap, cooldown), then qualitative tier markers (model tier,
  // GEO audits), then boolean features.
  // (AUTO_RUN_HOURS is referenced here so any caller importing it stays
  // in sync with the plan-config source of truth.)
  void AUTO_RUN_HOURS;

  return [
    row('Price / month',         (p) => PLAN_CREDITS[p]?.price ?? '-'),
    row('Tracked prompts (account-wide)', (p) => num(PLAN_CREDITS[p]?.trackedPromptsPerAccount ?? 0)),
    row('AI platforms (active)', platformsLabel),
    row('Brands',                brandsLabel),
    row('Competitors tracked',   competitorsLabel),
    row('Monthly credits',       (p) => num(PLAN_CREDITS[p]?.monthlyCredits ?? 0)),
    row('Auto-run frequency',    (p) => autoRunLabel(PLAN_CREDITS[p]?.autoRunFrequency)),
    row('Manual Run Query cap',  manualCapLabel),
    row('Cooldown per prompt',   (p) => cooldownLabel(PLAN_CREDITS[p]?.cooldownSeconds ?? 0)),
    row('Model tier',            modelTierLabel),
    row('GEO Audits / month',    geoAuditsLabel),
    row('Sentiment analysis',    sentimentLabel),
    row('API access',            apiAccessLabel),
    row('Priority support',      priorityLabel),
  ];
}

const PLAN_FEATURES: Record<string, string | undefined>[] = buildPlanFeatures();
// Re-export the canonical plan order so any caller iterating over
// it stays in sync with plan-config.ts.
void PLAN_DISPLAY_ORDER;

const METER_TOOLTIPS: Record<string, string> = {
  'Brands': 'Active brands: 1 on Free, 3 on Starter, unlimited on Pro and Agency.',
  'Tracked prompts': 'Account-wide cap on tracked prompts, summed across every brand you own.',
  'Competitors': 'Competitors: the total number of competitor brands you can track across all brands combined.',
  'Platforms': 'AI platforms tracked: the number of AI platforms (ChatGPT, Gemini, etc.) monitored per run.',
  'GEO Audits': 'GEO audits per month: the number of geographic URL audits you can perform monthly.',
};

const ANNUAL_PRICE_MAP: Record<string, string> = { owner: '-' };
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
  const { status: creditStatus } = useCredits();
  const [loading, setLoading] = useState(true);
  const [billingHistory, setBillingHistory] = useState<BillingEntry[]>([]);

  const currentPlan = user?.plan || 'free';
  const limits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;
  const creditCfg = PLAN_CREDITS[currentPlan] || PLAN_CREDITS.free;
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
  const [planTableScrolled, setPlanTableScrolled] = useState(false);
  const [apiCosts, setApiCosts] = useState<Record<string, number>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (brandsLoading) return;
    setBrandCount(brands.length);

    // Count queries and competitors across ALL brands (these are total limits, not per-brand)
    let totalQueries = 0;
    let totalCompetitors = 0;
    let maxPlatformCount = 0;
    for (const brand of brands) {
      const b = brand as Record<string, unknown>;
      totalQueries += b?.queries ? (b.queries as string[]).length : 0;
      totalCompetitors += b?.competitors ? (b.competitors as string[]).length : 0;
      const platCount = (b?.platforms as string[] || b?.selected_platforms as string[] || []).length;
      if (platCount > maxPlatformCount) maxPlatformCount = platCount;
    }
    setQueryCount(totalQueries);
    setCompetitorCount(totalCompetitors);
    setPlatformCount(maxPlatformCount);
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
    { label: 'Brands',            sublabel: 'Active brands',                 used: brandCount,       max: limits.brands,                       icon: '◆', color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)' },
    { label: 'Tracked prompts',   sublabel: 'Account-wide, all brands',      used: queryCount,       max: limits.trackedPromptsPerAccount,     icon: '⚡', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)' },
    { label: 'Competitors',       sublabel: 'Total across all brands',       used: competitorCount,  max: limits.competitors,                  icon: '⊘', color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' },
    { label: 'Platforms',         sublabel: 'AI platforms tracked',          used: platformCount,    max: limits.platforms,                    icon: '●', color: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)' },
    { label: 'GEO Audits',        sublabel: 'This month',                    used: geoAuditCount,    max: limits.geoAudits,                    icon: '◉', color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #34d399)' },
  ];

  // Use the tracked-prompts meter for the hero ring (the v3 cap most
  // users hit first since it's now account-wide rather than per-brand).
  const runsMeter = meters[1];
  const otherMeters = meters.filter((_, i) => i !== 1);
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
        ? { ...row, free: ANNUAL_PRICE_MAP.free, starter: ANNUAL_PRICE_MAP.starter, pro: ANNUAL_PRICE_MAP.pro, agency: ANNUAL_PRICE_MAP.agency, owner: '-' }
        : row)
    : PLAN_FEATURES;
  const displayPrices: Record<string, string> = annualBilling
    ? { free: ANNUAL_PRICE_MAP.free || '$0', starter: ANNUAL_PRICE_MAP.starter || '$7', pro: ANNUAL_PRICE_MAP.pro || '$23', agency: ANNUAL_PRICE_MAP.agency || '$71', owner: '-' }
    : PLAN_PRICES;

  const anyNearLimit = meters.some(m => {
    const s = getStatus(m.used, m.max);
    return s === 'warning' || s === 'danger';
  });
  const anyAtLimit = meters.some(m => m.max < 9999 && m.used === m.max);
  const anyOverLimit = meters.some(m => m.max < 9999 && m.used > m.max);
  const anyAtOrOverLimit = anyAtLimit || anyOverLimit;

  // Plan change modal state
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planSwitching, setPlanSwitching] = useState('');

  async function switchPlan(targetPlan: string) {
    const target = targetPlan.toLowerCase();
    const PLAN_TIERS: Record<string, number> = { free: 0, starter: 1, pro: 2, agency: 3, enterprise: 4 };
    const currentTier = PLAN_TIERS[currentPlan] ?? 0;
    const targetTier = PLAN_TIERS[target] ?? 0;

    if (target === currentPlan) return;

    if (target === 'free') {
      if (!confirm('Cancel your subscription? You will lose access to paid features at the end of your billing period.')) return;
      setPlanSwitching(target);
      try {
        const res = await fetch('/api/payments/cancel', { method: 'POST', credentials: 'include' });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error || 'Failed to cancel subscription. Please try again or contact support.');
          setPlanSwitching('');
          return;
        }
        window.location.reload();
      } catch { alert('Failed to cancel subscription. Please try again.'); setPlanSwitching(''); }
      return;
    }

    if (targetTier <= currentTier && currentPlan !== 'free') {
      alert('To downgrade, please cancel your current subscription first or manage billing via the customer portal.');
      return;
    }

    setPlanSwitching(target);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: target }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to start checkout'); setPlanSwitching(''); return; }
      if (data.url) { window.location.href = data.url; } else { alert('No checkout URL returned.'); setPlanSwitching(''); }
    } catch { setPlanSwitching(''); }
  }

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
            <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>
              {limits.trackedPromptsPerAccount >= 9999 ? '∞' : limits.trackedPromptsPerAccount} tracked prompts (account-wide) · {creditCfg.brandsCap >= 9999 ? 'Unlimited brands' : `${creditCfg.brandsCap} brand${creditCfg.brandsCap === 1 ? '' : 's'}`}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '-'}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
          <div className="card-title" style={{ marginBottom: 2 }}>Quick Actions</div>
          <button onClick={() => setShowPlanModal(true)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
            background: 'var(--primary)', color: '#fff', borderRadius: 'var(--radius-xs)',
            border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'opacity .15s', width: '100%',
          }}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>&#8593;</span> Upgrade Plan
          </button>
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

      {/* ── Status strip: AI Credits / Manual Today / Plan Tier ──
           Redesigned to match the new UsageSection visual language:
           single flat panel, hairline column dividers, monospace
           tabular numerals, status dots, refined eyebrow labels. */}
      {creditStatus && creditCfg.monthlyCredits < 99999 && (() => {
        const monthlyPct = Math.min(100, (creditStatus.monthlyUsed / Math.max(1, creditStatus.monthlyCap)) * 100);
        const manualUsedToday = creditCfg.manualDailyCap - creditStatus.manualRemainingToday;
        const manualPct = Math.min(100, (manualUsedToday / Math.max(1, creditStatus.manualDailyCap)) * 100);
        const creditStateColor = creditStatus.remaining === 0
          ? 'var(--red)'
          : creditStatus.lowBalance ? 'var(--amber)' : 'var(--green)';
        const creditStateLabel = creditStatus.remaining === 0
          ? 'Exhausted'
          : creditStatus.lowBalance ? 'Low' : 'Healthy';
        const isPremium = creditCfg.modelTier === 'premium';
        return (
          <div style={{
            marginTop: 16,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--app-shadow)',
            overflow: 'hidden',
          }} className="billing-status-strip">
            <div className="billing-status-strip-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            }}>
              {/* AI Credits */}
              <div className="billing-status-cell" style={{
                padding: '18px 22px',
                borderRight: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span aria-hidden="true" style={{
                    width: 6, height: 6, borderRadius: '50%', background: creditStateColor,
                  }} />
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
                    textTransform: 'uppercase', color: 'var(--muted)',
                  }}>
                    AI Credits
                  </span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                    letterSpacing: 0.4, textTransform: 'uppercase',
                    color: creditStateColor,
                  }}>
                    {creditStateLabel}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{
                    fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums',
                    fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: -0.5,
                    color: creditStatus.remaining === 0 ? 'var(--red)' : 'var(--text)',
                  }}>
                    {creditStatus.remaining.toLocaleString()}
                  </span>
                  <span style={{
                    fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums',
                    fontSize: 14, color: 'var(--muted)', fontWeight: 400,
                  }}>
                    / {creditStatus.monthlyCap.toLocaleString()} remaining
                  </span>
                </div>
                <div style={{
                  height: 4, borderRadius: 'var(--radius-full)', background: 'var(--bg3)', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${monthlyPct}%`,
                    background: creditStatus.remaining === 0
                      ? 'var(--red)'
                      : creditStatus.lowBalance ? 'var(--amber)' : 'var(--text)',
                    borderRadius: 'var(--radius-full)',
                    transition: 'width 1s cubic-bezier(.16,1,.3,1)',
                  }} />
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--muted)',
                  fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums',
                }}>
                  Resets {new Date(creditStatus.nextResetAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>

              {/* Manual Today */}
              <div className="billing-status-cell" style={{
                padding: '18px 22px',
                borderRight: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span aria-hidden="true" style={{
                    width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)',
                  }} />
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
                    textTransform: 'uppercase', color: 'var(--muted)',
                  }}>
                    Manual today
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{
                    fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums',
                    fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: -0.5, color: 'var(--text)',
                  }}>
                    {creditStatus.manualRemainingToday.toLocaleString()}
                  </span>
                  <span style={{
                    fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums',
                    fontSize: 14, color: 'var(--muted)', fontWeight: 400,
                  }}>
                    / {creditStatus.manualDailyCap.toLocaleString()} left
                  </span>
                </div>
                <div style={{
                  height: 4, borderRadius: 'var(--radius-full)', background: 'var(--bg3)', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${manualPct}%`,
                    background: 'var(--blue)',
                    borderRadius: 'var(--radius-full)',
                    transition: 'width 1s cubic-bezier(.16,1,.3,1)',
                  }} />
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--muted)',
                  fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums',
                }}>
                  Resets at midnight UTC
                </div>
              </div>

              {/* Plan Tier */}
              <div className="billing-status-cell" style={{
                padding: '18px 22px',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span aria-hidden="true" style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: isPremium ? 'var(--purple, #8b5cf6)' : 'var(--green)',
                  }} />
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
                    textTransform: 'uppercase', color: 'var(--muted)',
                  }}>
                    Plan tier
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 22, fontWeight: 700, color: 'var(--text)',
                    letterSpacing: -0.3, lineHeight: 1,
                  }}>
                    {creditCfg.label}
                  </span>
                  <span style={{
                    padding: '3px 8px', borderRadius: 'var(--radius-xs)',
                    fontSize: 10, fontWeight: 700,
                    fontFamily: 'var(--mono)', textTransform: 'uppercase',
                    letterSpacing: 0.4,
                    background: isPremium ? 'rgba(139,92,246,.1)' : 'rgba(16,185,129,.1)',
                    color: isPremium ? '#8b5cf6' : 'var(--green)',
                    border: `1px solid ${isPremium ? 'rgba(139,92,246,.25)' : 'rgba(16,185,129,.25)'}`,
                  }}>
                    {creditCfg.modelTier} model
                  </span>
                </div>
                <div style={{
                  fontSize: 12, color: 'var(--muted)', lineHeight: 1.55,
                  display: 'flex', flexWrap: 'wrap', columnGap: 6, rowGap: 2,
                }}>
                  <span><span style={{ fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--text)', fontWeight: 600 }}>{creditCfg.maxPlatforms}</span> platforms</span>
                  <span style={{ opacity: 0.5 }}>·</span>
                  <span>
                    <span style={{ fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--text)', fontWeight: 600 }}>
                      {creditCfg.trackedPromptsPerAccount >= 9999 ? '∞' : creditCfg.trackedPromptsPerAccount}
                    </span> prompts
                  </span>
                  {creditCfg.cooldownSeconds > 0 && (
                    <>
                      <span style={{ opacity: 0.5 }}>·</span>
                      <span>
                        <span style={{ fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--text)', fontWeight: 600 }}>
                          {creditCfg.cooldownSeconds}s
                        </span> cooldown
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <style>{`
              @media (max-width: 880px) {
                .billing-status-strip-grid { grid-template-columns: 1fr 1fr !important; }
                .billing-status-cell:nth-child(2) { border-right: none !important; }
                .billing-status-cell:nth-child(3) {
                  grid-column: 1 / -1;
                  border-top: 1px solid var(--border) !important;
                }
              }
              @media (max-width: 640px) {
                .billing-status-strip-grid { grid-template-columns: 1fr !important; }
                .billing-status-cell {
                  border-right: none !important;
                  border-top: 1px solid var(--border) !important;
                }
                .billing-status-cell:first-child { border-top: none !important; }
              }
            `}</style>
          </div>
        );
      })()}

      {/* ── Usage This Period (v2 credit-aware redesign) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Usage This Period</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Current billing period · credits, prompts, platforms, brands.
          </div>
        </div>
      </div>
      <UsageSection numBrandsFromPage={brands.length} resetDateLabel={resetDate || undefined} />


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
              {(() => {
                const nextCfg = PLAN_CREDITS[nextPlanKey];
                const nextBrands = nextCfg?.brandsCap ?? 9999;
                const brandsCopy = nextBrands >= 9999 ? 'unlimited brands' : `${nextBrands} brand${nextBrands === 1 ? '' : 's'}`;
                return (
                  <>
                    Upgrade to <strong style={{ color: 'var(--primary)', textTransform: 'capitalize' }}>{nextPlanKey}</strong> for{' '}
                    <strong>{brandsCopy}</strong> and{' '}
                    <strong>{nextPlanLimits.trackedPromptsPerAccount >= 9999 ? '∞' : nextPlanLimits.trackedPromptsPerAccount} tracked prompts (account-wide)</strong>
                    {nextPlanPricing.price !== 'Custom'
                      ? <> - just <strong style={{ color: 'var(--primary)' }}>{nextPlanPricing.price}/mo</strong></>
                      : <> - <strong style={{ color: 'var(--primary)' }}>contact us for pricing</strong></>}
                  </>
                );
              })()}
            </div>
          </div>
          <button onClick={() => setShowPlanModal(true)} style={{
            padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {nextPlanPricing.price === 'Custom' ? 'Contact Sales' : `Upgrade to ${nextPlanKey.charAt(0).toUpperCase() + nextPlanKey.slice(1)}`}
          </button>
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
                        : '-'}
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
        <div className={`plan-comparison-wrap${planTableScrolled ? ' is-scrolled' : ''}`} style={{ marginTop: 16 }}>
        <div
          className="plan-comparison-scroll"
          style={{ overflowX: 'auto' }}
          onScroll={(e) => {
            const next = (e.currentTarget.scrollLeft || 0) > 0;
            if (next !== planTableScrolled) setPlanTableScrolled(next);
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
            <colgroup>
              <col style={{ width: '28%' }} />
              {visiblePlans.map(p => (
                <col key={p} style={{ width: `${72 / visiblePlans.length}%` }} />
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
                      padding: '12px 8px', fontWeight: 700, textAlign: 'center',
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
                    const isCross = val === '✗';
                    const isDash = val === '-';
                    const isGlyph = isCheck || isCross || isDash;
                    const isCurrent = p === currentPlan;
                    const isRecommended = p === recommendedPlan && p !== currentPlan;
                    return (
                      <td key={p} style={{
                        padding: '11px 8px', textAlign: 'center',
                        color: isCheck
                          ? 'var(--green)'
                          : isCross
                            ? 'var(--muted)'
                            : isDash
                              ? 'var(--muted)'
                              : isCurrent
                                ? 'var(--primary)'
                                : isRecommended
                                  ? '#10b981'
                                  : 'var(--text)',
                        fontWeight: isCurrent || isRecommended ? 700 : isCheck ? 600 : 400,
                        fontFamily: !isGlyph ? 'var(--mono)' : 'var(--font)',
                        fontSize: isCheck || isCross ? 16 : 13,
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
        </div>
        <div style={{ textAlign: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button onClick={() => setShowPlanModal(true)} style={{
            display: 'inline-block', padding: '10px 32px', background: 'var(--primary)', color: '#fff',
            borderRadius: 'var(--radius-xs)', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
          }}>
            Change Plan
          </button>
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

      {/* ── Change Plan Modal ── */}
      {showPlanModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }} onClick={() => setShowPlanModal(false)}>
          <div style={{
            background: 'var(--card-bg, #fff)', borderRadius: 'var(--radius)', padding: '28px 32px',
            maxWidth: 900, width: '100%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,.2)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Choose Your Plan</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Select a plan that fits your needs. Current plan: <strong style={{ textTransform: 'uppercase', color: 'var(--primary)' }}>{currentPlan}</strong></div>
              </div>
              <button onClick={() => setShowPlanModal(false)} style={{
                width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)',
                background: 'var(--bg3)', cursor: 'pointer', fontSize: 16, color: 'var(--muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>&times;</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              {PRICING_PLANS.map(p => {
                const planKey = p.name.toLowerCase();
                const isCurrent = planKey === currentPlan;
                const PLAN_TIERS: Record<string, number> = { free: 0, starter: 1, pro: 2, agency: 3, enterprise: 4 };
                const isDowngrade = (PLAN_TIERS[planKey] ?? 0) < (PLAN_TIERS[currentPlan] ?? 0);
                const isUpgrade = (PLAN_TIERS[planKey] ?? 0) > (PLAN_TIERS[currentPlan] ?? 0);
                const planLimits = PLAN_LIMITS[planKey];
                return (
                  <div key={p.name} style={{
                    border: isCurrent ? '2px solid var(--primary)' : p.featured ? '2px solid var(--primary)' : '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '20px 16px', position: 'relative',
                    background: isCurrent ? 'rgba(99,102,241,.04)' : 'transparent',
                    boxShadow: p.featured && !isCurrent ? '0 0 0 1px var(--primary)' : 'none',
                    opacity: planSwitching && planSwitching !== planKey ? 0.5 : 1,
                  }}>
                    {p.featured && !isCurrent && (
                      <span style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', fontSize: 9, fontWeight: 700, background: 'var(--primary)', color: '#fff', padding: '3px 12px', borderRadius: 100, whiteSpace: 'nowrap' }}>MOST POPULAR</span>
                    )}
                    {isCurrent && (
                      <span style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', fontSize: 9, fontWeight: 700, background: 'var(--primary)', color: '#fff', padding: '3px 12px', borderRadius: 100 }}>CURRENT</span>
                    )}
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{p.name}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: isCurrent ? 'var(--primary)' : 'var(--text)', marginTop: 4 }}>
                      {annualBilling ? (p.annualPrice || p.price) : p.price}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>{p.price !== 'Custom' ? '/mo' : ''}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, marginBottom: 12 }}>{p.sub}</div>
                    {planLimits && (() => {
                      const cfg = PLAN_CREDITS[planKey];
                      const brandsCap = cfg?.brandsCap ?? 9999;
                      return (
                        <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.8, fontFamily: 'var(--mono)', marginBottom: 12 }}>
                          <div>{brandsCap >= 9999 ? 'Unlimited brands' : `${brandsCap} brand${brandsCap === 1 ? '' : 's'}`}</div>
                          <div>{planLimits.trackedPromptsPerAccount >= 9999 ? '∞' : planLimits.trackedPromptsPerAccount} tracked prompts (account-wide)</div>
                          <div>{planLimits.competitors >= 9999 ? '∞' : planLimits.competitors} competitors</div>
                        </div>
                      );
                    })()}
                    {isCurrent ? (
                      <button disabled style={{
                        width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--primary)',
                        background: 'transparent', color: 'var(--primary)', fontSize: 11, fontWeight: 700, cursor: 'default',
                      }}>CURRENT PLAN</button>
                    ) : p.price === 'Custom' ? (
                      <a href="/contact" style={{
                        display: 'block', width: '100%', padding: '8px 12px', borderRadius: 6,
                        background: 'var(--primary)', color: '#fff', fontSize: 11, fontWeight: 700,
                        textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box',
                      }}>CONTACT US</a>
                    ) : (
                      <button
                        disabled={!!planSwitching}
                        onClick={() => switchPlan(p.name)}
                        style={{
                          width: '100%', padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: isDowngrade ? 'var(--bg3)' : 'var(--primary)', color: isDowngrade ? 'var(--text)' : '#fff',
                          fontSize: 11, fontWeight: 700,
                        }}
                      >
                        {planSwitching === planKey ? 'PROCESSING...' : isUpgrade ? `UPGRADE TO ${p.name.toUpperCase()}` : `DOWNGRADE TO ${p.name.toUpperCase()}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {currentPlan !== 'free' && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <a href={BILLING_PORTAL_URL} target="_blank" rel="noopener" style={{
                  fontSize: 11, color: 'var(--muted)', textDecoration: 'underline',
                }}>Manage billing via customer portal</a>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .usage-status-badge {
          font-size: 10px; font-weight: 700; padding: 5px 14px; border-radius: 100;
          letter-spacing: .5px; font-family: var(--mono);
        }
        .usage-status-danger { background: rgba(239,68,68,.08); color: #ef4444; border: 1px solid rgba(239,68,68,.2); }
        .usage-status-warning { background: rgba(245,158,11,.08); color: #f59e0b; border: 1px solid rgba(245,158,11,.2); }

        .usage-hero-card {
          display: flex; align-items: center; gap: 32px;
          padding: 28px 32px; border-radius: var(--radius);
          background: var(--bg2); border: 1px solid var(--border);
          margin-bottom: 14px; transition: border-color .2s, box-shadow .2s;
          cursor: pointer;
        }
        .usage-hero-card:hover {
          border-color: var(--primary); box-shadow: 0 4px 20px rgba(99,102,241,.08);
        }
        .usage-hero-ring {
          position: relative; width: 110px; height: 110px; flex-shrink: 0;
        }
        .usage-hero-ring-label {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .usage-hero-left { flex-shrink: 0; }
        .usage-hero-right { flex: 1; min-width: 0; }

        .usage-cards-grid {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
        }
        .usage-meter-card {
          padding: 22px 20px; border-radius: var(--radius);
          background: var(--bg2); border: 1px solid var(--border);
          transition: border-color .2s, box-shadow .2s, transform .15s;
          cursor: pointer; display: block;
        }
        .usage-meter-card:hover {
          border-color: var(--primary); box-shadow: 0 4px 20px rgba(99,102,241,.08);
          transform: translateY(-2px);
        }

        .usage-upgrade-banner {
          margin-top: 14px; padding: 18px 24px; border-radius: var(--radius);
          display: flex; align-items: center; justify-content: space-between; gap: 16; flex-wrap: wrap;
        }

        @media (max-width: 1024px) {
          .usage-cards-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .usage-cards-grid { grid-template-columns: 1fr; }
          .usage-hero-card { flex-direction: column; text-align: center; gap: 16px; padding: 24px 20px; }
          .usage-hero-right { text-align: left; }
          .usage-upgrade-banner { flex-direction: column; text-align: center; }
        }
      `}</style>
    </div>
  );
}
