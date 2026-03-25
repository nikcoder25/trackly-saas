'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/dashboard/Sidebar';
import Topbar from '@/components/dashboard/Topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
    <div style={{ height: '100vh', overflow: 'hidden', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Topbar - full width on top */}
      <Topbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Sidebar - fixed positioned */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content - offset by sidebar width */}
      <main style={{
        marginLeft: 220,
        height: 'calc(100vh - 52px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'var(--bg)',
        padding: '16px 32px 32px',
      }}>
        {children}
      </main>
    </div>
  );
}
