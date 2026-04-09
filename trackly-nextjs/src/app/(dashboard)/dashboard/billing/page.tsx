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
  { feature: 'Price / month',  free: '$0',  starter: '$9',  pro: '$29',  agency: '$89',  owner: '—' },
  { feature: 'Total Prompts',  free: '5',   starter: '30',  pro: '250',  agency: '1,000', owner: '∞' },
  { feature: 'Brands',         free: '1',   starter: '1',   pro: '5',    agency: '20',   owner: '∞' },
  { feature: 'Competitors',    free: '0',   starter: '2',   pro: '5',    agency: '20',   owner: '∞' },
  { feature: 'Platforms',      free: '2',   starter: '2',   pro: '5',    agency: '5',    owner: '5' },
  { feature: 'GEO Audits',     free: '3',   starter: '25',  pro: '100',  agency: '500',  owner: '∞' },
  { feature: 'Sentiment',      free: '—',   starter: '✓',   pro: '✓',    agency: '✓',    owner: '✓' },
  { feature: 'Scheduled Runs', free: '—',   starter: '72h', pro: '24h',  agency: '12h',  owner: '1h' },
  { feature: 'API Access',     free: '—',   starter: '—',   pro: '—',    agency: '—',    owner: '✓' },
  { feature: 'Priority Support', free: '—', starter: '—',   pro: '—',    agency: '✓',    owner: '✓' },
];

interface BillingEntry { date: string; plan: string; amount: string; status: string; }

function getUsageStatus(used: number, max: number): 'good' | 'warning' | 'danger' {
  if (max >= 9999) return 'good';
  const pct = (used / max) * 100;
  if (pct > 100) return 'danger';
  if (pct >= 80) return 'warning';
  return 'good';
}

function getStatusColor(status: 'good' | 'warning' | 'danger'): string {
  if (status === 'danger') return 'var(--red)';
  if (status === 'warning') return 'var(--amber)';
  return 'var(--green)';
}

function getStatusBg(status: 'good' | 'warning' | 'danger'): string {
  if (status === 'danger') return 'rgba(239,68,68,.08)';
  if (status === 'warning') return 'rgba(245,158,11,.08)';
  return 'rgba(16,185,129,.08)';
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

  const [brandCount, setBrandCount] = useState(0);
  const [queryCount, setQueryCount] = useState(0);
  const [platformCount, setPlatformCount] = useState(0);
  const [geoAuditCount, setGeoAuditCount] = useState(0);

  useEffect(() => {
    if (brandsLoading) return;
    const b = selectedBrand as Record<string, unknown>;
    setBrandCount(brands.length);
    setQueryCount(b?.queries ? (b.queries as string[]).length : 0);
    setPlatformCount((b?.selected_platforms as string[] || []).length || 5);
    setGeoAuditCount(0);
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

  const meters = [
    { label: 'Brands',     used: brandCount,    max: limits.brands    || 1, icon: '◆', color: 'var(--blue)' },
    { label: 'Prompts',    used: queryCount,     max: limits.prompts   || 5, icon: '⚡', color: 'var(--amber)' },
    { label: 'Platforms',  used: platformCount,  max: limits.platforms || 2, icon: '◎', color: 'var(--purple)' },
    { label: 'GEO Audits', used: geoAuditCount, max: limits.geoAudits || 3, icon: '◉', color: 'var(--green)' },
  ];

  const hasOverage = meters.some(m => m.used > m.max && m.max < 9999);

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

      {/* ── Usage Meters ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Usage This Period</div>
          {hasOverage && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'rgba(239,68,68,.08)', color: 'var(--red)', border: '1px solid rgba(239,68,68,.2)' }}>
              OVER LIMIT
            </span>
          )}
        </div>
        <div className="billing-meters-grid" style={{ marginBottom: 0 }}>
          {meters.map(m => {
            const pct = m.max > 0 ? Math.min((m.used / m.max) * 100, 100) : 0;
            const status = getUsageStatus(m.used, m.max);
            const statusColor = getStatusColor(status);
            const isUnlimited = m.max >= 9999;
            return (
              <div key={m.label} className="billing-meter-card" style={{ borderTopColor: m.color }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div className="billing-meter-label" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ opacity: 0.5 }}>{m.icon}</span> {m.label}
                  </div>
                  {!isUnlimited && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)',
                      padding: '2px 8px', borderRadius: 'var(--radius-full)',
                      background: getStatusBg(status), color: statusColor,
                    }}>
                      {Math.round(pct)}%
                    </span>
                  )}
                </div>
                <div className="billing-meter-value">
                  <span style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)' }}>{m.used}</span>
                  <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}> / {isUnlimited ? '∞' : m.max}</span>
                </div>
                <div className="billing-meter-bar">
                  <div className="billing-meter-fill" style={{
                    width: isUnlimited ? '0%' : `${pct}%`,
                    background: statusColor,
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Over-limit Warning ── */}
      {hasOverage && (
        <div style={{
          padding: '16px 20px', marginTop: 16, background: 'rgba(239,68,68,.04)',
          border: '1px solid rgba(239,68,68,.15)', borderRadius: 'var(--radius)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-xs)',
              background: 'rgba(239,68,68,.08)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0, fontSize: 16, color: 'var(--red)', fontWeight: 700,
            }}>!</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>Usage Exceeds Plan Limits</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12 }}>
                {meters.filter(m => m.used > m.max && m.max < 9999).map(m => (
                  <div key={m.label}>&bull; <strong>{m.label}:</strong> Using {m.used} of {m.max} allowed on your {currentPlan} plan</div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, marginBottom: 12 }}>
                Excess brands are <strong>locked</strong> (read-only). Upgrade your plan or remove unused brands to restore full access.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link href="/dashboard/account" style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 'var(--radius-xs)', textDecoration: 'none', display: 'inline-block' }}>
                  Upgrade Plan
                </Link>
                <Link href="/dashboard/setup" style={{ padding: '8px 16px', background: 'var(--bg3)', color: 'var(--text)', fontSize: 12, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', textDecoration: 'none', display: 'inline-block' }}>
                  Manage Brands
                </Link>
              </div>
            </div>
          </div>
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
                        padding: '3px 8px', borderRadius: 'var(--radius-full)', textTransform: 'uppercase',
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '18%' }} />
              {visiblePlans.map(p => (
                <col key={p} style={{ width: `${82 / visiblePlans.length}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 600, color: 'var(--text)' }}>Feature</th>
                {visiblePlans.map(p => (
                  <th key={p} style={{
                    padding: '12px 14px', fontWeight: 700, textAlign: 'center',
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
                      <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--radius-full)', background: 'var(--primary)', color: '#fff', display: 'inline-block', marginTop: 4 }}>
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
                        padding: '11px 14px', textAlign: 'center',
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
