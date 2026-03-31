'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import AddBrandModal from '@/components/dashboard/AddBrandModal';

interface Brand { id: string; name: string; }

export default function Topbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user, logout } = useAuth();
  // Language removed from dashboard
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [showNotifs, setShowNotifs] = useState(false);
  const [showAddBrand, setShowAddBrand] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close notification on outside click
  useEffect(() => {
    if (!showNotifs) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotifs]);

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const b = d.brands || [];
        setBrands(b);
        if (b.length) setSelectedId(b[0].id);
      })
      .catch(() => {});
  }, []);

  return (
    <>
    <header className="topbar">
      {/* Left side */}
      <div className="topbar-left">
        <button onClick={onMenuToggle} className="land-hamburger" style={{ display: 'none' }} aria-label="Menu">
          <span /><span /><span />
        </button>
        <style>{`@media(max-width:1023px){.topbar .land-hamburger{display:flex!important;}}`}</style>

        <span className="topbar-logo">Live<span>sov</span></span>

        {/* Brand selector — connected to real data */}
        <div className="topbar-brand-sel">
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
            {brands.length === 0 && <option value="">-- Select brand --</option>}
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <button onClick={() => setShowAddBrand(true)} className="add-brand-btn" style={{ display: 'none', cursor: 'pointer' }}>+ ADD BRAND</button>
        <style>{`@media(min-width:768px){.add-brand-btn{display:inline-block!important;}}`}</style>
      </div>

      {/* Right side */}
      <div className="topbar-right">
        <span className="user-badge" style={{ display: 'none' }}>{user?.email}</span>
        <style>{`@media(min-width:1024px){.user-badge{display:inline!important;}}`}</style>

        {/* Notification bell with dropdown */}
        <div ref={notifRef} style={{ position: 'relative', zIndex: 200 }}>
          <button className="notif-bell" aria-label="Notifications" onClick={(e) => { e.stopPropagation(); setShowNotifs(!showNotifs); }}
            style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 14, cursor: 'pointer', padding: '4px 8px', lineHeight: 1, borderRadius: 'var(--radius-xs)' }}>
            🔔
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
              <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>No new notifications.</p>
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
        <style>{`@media(min-width:768px){.logout-btn{display:inline!important;}}`}</style>
      </div>
    </header>
    {showAddBrand && (
      <AddBrandModal
        onClose={() => setShowAddBrand(false)}
        onCreated={(brand) => {
          setBrands(prev => [...prev, brand]);
          setSelectedId(brand.id);
          setShowAddBrand(false);
        }}
      />
    )}
    </>
  );
}
