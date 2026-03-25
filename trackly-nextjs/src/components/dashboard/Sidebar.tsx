'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  const navItems = [
    { href: '/dashboard', label: t.dashboard.overview, icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { href: '/dashboard/mentions', label: t.dashboard.mentions, icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z' },
    { href: '/dashboard/platforms', label: t.dashboard.platforms, icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z' },
    { href: '/dashboard/trends', label: t.dashboard.trends, icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
    { href: '/dashboard/competitors', label: t.dashboard.competitors, icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    { href: '/dashboard/analytics', label: t.dashboard.analytics, icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { type: 'divider' as const, href: undefined, label: undefined, icon: undefined },
    { href: '/dashboard/setup', label: t.dashboard.brandSetup, icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    { href: '/dashboard/alerts', label: t.dashboard.alerts, icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
    { href: '/dashboard/billing', label: t.dashboard.billing, icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    { href: '/dashboard/account', label: t.dashboard.account, icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onClose} />
      )}

      <aside className={`fixed top-0 left-0 h-full w-[220px] bg-[var(--bg2)] border-r border-[var(--border)] z-50 transform transition-transform duration-200 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-[52px] flex items-center px-5 border-b border-[var(--border)]">
            <Link href="/dashboard" className="text-xl font-extrabold tracking-tight text-[var(--text)]">
              Live<span className="text-[var(--primary)]">sov</span>
            </Link>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto py-2 px-2">
            {navItems.map((item, i) => {
              if ('type' in item && item.type === 'divider') {
                return <div key={i} className="h-px bg-[var(--border)] my-2 mx-2" />;
              }
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href!));
              return (
                <Link
                  key={item.href}
                  href={item.href!}
                  onClick={onClose}
                  className={`flex items-center gap-2.5 px-3.5 py-[9px] rounded-md text-[13px] font-medium transition mb-px ${
                    isActive
                      ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg3)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  {item.label}
                </Link>
              );
            })}
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
