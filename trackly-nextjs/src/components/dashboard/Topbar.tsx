'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBrands } from '@/contexts/BrandContext';
import { useRun } from '@/contexts/RunContext';
import Link from 'next/link';
import AddBrandModal from '@/components/dashboard/AddBrandModal';
import { useNotifications } from '@/hooks/useNotifications';

export default function Topbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user, logout } = useAuth();
  const { brands, selectedBrand, setSelectedBrand, selectBrandById, refreshBrands, plan, brandLimit, overLimit, error: brandsError } = useBrands();
  const { startRun } = useRun();
  const startRunRef = useRef(startRun);
  useEffect(() => { startRunRef.current = startRun; }, [startRun]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [showLimitPrompt, setShowLimitPrompt] = useState(false);
  const { notifications, unreadCount, markRead } = useNotifications();
  const notifRef = useRef<HTMLDivElement>(null);
  const limitRef = useRef<HTMLDivElement>(null);

  const atBrandLimit = brands.length >= brandLimit;

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showNotifs && !showLimitPrompt) return;
    const handler = (e: MouseEvent) => {
      if (showNotifs && notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
      if (showLimitPrompt && limitRef.current && !limitRef.current.contains(e.target as Node)) setShowLimitPrompt(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotifs, showLimitPrompt]);


  const handleAddBrandClick = () => {
    if (atBrandLimit) {
      setShowLimitPrompt(true);
    } else {
      setShowAddBrand(true);
    }
  };

  return (
    <>
    <header className="topbar">
      {/* Left side */}
      <div className="topbar-left">
        <button onClick={onMenuToggle} className="land-hamburger" style={{ display: 'none' }} aria-label="Menu">
          <span /><span /><span />
        </button>
        <style>{`@media(max-width:1023px){.topbar .land-hamburger{display:flex!important;}}@media(max-width:767px){.topbar-brand-sel select{max-width:120px;font-size:12px;}}`}</style>

        <span className="topbar-logo">Live<span>sov</span></span>

        {/* Brand selector - reads from BrandContext */}
        <div className="topbar-brand-sel">
          <select value={selectedBrand?.id || ''} onChange={e => selectBrandById(e.target.value)} aria-label="Select brand" disabled={!!brandsError}>
            {brands.length === 0 && <option value="">{brandsError ? 'Unavailable' : '-- Select brand --'}</option>}
            {brands.map(b => <option key={b.id} value={b.id}>{b.lockedByPlan ? '🔒 ' : ''}{b.name}</option>)}
          </select>
          {brandsError && (
            <span role="alert" style={{ marginLeft: 8, fontSize: 11, color: 'var(--danger, #c00)' }}>
              {brandsError}{' '}
              <button
                onClick={() => refreshBrands()}
                style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}
              >
                Retry
              </button>
            </span>
          )}
        </div>

        {/* Add Brand button with limit-aware behavior */}
        <div style={{ position: 'relative' }} ref={limitRef}>
          <button
            onClick={handleAddBrandClick}
            className="add-brand-btn"
            style={{
              display: 'none',
              cursor: 'pointer',
              opacity: atBrandLimit ? 0.5 : 1,
            }}
          >
            + ADD BRAND
            {atBrandLimit && (
              <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.7 }}>
                ({brands.length}/{brandLimit})
              </span>
            )}
          </button>
          <style>{`@media(min-width:1024px){.add-brand-btn{display:inline-block!important;}}`}</style>

          {/* Upgrade prompt dropdown */}
          {showLimitPrompt && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 8,
              width: 300, background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', boxShadow: '0 8px 30px rgba(0,0,0,.12)',
              zIndex: 9999, padding: 20, textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🚀</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                Brand Limit Reached
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
                Your <strong>{plan}</strong> plan allows up to <strong>{brandLimit} brand{brandLimit !== 1 ? 's' : ''}</strong>.
                Upgrade your plan to add more brands.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowLimitPrompt(false)}
                  style={{ flex: 1, padding: '8px 12px', background: 'var(--bg3)', color: 'var(--muted)', fontSize: 12, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <Link
                  href="/dashboard/account"
                  onClick={() => setShowLimitPrompt(false)}
                  style={{ flex: 1, padding: '8px 12px', background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}
                >
                  Upgrade Plan
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right side */}
      <div className="topbar-right">
        <span className="user-badge" style={{ display: 'none' }}>{user?.email}</span>
        <style>{`@media(min-width:1024px){.user-badge{display:inline!important;}}`}</style>

        {/* Notification bell with dropdown */}
        <div ref={notifRef} style={{ position: 'relative', zIndex: 200 }}>
          <button className="notif-bell" aria-label="Notifications" onClick={(e) => { e.stopPropagation(); setShowNotifs(!showNotifs); }}
            style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 14, cursor: 'pointer', padding: '4px 8px', lineHeight: 1, borderRadius: 'var(--radius-xs)', position: 'relative' }}>
            🔔
            {unreadCount > 0 && (
              <span aria-label={`${unreadCount} unread notifications`} style={{
                position: 'absolute', top: -4, right: -4, background: 'var(--primary)',
                color: '#fff', fontSize: 9, fontWeight: 700, minWidth: 16, height: 16,
                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px', lineHeight: 1,
              }}>
                {unreadCount}
              </span>
            )}
          </button>
          {showNotifs && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 8,
              width: 300, background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', boxShadow: '0 8px 30px rgba(0,0,0,.12)',
              zIndex: 9999, padding: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Notifications</div>
                <Link href="/dashboard/alerts" onClick={() => setShowNotifs(false)} style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--primary)', textDecoration: 'none' }}>VIEW ALL →</Link>
              </div>
              {notifications.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>No new notifications.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                  {notifications.slice(0, 10).map(n => {
                    const rowStyle: React.CSSProperties = {
                      fontSize: 12,
                      color: n.read ? 'var(--muted)' : 'var(--text)',
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border)',
                      fontWeight: n.read ? 400 : 600,
                      textDecoration: 'none',
                      display: 'block',
                    };
                    const inner = (
                      <>
                        <div>{n.message}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                          {new Date(n.created_at).toLocaleString()}
                        </div>
                      </>
                    );
                    if (n.href) {
                      return (
                        <Link
                          key={n.id}
                          href={n.href}
                          style={rowStyle}
                          onClick={() => { markRead(n.id); setShowNotifs(false); }}
                        >
                          {inner}
                        </Link>
                      );
                    }
                    return (
                      <div key={n.id} style={rowStyle} onClick={() => markRead(n.id)}>
                        {inner}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Plan badge */}
        <Link href="/dashboard/billing" prefetch={false} style={{ textDecoration: 'none' }}
          onMouseEnter={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '0.7'; (e.currentTarget.firstChild as HTMLElement).style.textDecoration = 'underline'; }}
          onMouseLeave={e => { (e.currentTarget.firstChild as HTMLElement).style.opacity = '1'; (e.currentTarget.firstChild as HTMLElement).style.textDecoration = 'none'; }}>
          <span className={`plan-badge ${user?.plan === 'pro' ? 'pro' : user?.plan === 'agency' ? 'agency' : ''}`} style={{ cursor: 'pointer' }}>
            {(user?.plan || 'FREE').toUpperCase()}
          </span>
        </Link>

        <button onClick={logout} className="logout-btn" style={{ display: 'none' }}>
          LOGOUT
        </button>
        <style>{`@media(min-width:1024px){.logout-btn{display:inline!important;}}`}</style>
      </div>
    </header>
    {showAddBrand && (
      <AddBrandModal
        onClose={() => setShowAddBrand(false)}
        onCreated={(brand) => {
          setShowAddBrand(false);
          setSelectedBrand(brand);
          // Pass brandId so the auto-run targets the brand we just created
          // rather than racing the selectedBrand closure update.
          refreshBrands().then(() => {
            setTimeout(() => startRunRef.current(false, { auto: true, brandId: brand.id }), 600);
          });
        }}
      />
    )}
    </>
  );
}
