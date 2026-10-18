'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { MARKETING_NAV_LINKS } from '@/lib/marketing-nav';

export function SiteLogo() {
  return (
    <>
      <span className="ls-logo-mk" aria-hidden="true"><i /></span>
      livesov
    </>
  );
}

/* In-page smooth scroll when a link's hash target exists on this page
   (homepage: /#how-it-works). Falls through to navigation. */
function smoothScrollTo(e: React.MouseEvent<HTMLAnchorElement>) {
  const href = e.currentTarget.getAttribute('href') || '';
  const i = href.indexOf('#');
  if (i === -1) return;
  const el = document.querySelector(href.slice(i));
  if (el) {
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* Header links come from MARKETING_NAV_LINKS (pinned by
   tests/header-canonical-links): interior pages render `href`, the homepage
   prefers the in-page `homeHref` anchor. */
export default function SiteHeader() {
  const pathname = usePathname() || '/';
  const isHome = pathname === '/' || pathname === '/home';
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className={'ls-nav' + (open ? ' open' : '')}>
      <div className="ls-wrap ls-nav-inner">
        <Link href="/" className="ls-logo" aria-label="Livesov home"><SiteLogo /></Link>
        <nav aria-label="Main">
          <ul className="ls-nav-links">
            {MARKETING_NAV_LINKS.map((link) => {
              const href = isHome ? (link.homeHref ?? link.href) : link.href;
              const active = !link.href.includes('#') && pathname.startsWith(link.href);
              return (
                <li key={link.href}>
                  <Link href={href} onClick={smoothScrollTo} aria-current={active ? 'page' : undefined}>{link.label}</Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ls-nav-cta">
          <Link href="/login" className="ls-nav-signin">Sign in</Link>
          <Link href="/signup" className="ls-btn ls-btn-pri">Start free trial</Link>
          <button
            type="button"
            className="ls-burger"
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="ls-sheet"
            onClick={() => setOpen((o) => !o)}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>
      <div className="ls-sheet" id="ls-sheet">
        <ul>
          {MARKETING_NAV_LINKS.map((link) => {
            const href = isHome ? (link.homeHref ?? link.href) : link.href;
            return (
              <li key={link.href}>
                <Link href={href} onClick={(e) => { smoothScrollTo(e); close(); }}>{link.label}</Link>
              </li>
            );
          })}
        </ul>
        <div className="ls-sheet-cta">
          <Link href="/login" className="ls-btn ls-btn-out" onClick={close}>Sign in</Link>
          <Link href="/signup" className="ls-btn ls-btn-pri" onClick={close}>Start free trial</Link>
        </div>
      </div>
    </header>
  );
}
