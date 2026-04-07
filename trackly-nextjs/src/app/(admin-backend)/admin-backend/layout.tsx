'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV_ITEMS = [
  { href: '/admin-backend', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4' },
  { href: '/admin-backend/users', label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { href: '/admin-backend/analytics', label: 'API Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { href: '/admin-backend/revenue', label: 'Revenue', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { href: '/admin-backend/audit-logs', label: 'Audit Logs', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { href: '/admin-backend/system', label: 'System', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

export default function AdminBackendLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user || (user.role !== 'admin' && user.plan !== 'owner')) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#ef4444' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Access Denied</h1>
          <p style={{ color: '#71717a', fontSize: 14 }}>This area is restricted to administrators.</p>
          <Link href="/dashboard" style={{ display: 'inline-block', marginTop: 20, padding: '10px 24px', background: '#6366f1', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const isActive = (href: string) => href === '/admin-backend' ? pathname === href : pathname.startsWith(href);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#09090b', color: '#fafafa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 40 }} />
      )}

      {/* Sidebar */}
      <aside style={{
        width: 240, flexShrink: 0, background: '#0a0a0f', borderRight: '1px solid #1e1e2e',
        display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 50,
        transform: sidebarOpen ? 'translateX(0)' : undefined,
      }}
      className="admin-sidebar"
      >
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #1e1e2e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#fff' }}>A</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fafafa', lineHeight: 1.2 }}>Admin Backend</div>
              <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Control Panel</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map(item => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8,
                  fontSize: 13, fontWeight: active ? 600 : 500, textDecoration: 'none', transition: 'all .15s',
                  color: active ? '#fff' : '#a1a1aa',
                  background: active ? 'rgba(99,102,241,.12)' : 'transparent',
                }}
              >
                <svg width={18} height={18} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} style={{ flexShrink: 0, color: active ? '#6366f1' : '#71717a' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid #1e1e2e' }}>
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12, color: '#71717a', textDecoration: 'none', transition: 'color .15s' }}>
            <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>
            Back to App
          </Link>
          <button onClick={logout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12, color: '#71717a', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'color .15s' }}>
            <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Logout
          </button>
          <div style={{ padding: '8px 12px', fontSize: 10, color: '#3f3f46' }}>
            Signed in as {user.email}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, marginLeft: 240, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Top bar */}
        <header style={{ height: 52, borderBottom: '1px solid #1e1e2e', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12, flexShrink: 0, background: '#09090b' }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="admin-menu-btn" style={{ display: 'none', background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 4 }}>
            <svg width={20} height={20} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontSize: 12, color: '#71717a' }}>System Online</span>
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {children}
        </main>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .admin-sidebar { transform: translateX(-100%); transition: transform .2s; }
          .admin-sidebar[style*="translateX(0)"] { transform: translateX(0) !important; }
          .admin-menu-btn { display: block !important; }
          div[style*="marginLeft: 240"] { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}
