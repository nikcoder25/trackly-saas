'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useRun } from '@/contexts/RunContext';
import { useBrands } from '@/contexts/BrandContext';

const navGroups = [
  {
    label: 'Dashboard',
    items: [
      { href: '/dashboard', label: 'Overview', icon: '📊' },
      { href: '/dashboard/mentions', label: 'Mentions', icon: '◎' },
      { href: '/dashboard/proof', label: 'Evidence & Proof', icon: '◆' },
      { href: '/dashboard/platforms', label: 'Platform Status', icon: '●' },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { href: '/dashboard/competitors', label: 'Competitors', icon: '⊘' },
      { href: '/dashboard/trends', label: 'SOV Trends', icon: '◆' },
      { href: '/dashboard/accuracy', label: 'Accuracy Monitor', icon: '◎' },
      { href: '/dashboard/citations', label: 'Citations', icon: '◇' },
      { href: '/dashboard/query-tracker', label: 'Query Tracker', icon: '◈' },
      { href: '/dashboard/recommendations', label: 'Recommendations', icon: '◆' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/dashboard/geo-audit', label: 'GEO Audit', icon: '◉' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/dashboard/setup', label: 'Brand Setup', icon: '◇' },
      { href: '/dashboard/account', label: 'Account & Plan', icon: '◉' },
      { href: '/dashboard/billing', label: 'Billing & Usage', icon: '◆' },
{ href: '/dashboard/alerts', label: 'Alerts', icon: '◈' },
      { href: '/dashboard/admin', label: 'Admin Panel', icon: '⚑', adminOnly: true },
    ],
  },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { live, startRun, forceRun } = useRun();
  const { selectedBrandLocked } = useBrands();

  const isDisabled = live.running || selectedBrandLocked;
  const isAdmin = user?.plan === 'owner' || user?.role === 'admin';

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="mobile-overlay" role="presentation" style={{ display: 'block', position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 998 }} onClick={onClose} />
      )}

      <aside className={`sidebar ${open ? 'mobile-open' : ''}`} role="navigation" aria-label="Main navigation" style={{
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Run Queries Button — admin/owner only */}
        {isAdmin ? (
        <div style={{ padding: '8px 8px 4px' }}>
          <button
            className={`run-btn${live.running ? ' running' : ''}`}
            id="sidebar-run-btn"
            aria-label={live.running ? 'Running queries' : 'Run queries'}
            style={{
              margin: 0,
              opacity: isDisabled ? 0.5 : 1,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              background: selectedBrandLocked ? 'var(--muted)' : live.status === 'done' ? 'var(--green)' : live.status === 'error' ? 'var(--red)' : undefined,
              fontSize: live.status === 'error' && live.errorMsg && live.errorMsg !== 'concurrent' ? '10px' : undefined,
            }}
            title={selectedBrandLocked ? 'This brand is locked — upgrade your plan to run queries' : live.errorMsg && live.errorMsg !== 'concurrent' ? live.errorMsg : undefined}
            disabled={isDisabled}
            onClick={() => startRun(false)}
          >
            {selectedBrandLocked ? '🔒 BRAND LOCKED' : live.running ? '⏳ RUNNING...' : live.status === 'done' ? '✓ DONE — Refreshing...' : live.status === 'error' ? (live.errorMsg === 'concurrent' ? '⚠ Run in progress' : live.errorMsg === 'run_limit' ? '❌ Run limit reached' : live.errorMsg === 'plan_limit' ? '🔒 Brand locked' : '❌ ' + ((live.statusText || 'Run failed').length > 30 ? (live.statusText || 'Run failed').substring(0, 28) + '...' : (live.statusText || 'Run failed'))) : '▶ RUN QUERIES'}
          </button>

          {/* Upgrade hint for locked brand, run limit, or plan limit */}
          {(selectedBrandLocked || (live.status === 'error' && (live.errorMsg === 'run_limit' || live.errorMsg === 'plan_limit'))) && (
            <Link href="/dashboard/account" style={{
              display: 'block', marginTop: 4, padding: '5px 8px', background: 'rgba(245,158,11,.08)',
              border: '1px solid rgba(245,158,11,.2)', borderRadius: 4, textAlign: 'center',
              fontSize: 10, fontWeight: 600, color: 'var(--amber)', textDecoration: 'none',
            }}>
              {live.errorMsg === 'run_limit' ? 'Upgrade for more runs →' : 'Upgrade to unlock →'}
            </Link>
          )}

          {/* Force-run button for concurrent lock errors */}
          {!selectedBrandLocked && live.status === 'error' && live.errorMsg === 'concurrent' && (
            <button onClick={forceRun} style={{ width: '100%', marginTop: 4, padding: '6px 8px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--mono)' }}>
              ⚡ FORCE RUN
            </button>
          )}
        </div>
        ) : (
        <div style={{ padding: '8px 8px 4px' }}>
          <div style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 'var(--radius-xs)', textAlign: 'center', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
            Queries run automatically on your plan schedule
          </div>
        </div>
        )}

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
          <button onClick={logout} className="logout-btn" aria-label="Sign out">Sign out</button>
        </div>
      </aside>

      <style>{`
        @media(max-width:767px){
          .sidebar{display:none!important;position:fixed!important;top:52px!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;z-index:999!important;}
          .sidebar.mobile-open{display:flex!important;}
        }
        @media(min-width:768px) and (max-width:1023px){
          .sidebar{display:none!important;position:fixed!important;top:52px!important;left:0!important;bottom:0!important;width:260px!important;z-index:999!important;}
          .sidebar.mobile-open{display:flex!important;}
        }
      `}</style>
    </>
  );
}
