'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandProvider } from '@/contexts/BrandContext';
import { RunProvider } from '@/contexts/RunContext';
import Sidebar from '@/components/dashboard/Sidebar';
import Topbar from '@/components/dashboard/Topbar';

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
    <RunProvider>
    <div id="app" style={{ display: 'grid', height: '100vh', overflow: 'hidden', gridTemplateColumns: '220px 1fr', gridTemplateRows: '52px 1fr', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Topbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main">
          <BrandProvider>
            {children}
          </BrandProvider>
      </main>
      <style>{`
        @media(max-width:1023px){
          #app{grid-template-columns:1fr!important;}
          #app .main{padding:12px 16px 24px!important;}
        }
      `}</style>
    </div>
    </RunProvider>
  );
}
