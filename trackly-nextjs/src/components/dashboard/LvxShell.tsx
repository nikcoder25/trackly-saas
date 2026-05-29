'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Production dashboard shell — the redesigned (Dashboard.html) chrome wired to
// the app's real auth / brand / run contexts and Next.js routing.
//
// The grid host (.lvx-shell) is intentionally NOT `.lvx`: the legacy routed
// pages it renders keep their own tokens and class rules. Only the chrome
// (topbar / sidebar / subbar) opts into `.lvx` via `display: contents`
// wrappers, so the redesign's scoped styles apply to the chrome without
// leaking into — or being overridden onto — the existing pages.

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useBrands } from '@/contexts/BrandContext';
import { useRun } from '@/contexts/RunContext';
import { Logo } from '@/app/dashboard-v2/ui';
import '@/app/dashboard-v2/dashboard-v2.css';

interface NavItem { id: string; href: string; label: string; badge?: string; adminOnly?: boolean }
const NAV: { label: string; items: NavItem[] }[] = [
  { label: 'Dashboard', items: [
    { id: 'overview', href: '/dashboard', label: 'Overview' },
    { id: 'mentions', href: '/dashboard/mentions', label: 'Mentions' },
    { id: 'proof', href: '/dashboard/proof', label: 'Evidence & Proof' },
    { id: 'platforms', href: '/dashboard/platforms', label: 'Platform Status' },
  ] },
  { label: 'Analysis', items: [
    { id: 'competitors', href: '/dashboard/competitors', label: 'Competitors' },
    { id: 'trends', href: '/dashboard/trends', label: 'SOV Trends' },
    { id: 'accuracy', href: '/dashboard/accuracy', label: 'Accuracy Monitor' },
    { id: 'citations', href: '/dashboard/citations', label: 'Citations' },
    { id: 'results', href: '/dashboard/results', label: 'Results' },
    { id: 'query-tracker', href: '/dashboard/query-tracker', label: 'Query Tracker' },
    { id: 'recommendations', href: '/dashboard/recommendations', label: 'Recommendations' },
  ] },
  { label: 'Tools', items: [
    { id: 'geo-audit', href: '/dashboard/geo-audit', label: 'GEO Audit' },
    { id: 'regional', href: '/dashboard/geo-audits', label: 'Regional Audits' },
  ] },
  { label: 'Settings', items: [
    { id: 'setup', href: '/dashboard/setup', label: 'Brand Setup' },
    { id: 'prompts', href: '/dashboard/prompts', label: 'Tracked Prompts' },
    { id: 'account', href: '/dashboard/account', label: 'Account & Plan' },
    { id: 'billing', href: '/dashboard/billing', label: 'Billing & Usage' },
    { id: 'alerts', href: '/dashboard/alerts', label: 'Alerts' },
    { id: 'admin', href: '/dashboard/admin', label: 'Admin Panel', adminOnly: true },
  ] },
];
const ALL_ITEMS = NAV.flatMap(g => g.items.map(it => ({ ...it, group: g.label })));

// Routes whose page already renders the redesigned (.lvx) layout and owns its
// own padding. These bypass the legacy `.lvx-shell-content` padding wrapper so
// they line up with the Overview. Add a route here once its page is themed.
const THEMED_ROUTES = new Set<string>([
  '/dashboard',
  '/dashboard/mentions',
  '/dashboard/competitors',
  '/dashboard/citations',
  '/dashboard/platforms',
  '/dashboard/trends',
  '/dashboard/accuracy',
  '/dashboard/results',
  '/dashboard/query-tracker',
  '/dashboard/recommendations',
  '/dashboard/proof',
]);

