'use client';

// Post-checkout payment reconciliation + success banner. Extracted verbatim
// (behaviour-preserving) from the old dashboard Overview page so the redesigned
// Overview can stay presentational while this still runs on /dashboard?payment=success.

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { PLAN_LIMITS } from '@/lib/constants';

export default function PaymentSuccessBanner() {
  const { user, refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);

  const dismissPaymentBanner = useCallback(() => {
    setShowPaymentSuccess(false);
    window.history.replaceState({}, '', '/dashboard');
  }, []);

  useEffect(() => {
    if (searchParams.get('payment') !== 'success') return;
    setShowPaymentSuccess(true);
    const fromPlan = searchParams.get('from') || null;

    // Active reconciliation poll. The webhook is best-effort, so we also pull
    // live state from Dodo until the local plan diverges from the pre-checkout
    // value (or we hit the ceiling).
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;
    const INTERVAL_MS = 3000;

    async function pollOnce() {
      if (cancelled) return;
      attempts++;
      try {
        const res = await fetch('/api/payments/refresh', { method: 'POST', credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data?.plan && data.plan !== fromPlan) {
            await refreshUser();
            return;
          }
        }
      } catch {
        // Network blip - keep polling until ceiling.
      }
      if (cancelled || attempts >= MAX_ATTEMPTS) return;
      setTimeout(pollOnce, INTERVAL_MS);
    }
    pollOnce();

    const timer = setTimeout(dismissPaymentBanner, MAX_ATTEMPTS * INTERVAL_MS + 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchParams, dismissPaymentBanner, refreshUser]);

  if (!showPaymentSuccess) return null;

  const fromPlan = searchParams.get('from') || null;
  const currentPlan = user?.plan || null;
  const upgradeApplied = !!currentPlan && (!fromPlan || currentPlan !== fromPlan);

  if (!upgradeApplied) {
    return (
      <div style={{
        marginBottom: 16, padding: '20px 24px', borderRadius: 'var(--radius)',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        color: '#fff', position: 'relative', overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(99,102,241,.3)', animation: 'fadeInUp .4s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin 1s linear infinite' }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Payment received, upgrade processing…</div>
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
                Your new plan will activate within a minute. You can stay on this page - it&apos;ll refresh automatically.
              </div>
            </div>
          </div>
          <button onClick={dismissPaymentBanner} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', cursor: 'pointer', padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Dismiss</button>
        </div>
      </div>
    );
  }

  const planName = currentPlan!.charAt(0).toUpperCase() + currentPlan!.slice(1);
  const limits = PLAN_LIMITS[currentPlan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.pro;
  return (
    <div style={{
      marginBottom: 16, padding: '24px 28px', borderRadius: 'var(--radius)',
      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
      color: '#fff', position: 'relative', overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(99,102,241,.3)', animation: 'fadeInUp .4s ease',
    }}>
      <div style={{ position: 'absolute', top: -20, right: -20, fontSize: 80, opacity: 0.12, lineHeight: 1 }}>&#10003;</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>&#10003;</span>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px' }}>Welcome to {planName}!</span>
          </div>
          <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 14, lineHeight: 1.5 }}>
            Your plan has been upgraded successfully. Here&apos;s what you now have access to:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              `${limits.trackedPromptsPerAccount >= 9999 ? 'Unlimited' : limits.trackedPromptsPerAccount} tracked prompts (account-wide)`,
              `${limits.platforms} AI platforms`,
              `${limits.competitors} competitors`,
              ...(limits.sentiment ? ['Sentiment analysis'] : []),
              ...(limits.prioritySupport ? ['Priority support'] : []),
              ...(limits.scheduledRuns ? ['Scheduled runs'] : []),
            ].map((f, i) => (
              <span key={i} style={{ padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(4px)' }}>{f}</span>
            ))}
          </div>
        </div>
        <button onClick={dismissPaymentBanner} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', cursor: 'pointer', padding: '8px 20px', borderRadius: 'var(--radius-xs)', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>Got it!</button>
      </div>
    </div>
  );
}
