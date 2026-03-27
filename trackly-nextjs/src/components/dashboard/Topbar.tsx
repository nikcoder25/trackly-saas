'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function Topbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <header className="topbar">
      {/* Left side */}
      <div className="topbar-left">
        {/* Mobile menu */}
        <button onClick={onMenuToggle} className="land-hamburger" style={{ display: 'none' }} aria-label="Menu">
          <span /><span /><span />
        </button>
        <style>{`@media(max-width:1023px){.topbar .land-hamburger{display:flex!important;}}`}</style>

        {/* Logo */}
        <span className="topbar-logo">Live<span>sov</span></span>

        {/* Brand selector */}
        <div className="topbar-brand-sel">
          <select>
            <option>-- Select brand --</option>
          </select>
        </div>

        {/* Add Brand */}
        <button className="add-brand-btn" style={{ display: 'none' }}>+ ADD BRAND</button>
        <style>{`@media(min-width:768px){.add-brand-btn{display:inline-block!important;}}`}</style>
      </div>

      {/* Right side */}
      <div className="topbar-right">
        <LanguageSwitcher variant="light" />

        <span className="user-badge" style={{ display: 'none' }}>{user?.email}</span>
        <style>{`@media(min-width:1024px){.user-badge{display:inline!important;}}`}</style>

        {/* Notification bell */}
        <button className="notif-bell" aria-label="Notifications">&#128276;</button>

        {/* Plan badge */}
        <span className={`plan-badge ${user?.plan === 'pro' ? 'pro' : user?.plan === 'agency' ? 'agency' : ''}`}>
          {(user?.plan || 'FREE').toUpperCase()}
        </span>

        {/* Logout */}
        <button onClick={logout} className="logout-btn" style={{ display: 'none' }}>
          {t.dashboard.signOut}
        </button>
        <style>{`@media(min-width:768px){.logout-btn{display:inline!important;}}`}</style>
      </div>
    </header>
  );
}
