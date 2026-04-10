'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandProvider, useBrands } from '@/contexts/BrandContext';
import { RunProvider, useRun } from '@/contexts/RunContext';
import { PLAN_LIMITS } from '@/lib/constants';
import Sidebar from '@/components/dashboard/Sidebar';
import Topbar from '@/components/dashboard/Topbar';
import GlobalRunProgress from '@/components/dashboard/GlobalRunProgress';
import GlobalLiveToasts from '@/components/dashboard/GlobalLiveToasts';
import { ToastProvider } from '@/components/dashboard/Toast';
import { SkeletonStyles } from '@/components/dashboard/Skeleton';
import AddBrandModal from '@/components/dashboard/AddBrandModal';
import Link from 'next/link';

function OnboardingModal() {
  const { brands, loading, setSelectedBrand, refreshBrands } = useBrands();
  const { startRun } = useRun();
  const [dismissed, setDismissed] = useState(false);

  // Show the AddBrandModal when user has zero brands (first-time onboarding)
  if (loading || brands.length > 0 || dismissed) return null;

  return (
    <AddBrandModal
      onClose={() => setDismissed(true)}
      onCreated={(brand) => {
        setSelectedBrand(brand);
        refreshBrands().then(() => {
          setTimeout(() => startRun(false), 500);
        });
      }}
    />
  );
}

function EmailVerificationBanner() {
  const { user, refreshUser } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (!user || user.emailVerified) return null;

  const handleResend = async () => {
    setSending(true);
    setError('');
    try {
      let res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
      });

      // If token expired, refresh and retry once
      if (res.status === 401) {
        const refreshRes = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (refreshRes.ok) {
          res = await fetch('/api/auth/resend-verification', {
            method: 'POST',
            credentials: 'include',
          });
        }
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');

      // Backend says already verified — refresh user state to hide the banner
      if (data.message === 'Email already verified') {
        await refreshUser();
        return;
      }

      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', marginBottom: 14,
      background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)',
      borderRadius: 'var(--radius-xs)', fontSize: 12, color: '#ef4444',
    }}>
      <span style={{ fontSize: 16 }}>&#9993;</span>
      <div style={{ flex: 1 }}>
        <strong>Email not verified.</strong> Please check your inbox for a verification link.
        {sent && !error
          ? <span style={{ color: '#10b981', fontWeight: 600, marginLeft: 8 }}>Verification email sent! Check your inbox.</span>
          : (
            <button
              onClick={handleResend}
              disabled={sending}
              style={{
                background: 'none', border: 'none', color: 'var(--primary)', cursor: sending ? 'default' : 'pointer',
                fontWeight: 700, fontSize: 12, marginLeft: 8, textDecoration: 'underline', textUnderlineOffset: 2, padding: 0,
              }}
            >{sending ? 'Sending...' : 'Resend verification email'}</button>
          )}
        {error && <span style={{ color: '#ef4444', marginLeft: 8 }}>Failed: {error}</span>}
      </div>
    </div>
  );
}

