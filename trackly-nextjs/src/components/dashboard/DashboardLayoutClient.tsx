'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandProvider, useBrands } from '@/contexts/BrandContext';
import { RunProvider, useRun } from '@/contexts/RunContext';
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

function OverLimitBanner() {
  const { overLimit, brands, brandLimit, plan } = useBrands();
  const [dismissed, setDismissed] = useState(false);

  if (!overLimit || dismissed) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', marginBottom: 14,
      background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)',
      borderRadius: 'var(--radius-xs)', fontSize: 12, color: 'var(--amber)',
    }}>
      <span style={{ fontSize: 16 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <strong>Plan limit exceeded.</strong> You have <strong>{brands.length} brand{brands.length !== 1 ? 's' : ''}</strong> but your <strong>{plan}</strong> plan allows <strong>{brandLimit}</strong>.
        {' '}Excess brands are locked (read-only). <Link href="/dashboard/account" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 700 }}>Upgrade</Link> or delete unused brands.
      </div>
      <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: 4 }}>&times;</button>
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
          <OverLimitBanner />
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
