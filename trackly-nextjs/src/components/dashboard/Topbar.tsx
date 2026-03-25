'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function Topbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user } = useAuth();
  const { t } = useLanguage();

  return (
    <header className="h-[52px] bg-[var(--bg2)] border-b border-[var(--border)] flex items-center justify-between px-6">
      {/* Left side */}
      <div className="flex items-center gap-4">
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

        {/* Brand selector */}
        <div className="hidden sm:block">
          <select className="min-w-[160px] max-w-[220px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] py-[5px] px-2.5 font-sans text-xs rounded-md focus:border-[var(--primary)] focus:outline-none transition">
            <option>Select brand...</option>
          </select>
        </div>

        {/* Plan badge */}
        {user?.plan && user.plan !== 'free' ? (
          <span className={`text-[9px] font-bold font-mono px-2.5 py-[3px] rounded-full uppercase tracking-wider border ${
            user.plan === 'agency'
              ? 'bg-[var(--accent-light)] text-[var(--accent)] border-[var(--accent)]'
              : 'bg-[var(--primary-light)] text-[var(--primary)] border-[var(--primary-border)]'
          }`}>
            {user.plan}
          </span>
        ) : null}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <LanguageSwitcher variant="light" />

        {/* Notification bell */}
        <button className="relative border border-[var(--border)] text-[var(--muted)] text-sm px-2 py-1 rounded-md hover:border-[var(--primary)] hover:text-[var(--primary)] transition leading-none" aria-label="Notifications">
          &#128276;
        </button>

        {!user?.emailVerified && (
          <span className="text-xs text-[var(--amber)] bg-[var(--warning-light)] px-2 py-1 rounded border border-[rgba(245,158,11,.2)]">
            {t.dashboard.verifyEmail}
          </span>
        )}
        <span className="hidden md:inline text-[11px] font-mono text-[var(--muted)]">{user?.email}</span>
        <div className="w-8 h-8 bg-[var(--bg3)] rounded-full flex items-center justify-center text-[var(--muted)] text-sm font-medium">
          {user?.name?.[0]?.toUpperCase() || 'U'}
        </div>
        <button
          onClick={() => {/* logout handled in sidebar */}}
          className="hidden md:inline font-mono text-[10px] text-[var(--muted)] hover:text-[var(--text)] transition"
        >
          {t.dashboard.signOut}
        </button>
      </div>
    </header>
  );
}