function UsageLimitBanner() {
  const { user } = useAuth();
  const { brands, selectedBrand, plan, brandLimit, overLimit, loading: brandsLoading } = useBrands();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [runsUsed, setRunsUsed] = useState(0);
  const [runsLoaded, setRunsLoaded] = useState(false);

  const currentPlan = plan || user?.plan || 'free';
  const limits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;

  // Fetch monthly run count
  useEffect(() => {
    if (brandsLoading || !brands.length) return;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let count = 0;
    for (const brand of brands) {
      const b = brand as Record<string, unknown>;
      for (const run of ((b.runs || []) as Array<{ time?: string; date?: string }>)) {
        const t = new Date(run.time || run.date || 0).getTime();
        if (t >= thirtyDaysAgo) count++;
      }
    }
    setRunsUsed(count);
    setRunsLoaded(true);
  }, [brandsLoading, brands]);

  // Re-check after a run completes
  useEffect(() => {
    const handler = () => {
      setDismissed(null); // Un-dismiss so new limits show
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      let count = 0;
      for (const brand of brands) {
        const b = brand as Record<string, unknown>;
        for (const run of ((b.runs || []) as Array<{ time?: string; date?: string }>)) {
          const t = new Date(run.time || run.date || 0).getTime();
          if (t >= thirtyDaysAgo) count++;
        }
      }
      setRunsUsed(count);
    };
    window.addEventListener('livesov:run-complete', handler);
    return () => window.removeEventListener('livesov:run-complete', handler);
  }, [brands]);

  if (brandsLoading || !runsLoaded) return null;

  // Compute which limits are hit
  const b = selectedBrand as Record<string, unknown> | null;
  const queryCount = b?.queries ? (b.queries as string[]).length : 0;
  const competitorCount = b?.competitors ? (b.competitors as string[]).length : 0;

  interface LimitAlert {
    key: string;
    icon: string;
    label: string;
    used: number;
    max: number;
    severity: 'danger' | 'warning';
    message: string;
  }

  const alerts: LimitAlert[] = [];

  // Brand limit
  if (brands.length >= brandLimit && brandLimit < 9999) {
    alerts.push({
      key: 'brands', icon: '◆', label: 'Brands', used: brands.length, max: brandLimit,
      severity: brands.length > brandLimit ? 'danger' : 'warning',
      message: brands.length > brandLimit
        ? `You have ${brands.length} brands but your plan allows ${brandLimit}. Excess brands are locked.`
        : `You've reached your brand limit (${brandLimit}). Delete a brand or upgrade to add more.`,
    });
  }

  // Run limit
  if (limits.runsPerMonth < 9999) {
    const runPct = limits.runsPerMonth > 0 ? (runsUsed / limits.runsPerMonth) * 100 : 0;
    if (runPct >= 80) {
      alerts.push({
        key: 'runs', icon: '▶', label: 'Runs', used: runsUsed, max: limits.runsPerMonth,
        severity: runPct >= 100 ? 'danger' : 'warning',
        message: runPct >= 100
          ? `Monthly run limit reached (${runsUsed}/${limits.runsPerMonth}). You can't run queries until the limit resets.`
          : `You've used ${runsUsed} of ${limits.runsPerMonth} monthly runs (${Math.round(runPct)}%). Consider upgrading if you need more.`,
      });
    }
  }

  // Query-per-brand limit
  if (limits.queries < 9999 && queryCount >= limits.queries) {
    alerts.push({
      key: 'queries', icon: '⚡', label: 'Queries', used: queryCount, max: limits.queries,
      severity: queryCount > limits.queries ? 'danger' : 'warning',
      message: `This brand has ${queryCount}/${limits.queries} queries. Remove some or upgrade to add more.`,
    });
  }

  // Competitor limit
  if (limits.competitors > 0 && limits.competitors < 9999 && competitorCount >= limits.competitors) {
    alerts.push({
      key: 'competitors', icon: '⊘', label: 'Competitors', used: competitorCount, max: limits.competitors,
      severity: 'warning',
      message: `Competitor tracking limit reached (${competitorCount}/${limits.competitors}).`,
    });
  }

  if (alerts.length === 0) return null;

  // Allow dismiss — but key it to the current alert state so it re-appears when limits change
  const alertKey = alerts.map(a => a.key).sort().join(',');
  if (dismissed === alertKey) return null;

  const hasDanger = alerts.some(a => a.severity === 'danger');
  const borderColor = hasDanger ? 'rgba(239,68,68,.25)' : 'rgba(245,158,11,.25)';
  const bgColor = hasDanger ? 'rgba(239,68,68,.04)' : 'rgba(245,158,11,.04)';
  const accentColor = hasDanger ? '#ef4444' : '#f59e0b';

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', marginBottom: 14,
      background: bgColor, border: `1px solid ${borderColor}`,
      borderRadius: 'var(--radius-xs)', fontSize: 12,
    }}>
      {/* Icon */}
      <div style={{
        width: 28, height: 28, borderRadius: 6, flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
        background: hasDanger ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)',
        color: accentColor,
      }}>
        {hasDanger ? '!' : '!'}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: accentColor, marginBottom: 4, fontSize: 12 }}>
          {hasDanger ? 'Plan Limit Exceeded' : 'Approaching Plan Limits'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', color: 'var(--muted)', lineHeight: 1.6 }}>
          {alerts.map(a => (
            <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: 4, fontSize: 10,
                background: a.severity === 'danger' ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)',
                color: a.severity === 'danger' ? '#ef4444' : '#f59e0b',
              }}>{a.icon}</span>
              <span>
                <strong style={{ color: 'var(--text)' }}>{a.label}:</strong>{' '}
                <span style={{
                  fontFamily: 'var(--mono)', fontWeight: 600,
                  color: a.severity === 'danger' ? '#ef4444' : '#f59e0b',
                }}>
                  {a.used}/{a.max >= 9999 ? '∞' : a.max}
                </span>
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/dashboard/account" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
            background: 'var(--primary)', color: '#fff', textDecoration: 'none',
          }}>
            Upgrade Plan
          </Link>
          <Link href="/dashboard/billing" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: 'var(--bg3)', color: 'var(--muted)', textDecoration: 'none',
            border: '1px solid var(--border)',
          }}>
            View Usage
          </Link>
        </div>
      </div>

      {/* Dismiss */}
      <button onClick={() => setDismissed(alertKey)} style={{
        background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer',
        fontSize: 16, padding: 2, lineHeight: 1, flexShrink: 0, opacity: 0.6,
      }} aria-label="Dismiss">&times;</button>
    </div>
  );
}

export default function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!user) return null;

  return (
    <BrandProvider>
    <RunProvider>
    <ToastProvider>
    <OnboardingModal />
    <SkeletonStyles />
    <div id="app" style={{ display: 'grid', height: '100vh', overflow: 'hidden', gridTemplateColumns: '220px 1fr', gridTemplateRows: '52px 1fr', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Topbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main">
          <EmailVerificationBanner />
          <UsageLimitBanner />
          <GlobalRunProgress />
          {children}
      </main>
      <GlobalLiveToasts />
      <style>{`
        @media(max-width:1023px){
          #app{grid-template-columns:1fr!important;}
          #app .main{padding:12px 16px 24px!important;}
        }
        @media(max-width:767px){
          #app{grid-template-columns:1fr!important;}
          #app .main{padding:8px 12px 20px!important;}
        }
      `}</style>
    </div>
    </ToastProvider>
    </RunProvider>
    </BrandProvider>
  );
}
