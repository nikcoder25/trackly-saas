'use client';

import { useAuth } from '@/contexts/AuthContext';

export default function Topbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user } = useAuth();

  return (
    <header className="h-16 bg-[var(--bg2)] border-b border-[var(--border)] flex items-center justify-between px-6">
      {/* Mobile menu button */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden text-[var(--text-muted)] hover:text-white"
        aria-label="Toggle menu"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Brand selector placeholder */}
      <div className="flex-1 lg:ml-0 ml-4">
        <span className="text-sm text-[var(--text-muted)]">
          {user?.plan && user.plan !== 'free' ? (
            <span className="inline-flex items-center gap-1.5 bg-[var(--primary)]/10 text-[var(--primary)] text-xs px-2 py-1 rounded capitalize">
              {user.plan}
            </span>
          ) : null}
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {!user?.emailVerified && (
          <span className="text-xs text-amber-400 bg-amber-900/20 px-2 py-1 rounded">
            Verify email
          </span>
        )}
        <div className="w-8 h-8 bg-[var(--bg3)] rounded-full flex items-center justify-center text-[var(--text-muted)] text-sm">
          {user?.name?.[0]?.toUpperCase() || 'U'}
        </div>
      </div>
    </header>
  );
}
