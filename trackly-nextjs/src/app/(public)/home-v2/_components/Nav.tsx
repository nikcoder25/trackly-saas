'use client';

import Link from 'next/link';
import { useState } from 'react';

const navLinks = [
  { href: '#features', label: 'Product' },
  { href: '#pricing', label: 'Pricing' },
  { href: '/blog', label: 'Resources' },
];

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="hp-nav" aria-label="Primary">
      <div className="hp-nav-inner">
        <Link href="/" className="hp-logo" aria-label="Livesov home">
          <span className="hp-logo-dot" aria-hidden="true" />
          Livesov
        </Link>

        <div className={`hp-nav-links${open ? ' is-open' : ''}`}>
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
        </div>

        <span className="hp-nav-spacer" />

        <div className="hp-nav-cta">
          <Link href="/login" className="hp-nav-login">Login</Link>
          <Link href="/signup" className="hp-btn hp-btn-primary">Start free trial</Link>
        </div>

        <button
          type="button"
          className="hp-hamburger"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span /><span /><span />
        </button>
      </div>
    </nav>
  );
}
