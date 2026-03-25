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
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="h-screen overflow-hidden bg-[var(--bg)]" style={{ color: 'var(--text)' }}>
      {/* Topbar spans full width */}
      <Topbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex h-[calc(100vh-52px)]">
        {/* Sidebar below topbar */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        {/* Main content */}
        <main className="flex-1 lg:ml-[220px] overflow-y-auto overflow-x-hidden p-4 md:p-8 bg-[var(--bg)]">
          {children}
        </main>
      </div>
    </div>
  );
}
