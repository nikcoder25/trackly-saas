'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PLAN_LIMITS } from '@/lib/constants';

const PLAN_PRICES: Record<string, string> = { free: '$0', starter: '$29', pro: '$79', agency: '$199', enterprise: 'Custom' };
const PLAN_COLORS: Record<string, string> = { free: '#6b7280', starter: '#f59e0b', pro: '#4f46e5', agency: '#7c3aed', enterprise: '#9b72ff', owner: '#059669' };
const METER_COLORS = ['#4f46e5', '#059669', '#f59e0b', '#7c3aed'];

interface UsageMeter {
  label: string;
  used: number;
  limit: number;
}

interface BillingData {
  plan: string;
  usage: {
    brands: { used: number; limit: number };
    queries: { used: number; limit: number };
    runsToday: { used: number; limit: number };
    platforms: { used: number; limit: number };
  };
  warnings: { type: string; message: string }[];
  memberSince: string;
}

export default function BillingPage() {
  const { user } = useAuth();
  const currentPlan = user?.plan || 'free';
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(true);

  useEffect(() => {
    fetch('/api/billing', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setBilling(data);
        setLoadingBilling(false);
      })
      .catch(() => setLoadingBilling(false));
  }, []);

  const handleUpgrade = async (plan: string) => {
    setUpgrading(plan);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || 'Failed to start checkout');
    } catch { alert('Checkout failed'); }
    setUpgrading(null);
  };

  // Build usage meters from billing data or fall back to plan limits
  const limits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;
  const meters: UsageMeter[] = billing
    ? [
        { label: 'Brands Used', used: billing.usage.brands.used, limit: billing.usage.brands.limit },
        { label: 'Queries Used', used: billing.usage.queries.used, limit: billing.usage.queries.limit },
        { label: 'Runs Today', used: billing.usage.runsToday.used, limit: billing.usage.runsToday.limit },
        { label: 'Platforms', used: billing.usage.platforms.used, limit: billing.usage.platforms.limit },
      ]
    : [
        { label: 'Brands Used', used: 0, limit: limits.brands },
        { label: 'Queries Used', used: 0, limit: limits.queries },
        { label: 'Runs Today', used: 0, limit: limits.prompts },
        { label: 'Platforms', used: limits.platforms, limit: 5 },
      ];

  const warnings = billing?.warnings || [];
  const planColor = PLAN_COLORS[currentPlan] || '#888';
  const memberSince = billing?.memberSince
    ? new Date(billing.memberSince).toLocaleDateString()
    : user?.createdAt
      ? new Date(user.createdAt).toLocaleDateString()
      : '';

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text)] mb-2">Billing</h1>
      <p className="text-[var(--text-muted)] mb-6">Manage your subscription and billing</p>

      {/* ── Current Plan Card ── */}
      <div className="mb-6 rounded-xl overflow-hidden border border-[var(--border)]">
        <div
          className="px-7 py-6"
          style={{ background: `linear-gradient(135deg, ${planColor}, ${planColor}cc)` }}
        >
          <div className="text-[11px] uppercase tracking-wider text-white/80 font-medium">Current Plan</div>
          <div className="text-[32px] font-extrabold uppercase text-white mt-1">{currentPlan}</div>
          {memberSince && (
            <div className="text-xs text-white/70 mt-1">Member since {memberSince}</div>
          )}
        </div>
        <div className="bg-[var(--bg2)] px-7 py-4 border-t border-[var(--border)]">
          <div className="flex flex-wrap gap-3 text-sm text-[var(--text-muted)]">
            <span>{limits.brands} brand{limits.brands > 1 ? 's' : ''}</span>
            <span className="text-[var(--border)]">|</span>
            <span>{limits.prompts} prompts/mo</span>
            <span className="text-[var(--border)]">|</span>
            <span>{limits.platforms} platforms</span>
            <span className="text-[var(--border)]">|</span>
            <span>{limits.competitors} competitors</span>
            {limits.sentiment && (
              <>
                <span className="text-[var(--border)]">|</span>
                <span>Sentiment</span>
              </>
            )}
            {limits.apiAccess && (
              <>
                <span className="text-[var(--border)]">|</span>
                <span>API Access</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Usage Meters Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {meters.map((meter, i) => {
          const pct = meter.limit > 0 ? Math.min((meter.used / meter.limit) * 100, 100) : 0;
          const barColor = pct > 90 ? 'var(--red, #ef4444)' : pct > 70 ? '#f59e0b' : METER_COLORS[i];
          const displayLimit = meter.limit >= 9999 ? '\u221e' : meter.limit;
          return (
            <div
              key={meter.label}
              className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5"
              style={{ borderTopWidth: '3px', borderTopColor: METER_COLORS[i] }}
            >
              <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
                {meter.label}
              </div>
              <div className="text-2xl font-bold text-[var(--text)]">
                {meter.used}{' '}
                <span className="text-sm font-medium text-[var(--text-muted)]">/ {displayLimit}</span>
              </div>
              <div className="mt-3 h-2 bg-[var(--border)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: barColor }}
                />
              </div>
              {loadingBilling && (
                <div className="mt-2 text-xs text-[var(--text-muted)]">Loading...</div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Usage Warnings ── */}
      {warnings.length > 0 && (
        <div className="mb-6 space-y-2">
          {warnings.map((w, i) => (
            <div
              key={i}
              className="px-4 py-3 rounded-lg text-sm"
              style={{
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.2)',
              }}
            >
              <span className="mr-1">&#9888;</span> {w.message}
            </div>
          ))}
        </div>
      )}

      {/* ── Plan Comparison Grid ── */}
      <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Compare Plans</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(PLAN_LIMITS).filter(([key]) => key !== 'owner').map(([planName, planLimits]) => {
          const isCurrent = currentPlan === planName;
          const isUpgrade = !isCurrent && planName !== 'free';
          return (
            <div key={planName} className={`bg-[var(--bg2)] border rounded-xl p-6 ${isCurrent ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]/20' : 'border-[var(--border)]'}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-[var(--text)] capitalize">{planName}</h3>
                {isCurrent && <span className="text-xs bg-[var(--primary)]/10 text-[var(--primary)] px-2 py-1 rounded">Current</span>}
              </div>
              <p className="text-2xl font-bold text-[var(--text)] mb-4">{PLAN_PRICES[planName]}<span className="text-sm text-[var(--text-muted)] font-normal">{planName !== 'free' && planName !== 'enterprise' ? '/mo' : ''}</span></p>
              <ul className="space-y-2 text-sm text-[var(--text-muted)] mb-6">
                <li>{planLimits.brands} brand{planLimits.brands > 1 ? 's' : ''}</li>
                <li>{planLimits.prompts} prompts/month</li>
                <li>{planLimits.platforms} platforms</li>
                <li>{planLimits.competitors} competitors</li>
                {planLimits.scheduledRuns && <li>Scheduled runs ({planLimits.minScheduleHours}h min)</li>}
                {planLimits.sentiment && <li>Sentiment analysis</li>}
                {planLimits.apiAccess && <li>API access</li>}
              </ul>
              {isUpgrade && (
                <button onClick={() => handleUpgrade(planName)} disabled={upgrading === planName}
                  className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--text)] py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                  {upgrading === planName ? 'Processing...' : `Upgrade to ${planName}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
