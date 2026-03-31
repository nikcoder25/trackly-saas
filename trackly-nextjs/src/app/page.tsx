'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function HomePage() {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div id="landing-page">

      {/* Navigation — uses legacy .land-nav classes */}
      <nav className="land-nav">
        <div className="land-nav-logo">Live<span>sov</span></div>

        <button className="land-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
          <span /><span /><span />
        </button>

        <div className={`land-nav-links ${menuOpen ? 'open' : ''}`}>
          <a href="#features" onClick={() => setMenuOpen(false)}>{t.nav.features}</a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>{t.nav.howItWorks}</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)}>{t.nav.pricing}</a>
          <a href="#use-cases" onClick={() => setMenuOpen(false)}>{t.nav.useCases}</a>
          <a href="#faq" onClick={() => setMenuOpen(false)}>{t.nav.faq}</a>
        </div>

        <div className="land-nav-right">
          <LanguageSwitcher variant="light" />
          <Link href="/login" className="land-btn land-btn-ghost">{t.nav.login}</Link>
          <Link href="/signup" className="land-btn land-btn-primary">{t.nav.getStarted}</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="land-hero">
        <div className="land-hero-badge">{t.hero.badge}</div>
        <h1>{t.hero.title}<span>{t.hero.titleHighlight}</span></h1>
        <p>{t.hero.description}</p>
        <div className="land-hero-cta">
          <Link href="/signup" className="land-btn land-btn-primary">{t.hero.cta} &rarr;</Link>
          <a href="#demo-section" className="land-btn land-btn-ghost">{t.hero.ctaDemo}</a>
        </div>
        <div className="land-google-wrap">
          <Link href="/signup" className="btn-google-land">
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Sign up with Google
          </Link>
        </div>
      </section>

      {/* Social Proof */}
      <section className="land-social-proof">
        <div className="land-social-proof-stats">
          <div className="land-social-proof-stat"><div className="val">500+</div><div className="lbl">{t.socialProof.brandsTracked}</div></div>
          <div className="land-social-proof-stat"><div className="val">7</div><div className="lbl">{t.socialProof.aiPlatforms}</div></div>
          <div className="land-social-proof-stat"><div className="val">50K+</div><div className="lbl">{t.socialProof.queriesRun}</div></div>
          <div className="land-social-proof-stat"><div className="val">Real-time</div><div className="lbl">{t.socialProof.liveResults}</div></div>
        </div>
      </section>

      {/* Platform Chips */}
      <section className="land-platforms">
        {[
          { name: 'ChatGPT', color: '#19c37d', icon: '\u2B21' },
          { name: 'Perplexity', color: '#9b72ff', icon: '\u25CE' },
          { name: 'Claude', color: '#d97706', icon: '\u25C8' },
          { name: 'Gemini', color: '#4285f4', icon: '\u2726' },
          { name: 'Grok', color: '#1d9bf0', icon: '\u26A1' },
        ].map(p => (
          <div key={p.name} className="land-plat-chip">
            <span className="plat-icon" style={{ color: p.color }}>{p.icon}</span> {p.name}
          </div>
        ))}
      </section>

      {/* Live Demo */}
      <section className="land-demo" id="demo-section">
        <div className="land-demo-box">
          <div className="land-demo-header">
            <div className="dot g" /><div className="dot" /><div className="dot" />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 12 }}>{t.demo.query}</span>
          </div>
          <div className="land-demo-body">
            {[
              { name: 'ChatGPT', color: '#19c37d', icon: '\u2B21', found: true, text: t.demo.chatgptResponse },
              { name: 'Perplexity', color: '#9b72ff', icon: '\u25CE', found: true, text: t.demo.perplexityResponse },
              { name: 'Claude', color: '#d97706', icon: '\u25C8', found: true, text: t.demo.claudeResponse },
              { name: 'Gemini', color: '#4285f4', icon: '\u2726', found: true, text: t.demo.geminiResponse },
              { name: 'Grok', color: '#1d9bf0', icon: '\u26A1', found: false, text: t.demo.grokResponse },
            ].map(d => (
              <div key={d.name} className="land-demo-card" style={!d.found ? { opacity: 0.7 } : undefined}>
                <div className="plat-head"><span className="icon" style={{ color: d.color }}>{d.icon}</span> {d.name}</div>
                <div className="found-badge" style={!d.found ? { background: 'var(--danger-light)', color: 'var(--red)', borderColor: 'rgba(239,68,68,.2)' } : undefined}>
                  {d.found ? t.demo.mentioned : t.demo.notFound}
                </div>
                <div className="response-text" dangerouslySetInnerHTML={{ __html: d.text }} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <Link href="/signup" className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 15 }}>
            {t.demo.tryIt} &rarr;
          </Link>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>{t.demo.plansStart}</p>
        </div>
      </section>

      {/* Features */}
      <section className="land-section" id="features">
        <div className="land-section-label">{t.features.label}</div>
        <h2>{t.features.title}</h2>
        <div className="section-sub">{t.features.subtitle}</div>
        <div className="land-features">
          {t.features.items.map((f: { icon: string; title: string; desc: string }) => (
            <div key={f.title} className="land-feature">
              <div className="feat-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it Works */}
      <section className="land-section" id="how-it-works">
        <div className="land-section-label">{t.howItWorks.label}</div>
        <h2>{t.howItWorks.title}</h2>
        <div className="section-sub">{t.howItWorks.subtitle}</div>
        <div className="land-how">
          {t.howItWorks.steps.map((s: { num: string; title: string; desc: string }) => (
            <div key={s.num} className="land-how-step">
              <div className="land-how-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="land-section" id="pricing">
        <div className="land-section-label">{t.pricing.label}</div>
        <h2>{t.pricing.title}</h2>
        <div className="section-sub">{t.pricing.subtitle}</div>
        <div className="land-pricing">
          {t.pricing.plans.map((plan: { name: string; price: string; sub: string; features: string[]; featured?: boolean; enterprise?: boolean }, i: number) => (
            <div key={plan.name} className={`land-price-card ${plan.featured ? 'featured' : ''}`} style={plan.enterprise ? { borderColor: 'var(--purple)' } : undefined}>
              <h3 style={plan.enterprise ? { color: 'var(--purple)' } : undefined}>{plan.name}</h3>
              <div className="price">{plan.price}<span>{t.pricing.perMonth}</span></div>
              <div className="price-sub">{plan.sub}</div>
              <ul>
                {plan.features.map((f: string) => <li key={f}>{f}</li>)}
              </ul>
              <Link href="/signup" className="land-btn land-btn-primary" style={{ width: '100%' }}>
                {i === 0 ? t.pricing.getStarted : i === 1 ? t.pricing.startPro : i === 2 ? t.pricing.startAgency : t.pricing.contactSales}
              </Link>
            </div>
          ))}
        </div>

        {/* Comparison Table */}
        <div style={{ maxWidth: 900, margin: '48px auto 0' }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>{t.pricing.comparison.title}</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 16, textAlign: 'center', marginBottom: 24 }}>{t.pricing.comparison.subtitle}</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'center' }}>
              <thead>
                <tr>
                  {t.pricing.comparison.headers.map((h: string, i: number) => (
                    <th key={h} style={{ textAlign: i === 0 ? 'left' : 'center', color: i === 1 ? 'var(--primary)' : undefined, fontWeight: i === 1 ? 700 : undefined }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.pricing.comparison.rows.map((row: string[], ri: number) => (
                  <tr key={ri}>
                    {row.map((cell: string, ci: number) => (
                      <td key={ci} style={{
                        textAlign: ci === 0 ? 'left' : 'center',
                        color: ci === 1 ? 'var(--primary)' : cell.includes('\u2713') ? 'var(--green)' : cell.includes('\u2717') ? 'var(--red)' : undefined,
                        fontWeight: ci === 1 ? 700 : undefined,
                      }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11, textAlign: 'center', marginTop: 16, opacity: 0.6 }}>{t.pricing.comparison.disclaimer}</p>
        </div>
      </section>

      {/* Why AI Visibility */}
      <section className="land-section">
        <div className="land-section-label">{t.whyAI.label}</div>
        <h2>{t.whyAI.title}</h2>
        <div className="section-sub">{t.whyAI.subtitle}</div>
        <div className="land-features" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {t.whyAI.items.map((item: { icon: string; title: string; desc: string }) => (
            <div key={item.title} className="land-feature">
              <div className="feat-icon">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section className="land-section" id="use-cases">
        <div className="land-section-label">{t.useCases.label}</div>
        <h2>{t.useCases.title}</h2>
        <div className="section-sub">{t.useCases.subtitle}</div>
        <div className="land-features">
          {t.useCases.items.map((item: { icon: string; title: string; desc: string }) => (
            <div key={item.title} className="land-feature">
              <div className="feat-icon">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="land-section" id="faq">
        <div className="land-section-label">{t.faq.label}</div>
        <h2>{t.faq.title}</h2>
        <div className="section-sub">{t.faq.subtitle}</div>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          {t.faq.items.map((item: { q: string; a: string }) => (
            <details key={item.q} className="faq-item">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="land-section">
        <h2>{t.testimonials.title}</h2>
        <div className="section-sub">{t.testimonials.subtitle}</div>
        <div className="land-testimonials">
          {t.testimonials.items.map((item: { name: string; role: string; text: string; initials: string }) => (
            <div key={item.name} className="land-testimonial-card">
              <div className="land-testimonial-stars">{'\u2605\u2605\u2605\u2605\u2605'}</div>
              <div className="land-testimonial-text">{item.text}</div>
              <div className="land-testimonial-author">
                <div className="land-testimonial-avatar">{item.initials}</div>
                <div>
                  <div className="land-testimonial-name">{item.name}</div>
                  <div className="land-testimonial-role">{item.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="land-cta-section">
        <h2>{t.cta.title}</h2>
        <div className="section-sub">{t.cta.subtitle}</div>
        <Link href="/signup" className="land-btn land-btn-primary" style={{ padding: '16px 44px', fontSize: 16 }}>
          {t.cta.button} &rarr;
        </Link>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginTop: 16 }}>{t.cta.note}</p>
      </section>

      {/* Footer */}
      <footer className="land-footer">
        <div className="land-footer-grid">
          <div className="land-footer-brand">
            <div className="land-footer-logo">Live<span>sov</span></div>
            <div className="land-footer-desc">{t.footer.desc}</div>
          </div>
          <div className="land-footer-col">
            <div className="land-footer-col-title">{t.footer.product}</div>
            <Link href="/#features">{t.footer.links.features}</Link>
            <Link href="/pricing">{t.footer.links.pricing}</Link>
            <Link href="/how-it-works">{t.footer.links.howItWorks}</Link>
            <Link href="/use-cases">{t.footer.links.useCases}</Link>
            <Link href="/integrations">{t.footer.links.integrations}</Link>
          </div>
          <div className="land-footer-col">
            <div className="land-footer-col-title">{t.footer.resources}</div>
            <Link href="/blog">{t.footer.links.blog}</Link>
            <Link href="/geo-optimization">{t.footer.links.geoGuide}</Link>
            <Link href="/about">{t.footer.links.about}</Link>
            <Link href="/contact">{t.footer.links.contact}</Link>
            <Link href="/changelog">{t.footer.links.changelog}</Link>
          </div>
          <div className="land-footer-col">
            <div className="land-footer-col-title">{t.footer.legal}</div>
            <Link href="/privacy">{t.footer.links.privacy}</Link>
            <Link href="/terms">{t.footer.links.terms}</Link>
            <Link href="/cookies">{t.footer.links.cookies}</Link>
          </div>
        </div>
        <div className="land-footer-bottom">
          <div className="land-footer-text">&copy; {new Date().getFullYear()} {t.footer.copyright}</div>
          <div className="land-footer-social">
            <a href="mailto:hello@livesov.com" aria-label="Email">{'\u2709'}</a>
            <a href="https://x.com/livesov" target="_blank" rel="noopener noreferrer" aria-label="X">{'\u2715'}</a>
            <a href="https://linkedin.com/company/livesov" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">in</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
