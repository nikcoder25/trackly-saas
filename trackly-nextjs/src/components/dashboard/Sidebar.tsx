'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

// SVG icon helper — 14x14 inline icons
const I = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d={d} /></svg>;

const navGroups = [
  {
    label: 'Dashboard',
    items: [
      { href: '/dashboard', label: 'Overview', svg: I('M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z') },
      { href: '/dashboard/mentions', label: 'Mentions', svg: I('M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z') },
      { href: '/dashboard/recommendations', label: 'Recommendations', svg: I('M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z') },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { href: '/dashboard/proof', label: 'Evidence & Proof', svg: I('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z') },
      { href: '/dashboard/query-performance', label: 'Query Performance', svg: I('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m6 0h6m-6 0V9a2 2 0 012-2h2a2 2 0 012 2v10m6 0v-4a2 2 0 00-2-2h-2a2 2 0 00-2 2v4') },
      { href: '/dashboard/query-tracker', label: 'Query Tracker', svg: I('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z') },
      { href: '/dashboard/prompt-details', label: 'Prompt Details', svg: I('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
      { href: '/dashboard/trends', label: 'SOV Trends', svg: I('M13 7h8m0 0v8m0-8l-8 8-4-4-6 6') },
      { href: '/dashboard/competitors', label: 'Competitors', svg: I('M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z') },
      { href: '/dashboard/citations', label: 'Citation Analysis', svg: I('M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1') },
      { href: '/dashboard/accuracy', label: 'Accuracy Monitor', svg: I('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z') },
      { href: '/dashboard/platforms', label: 'Platform Status', svg: I('M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01') },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/dashboard/copilot', label: 'Copilot', svg: I('M13 10V3L4 14h7v7l9-11h-7z') },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/dashboard/setup', label: 'Brand Setup', svg: I('M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z') },
      { href: '/dashboard/alerts', label: 'Alerts & Notifications', svg: I('M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9') },
      { href: '/dashboard/team', label: 'Team Members', svg: I('M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z') },
      { href: '/dashboard/billing', label: 'Billing', svg: I('M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z') },
      { href: '/dashboard/account', label: 'Account & Plan', svg: I('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z') },
      { href: '/dashboard/activity', label: 'Activity & Logs', svg: I('M4 6h16M4 10h16M4 14h16M4 18h16') },
      { href: '/dashboard/admin', label: 'Admin Panel', svg: I('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'), adminOnly: true },
    ],
  },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="mobile-overlay" style={{ display: 'block', position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 998 }} onClick={onClose} />
      )}

      <aside className={`sidebar ${open ? 'mobile-open' : ''}`} style={{
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Run Queries Button */}
        <div style={{ padding: '8px 8px 4px' }}>
          <button className="run-btn" style={{ margin: 0 }} onClick={() => {
            fetch('/api/brands', { credentials: 'include' })
              .then(r => r.json())
              .then(d => {
                const b = (d.brands || [])[0];
                if (b) {
                  fetch(`/api/brands/${b.id}/run`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
                    .then(() => alert('Queries running! Check Mentions page for results.'))
                    .catch(() => alert('Failed to start run.'));
                } else {
                  alert('No brand configured. Set up a brand first.');
                }
              });
          }}>▶ RUN QUERIES</button>
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, padding: '4px 8px' }}>
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="nav-group">{group.label}</div>
              {group.items.map((item) => {
                if ('adminOnly' in item && item.adminOnly && user?.role !== 'admin') return null;
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`nav-item ${isActive ? 'active' : ''} ${'adminOnly' in item && item.adminOnly ? 'admin-link' : ''}`}
                    style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    {'svg' in item && item.svg} {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User section */}
        <div style={{ borderTop: '1px solid var(--border)', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, background: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 500 }}>
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{user?.name || 'User'}</p>
              <p style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{user?.plan || 'free'} plan</p>
            </div>
          </div>
          <button onClick={logout} className="logout-btn">
            {t.dashboard.signOut}
          </button>
        </div>
      </aside>

      <style>{`
        @media(max-width:1023px){
          .sidebar{display:none!important;position:fixed!important;top:52px!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;z-index:999!important;}
          .sidebar.mobile-open{display:flex!important;}
        }
      `}</style>
    </>
  );
}
