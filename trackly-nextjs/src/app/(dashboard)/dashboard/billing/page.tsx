'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PLAN_LIMITS } from '@/lib/constants';

const PLAN_PRICES: Record<string, string> = { free: '$0', starter: '$29', pro: '$79', agency: '$199', enterprise: 'Custom' };

export default function BillingPage() {
  const { user } = useAuth();
  const currentPlan = user?.plan || 'free';
  const [upgrading, setUpgrading] = useState<string | null>(null);

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

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Billing</h1>
      <p className="text-[var(--text-muted)] mb-6">Manage your subscription and billing</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(PLAN_LIMITS).filter(([key]) => key !== 'owner').map(([planName, limits]) => {
          const isCurrent = currentPlan === planName;
          const isUpgrade = !isCurrent && planName !== 'free';
          return (
            <div key={planName} className={`bg-[var(--bg2)] border rounded-xl p-6 ${isCurrent ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]/20' : 'border-[var(--border)]'}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-white capitalize">{planName}</h3>
                {isCurrent && <span className="text-xs bg-[var(--primary)]/10 text-[var(--primary)] px-2 py-1 rounded">Current</span>}
              </div>
              <p className="text-2xl font-bold text-white mb-4">{PLAN_PRICES[planName]}<span className="text-sm text-[var(--text-muted)] font-normal">{planName !== 'free' && planName !== 'enterprise' ? '/mo' : ''}</span></p>
              <ul className="space-y-2 text-sm text-[var(--text-muted)] mb-6">
                <li>{limits.brands} brand{limits.brands > 1 ? 's' : ''}</li>
                <li>{limits.prompts} prompts/month</li>
                <li>{limits.platforms} platforms</li>
                <li>{limits.competitors} competitors</li>
                {limits.scheduledRuns && <li>Scheduled runs ({limits.minScheduleHours}h min)</li>}
                {limits.sentiment && <li>Sentiment analysis</li>}
                {limits.apiAccess && <li>API access</li>}
              </ul>
              {isUpgrade && (
                <button onClick={() => handleUpgrade(planName)} disabled={upgrading === planName}
                  className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
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