function NavIcon({ id }: { id: string }) {
  const s: any = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (id) {
    case 'overview': return <svg {...s}><rect x="2" y="2" width="4" height="4" /><rect x="8" y="2" width="4" height="4" /><rect x="2" y="8" width="4" height="4" /><rect x="8" y="8" width="4" height="4" /></svg>;
    case 'mentions': return <svg {...s}><path d="M2 4h10v6h-5l-3 2v-2H2z" /></svg>;
    case 'proof': return <svg {...s}><path d="M2 3h7l3 3v7H2z" /><path d="M9 3v3h3" /><path d="M5 8l2 2 3-3" /></svg>;
    case 'platforms': return <svg {...s}><circle cx="7" cy="7" r="5" /><path d="M2 7h10M7 2c1.5 2 1.5 8 0 10M7 2c-1.5 2-1.5 8 0 10" /></svg>;
    case 'competitors': return <svg {...s}><path d="M3 11V5l4-3 4 3v6" /><path d="M3 11h8" /></svg>;
    case 'trends': return <svg {...s}><path d="M2 11l3-3 2 2 5-5" /><path d="M12 5h-2V3" /></svg>;
    case 'accuracy': return <svg {...s}><circle cx="7" cy="7" r="5" /><path d="M5 7l2 2 3-3" /></svg>;
    case 'citations': return <svg {...s}><path d="M2 5c1-2 3-2 4-2v3c-1 0-2.5.5-2.5 2v2H2zM7.5 5c1-2 3-2 4-2v3c-1 0-2.5.5-2.5 2v2H7.5z" /></svg>;
    case 'results': return <svg {...s}><path d="M2 4h10M2 7h10M2 10h7" /></svg>;
    case 'query-tracker': return <svg {...s}><circle cx="6" cy="6" r="4" /><path d="M9 9l3 3" /></svg>;
    case 'recommendations': return <svg {...s}><path d="M7 2l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" /></svg>;
    case 'geo-audit': return <svg {...s}><circle cx="7" cy="6" r="3" /><path d="M7 9v3M4 12h6" /></svg>;
    case 'regional': return <svg {...s}><circle cx="7" cy="7" r="5" /><path d="M2 7h10M7 2c2 2 2 8 0 10M7 2c-2 2-2 8 0 10" /></svg>;
    case 'setup': return <svg {...s}><circle cx="7" cy="7" r="2" /><path d="M7 2v1.5M7 10.5V12M2 7h1.5M10.5 7H12M3.5 3.5l1 1M9.5 9.5l1 1M3.5 10.5l1-1M9.5 4.5l1-1" /></svg>;
    case 'prompts': return <svg {...s}><path d="M5 2L3 7l2 5M9 2l2 5-2 5" /></svg>;
    case 'account': return <svg {...s}><circle cx="7" cy="5" r="2.5" /><path d="M3 12c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" /></svg>;
    case 'billing': return <svg {...s}><rect x="2" y="3.5" width="10" height="7" rx="1" /><path d="M2 6h10" /></svg>;
    case 'alerts': return <svg {...s}><path d="M3 6a4 4 0 018 0v2l1 2H2l1-2z" /><path d="M5.5 11.5a1.5 1.5 0 003 0" /></svg>;
    case 'admin': return <svg {...s}><path d="M7 2l4 2v3c0 2.5-1.7 4.2-4 5-2.3-.8-4-2.5-4-5V4z" /></svg>;
    default: return <svg {...s}><circle cx="7" cy="7" r="2" /></svg>;
  }
}

function Lvx({ children }: { children: React.ReactNode }) {
  // display:contents so the wrapped chrome element is the real grid item,
  // while still being a descendant of `.lvx` for scoped styles + tokens.
  return <div className="lvx" style={{ display: 'contents' }}>{children}</div>;
}

function ProdTopbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user } = useAuth();
  const { brands, selectedBrand, selectBrandById, brandLimit } = useBrands();
  const initials = (selectedBrand?.name || 'Br').slice(0, 2).toUpperCase();
  const planLabel = (user?.plan || 'free').toUpperCase();
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button onClick={onMenuToggle} className="icon-btn lvx-hamburger" aria-label="Menu" style={{ display: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
        <Logo size={14} />
        <span className="div" />
        <div className="brand-sel" style={{ position: 'relative' }}>
          <span className="ptile ptile-chatgpt mono" style={{ width: 22, height: 22, fontSize: 9, background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}>{initials}</span>
          <span className="bs-name">{selectedBrand?.name || 'Select brand'}</span>
          <span className="bs-meta">{brands.length} / {brandLimit >= 9999 ? '∞' : brandLimit}</span>
          <span className="bs-caret">▾</span>
          <select aria-label="Select brand" value={selectedBrand?.id || ''} onChange={e => selectBrandById(e.target.value)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}>
            {brands.length === 0 && <option value="">No brands</option>}
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <Link href="/dashboard/setup" className="btn-d" style={{ fontSize: 12 }}>+ Add brand</Link>
        <Link href="/dashboard/query-tracker" className="global-search lvx-search" style={{ display: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>Search prompts, mentions, sources…</span>
          <kbd>⌘ K</kbd>
        </Link>
        <style>{`@media(min-width:1100px){.lvx-search{display:flex!important;}}@media(max-width:1023px){.lvx-hamburger{display:inline-flex!important;}}`}</style>
      </div>
      <div className="topbar-right">
        <Link href="/dashboard/alerts" className="icon-btn" title="Alerts">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 6C3 3.8 4.8 2 7 2C9.2 2 11 3.8 11 6V8L12 10H2L3 8V6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" /><path d="M5.5 11.5C5.5 12.3 6.2 13 7 13C7.8 13 8.5 12.3 8.5 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" /></svg>
        </Link>
        <Link href="/dashboard/billing" className="plan-badge" style={{ textDecoration: 'none' }}>{planLabel}</Link>
        <button className="avatar" title={user?.email || ''}>{user?.name?.[0]?.toUpperCase() || 'U'}</button>
      </div>
    </header>
  );
}

function ProdSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { live, startRun } = useRun();
  const { selectedBrandLocked } = useBrands();
  const isAdmin = user?.role === 'admin' || user?.plan === 'owner';
  const disabled = live.running || selectedBrandLocked;
  return (
    <aside className="sidebar">
      <button className="sb-run" onClick={() => startRun(false)} disabled={disabled}
        title={selectedBrandLocked ? 'This brand is locked — upgrade to run' : undefined}
        style={disabled ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
        {live.running ? <><span className="pulse" /> Running…</> : selectedBrandLocked ? <>🔒 Brand locked</> : <>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 2L10 6L3 10Z" fill="currentColor" /></svg>
          Run all engines
        </>}
      </button>
      {NAV.map(group => (
        <div key={group.label} className="sb-group">
          <div className="sb-group-label">{group.label}</div>
          {group.items.map(it => {
            if (it.adminOnly && !isAdmin) return null;
            const active = pathname === it.href || (it.href !== '/dashboard' && pathname?.startsWith(it.href + '/'));
            return (
              <Link key={it.id} href={it.href} prefetch={false} onClick={onNavigate} className={'sb-item ' + (active ? 'on' : '')}>
                <span className="sb-i"><NavIcon id={it.id} /></span>
                <span>{it.label}</span>
                {it.badge && <span className="sb-badge">{it.badge}</span>}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="sb-foot">
        <span className="av">{user?.name?.[0]?.toUpperCase() || 'U'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || 'User'}</div>
          <div className="plan">{(user?.plan || 'free')} plan</div>
        </div>
        <button className="icon-btn" title="Sign out" onClick={logout}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M5 2H3a1 1 0 00-1 1v7a1 1 0 001 1h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M8 4l3 2.5L8 9M11 6.5H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </aside>
  );
}

function ProdSubbar() {
  const pathname = usePathname();
  const meta = [...ALL_ITEMS].sort((a, b) => b.href.length - a.href.length)
    .find(it => pathname === it.href || pathname?.startsWith(it.href + '/')) || ALL_ITEMS[0];
  return (
    <div className="subbar">
      <div className="breadcrumbs">
        <span>Livesov</span>
        <span className="crumb-sep">/</span>
        <span>{meta.group}</span>
        <span className="crumb-sep">/</span>
        <b>{meta.label}</b>
      </div>
      <div className="subbar-right">
        <span className="subbar-run"><span className="pulse" /> Auto-runs · hourly</span>
      </div>
    </div>
  );
}

export default function LvxShell({ banners, children }: { banners?: React.ReactNode; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();
  const themed = !!pathname && THEMED_ROUTES.has(pathname);
  return (
    <>
      <div className="lvx-shell">
        <Lvx><ProdTopbar onMenuToggle={() => setMobileOpen(o => !o)} /></Lvx>
        <Lvx><ProdSidebar onNavigate={() => setMobileOpen(false)} /></Lvx>
        <main className="lvx-shell-main">
          <Lvx><ProdSubbar /></Lvx>
          {banners && <div className="lvx-shell-banners">{banners}</div>}
          {themed ? children : <div className="lvx-shell-content">{children}</div>}
        </main>
      </div>
      {mobileOpen && (
        <>
          <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: '56px 0 0 0', background: 'rgba(0,0,0,.35)', zIndex: 40 }} />
          <div className="lvx lvx-drawer">
            <ProdSidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </>
      )}
    </>
  );
}
