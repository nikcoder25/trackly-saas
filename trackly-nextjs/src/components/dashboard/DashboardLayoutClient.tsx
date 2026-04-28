'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandProvider, useBrands } from '@/contexts/BrandContext';
import { RunProvider, useRun } from '@/contexts/RunContext';
import { CreditsProvider } from '@/contexts/CreditsContext';
import { PLAN_LIMITS } from '@/lib/constants';
import Sidebar from '@/components/dashboard/Sidebar';
import Topbar from '@/components/dashboard/Topbar';
import GlobalRunProgress from '@/components/dashboard/GlobalRunProgress';
import GlobalLiveToasts from '@/components/dashboard/GlobalLiveToasts';
import LowBalanceBanner from '@/components/dashboard/LowBalanceBanner';
import CreditMigrationBanner from '@/components/dashboard/CreditMigrationBanner';
import { ToastProvider } from '@/components/dashboard/Toast';
import { SkeletonStyles } from '@/components/dashboard/Skeleton';
import AddBrandModal from '@/components/dashboard/AddBrandModal';
import Link from 'next/link';

function OnboardingModal() {
  const { brands, loading, setSelectedBrand, refreshBrands } = useBrands();
  const { startRun } = useRun();
  const startRunRef = useRef(startRun);
  useEffect(() => { startRunRef.current = startRun; }, [startRun]);
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  // Show the AddBrandModal when user has zero brands (first-time onboarding)
  if (loading || brands.length > 0 || dismissed) return null;

  return (
    <AddBrandModal
      onClose={() => setDismissed(true)}
      onCreated={(brand) => {
        setSelectedBrand(brand);
        refreshBrands().then(() => {
          setTimeout(() => startRunRef.current(false, { auto: true }), 600);
        });
      }}
    />
  );
}

