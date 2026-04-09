'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PLAN_LIMITS } from '@/lib/constants';
import Link from 'next/link';
import { useBrands } from '@/contexts/BrandContext';

interface BillingData { plan: string; memberSince: string; brandCount?: number; queryCount?: number; platformCount?: number; }

const PLAN_PRICES: Record<string, string> = {
  free: '$0', starter: '$9', pro: '$29', agency: '$89', owner: '—',
};

const PLAN_FEATURES = [
  { feature: 'Price / month', free: '$0', starter: '$9', pro: '$29', agency: '$89', owner: '—' },
  { feature: 'Total Prompts', free: '5', starter: '30', pro: '250', agency: '1000', owner: '∞' },
  { feature: 'Brands', free: '1', starter: '1', pro: '5', agency: '20', owner: '∞' },
  { feature: 'Competitors', free: '0', starter: '2', pro: '5', agency: '20', owner: '∞' },
  { feature: 'Platforms', free: '2', starter: '2', pro: '5', agency: '5', owner: '5' },
  { feature: 'Sentiment', free: '—', starter: '✓', pro: '✓', agency: '✓', owner: '✓' },
  { feature: 'API Access', free: '—', starter: '—', pro: '—', agency: '—', owner: '✓' },
  { feature: 'Priority Support', free: '—', starter: '—', pro: '—', agency: '✓', owner: '✓' },
  { feature: 'GEO Audits/month', free: '3', starter: '25', pro: '100', agency: '500', owner: '∞' },
];

export default function BillingPage() {
  const { user } = useAuth();
  const { brands, selectedBrand, loading: brandsLoading } = useBrands();
  const [loading, setLoading] = useState(true);

  const currentPlan = user?.plan || 'free';
  const limits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;

  // Only show the owner plan in the comparison table if the user is on the owner plan
  const visiblePlans = currentPlan === 'owner'
    ? ['free', 'starter', 'pro', 'agency', 'owner'] as const
    : ['free', 'starter', 'pro', 'agency'] as const;

  const [billing, setBilling] = useState<BillingData | null>(null);

  useEffect(() => {
    if (brandsLoading) return;
    const b = selectedBrand;
    setBilling({
      plan: currentPlan,
      memberSince: user?.createdAt || '',
      brandCount: brands.length,
      queryCount: (b as Record<string, unknown>)?.queries ? ((b as Record<string, unknown>).queries as string[]).length : 0,
      platformCount: ((b as Record<string, unknown>)?.selected_platforms as string[] || []).length || 5,
    });
    setLoading(false);
  }, [brandsLoading, brands, selectedBrand, currentPlan, user]);

  const meters = [
    { label: 'Brands', used: billing?.brandCount || 0, max: limits.brands || 1, color: 'var(--blue)' },
    { label: 'Queries', used: billing?.queryCount || 0, max: limits.prompts || 5, color: 'var(--amber)' },
    { label: 'Platforms', used: billing?.platformCount || 0, max: 7, color: 'var(--purple)' },
  ];

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      <div className="view-title">Billing &amp; Usage</div>
      <div className="view-sub">View your current plan, usage, and manage your subscription.</div>

      {/* Current Plan Card — gradient background */}
      <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)', borderRadius: 'var(--radius)', padding: '28px 32px', marginBottom: 16, color: '#fff' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.8, marginBottom: 4 }}>Current Plan</div>
        <div style={{ fontSize: 36, fontWeight: 800, marginBottom: 4 }}>{currentPlan.toUpperCase()}</div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Member since {billing?.memberSince ? new Date(billing.memberSince).toLocaleDateString('en-GB') : '—'}</div>
        <Link href="/dashboard/account"
          style={{ marginTop: 16, padding: '10px 24px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-xs)', fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}>
          Upgrade Plan
        </Link>
      </div>

      {/* Usage Meters — 4 cards with colored top border */}
      <div className="billing-meters-grid">
        {meters.map(m => {
          const pct = m.max > 0 ? Math.min((m.used / m.max) * 100, 100) : 0;
          return (
            <div key={m.label} className="billing-meter-card" style={{ borderTopColor: m.color }}>
              <div className="billing-meter-label">{m.label}</div>
              <div className="billing-meter-value" style={{ color: 'var(--text)' }}>
                <span style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)' }}>{m.used}</span>
                <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}> / {m.max >= 9999 ? '∞' : m.max}</span>
              </div>
              <div className="billing-meter-bar">
                <div className="billing-meter-fill" style={{ width: `${pct}%`, background: m.color }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Over-limit warning */}
      {meters.some(m => m.used > m.max && m.max < 10000) && (
        <div style={{
          padding: '16px 20px', marginTop: 16, background: 'rgba(239,68,68,.05)',
          border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--radius-xs)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>Usage Exceeds Plan Limits</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12 }}>
                {meters.filter(m => m.used > m.max && m.max < 10000).map(m => (
                  <div key={m.label}>• <strong>{m.label}:</strong> Using {m.used} of {m.max} allowed on your {currentPlan} plan</div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, marginBottom: 12 }}>
                Excess brands are <strong>locked</strong> (read-only — no edits or query runs). To restore full access, upgrade your plan or delete unused brands.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { const el = document.getElementById('plan-comparison'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}
                  style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer' }}>
                  Upgrade Plan
                </button>
                <Link href="/dashboard/setup" style={{ padding: '8px 16px', background: 'var(--bg3)', color: 'var(--text)', fontSize: 12, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', textDecoration: 'none', display: 'inline-block' }}>
                  Manage Brands
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Comparison Table */}
      <div className="card" style={{ padding: 16, marginTop: 16 }} id="plan-comparison">
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
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--text)' }}>Feature</th>
                {visiblePlans.map(p => (
                  <th key={p} style={{ padding: '10px 8px', fontWeight: 700, color: p === currentPlan ? 'var(--primary)' : 'var(--muted)', textTransform: 'uppercase', fontSize: 11, letterSpacing: .5 }}>
                    {p}{p === currentPlan && ' ★'}
                    <div style={{ fontSize: 13, fontWeight: 800, color: p === currentPlan ? 'var(--primary)' : 'var(--text)', marginTop: 2 }}>{PLAN_PRICES[p]}<span style={{ fontSize: 9, fontWeight: 400, color: 'var(--muted)' }}>{p !== 'free' && p !== 'owner' ? '/mo' : ''}</span></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAN_FEATURES.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 500, color: 'var(--text)' }}>{row.feature}</td>
                  {visiblePlans.map(p => {
                    const val = row[p];
                    const isCheck = val === '✓';
                    const isDash = val === '—';
                    const isCurrent = p === currentPlan;
                    return (
                      <td key={p} style={{ padding: '10px 8px', color: isCheck ? 'var(--green)' : isDash ? 'var(--muted)' : isCurrent ? 'var(--primary)' : 'var(--text)', fontWeight: isCurrent ? 700 : 400, fontFamily: !isCheck && !isDash ? 'var(--mono)' : 'var(--font)' }}>
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
    </div>
  );
}
