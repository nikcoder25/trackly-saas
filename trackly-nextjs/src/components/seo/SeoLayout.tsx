import Link from 'next/link';

interface SeoLayoutProps {
  children: React.ReactNode;
}

const navLinks = [
  { href: '/#features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/how-it-works', label: 'How it Works' },
  { href: '/use-cases', label: 'Use Cases' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
];

const footerLinks = [
  { href: '/', label: 'Home' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/how-it-works', label: 'How it Works' },
  { href: '/use-cases', label: 'Use Cases' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/chatgpt-brand-tracking', label: 'ChatGPT Tracking' },
  { href: '/perplexity-brand-tracking', label: 'Perplexity Tracking' },
  { href: '/gemini-brand-tracking', label: 'Gemini Tracking' },
  { href: '/claude-brand-tracking', label: 'Claude Tracking' },
  { href: '/grok-brand-tracking', label: 'Grok Tracking' },
  { href: '/geo-optimization', label: 'GEO Guide' },
  { href: '/vs/semrush', label: 'vs Semrush' },
  { href: '/vs/ahrefs', label: 'vs Ahrefs' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];

export default function SeoLayout({ children }: SeoLayoutProps) {
  return (
    <div id="landing-page">
      {/* Nav — uses legacy .land-nav classes */}
      <nav className="land-nav">
        <Link href="/" className="land-nav-logo" style={{ textDecoration: 'none' }}>
          Live<span>sov</span>
        </Link>
        <div className="land-nav-links">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>{link.label}</Link>
          ))}
        </div>
        <div className="land-nav-right">
          <Link href="/login" className="land-btn land-btn-ghost">Login</Link>
          <Link href="/signup" className="land-btn land-btn-primary">Get Started</Link>
        </div>
      </nav>

      {/* Content */}
      <main>{children}</main>

      {/* CTA */}
      <section className="land-cta-section">
        <h2>Ready to track your AI visibility?</h2>
        <div className="section-sub">Monitor your brand across ChatGPT, Perplexity, Claude, Gemini & Grok.</div>
        <Link href="/signup" className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 16 }}>
          Get Started
        </Link>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 16 }}>No credit card required.</p>
      </section>

      {/* Footer — uses legacy .land-footer classes */}
      <footer className="land-footer">
        <div className="land-footer-grid">
          <div className="land-footer-brand">
            <div className="land-footer-logo">Live<span>sov</span></div>
            <div className="land-footer-desc">AI Visibility Tracker — Track how AI platforms mention your brand across ChatGPT, Perplexity, Claude, Gemini & Grok.</div>
          </div>
          <div className="land-footer-col">
            <div className="land-footer-col-title">Product</div>
            <Link href="/#features">Features</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/how-it-works">How it Works</Link>
            <Link href="/use-cases">Use Cases</Link>
          </div>
          <div className="land-footer-col">
            <div className="land-footer-col-title">Resources</div>
            <Link href="/blog">Blog</Link>
            <Link href="/geo-optimization">GEO Guide</Link>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/changelog">Changelog</Link>
          </div>
          <div className="land-footer-col">
            <div className="land-footer-col-title">Legal</div>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/cookies">Cookies</Link>
          </div>
        </div>
        <div className="land-footer-bottom">
          <div className="land-footer-text">&copy; {new Date().getFullYear()} Livesov. All rights reserved.</div>
          <div className="land-footer-social">
            <a href="mailto:hello@livesov.com" aria-label="Email">✉</a>
            <a href="https://x.com/livesov" target="_blank" rel="noopener noreferrer" aria-label="X">✕</a>
            <a href="https://linkedin.com/company/livesov" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">in</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function SeoHero({ title, subtitle }: { title: React.ReactNode; subtitle: string }) {
  return (
    <section className="land-hero" style={{ paddingTop: 60, paddingBottom: 48 }}>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      <Link href="/signup" className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 16 }}>
        Start Tracking
      </Link>
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
