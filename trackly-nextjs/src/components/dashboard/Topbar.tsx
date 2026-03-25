'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function Topbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <header className="h-[52px] bg-[var(--bg2)] border-b border-[var(--border)] flex items-center justify-between px-6 z-10">
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

        {/* Logo */}
        <span className="text-xl font-extrabold tracking-tight text-[var(--text)]">
          Live<span className="text-[var(--primary)]">sov</span>
        </span>

        {/* Brand selector */}
        <div className="hidden sm:block">
          <select className="min-w-[160px] max-w-[220px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] py-[5px] px-2.5 font-sans text-xs rounded-md focus:border-[var(--primary)] focus:outline-none transition">
            <option>-- Select brand --</option>
          </select>
        </div>

        {/* Add Brand button */}
        <button className="hidden md:inline-flex items-center px-4 py-[7px] bg-[var(--primary)] text-white text-[11px] font-bold tracking-wider rounded-md shadow-[0_1px_2px_rgba(255,97,84,.2)] hover:bg-[var(--primary-hover)] hover:-translate-y-px hover:shadow-[0_2px_6px_rgba(255,97,84,.3)] transition">
          + ADD BRAND
        </button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <LanguageSwitcher variant="light" />

        <span className="hidden lg:inline text-[11px] font-mono text-[var(--muted)]">{user?.email}</span>

        {/* Notification bell */}
        <button className="relative border border-[var(--border)] text-[var(--muted)] text-sm px-2 py-1 rounded-md hover:border-[var(--primary)] hover:text-[var(--primary)] transition leading-none" aria-label="Notifications">
          &#128276;
        </button>

        {/* Plan badge */}
        <span className={`text-[9px] font-bold font-mono px-2.5 py-[3px] rounded-full uppercase tracking-wider border cursor-pointer hover:opacity-70 transition ${
          user?.plan === 'agency'
            ? 'bg-[rgba(99,102,241,.08)] text-[#6366f1] border-[#6366f1]'
            : user?.plan === 'pro'
              ? 'bg-[var(--primary-light)] text-[var(--primary)] border-[var(--primary-border)]'
              : 'bg-[var(--primary-light)] text-[var(--primary)] border-[var(--primary-border)]'
        }`}>
          {(user?.plan || 'FREE').toUpperCase()}
        </span>

        {/* Logout */}
        <button onClick={logout} className="hidden md:inline font-mono text-[10px] text-[var(--muted)] hover:text-[var(--text)] transition">
          LOGOUT
        </button>
      </div>
    </header>
  );
}
