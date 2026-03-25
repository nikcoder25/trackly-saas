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
    <div style={{ height: '100vh', overflow: 'hidden', background: 'var(--bg)', color: 'var(--text)', display: 'grid', gridTemplateRows: '52px 1fr', gridTemplateColumns: '220px 1fr' }}>
      {/* Topbar - spans full width */}
      <div style={{ gridColumn: '1 / -1' }}>
        <Topbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
      </div>

      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <main style={{ overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg)', padding: '16px 32px 32px' }}>
        {children}
      </main>
    </div>
  );
}
