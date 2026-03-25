'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function Topbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user } = useAuth();
  const { t } = useLanguage();

  return (
    <header className="h-[52px] bg-[var(--bg2)] border-b border-[var(--border)] flex items-center justify-between px-6">
      {/* Mobile menu button */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden text-[var(--muted)] hover:text-[var(--text)]"
        aria-label="Toggle menu"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Brand selector placeholder */}
      <div className="flex-1 lg:ml-0 ml-4">
        {user?.plan && user.plan !== 'free' ? (
          <span className="inline-flex items-center gap-1.5 bg-[var(--primary-light)] text-[var(--primary)] text-[9px] font-bold font-mono px-2.5 py-1 rounded-full uppercase tracking-wider border border-[var(--primary-border)]">
            {user.plan}
          </span>
        ) : null}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <LanguageSwitcher variant="light" />
        {!user?.emailVerified && (
          <span className="text-xs text-[var(--amber)] bg-[var(--warning-light)] px-2 py-1 rounded border border-[rgba(245,158,11,.2)]">
            {t.dashboard.verifyEmail}
          </span>
        )}
        <span className="text-[11px] font-mono text-[var(--muted)]">{user?.email}</span>
        <div className="w-8 h-8 bg-[var(--bg3)] rounded-full flex items-center justify-center text-[var(--muted)] text-sm font-medium">
          {user?.name?.[0]?.toUpperCase() || 'U'}
        </div>
      </div>
    </header>
  );
}
