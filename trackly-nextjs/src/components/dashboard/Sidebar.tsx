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
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onClose} />
      )}

      <aside className={`fixed top-[52px] left-0 h-[calc(100vh-52px)] w-[220px] bg-[var(--bg2)] border-r border-[var(--border)] z-50 transform transition-transform duration-200 lg:translate-x-0 overflow-y-auto ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Run Queries Button */}
          <div className="px-2 pt-2">
            <button className="w-full py-2.5 text-center text-xs font-bold text-white bg-[var(--primary)] rounded-md shadow-[0_1px_3px_rgba(255,97,84,.2)] hover:bg-[var(--primary-hover)] hover:-translate-y-px hover:shadow-[0_3px_8px_rgba(255,97,84,.3)] transition tracking-wider">
              &#9654; RUN QUERIES
            </button>
          </div>

          {/* Nav groups */}
          <nav className="flex-1 py-1 px-2">
            {navGroups.map((group) => (
              <div key={group.label}>
                <div className="px-3 pt-3.5 pb-1.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-[1.2px]">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={`block w-full px-3.5 py-[9px] text-[13px] font-medium rounded-md mb-px transition ${
                        isActive
                          ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg3)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="mr-2">{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* User section */}
          <div className="border-t border-[var(--border)] p-3">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 bg-[var(--primary)] rounded-full flex items-center justify-center text-white text-sm font-medium">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text)] truncate font-medium">{user?.name || 'User'}</p>
                <p className="text-[10px] font-mono text-[var(--muted)] truncate uppercase">{user?.plan || 'free'} plan</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full text-left text-[10px] font-mono text-[var(--muted)] hover:text-[var(--text)] transition px-2 py-1"
            >
              {t.dashboard.signOut}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
