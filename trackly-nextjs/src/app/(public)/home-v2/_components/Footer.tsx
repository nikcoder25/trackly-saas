import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="hp-footer" aria-labelledby="hp-footer-title">
      <h2 id="hp-footer-title" className="sr-only">Site links</h2>
      <div className="hp-container">
        <div className="hp-footer-grid">
          <div className="hp-footer-brand">
            <Link href="/" className="hp-logo" aria-label="Livesov home">
              <span className="hp-logo-dot" aria-hidden="true" />
              Livesov
            </Link>
            <p>
              The AI visibility tracker for ChatGPT, Perplexity, Claude, Gemini, and Grok.
            </p>
          </div>

          <div className="hp-footer-col">
            <h4>Product</h4>
            <Link href="#features">Features</Link>
            <Link href="#pricing">Pricing</Link>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/geo-audit">GEO audit</Link>
            <Link href="/integrations">Integrations</Link>
          </div>

          <div className="hp-footer-col">
            <h4>Platforms</h4>
            <Link href="/chatgpt-brand-tracking">ChatGPT</Link>
            <Link href="/perplexity-brand-tracking">Perplexity</Link>
            <Link href="/claude-brand-tracking">Claude</Link>
            <Link href="/gemini-brand-tracking">Gemini</Link>
            <Link href="/grok-brand-tracking">Grok</Link>
          </div>

          <div className="hp-footer-col">
            <h4>Resources</h4>
            <Link href="/blog">Blog</Link>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/changelog">Changelog</Link>
            <Link href="/partners">Partners</Link>
          </div>

          <div className="hp-footer-col">
            <h4>Legal</h4>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/cookies">Cookies</Link>
          </div>
        </div>

        <div className="hp-footer-bottom">
          <span>© {new Date().getFullYear()} Livesov. All rights reserved.</span>
          <span>Made for teams winning the AI answer.</span>
        </div>
      </div>
    </footer>
  );
}
