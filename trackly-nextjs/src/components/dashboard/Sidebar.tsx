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
                    style={{ textDecoration: 'none' }}
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
