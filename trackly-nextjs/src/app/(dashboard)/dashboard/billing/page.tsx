'use client';

import { useAuth } from '@/contexts/AuthContext';
import { PLAN_LIMITS } from '@/lib/constants';

export default function BillingPage() {
  const { user } = useAuth();
  const currentPlan = user?.plan || 'free';

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Billing</h1>
      <p className="text-[var(--text-muted)] mb-6">Manage your subscription and billing</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(PLAN_LIMITS).filter(([key]) => key !== 'owner').map(([planName, limits]) => (
          <div key={planName} className={`bg-[var(--bg2)] border rounded-xl p-6 ${currentPlan === planName ? 'border-[var(--primary)]' : 'border-[var(--border)]'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white capitalize">{planName}</h3>
              {currentPlan === planName && (
                <span className="text-xs bg-[var(--primary)]/10 text-[var(--primary)] px-2 py-1 rounded">Current</span>
              )}
            </div>
            <ul className="space-y-2 text-sm text-[var(--text-muted)]">
              <li>{limits.brands} brand{limits.brands > 1 ? 's' : ''}</li>
              <li>{limits.prompts} prompts/month</li>
              <li>{limits.platforms} platforms</li>
              <li>{limits.competitors} competitors</li>
              {limits.scheduledRuns && <li>Scheduled runs</li>}
              {limits.sentiment && <li>Sentiment analysis</li>}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
