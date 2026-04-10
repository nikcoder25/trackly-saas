'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CookiePreferencesButton } from '@/components/CookieConsent';

interface SeoLayoutProps {
  children: React.ReactNode;
}

const navLinks = [
  { href: '/#features', label: 'Features' },
  { href: '/how-it-works', label: 'How it Works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/geo-audit', label: 'GEO Audit' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
];

export default function SeoLayout({ children }: SeoLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div id="landing-page">
      <a href="#main-content" className="skip-to-content">Skip to content</a>

      {/* Nav — uses legacy .land-nav classes */}
      <nav className="land-nav">
        <Link href="/" className="land-nav-logo" style={{ textDecoration: 'none' }}>
          Live<span>sov</span>
        </Link>

        {/* Hamburger button for mobile */}
        <button
          className="land-hamburger"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
          aria-controls="land-nav-links"
        >
          <span /><span /><span />
        </button>

        <div id="land-nav-links" className={`land-nav-links${menuOpen ? ' open' : ''}`}>
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</Link>
          ))}
        </div>
        <div className="land-nav-right">
          <Link href="/login" className="land-btn land-btn-ghost">Login</Link>
          <Link href="/signup" className="land-btn land-btn-primary">Get Started</Link>
        </div>
      </nav>

      {/* Content */}
      <main id="main-content">{children}</main>

      {/* CTA */}
      <section className="land-cta-section">
        <h2>Ready to track your AI visibility?</h2>
        <div className="section-sub">Monitor your brand across ChatGPT, Perplexity, Claude, Gemini, Grok & Google AI Overviews.</div>
        <Link href="/signup" className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 16 }}>
          Get Started
        </Link>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 16 }}>No credit card required.</p>
      </section>

      {/* Footer */}
      <footer className="land-footer">
        <div className="land-footer-grid">
          <div className="land-footer-brand">
            <div className="land-footer-logo">Live<span>sov</span></div>
            <div className="land-footer-desc">AI Visibility Tracker &mdash; Track how AI platforms mention your brand across ChatGPT, Perplexity, Claude, Gemini, Grok &amp; Google AI Overviews.</div>
          </div>
          <div className="land-footer-col">
            <h4>Product</h4>
            <Link href="/#features">Features</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/how-it-works">How it Works</Link>
            <Link href="/integrations">Integrations</Link>
          </div>
          <div className="land-footer-col">
            <h4>Resources</h4>
            <Link href="/blog">Blog</Link>
            <Link href="/geo-optimization">GEO Guide</Link>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/changelog">Changelog</Link>
            <Link href="/partners">Partners</Link>
            <Link href="/vs/ahrefs">Livesov vs Ahrefs</Link>
            <Link href="/vs/semrush">Livesov vs Semrush</Link>
          </div>
          <div className="land-footer-col">
            <h4>AI Platforms</h4>
            <Link href="/chatgpt-brand-tracking">ChatGPT Tracking</Link>
            <Link href="/perplexity-brand-tracking">Perplexity Tracking</Link>
            <Link href="/claude-brand-tracking">Claude Tracking</Link>
            <Link href="/gemini-brand-tracking">Gemini Tracking</Link>
            <Link href="/grok-brand-tracking">Grok Tracking</Link>
          </div>
          <div className="land-footer-col">
            <h4>Legal</h4>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/cookies">Cookie Policy</Link>
          </div>
        </div>
        <div className="land-footer-bottom">
          <div className="land-footer-text">&copy; {new Date().getFullYear()} Livesov. All rights reserved.</div>
          <CookiePreferencesButton />
          <div className="land-footer-social">
            <a href="mailto:hello@livesov.com" aria-label="Email">✉</a>
            <a href="https://x.com/livesov" target="_blank" rel="noopener noreferrer" aria-label="X">𝕏</a>
            <a href="https://linkedin.com/company/livesov" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">in</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function SeoHero({ title, subtitle, ctaText, ctaHref, hideCta }: { title: React.ReactNode; subtitle: string; ctaText?: string; ctaHref?: string; hideCta?: boolean }) {
  return (
    <section className="land-hero" style={{ paddingTop: 60, paddingBottom: 48 }}>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {!hideCta && (
        <Link href={ctaHref || '/signup'} className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 16 }}>
          {ctaText || 'Start Tracking'}
        </Link>
      )}
    </section>
  );
}

export function SeoContent({ children }: { children: React.ReactNode }) {
  return (
    <article className="land-section" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 720, margin: '0 auto', fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
        {children}
      </div>
    </article>
  );
}

/**
 * Breadcrumb JSON-LD structured data for sub-pages.
 * Usage: <Breadcrumbs items={[{ name: 'Pricing', url: '/pricing' }]} />
 */
export function Breadcrumbs({ items }: { items: Array<{ name: string; url: string }> }) {
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://livesov.com/' },
      ...items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: item.name,
        item: `https://livesov.com${item.url}`,
      })),
    ],
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
  );
}
