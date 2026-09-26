'use client';
// v3 dashboard chrome: grouped sidebar, 68px topbar, phone drawer and bottom
// tab bar. Wired to the same auth / brand / run contexts as the classic
// LvxShell; the routed pages render unchanged inside it.

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useBrands } from '@/contexts/BrandContext';
import { useRun, markPendingFirstRun } from '@/contexts/RunContext';
import AddBrandModal from '@/components/dashboard/AddBrandModal';
import CommandPalette from '@/components/dashboard/CommandPalette';
import {
  V3_SECTIONS, V3_BOTTOM_TABS, v3TabForPath, v3VisibleTabs, type V3Section, type V3SectionId,
} from '@/lib/dashboard-nav-v3';
import { V3Icon, type V3IconName } from './icons';
import { v3FontVars } from './fonts';
import AccountMenu from './AccountMenu';
import { OpenRecsProvider, useOpenRecommendations, lastRunMs, agoLabel, nextScanMs, untilLabel, initials } from './hooks';
import './v3.css';

const SECTION_ICON: Record<V3SectionId, V3IconName> = {
  overview: 'overview', prompts: 'prompts', competitors: 'competitors', sources: 'sources',
  fixes: 'fixes', reports: 'reports', audits: 'audits', settings: 'settings',
};

function useIsAdmin() {
  const { user } = useAuth();
  return user?.role === 'admin' || user?.plan === 'owner';
}

