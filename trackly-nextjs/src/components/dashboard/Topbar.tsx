'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function Topbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <header style={{
      height: 52,
      background: 'var(--bg2)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      zIndex: 10,
    }}>
      {/* Left side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Mobile menu */}
        <button onClick={onMenuToggle} className="lg:hidden" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20 }} aria-label="Menu">
          &#9776;
        </button>

        {/* Logo */}
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -1, color: 'var(--text)' }}>
          Live<span style={{ color: 'var(--primary)' }}>sov</span>
        </span>

        {/* Brand selector */}
        <select style={{
          minWidth: 160, maxWidth: 220, background: 'var(--bg)', border: '1px solid var(--border)',
          color: 'var(--text)', padding: '5px 10px', fontFamily: 'var(--font)', fontSize: 12,
          borderRadius: 'var(--radius-xs)', outline: 'none',
        }}>
          <option>-- Select brand --</option>
        </select>

        {/* Add Brand */}
        <button style={{
          padding: '7px 16px', background: 'var(--primary)', border: 'none', color: '#fff',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.3px', cursor: 'pointer',
          borderRadius: 'var(--radius-xs)', boxShadow: '0 1px 2px rgba(255,97,84,.2)',
        }} className="hidden md:inline-block">
          + ADD BRAND
        </button>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <LanguageSwitcher variant="light" />

        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }} className="hidden lg:inline">
          {user?.email}
        </span>

        {/* Notification bell */}
        <button style={{
          position: 'relative', background: 'none', border: '1px solid var(--border)',
          color: 'var(--muted)', fontSize: 14, cursor: 'pointer', padding: '4px 8px', lineHeight: 1,
          borderRadius: 'var(--radius-xs)',
        }} aria-label="Notifications">
          &#128276;
        </button>

        {/* Plan badge */}
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
          padding: '3px 10px', background: 'var(--primary-light)',
          border: '1px solid var(--primary-border)', color: 'var(--primary)',
          textTransform: 'uppercase', cursor: 'pointer', borderRadius: 100,
        }}>
          {(user?.plan || 'FREE').toUpperCase()}
        </span>

        {/* Logout */}
        <button onClick={logout} style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)',
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
        }} className="hidden md:inline">
          LOGOUT
        </button>
      </div>
    </header>
  );
}
