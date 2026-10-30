import Link from 'next/link';
import { CookiePreferencesButton } from '@/components/CookieConsent';
import EmailOff from '@/components/EmailOff';
import FooterNewsletter from '@/components/seo/FooterNewsletter';
import { alternatives } from '@/data/alternatives';
import { SiteLogo } from './SiteHeader';

/* One footer for every public page. It carries the full internal-link set
   the old SeoLayout footer had (tools, guides, alternatives), so moving the
   long-tail pages onto this shell loses no crawl paths. Links are written
   out so the canonical destinations - including the real `/features` and
   `/pricing` pages - stay pinned in source (see tests/nav-features-anchor,
   header-canonical-links). */
export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="ls-ft">
      <div className="ls-wrap ls-ft-full">
        <div className="ls-ft-news">
          <div className="ls-stack ls-gap-8" style={{ maxWidth: 520 }}>
            <span className="ls-mono" style={{ fontSize: 12, color: 'var(--ls-lime)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Newsletter</span>
            <h2 className="ls-ft-news-h">Get the GEO playbook <span className="ls-em">in your inbox.</span></h2>
            <p>Short notes on AI search and brand visibility. No spam, unsubscribe anytime.</p>
          </div>
          <FooterNewsletter />
        </div>

        <div className="ls-ft-top">
          <div className="ls-ft-brand">
            <Link href="/" className="ls-logo inv" aria-label="Livesov home"><SiteLogo /></Link>
            <p>See what AI says about your brand across ChatGPT, Claude, Gemini, Perplexity and Grok, every day.</p>
            <div className="ls-ft-status"><span className="ls-dot lime" />All engines operational</div>
            <div className="ls-ft-social" aria-label="Social links">
              <a href="https://x.com/livesov" target="_blank" rel="noopener noreferrer" aria-label="Livesov on X">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
              </a>
              <a href="https://linkedin.com/company/livesov" target="_blank" rel="noopener noreferrer" aria-label="Livesov on LinkedIn">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
              </a>
              <EmailOff>
                <a href="mailto:hello@livesov.com" aria-label="Email Livesov">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg>
                </a>
              </EmailOff>
            </div>
          </div>
          <div className="ls-ft-cols">
            <div className="ls-ft-col">
              <span className="ls-ft-col-t">Product</span>
              <Link href="/features">Features</Link>
              <Link href="/rank-tracker">Rank tracker</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/how-it-works">How it works</Link>
              <Link href="/use-cases">Use cases</Link>
              <Link href="/integrations">Integrations</Link>
              <Link href="/changelog">Changelog</Link>
              <Link href="/solutions/agencies">For agencies</Link>
              <Link href="/uses">Uses</Link>
              <Link href="/uses/ai-visibility-for-local-businesses">For local businesses</Link>
            </div>
            <div className="ls-ft-col">
              <span className="ls-ft-col-t">Platforms</span>
              <Link href="/chatgpt-rank-tracker">ChatGPT tracker</Link>
              <Link href="/claude-rank-tracker">Claude tracker</Link>
              <Link href="/gemini-rank-tracker">Gemini tracker</Link>
              <Link href="/perplexity-rank-tracker">Perplexity tracker</Link>
              <Link href="/grok-rank-tracker">Grok tracker</Link>
              <span className="ls-ft-col-t" style={{ marginTop: 14 }}>Compare</span>
              <Link href="/vs/ahrefs">vs Ahrefs</Link>
              <Link href="/vs/semrush">vs Semrush</Link>
              <Link href="/vs/otterly">vs Otterly</Link>
              <Link href="/vs/profound">vs Profound</Link>
              <Link href="/vs/peec-ai">vs Peec AI</Link>
              <Link href="/best-ai-search-optimization-tools">Best AI search tools</Link>
            </div>
            <div className="ls-ft-col">
              <span className="ls-ft-col-t">Free tools</span>
              <Link href="/geo-audit">AI visibility checker</Link>
              <Link href="/tools">All tools</Link>
              <Link href="/tools/llms-txt-generator">llms.txt generator</Link>
              <Link href="/tools/ai-crawler-checker">AI crawler checker</Link>
              <Link href="/tools/chatgpt-mention-checker">ChatGPT mention checker</Link>
              <Link href="/tools/geo-score-checker">GEO score checker</Link>
              <Link href="/tools/ai-readiness-audit">AI readiness audit</Link>
              <Link href="/tools/share-of-voice-calculator">Share of voice calculator</Link>
              <Link href="/tools/prompt-generator">Prompt generator</Link>
              <Link href="/tools/citation-finder">AI citation finder</Link>
              <Link href="/tools/competitor-finder">AI competitor finder</Link>
              <Link href="/tools/nap-verification">NAP audit tool</Link>
            </div>
            <div className="ls-ft-col">
              <span className="ls-ft-col-t">Resources</span>
              <Link href="/blog">Blog</Link>
              <Link href="/geo-optimization">GEO guide</Link>
              <Link href="/learn">Learn: pillar guides</Link>
              <Link href="/learn/llm-seo">LLM SEO guide</Link>
              <Link href="/learn/ai-search-optimization">AI search optimization</Link>
              <Link href="/learn/ai-overviews-optimization">AI Overviews guide</Link>
              <Link href="/learn/ai-visibility-score">AI visibility score</Link>
              <Link href="/learn/brand-visibility-in-llms">Brand visibility in LLMs</Link>
              <Link href="/ai-search-statistics-2026">AI search statistics 2026</Link>
              <Link href="/research/state-of-ai-search">State of AI search</Link>
              <Link href="/best">What ChatGPT recommends</Link>
              <Link href="/glossary">Glossary</Link>
              <Link href="/docs">Docs</Link>
              <Link href="/resources">Templates</Link>
              <Link href="/uses/ai-visibility-report-for-agencies">Client reports</Link>
            </div>
            <div className="ls-ft-col">
              <span className="ls-ft-col-t">Alternatives</span>
              {alternatives.map((a) => (
                <Link key={a.slug} href={`/${a.slug}`}>{a.name} alternative</Link>
              ))}
              <span className="ls-ft-col-t" style={{ marginTop: 14 }}>Company</span>
              <Link href="/about">About</Link>
              <Link href="/partners">Partners</Link>
              <Link href="/contact">Contact</Link>
            </div>
          </div>
        </div>
        <div className="ls-ft-word" aria-hidden="true">livesov</div>
        <div className="ls-ft-bot">
          <span className="ls-ft-legal">
            © {year} Livesov, Inc. · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/cookies">Cookies</Link>
            <CookiePreferencesButton />
          </span>
          <span className="ls-mono">livesov = live share of voice, for AI search.</span>
        </div>
      </div>
    </footer>
  );
}
