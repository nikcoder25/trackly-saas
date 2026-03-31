'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useRun } from '@/contexts/RunContext';

const navGroups = [
  {
    label: 'Dashboard',
    items: [
      { href: '/dashboard', label: 'Overview', icon: '📊' },
      { href: '/dashboard/mentions', label: 'Mentions', icon: '◎' },
      { href: '/dashboard/recommendations', label: 'Recommendations', icon: '✦' },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { href: '/dashboard/proof', label: 'Evidence & Proof', icon: '◆' },
      { href: '/dashboard/query-performance', label: 'Query Performance', icon: '◻' },
      { href: '/dashboard/query-tracker', label: 'Query Tracker', icon: '✦' },
      { href: '/dashboard/prompt-details', label: 'Prompt Details', icon: '◇' },
      { href: '/dashboard/trends', label: 'SOV Trends', icon: '◆' },
      { href: '/dashboard/competitors', label: 'Competitors', icon: '⊘' },
      { href: '/dashboard/citations', label: 'Citation Analysis', icon: '⬤' },
      { href: '/dashboard/accuracy', label: 'Accuracy Monitor', icon: '◎' },
      { href: '/dashboard/platforms', label: 'Platform Status', icon: '◎' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/dashboard/copilot', label: 'Copilot', icon: '✦' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/dashboard/setup', label: 'Brand Setup', icon: '◇' },
      { href: '/dashboard/alerts', label: 'Alerts & Notifications', icon: '⚡' },
      { href: '/dashboard/billing', label: 'Billing', icon: '◻' },
      { href: '/dashboard/account', label: 'Account & Plan', icon: '◉' },
      { href: '/dashboard/activity', label: 'Activity & Logs', icon: '◆' },
      { href: '/dashboard/admin', label: 'Admin Panel', icon: '⚑', adminOnly: true },
    ],
  },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { live, startRun, forceRun } = useRun();

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
          <button
            className={`run-btn${live.running ? ' running' : ''}`}
            id="sidebar-run-btn"
            style={{
              margin: 0,
              opacity: live.running ? 0.6 : 1,
              cursor: live.running ? 'not-allowed' : 'pointer',
              background: live.status === 'done' ? 'var(--green)' : live.status === 'error' ? 'var(--red)' : undefined,
              fontSize: live.status === 'error' && live.errorMsg && live.errorMsg !== 'concurrent' ? '10px' : undefined,
            }}
            title={live.errorMsg && live.errorMsg !== 'concurrent' ? live.errorMsg : undefined}
            disabled={live.running}
            onClick={() => startRun(false)}
          >
            {live.running ? '⏳ RUNNING...' : live.status === 'done' ? '✓ DONE — Refreshing...' : live.status === 'error' ? (live.errorMsg === 'concurrent' ? '⚠ Run in progress' : '❌ ' + (live.statusText.length > 30 ? live.statusText.substring(0, 28) + '...' : live.statusText)) : '▶ RUN QUERIES'}
          </button>

          {/* Force-run button for concurrent lock errors */}
          {live.status === 'error' && live.errorMsg === 'concurrent' && (
            <button onClick={forceRun} style={{ width: '100%', marginTop: 4, padding: '6px 8px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--mono)' }}>
              ⚡ FORCE RUN
            </button>
          )}
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
                  <Link key={item.href} href={item.href} prefetch={false} onClick={onClose}
                    className={`nav-item ${isActive ? 'active' : ''} ${'adminOnly' in item && item.adminOnly ? 'admin-link' : ''}`}
                    style={{ textDecoration: 'none' }}>
                    {item.icon} {item.label}
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
          <button onClick={logout} className="logout-btn">Sign out</button>
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
