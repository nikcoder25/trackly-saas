import Link from 'next/link';
import { SiteLogo } from './SiteHeader';

/* Links are written out (not mapped) so the canonical public destinations -
   including the `/#features` anchor and the real `/pricing` page - stay
   pinned in source (see tests/nav-features-anchor, header-canonical-links). */
export default function SiteFooter({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const year = new Date().getFullYear();

  if (variant === 'compact') {
    return (
      <footer className="ls-ft">
        <div className="ls-wrap ls-ft-compact">
          <Link href="/" className="ls-logo inv" aria-label="Livesov home"><SiteLogo /></Link>
          <nav aria-label="Footer">
            <Link href="/#features">Features</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/geo-audit">Free audit</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/contact">Contact</Link>
          </nav>
          <span className="ls-ft-legal" style={{ fontSize: 13 }}>
            © {year} Livesov, Inc. · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
          </span>
        </div>
      </footer>
    );
  }

  return (
    <footer className="ls-ft">
      <div className="ls-wrap ls-ft-full">
        <div className="ls-ft-top">
          <div className="ls-ft-brand">
            <Link href="/" className="ls-logo inv" aria-label="Livesov home"><SiteLogo /></Link>
            <p>See what AI says about your brand across ChatGPT, Claude, Gemini, Perplexity and Grok, every day.</p>
            <div className="ls-ft-status"><span className="ls-dot lime" />All engines operational</div>
          </div>
          <div className="ls-ft-cols">
            <div className="ls-ft-col">
              <span className="ls-ft-col-t">Platform</span>
              <Link href="/chatgpt-rank-tracker">ChatGPT tracker</Link>
              <Link href="/claude-rank-tracker">Claude tracker</Link>
              <Link href="/gemini-rank-tracker">Gemini tracker</Link>
              <Link href="/perplexity-rank-tracker">Perplexity tracker</Link>
              <Link href="/grok-rank-tracker">Grok tracker</Link>
              <Link href="/uses/ai-visibility-for-local-businesses">For local businesses</Link>
            </div>
            <div className="ls-ft-col">
              <span className="ls-ft-col-t">Compare</span>
              <Link href="/vs/ahrefs">vs Ahrefs</Link>
              <Link href="/vs/semrush">vs Semrush</Link>
              <Link href="/vs/otterly">vs Otterly</Link>
              <Link href="/vs/profound">vs Profound</Link>
              <Link href="/vs/peec-ai">vs Peec AI</Link>
              <Link href="/#features">Features</Link>
              <Link href="/how-it-works">How it works</Link>
            </div>
            <div className="ls-ft-col">
              <span className="ls-ft-col-t">Resources</span>
              <Link href="/geo-audit">AI visibility checker</Link>
              <Link href="/tools">Free tools</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/geo-optimization">GEO guide</Link>
              <Link href="/glossary">Glossary</Link>
              <Link href="/docs">Docs</Link>
              <Link href="/changelog">Changelog</Link>
            </div>
            <div className="ls-ft-col">
              <span className="ls-ft-col-t">Company</span>
              <Link href="/about">About</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/partners">Partners</Link>
              <Link href="/contact">Contact</Link>
            </div>
          </div>
        </div>
        <div className="ls-ft-word" aria-hidden="true">livesov</div>
        <div className="ls-ft-bot">
          <span className="ls-ft-legal">
            © {year} Livesov, Inc. · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/cookies">Cookies</Link>
          </span>
          <span className="ls-mono">livesov = live share of voice, for AI search.</span>
        </div>
      </div>
    </footer>
  );
}
