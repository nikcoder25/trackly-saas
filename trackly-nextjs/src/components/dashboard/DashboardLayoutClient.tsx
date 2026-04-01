'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandProvider } from '@/contexts/BrandContext';
import { RunProvider } from '@/contexts/RunContext';
import Sidebar from '@/components/dashboard/Sidebar';
import Topbar from '@/components/dashboard/Topbar';
import GlobalRunProgress from '@/components/dashboard/GlobalRunProgress';
import Link from 'next/link';
import { getPlanLimits } from '@/lib/constants';

export default function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading } = useAuth();
  const [overLimit, setOverLimit] = useState(false);
  const [brandCount, setBrandCount] = useState(0);
  const [brandLimit, setBrandLimit] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.overLimit) {
          setOverLimit(true);
          setBrandCount((d.brands || []).length);
          setBrandLimit(d.brandLimit || 1);
        }
      })
      .catch(() => {});
  }, [user]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!user) return null;

  const plan = user.plan || 'free';

  return (
    <RunProvider>
    <div id="app" style={{ display: 'grid', height: '100vh', overflow: 'hidden', gridTemplateColumns: '220px 1fr', gridTemplateRows: '52px 1fr', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Topbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main">
          {/* Over-limit warning banner */}
          {overLimit && !dismissed && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', marginBottom: 14,
              background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)',
              borderRadius: 'var(--radius-xs)', fontSize: 12, color: 'var(--amber)',
            }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <strong>Plan limit exceeded.</strong> You have <strong>{brandCount} brand{brandCount !== 1 ? 's' : ''}</strong> but your <strong>{plan}</strong> plan allows <strong>{brandLimit}</strong>.
                {' '}Excess brands are locked (read-only). <Link href="/dashboard/account" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 700 }}>Upgrade</Link> or delete unused brands.
              </div>
              <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: 4 }}>&times;</button>
            </div>
          )}
          <BrandProvider>
            <GlobalRunProgress />
            {children}
          </BrandProvider>
      </main>
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
    </RunProvider>
  );
}