/** Re-render once a minute so "X ago" labels stay current. */
function useMinuteTick() {
  const [, set] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => set(n => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

/* ─────────────────────────── brand selector ─────────────────────────── */

function BrandMenu({ onAddBrand, compact = false, onPicked }: { onAddBrand: () => void; compact?: boolean; onPicked?: () => void }) {
  const { brands, selectedBrand, selectBrandById, brandLimit, loading } = useBrands();
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  const atLimit = brands.length >= brandLimit;
  const name = selectedBrand?.name || (loading ? 'Loading…' : 'Add your first brand');
  const city = (selectedBrand as Record<string, unknown> | null)?.city as string | undefined;
  const countLabel = loading ? '' : `${brands.length} brand${brands.length === 1 ? '' : 's'}`;

  return (
    <div className={'v3-brand' + (compact ? ' compact' : '')} ref={ref}>
      <button type="button" className="v3-brand-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="v3-brand-tile">{initials(selectedBrand?.name)}</span>
        <span className="v3-brand-txt">
          <span className="v3-brand-name">{name}</span>
          {!compact && <span className="v3-brand-meta">{[city, countLabel].filter(Boolean).join(' · ')}</span>}
        </span>
        <V3Icon name="chevron-down" size={16} className="v3-brand-caret" />
      </button>
      {open && (
        <div className="v3-menu v3-brand-menu" role="menu">
          <div className="v3-menu-label">Your brands</div>
          {brands.map(b => (
            <button key={b.id} type="button" role="menuitemradio" aria-checked={b.id === selectedBrand?.id}
              className={'v3-menu-item' + (b.id === selectedBrand?.id ? ' on' : '')}
              onClick={() => { selectBrandById(b.id); setOpen(false); onPicked?.(); }}>
              <span className="v3-brand-tile sm">{initials(b.name)}</span>
              <span className="v3-menu-grow">{b.name}</span>
              {b.id === selectedBrand?.id && <V3Icon name="check" size={16} />}
            </button>
          ))}
          <div className="v3-menu-sep" />
          {atLimit ? (
            <Link href="/dashboard/account" className="v3-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <V3Icon name="plus" size={16} /><span className="v3-menu-grow">Upgrade to add brands</span>
              <span className="v3-mono v3-dim">{brands.length}/{brandLimit >= 9999 ? '∞' : brandLimit}</span>
            </Link>
          ) : (
            <button type="button" className="v3-menu-item" role="menuitem" onClick={() => { setOpen(false); onAddBrand(); }}>
              <V3Icon name="plus" size={16} /><span className="v3-menu-grow">Add brand</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── sidebar ─────────────────────────── */

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  const { count, available } = useOpenRecommendations();
  const current = v3TabForPath(pathname)?.section.id;

  const row = (s: V3Section) => {
    const tabs = v3VisibleTabs(s, isAdmin);
    if (tabs.length === 0) return null;
    const on = current === s.id;
    return (
      <div key={s.id} className="v3-nav-group">
        <Link href={tabs[0].href} prefetch={false} onClick={onNavigate} className={'v3-nav-item' + (on ? ' on' : '')}
          aria-current={on ? 'page' : undefined}>
          <V3Icon name={SECTION_ICON[s.id]} size={18} />
          <span className="v3-menu-grow">{s.label}</span>
          {s.id === 'fixes' && available && count > 0 && <span className="v3-nav-badge" aria-label={`${count} open`}>{count}</span>}
        </Link>
        {on && tabs.length > 1 && (
          <div className="v3-nav-sub">
            {tabs.map(t => {
              const tOn = v3TabForPath(pathname)?.tab.href === t.href;
              return (
                <Link key={t.href} href={t.href} prefetch={false} onClick={onNavigate} className={'v3-nav-subitem' + (tOn ? ' on' : '')}>
                  {t.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <nav className="v3-nav" aria-label="Dashboard">
      <div className="v3-nav-main">{V3_SECTIONS.filter(s => !s.bottom).map(row)}</div>
      <div className="v3-nav-bottom">{V3_SECTIONS.filter(s => s.bottom).map(row)}</div>
    </nav>
  );
}

function ScanCard() {
  const { selectedBrand, selectedBrandLocked, plan } = useBrands();
  const { live, startRun, pct } = useRun();
  useMinuteTick();
  const disabled = live.running || selectedBrandLocked || !selectedBrand;
  const next = nextScanMs(selectedBrand as Record<string, unknown> | null, plan);
  return (
    <div className="v3-scan-card">
      <div className="v3-eyebrow">Next automatic scan</div>
      <div className="v3-scan-when">{selectedBrand ? untilLabel(next) : 'Add a brand to start'}</div>
      <button type="button" className="v3-btn v3-btn-dark v3-btn-block" onClick={() => startRun(false)} disabled={disabled}
        title={selectedBrandLocked ? 'This brand is locked - upgrade to run' : undefined}>
        {live.running
          ? <><span className="v3-pulse" /> Scanning… {pct}%</>
          : selectedBrandLocked ? 'Brand locked' : <><V3Icon name="play" size={16} /> Scan all engines now</>}
      </button>
    </div>
  );
}

function Sidebar({ onNavigate, onAddBrand }: { onNavigate?: () => void; onAddBrand: () => void }) {
  return (
    <aside className="v3-sidebar">
      <Link href="/dashboard" className="v3-logo" onClick={onNavigate} aria-label="Livesov home">
        <span className="v3-logo-mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 9h2l2-5 3 9 2-6 1 2h2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span>livesov</span>
      </Link>
      <BrandMenu onAddBrand={onAddBrand} onPicked={onNavigate} />
      <SidebarNav onNavigate={onNavigate} />
      <ScanCard />
    </aside>
  );
}

/* ─────────────────────────── topbar ─────────────────────────── */

function Topbar({ onMenu, menuOpen, onSearch, onAddBrand }: { onMenu: () => void; menuOpen: boolean; onSearch: () => void; onAddBrand: () => void }) {
  const { selectedBrand } = useBrands();
  const { live } = useRun();
  useMinuteTick();
  const last = lastRunMs(selectedBrand as Record<string, unknown> | null);
  return (
    <header className="v3-topbar">
      <button type="button" className="v3-icon-btn v3-only-drawer" onClick={onMenu} aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen} aria-controls="v3-drawer">
        <V3Icon name="menu" size={20} />
      </button>
      <div className="v3-only-phone v3-top-brand"><BrandMenu onAddBrand={onAddBrand} compact /></div>
      <button type="button" className="v3-search v3-hide-phone" onClick={onSearch} aria-label="Search prompts, mentions and sources"
        aria-keyshortcuts="Meta+K Control+K">
        <V3Icon name="search" size={18} />
        <span className="v3-search-ph">Search prompts, mentions, sources</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="v3-top-right">
        <span className="v3-last-scan v3-hide-phone" title={last ? new Date(last).toLocaleString() : undefined}>
          <span className={'v3-dot' + (live.running ? ' live' : last ? '' : ' off')} />
          {live.running ? 'Scanning now' : `Last scan ${agoLabel(last)}`}
        </span>
        <button type="button" className="v3-icon-btn v3-only-phone" onClick={onSearch} aria-label="Search">
          <V3Icon name="search" size={20} />
        </button>
        <Link href="/dashboard/alerts" className="v3-icon-btn v3-hide-phone" aria-label="Alerts" title="Alerts">
          <V3Icon name="bell" size={20} />
        </Link>
        <AccountMenu variant="v3" />
      </div>
    </header>
  );
}

/* ─────────────────────────── tabs + bottom bar ─────────────────────────── */

function SectionTabs() {
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  const match = v3TabForPath(pathname);
  if (!match) return null;
  const tabs = v3VisibleTabs(match.section, isAdmin);
  if (tabs.length < 2) return null;
  return (
    <div className="v3-tabs-wrap">
      <nav className="v3-tabs" aria-label={match.section.label}>
        {tabs.map(t => (
          <Link key={t.href} href={t.href} prefetch={false} className={'v3-tab' + (t.href === match.tab.href ? ' on' : '')}
            aria-current={t.href === match.tab.href ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function BottomBar() {
  const pathname = usePathname();
  const current = v3TabForPath(pathname)?.section.id;
  const { count, available } = useOpenRecommendations();
  return (
    <nav className="v3-bottombar" aria-label="Quick navigation">
      {V3_BOTTOM_TABS.map(id => {
        const s = V3_SECTIONS.find(x => x.id === id)!;
        const on = current === id;
        return (
          <Link key={id} href={s.tabs[0].href} prefetch={false} className={'v3-bb-item' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined}>
            <span className="v3-bb-icon">
              <V3Icon name={SECTION_ICON[id]} size={20} />
              {id === 'fixes' && available && count > 0 && <span className="v3-bb-badge">{count}</span>}
            </span>
            <span>{s.short || s.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/* ─────────────────────────── shell ─────────────────────────── */

export default function ShellV3({ banners, children }: { banners?: React.ReactNode; children: React.ReactNode }) {
  const [drawer, setDrawer] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [showAddBrand, setShowAddBrand] = React.useState(false);
  const { setSelectedBrand, refreshBrands, selectedBrand } = useBrands();
  const pathname = usePathname();
  const close = React.useCallback(() => setDrawer(false), []);

  React.useEffect(() => { setDrawer(false); }, [pathname]);

  React.useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    const main = document.querySelector<HTMLElement>('.v3-main');
    const prev = [document.body.style.overflow, main?.style.overflow ?? ''];
    document.body.style.overflow = 'hidden';
    if (main) main.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev[0];
      if (main) main.style.overflow = prev[1];
    };
  }, [drawer]);

  const openAddBrand = React.useCallback(() => { setDrawer(false); setShowAddBrand(true); }, []);

  return (
    <OpenRecsProvider brandId={selectedBrand?.id}>
    <div className={`v3 ${v3FontVars}`} data-ui="v3">
      <div className="v3-shell">
        <div className="v3-side-col"><Sidebar onAddBrand={openAddBrand} /></div>
        <div className="v3-main-col">
          <Topbar onMenu={() => setDrawer(o => !o)} menuOpen={drawer} onSearch={() => setSearchOpen(true)} onAddBrand={openAddBrand} />
          <main className="v3-main">
            <div className="v3-content">
              <SectionTabs />
              {banners && <div className="v3-banners">{banners}</div>}
              {children}
            </div>
          </main>
        </div>
      </div>
      <BottomBar />
      <div className={'v3-backdrop' + (drawer ? ' open' : '')} onClick={close} aria-hidden="true" />
      <div id="v3-drawer" className={'v3-drawer' + (drawer ? ' open' : '')} role="dialog" aria-modal={drawer}
        aria-label="Navigation" aria-hidden={!drawer} inert={!drawer}>
        <button type="button" className="v3-icon-btn v3-drawer-close" onClick={close} aria-label="Close menu">
          <V3Icon name="close" size={20} />
        </button>
        <Sidebar onNavigate={close} onAddBrand={openAddBrand} />
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      {showAddBrand && (
        <AddBrandModal
          onClose={() => setShowAddBrand(false)}
          onCreated={(brand) => {
            setShowAddBrand(false);
            setSelectedBrand(brand);
            markPendingFirstRun(brand.id);
            refreshBrands();
          }}
        />
      )}
    </div>
    </OpenRecsProvider>
  );
}