function TrialBanner() {
  const { user } = useAuth();
  if (!user || user.plan !== 'trial' || !user.trialEndsAt) return null;
  const endMs = new Date(user.trialEndsAt).getTime();
  if (isNaN(endMs)) return null;
  const msLeft = endMs - Date.now();
  if (msLeft <= 0) return null;
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  const hoursLeft = Math.ceil(msLeft / (60 * 60 * 1000));
  const label = daysLeft > 1 ? `${daysLeft} days` : `${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', marginBottom: 10,
      background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.25)',
      borderRadius: 'var(--radius-xs)', fontSize: 12, color: 'var(--text)',
    }}>
      <span style={{ fontSize: 14, color: 'var(--green)' }}>★</span>
      <div style={{ flex: 1 }}>
        <strong>Free trial active</strong>
        <span style={{ margin: '0 6px', opacity: 0.5 }}>-</span>
        <span>{label} left &middot; 30 prompts &middot; all 5 AI platforms</span>
      </div>
      <Link href="/dashboard/account" style={{
        fontSize: 11, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none',
      }}>Upgrade →</Link>
    </div>
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
    setSent(false);
    try {
      let res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
      });

      // If token expired, refresh and retry once
      if (res.status === 401) {
        try {
          const refreshRes = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
          if (refreshRes.ok) {
            res = await fetch('/api/auth/resend-verification', {
              method: 'POST',
              credentials: 'include',
            });
          }
        } catch {
          // Refresh failed - fall through with original 401 response
        }
      }

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('Server error - please try again later.');
      }
      if (!res.ok) throw new Error(data.error || 'Failed to send verification email');

      // Backend says already verified - refresh user state to hide the banner
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
  const competitorCount = b?.competitors ? (b.competitors as string[]).length : 0;
  // Account-wide tracked prompts (v3 spec): sum across every brand
  // the user owns, since the cap is no longer per-brand.
  let accountPromptCount = 0;
  for (const brand of brands) {
    const br = brand as Record<string, unknown>;
    if (Array.isArray(br?.queries)) accountPromptCount += (br.queries as string[]).length;
  }

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

  // Account-wide tracked-prompt limit (v3 spec). The cap is shared
  // across every brand the user owns; we surface remaining slots
  // rather than a per-brand count so the alert reflects the actual
  // gating math the server enforces.
  if (limits.trackedPromptsPerAccount < 9999 && accountPromptCount >= limits.trackedPromptsPerAccount) {
    alerts.push({
      key: 'trackedPrompts', icon: '⚡', label: 'Tracked prompts', used: accountPromptCount, max: limits.trackedPromptsPerAccount,
      severity: accountPromptCount > limits.trackedPromptsPerAccount ? 'danger' : 'warning',
      message: `You're using ${accountPromptCount}/${limits.trackedPromptsPerAccount} tracked prompts (account-wide). Remove some or upgrade to add more.`,
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

  // Allow dismiss - but key it to the current alert state so it re-appears when limits change
  const alertKey = alerts.map(a => a.key).sort().join(',');
  if (dismissed === alertKey) return null;

  const hasDanger = alerts.some(a => a.severity === 'danger');
  const accentColor = hasDanger ? '#ef4444' : '#f59e0b';

  // Build a concise summary of what hit the limit, e.g. "Brands 1/1, Runs 50/50"
  const limitSummary = alerts.map(a => `${a.label} ${a.used}/${a.max >= 9999 ? '∞' : a.max}`).join(', ');

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', marginBottom: 8,
      background: hasDanger ? 'rgba(239,68,68,.05)' : 'rgba(245,158,11,.05)',
      border: `1px solid ${hasDanger ? 'rgba(239,68,68,.15)' : 'rgba(245,158,11,.15)'}`,
      borderRadius: 'var(--radius-xs)', fontSize: 11, lineHeight: 1.4,
    }}>
      <span style={{ color: accentColor, fontSize: 12, flexShrink: 0 }}>●</span>
      <span style={{ flex: 1, minWidth: 0, color: 'var(--muted)' }}>
        <span style={{ fontWeight: 600, color: accentColor }}>
          {hasDanger ? 'Limit reached' : 'Nearing limit'}
        </span>
        <span style={{ margin: '0 4px', opacity: 0.4 }}>-</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 500 }}>{limitSummary}</span>
      </span>
      <Link href="/dashboard/billing" style={{
        fontSize: 10, color: 'var(--muted)', textDecoration: 'underline', whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        View usage
      </Link>
      <Link href="/dashboard/account" style={{
        fontSize: 10, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        Upgrade →
      </Link>
      <button onClick={() => setDismissed(alertKey)} style={{
        background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer',
        fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0, opacity: 0.4,
      }} aria-label="Dismiss">×</button>
    </div>
  );
}

/**
 * Polls for background/scheduled run completions every 60s.
 * When a cron/scheduled run finishes while the user has the dashboard open,
 * this detects the new run and refreshes brand data across all pages.
 */
function BackgroundRunPoller() {
  const { brands, refreshBrands } = useBrands();
  const { live } = useRun();
  const lastRunCountRef = useRef<number | null>(null);

  useEffect(() => {
    // Don't poll while a user-triggered run is active (RunContext handles that)
    if (live.running) return;

    // Track current run count on mount
    if (lastRunCountRef.current === null) {
      let count = 0;
      for (const brand of brands) {
        const b = brand as Record<string, unknown>;
        count += ((b.runs || []) as unknown[]).length;
      }
      lastRunCountRef.current = count;
    }

    const interval = setInterval(async () => {
      // Skip if a run started while we were waiting
      if (live.running) return;

      try {
        await refreshBrands();
      } catch {
        // Silently ignore - will retry next interval
      }
    }, 60000); // Poll every 60 seconds

    return () => clearInterval(interval);
  }, [live.running, refreshBrands, brands]);

  // Detect new runs after refreshBrands updates brands
  useEffect(() => {
    if (lastRunCountRef.current === null) return;

    let count = 0;
    for (const brand of brands) {
      const b = brand as Record<string, unknown>;
      count += ((b.runs || []) as unknown[]).length;
    }

    if (count > lastRunCountRef.current) {
      // A new run was detected (likely from a scheduled/cron run)
      window.dispatchEvent(new CustomEvent('livesov:run-complete'));
    }
    lastRunCountRef.current = count;
  }, [brands]);

  return null;
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
    <CreditsProvider>
    <RunProvider>
    <ToastProvider>
    <OnboardingModal />
    <BackgroundRunPoller />
    <SkeletonStyles />
    <div id="app" style={{ display: 'grid', height: '100vh', overflow: 'hidden', gridTemplateColumns: '220px 1fr', gridTemplateRows: '52px 1fr', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Topbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main">
          <TrialBanner />
          <EmailVerificationBanner />
          <CreditMigrationBanner />
          <LowBalanceBanner />
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
    </CreditsProvider>
    </BrandProvider>
  );
}
