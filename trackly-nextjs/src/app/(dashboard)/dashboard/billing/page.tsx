'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PLAN_LIMITS, BILLING_PORTAL_URL } from '@/lib/constants';
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

  const meters: UsageMeter[] = [
    { label: 'Brands',            sublabel: 'Active brands',                 used: brandCount,      max: limits.brands,       icon: '◆', color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)' },
    { label: 'Queries',           sublabel: 'Per brand (current)',           used: queryCount,       max: limits.queries,      icon: '⚡', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)' },
    { label: 'Runs This Month',   sublabel: resetDate ? `Resets ${resetDate}` : 'Rolling 30 days', used: runsUsed,           max: limits.runsPerMonth, icon: '▶', color: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1, #818cf8)' },
    { label: 'Competitors',       sublabel: 'Per brand (current)',           used: competitorCount,  max: limits.competitors,  icon: '⊘', color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' },
    { label: 'Platforms',         sublabel: 'AI platforms tracked',          used: platformCount || 5, max: limits.platforms,    icon: '●', color: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)' },
    { label: 'GEO Audits',        sublabel: 'This month',                   used: geoAuditCount,    max: limits.geoAudits,    icon: '◉', color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #34d399)' },
  ];

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

        {/* Meter Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 0 }}>
          {meters.map(m => {
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
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: `${m.color}12`, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 14, color: m.color, flexShrink: 0,
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
                    width: isUnlimited ? '0%' : `${Math.min(pct, 100)}%`,
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
        <div className="card-title">Plan Comparison</div>
        <div style={{ overflowX: 'auto' }}>
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
                {visiblePlans.map(p => (
                  <th key={p} style={{
                    padding: '12px 8px', fontWeight: 700,
                    textTransform: 'uppercase', fontSize: 11, letterSpacing: .5,
                    color: p === currentPlan ? 'var(--primary)' : 'var(--muted)',
                    background: p === currentPlan ? 'rgba(99,102,241,.04)' : 'transparent',
                    borderRadius: p === currentPlan ? '8px 8px 0 0' : '0',
                  }}>
                    <div>{p}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: p === currentPlan ? 'var(--primary)' : 'var(--text)', marginTop: 2 }}>
                      {PLAN_PRICES[p]}<span style={{ fontSize: 9, fontWeight: 400, color: 'var(--muted)' }}>{p !== 'free' && p !== 'owner' ? '/mo' : ''}</span>
                    </div>
                    {p === currentPlan && (
                      <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: 'var(--primary)', color: '#fff', display: 'inline-block', marginTop: 4 }}>
                        CURRENT
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAN_FEATURES.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ textAlign: 'left', padding: '11px 14px', fontWeight: 500, color: 'var(--text)', fontSize: 12 }}>{row.feature}</td>
                  {visiblePlans.map(p => {
                    const val = row[p];
                    const isCheck = val === '✓';
                    const isDash = val === '—';
                    const isCurrent = p === currentPlan;
                    return (
                      <td key={p} style={{
                        padding: '11px 8px',
                        color: isCheck ? 'var(--green)' : isDash ? 'var(--muted)' : isCurrent ? 'var(--primary)' : 'var(--text)',
                        fontWeight: isCurrent ? 700 : isCheck ? 600 : 400,
                        fontFamily: !isCheck && !isDash ? 'var(--mono)' : 'var(--font)',
                        fontSize: isCheck ? 16 : 13,
                        background: isCurrent ? 'rgba(99,102,241,.04)' : 'transparent',
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
    </div>
  );
}
