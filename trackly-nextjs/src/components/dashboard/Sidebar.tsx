'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

const navGroups = [
  {
    label: 'Dashboard',
    items: [
      { href: '/dashboard', label: 'Overview', icon: '\u25C8' },
      { href: '/dashboard/mentions', label: 'Mentions', icon: '\u25CE' },
      { href: '/dashboard/recommendations', label: 'Recommendations', icon: '\u2726' },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { href: '/dashboard/proof', label: 'Evidence & Proof', icon: '\u25C6' },
      { href: '/dashboard/query-performance', label: 'Query Performance', icon: '\u25FB' },
      { href: '/dashboard/query-tracker', label: 'Query Tracker', icon: '\u25C8' },
      { href: '/dashboard/prompt-details', label: 'Prompt Details', icon: '\u25C7' },
      { href: '/dashboard/trends', label: 'SOV Trends', icon: '\u25C6' },
      { href: '/dashboard/competitors', label: 'Competitors', icon: '\u2298' },
      { href: '/dashboard/citations', label: 'Citation Analysis', icon: '\u2B24' },
      { href: '/dashboard/accuracy', label: 'Accuracy Monitor', icon: '\u25CE' },
      { href: '/dashboard/platforms', label: 'Platform Status', icon: '\u2B21' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/dashboard/copilot', label: 'Copilot', icon: '\u25C8' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/dashboard/setup', label: 'Brand Setup', icon: '\u2699' },
      { href: '/dashboard/alerts', label: 'Alerts & Notifications', icon: '\u26A1' },
      { href: '/dashboard/team', label: 'Team Members', icon: '\u25CE' },
      { href: '/dashboard/billing', label: 'Billing', icon: '\u25FB' },
      { href: '/dashboard/account', label: 'Account & Plan', icon: '\u25C9' },
      { href: '/dashboard/activity', label: 'Activity & Logs', icon: '\u25C6' },
      { href: '/dashboard/admin', label: 'Admin Panel', icon: '\u2691', adminOnly: true },
    ],
  },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <>
      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 40 }} className="lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          position: 'fixed',
          top: 52,
          left: 0,
          height: 'calc(100vh - 52px)',
          width: 220,
          background: 'var(--bg2)',
          borderRight: '1px solid var(--border)',
          zIndex: 50,
          overflowY: 'auto',
          transition: 'transform 0.2s',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Run Queries Button */}
        <div style={{ padding: '8px 8px 4px' }}>
          <button className="run-btn">&#9654; RUN QUERIES</button>
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, padding: '4px 8px' }}>
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((item) => {
                if ('adminOnly' in item && item.adminOnly && user?.role !== 'admin') return null;
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`nav-link ${isActive ? 'active' : ''} ${'adminOnly' in item && item.adminOnly ? 'admin-link' : ''}`}
                  >
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
              <p style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || 'User'}</p>
              <p style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.plan || 'free'} plan</p>
            </div>
          </div>
          <button
            onClick={logout}
            style={{ background: 'none', border: 'none', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', cursor: 'pointer', padding: '4px 8px' }}
          >
            {t.dashboard.signOut}
          </button>
        </div>
      </aside>
    </>
  );
}
