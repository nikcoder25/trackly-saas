'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CookiePreferencesButton } from '@/components/CookieConsent';
import { useNonce } from '@/components/NonceProvider';
import { MARKETING_NAV_LINKS } from '@/lib/marketing-nav';

interface SeoLayoutProps {
  children: React.ReactNode;
}

export default function SeoLayout({ children }: SeoLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div id="landing-page">
      <a href="#main-content" className="skip-to-content">Skip to content</a>

      {/* Nav - uses legacy .land-nav classes */}
      <nav className="land-nav">
        <Link href="/" className="land-nav-logo" style={{ textDecoration: 'none' }} aria-label="Livesov - Go to homepage">
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
          {MARKETING_NAV_LINKS.map((link) => (
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
        <div className="section-sub">Monitor your brand across ChatGPT, Perplexity, Claude, Gemini & Grok.</div>
        <Link href="/signup" className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 16 }}>
          Get Started
        </Link>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 16 }}>No credit card required.</p>
      </section>

      {/* Footer */}
      <footer className="land-footer">
        {/* Newsletter strip */}
        <div className="land-footer-newsletter">
          <div className="land-footer-newsletter-inner">
            <div className="land-footer-newsletter-copy">
              <div className="land-footer-newsletter-eyebrow">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                <span>Newsletter</span>
              </div>
              <h3>Get the GEO playbook in your inbox</h3>
              <p>Insights on AI search, brand visibility tactics, and product updates straight to your inbox. No spam, unsubscribe anytime.</p>
            </div>
            <form
              className="land-footer-newsletter-form"
              action="https://livesov.com/api/newsletter"
              method="post"
              onSubmit={(e) => { e.preventDefault(); }}
            >
              <label htmlFor="footer-newsletter-email" className="sr-only">Email address</label>
              <input
                id="footer-newsletter-email"
                type="email"
                name="email"
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
              <button type="submit" className="land-btn land-btn-primary">Subscribe</button>
            </form>
          </div>
        </div>

        <div className="land-footer-grid">
          <div className="land-footer-brand">
            <Link href="/" className="land-footer-logo" aria-label="Livesov - Home" style={{ textDecoration: 'none' }}>
              Live<span>sov</span>
            </Link>
            <div className="land-footer-desc">AI Visibility Tracker &ndash; Track how AI platforms mention your brand across ChatGPT, Perplexity, Claude, Gemini &amp; Grok.</div>
            <div className="land-footer-tracking" aria-label="Platforms tracked">
              <span className="land-footer-tracking-label">Tracking on</span>
              <div className="land-footer-tracking-chips">
                <span className="land-footer-tracking-chip">ChatGPT</span>
                <span className="land-footer-tracking-chip">Perplexity</span>
                <span className="land-footer-tracking-chip">Claude</span>
                <span className="land-footer-tracking-chip">Gemini</span>
                <span className="land-footer-tracking-chip">Grok</span>
              </div>
            </div>
            <div className="land-footer-badges" aria-label="Trust signals">
              <span className="land-footer-badge"><span className="land-footer-badge-dot" /> All systems operational</span>
              <span className="land-footer-badge">SOC 2 ready</span>
              <span className="land-footer-badge">GDPR compliant</span>
            </div>
            <div className="land-footer-social" aria-label="Social links">
              <a href="https://x.com/livesov" target="_blank" rel="noopener noreferrer" aria-label="Follow on X">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a href="https://linkedin.com/company/livesov" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
              <a href="https://github.com/livesov" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
              </a>
              <a href="mailto:hello@livesov.com" aria-label="Email us">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>
              </a>
            </div>
          </div>
          <div className="land-footer-col">
            <h4>Product</h4>
            <Link href="/#features">Features</Link>
            <Link href="/#pricing">Pricing</Link>
            <Link href="/#how-it-works">How it Works</Link>
            <Link href="/use-cases">Use Cases</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/changelog">Changelog</Link>
          </div>
          <div className="land-footer-col">
            <h4>Resources</h4>
            <Link href="/blog">Blog</Link>
            <Link href="/glossary">Glossary</Link>
            <Link href="/case-studies">Case Studies</Link>
            <Link href="/resources">Templates &amp; Resources</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/ai-search-statistics-2026">AI Search Statistics 2026</Link>
            <Link href="/geo-optimization">GEO Guide</Link>
            <Link href="/learn/llm-seo">LLM SEO Guide</Link>
            <Link href="/learn/ai-search-optimization">AI Search Optimization</Link>
            <Link href="/learn/ai-overviews-optimization">AI Overviews Guide</Link>
            <Link href="/best">What ChatGPT Recommends</Link>
            <Link href="/vs/ahrefs">Livesov vs Ahrefs</Link>
            <Link href="/vs/semrush">Livesov vs Semrush</Link>
          </div>
          <div className="land-footer-col">
            <h4>Free Tools</h4>
            <Link href="/tools">All Tools</Link>
            <Link href="/tools/llms-txt-generator">llms.txt Generator</Link>
            <Link href="/tools/ai-crawler-checker">AI Crawler Checker</Link>
            <Link href="/tools/chatgpt-mention-checker">ChatGPT Mention Checker</Link>
            <Link href="/tools/geo-score-checker">GEO Score Checker</Link>
            <Link href="/tools/ai-readiness-audit">AI Readiness Audit</Link>
            <Link href="/tools/share-of-voice-calculator">Share of Voice Calculator</Link>
            <Link href="/tools/prompt-generator">Prompt Generator</Link>
            <Link href="/tools/citation-finder">AI Citation Finder</Link>
            <Link href="/tools/competitor-finder">AI Competitor Finder</Link>
          </div>
          <div className="land-footer-col">
            <h4>AI Platforms</h4>
            <Link href="/chatgpt-brand-tracking">ChatGPT Tracking</Link>
            <Link href="/perplexity-brand-tracking">Perplexity Tracking</Link>
            <Link href="/claude-brand-tracking">Claude Tracking</Link>
            <Link href="/gemini-brand-tracking">Gemini Tracking</Link>
            <Link href="/grok-brand-tracking">Grok Tracking</Link>
            <div className="land-footer-subhead">Company</div>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/partners">Partners</Link>
          </div>
        </div>
        <div className="land-footer-bottom">
          <div className="land-footer-bottom-left">
            <div className="land-footer-text">&copy; {new Date().getFullYear()} Livesov. All rights reserved.</div>
            <div className="land-footer-tagline">Built for the AI search era.</div>
          </div>
          <div className="land-footer-legal">
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/cookies">Cookie Policy</Link>
            <CookiePreferencesButton />
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
  const nonce = useNonce();
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
    <script type="application/ld+json" nonce={nonce || undefined} dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
  );
}
