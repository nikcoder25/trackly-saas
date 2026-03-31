'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

/* ─── Animated counter hook ─── */
function useCounter(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [started, target, duration]);

  return { count, ref: (node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStarted(true); }, { threshold: 0.3 });
    observer.observe(node);
    return () => observer.disconnect();
  }};
}

/* ─── Platform data ─── */
const platforms = [
  { name: 'ChatGPT', color: '#10a37f', icon: '⬡' },
  { name: 'Perplexity', color: '#9b72ff', icon: '◎' },
  { name: 'Claude', color: '#d97706', icon: '◈' },
  { name: 'Gemini', color: '#4285f4', icon: '✦' },
  { name: 'Grok', color: '#1d9bf0', icon: '⚡' },
];

const features = [
  { icon: '🔍', title: 'Multi-Platform Tracking', desc: 'Monitor your brand across ChatGPT, Perplexity, Claude, Gemini & Grok — all from a single dashboard.' },
  { icon: '📊', title: 'Share of Voice', desc: 'Measure what percentage of AI responses mention your brand vs competitors. Track SOV trends over time.' },
  { icon: '🛡️', title: 'Evidence & Proof', desc: 'Save full AI responses as verifiable proof. Export to CSV, share with clients, build trust with real data.' },
  { icon: '🎯', title: 'Sentiment Analysis', desc: 'Know whether AI recommends your brand positively, negatively, or neutrally. Spot reputation shifts early.' },
  { icon: '⚙️', title: 'Custom Queries', desc: 'Define exactly what your customers ask. Track performance per query, per platform, per location.' },
  { icon: '📈', title: 'Competitor Intelligence', desc: 'Add competitors to see how they appear in AI responses alongside your brand. Benchmark and outrank.' },
];

const steps = [
  { num: '01', title: 'Add Your Brand', desc: 'Enter your brand name, industry, and location. Smart default queries are generated automatically.' },
  { num: '02', title: 'Auto-Track Daily', desc: 'Trackly queries all 5 AI platforms on your schedule. Results flow into your real-time dashboard.' },
  { num: '03', title: 'Analyze & Report', desc: 'See what each AI says about you. Track trends, export proof, and share data-backed reports.' },
];

const pricingPlans = [
  { name: 'Starter', price: '$9', sub: 'Perfect for getting started', features: ['30 prompts/month', '1 brand', '2 AI platforms', 'Weekly tracking', 'SOV tracking & export'], cta: 'Get Started' },
  { name: 'Pro', price: '$29', sub: 'For growing businesses', featured: true, features: ['250 prompts/month', '5 brands', 'All 5 AI platforms', 'Daily tracking', 'Competitor tracking (5)', 'Sentiment analysis', 'Scheduled runs & webhooks'], cta: 'Start Pro' },
  { name: 'Agency', price: '$89', sub: 'For agencies & teams', features: ['1,000 prompts/month', '20 brands', 'All 5 AI platforms', 'Daily tracking', 'Competitor tracking (20)', 'Sentiment analysis', 'Scheduled runs & webhooks'], cta: 'Start Agency' },
  { name: 'Enterprise', price: '$499', sub: 'For large organizations', enterprise: true, features: ['10,000 prompts/month', '100 brands', 'All 5 AI platforms', 'Daily tracking', 'Competitor tracking (100)', 'API access', 'Priority support'], cta: 'Contact Sales' },
];

const faqs = [
  { q: 'What is AI visibility tracking?', a: 'AI visibility tracking monitors how AI platforms like ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand when users ask questions. It reveals your brand\'s presence in the new AI-driven discovery layer.' },
  { q: 'Which AI platforms does Trackly support?', a: 'Trackly tracks your brand across 5 major AI platforms: ChatGPT (OpenAI), Perplexity AI, Claude (Anthropic), Google Gemini, and Grok (xAI).' },
  { q: 'What is Share of Voice in AI?', a: 'Share of Voice (SOV) in AI measures what percentage of AI-generated responses mention your brand when relevant queries are asked. A higher SOV means AI is more likely to recommend you.' },
  { q: 'How is this different from traditional SEO tools?', a: 'SEO tools track Google Search rankings. Trackly tracks your visibility in AI-generated answers — a completely different discovery channel that\'s growing rapidly.' },
  { q: 'Can I use Trackly for client reporting?', a: 'Yes. Trackly saves complete AI responses as proof, exportable as CSV reports. Agencies use it to deliver data-backed AI visibility audits to clients.' },
  { q: 'How much does Trackly cost?', a: 'Plans start at $9/mo (Starter). Pro is $29/mo and Agency is $89/mo — the best value in AI visibility tracking.' },
];

const testimonials = [
  { text: 'We had no idea ChatGPT was recommending our competitor. Within a month of optimizing, our AI Share of Voice went from 0% to 34%.', name: 'Sarah Kim', role: 'Head of Growth, NovaBrand', initials: 'SK' },
  { text: 'Trackly is like Ahrefs but for AI search. Our agency uses it for every client now. The proof exports make reporting effortless.', name: 'Marco Rivera', role: 'Founder, Altitude Digital', initials: 'MR' },
  { text: 'As a solo founder, I needed to know if AI platforms were recommending me. Trackly gave me clarity in minutes.', name: 'James Liu', role: 'Founder, StackPilot', initials: 'JL' },
];

const demoResults = [
  { name: 'ChatGPT', color: '#10a37f', icon: '⬡', found: true, text: 'Based on available information, <mark>CoolAir Pro</mark> is a well-regarded HVAC provider in Austin TX. Customers praise them for responsive service and transparent pricing...' },
  { name: 'Perplexity', color: '#9b72ff', icon: '◎', found: true, text: '<mark>CoolAir Pro</mark> is a leading HVAC company in Austin TX [1]. Reviews highlight professional technicians and fair pricing [2]...' },
  { name: 'Claude', color: '#d97706', icon: '◈', found: true, text: 'I can share that <mark>CoolAir Pro</mark> has developed a solid reputation in the Austin TX HVAC market for professional service...' },
  { name: 'Gemini', color: '#4285f4', icon: '✦', found: true, text: '<mark>CoolAir Pro</mark> is an HVAC provider in Austin TX with consistent 4+ star ratings. Professional, licensed, transparent...' },
  { name: 'Grok', color: '#1d9bf0', icon: '⚡', found: false, text: 'For HVAC in Austin TX, I\'d recommend AC Express, Stan\'s Heating, and Green Leaf Air. Solid reviews and competitive pricing...' },
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="trackly-landing">

      {/* ═══════ NAVIGATION ═══════ */}
      <nav className={`tl-nav ${scrolled ? 'tl-nav--scrolled' : ''}`}>
        <div className="tl-nav-inner">
          <Link href="/" className="tl-logo">
            Track<span>ly</span>
          </Link>

          <button className="tl-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            <span className={menuOpen ? 'open' : ''} />
            <span className={menuOpen ? 'open' : ''} />
            <span className={menuOpen ? 'open' : ''} />
          </button>

          <div className={`tl-nav-links ${menuOpen ? 'tl-nav-links--open' : ''}`}>
            <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it Works</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
            <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
          </div>

          <div className="tl-nav-actions">
            <Link href="/login" className="tl-btn tl-btn--ghost">Log In</Link>
            <Link href="/signup" className="tl-btn tl-btn--primary">Get Started Free</Link>
          </div>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="tl-mobile-menu">
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it Works</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
          <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
          <div className="tl-mobile-menu-actions">
            <Link href="/login" className="tl-btn tl-btn--ghost" style={{ width: '100%' }}>Log In</Link>
            <Link href="/signup" className="tl-btn tl-btn--primary" style={{ width: '100%' }}>Get Started Free</Link>
          </div>
        </div>
      )}

      {/* ═══════ HERO ═══════ */}
      <section className="tl-hero">
        <div className="tl-hero-glow" />
        <div className="tl-hero-content">
          <div className="tl-badge">
            <span className="tl-badge-dot" />
            AI Visibility Tracker
          </div>
          <h1>
            Is your brand visible in{' '}
            <span className="tl-gradient-text">AI answers?</span>
          </h1>
          <p className="tl-hero-sub">
            Track how ChatGPT, Perplexity, Claude, Gemini & Grok mention your brand.
            Get real proof, measure share of voice, and optimize your AI visibility strategy.
          </p>
          <div className="tl-hero-ctas">
            <Link href="/signup" className="tl-btn tl-btn--primary tl-btn--lg">
              Start Tracking Free <span className="tl-arrow">&rarr;</span>
            </Link>
            <a href="#demo-section" className="tl-btn tl-btn--outline tl-btn--lg">
              See Live Demo
            </a>
          </div>
          <p className="tl-hero-note">No credit card required &middot; Set up in 2 minutes</p>
        </div>

        {/* Platform pills floating */}
        <div className="tl-hero-platforms">
          {platforms.map(p => (
            <div key={p.name} className="tl-platform-pill" style={{ '--platform-color': p.color } as React.CSSProperties}>
              <span className="tl-platform-icon">{p.icon}</span>
              {p.name}
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ SOCIAL PROOF BAR ═══════ */}
      <section className="tl-proof">
        <div className="tl-proof-inner">
          <div className="tl-proof-item">
            <span className="tl-proof-val">500+</span>
            <span className="tl-proof-label">Brands tracked</span>
          </div>
          <div className="tl-proof-divider" />
          <div className="tl-proof-item">
            <span className="tl-proof-val">5</span>
            <span className="tl-proof-label">AI platforms</span>
          </div>
          <div className="tl-proof-divider" />
          <div className="tl-proof-item">
            <span className="tl-proof-val">50K+</span>
            <span className="tl-proof-label">Queries analyzed</span>
          </div>
          <div className="tl-proof-divider" />
          <div className="tl-proof-item">
            <span className="tl-proof-val">Real-time</span>
            <span className="tl-proof-label">Live results</span>
          </div>
        </div>
      </section>

      {/* ═══════ LIVE DEMO ═══════ */}
      <section className="tl-section" id="demo-section">
        <div className="tl-section-inner">
          <div className="tl-section-header">
            <span className="tl-section-tag">Live Demo</span>
            <h2>See Trackly in Action</h2>
            <p>Here's what happens when you track a brand across all 5 AI platforms.</p>
          </div>

          <div className="tl-demo-window">
            <div className="tl-demo-toolbar">
              <div className="tl-demo-dots">
                <span className="tl-dot tl-dot--red" />
                <span className="tl-dot tl-dot--yellow" />
                <span className="tl-dot tl-dot--green" />
              </div>
              <div className="tl-demo-query">
                <span className="tl-demo-query-icon">🔍</span>
                &quot;Best HVAC company in Austin TX&quot;
              </div>
            </div>
            <div className="tl-demo-grid">
              {demoResults.map(d => (
                <div key={d.name} className={`tl-demo-card ${!d.found ? 'tl-demo-card--missed' : ''}`}>
                  <div className="tl-demo-card-head">
                    <span style={{ color: d.color, fontSize: 18 }}>{d.icon}</span>
                    <span className="tl-demo-card-name">{d.name}</span>
                    <span className={`tl-demo-badge ${d.found ? 'tl-demo-badge--found' : 'tl-demo-badge--missed'}`}>
                      {d.found ? '✓ Mentioned' : '✗ Not Found'}
                    </span>
                  </div>
                  <div className="tl-demo-card-text" dangerouslySetInnerHTML={{ __html: d.text }} />
                </div>
              ))}
            </div>
          </div>

          <div className="tl-demo-cta">
            <Link href="/signup" className="tl-btn tl-btn--primary tl-btn--lg">
              Try It With Your Brand <span className="tl-arrow">&rarr;</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════ FEATURES ═══════ */}
      <section className="tl-section tl-section--alt" id="features">
        <div className="tl-section-inner">
          <div className="tl-section-header">
            <span className="tl-section-tag">Features</span>
            <h2>Everything you need to dominate AI visibility</h2>
            <p>Monitor your brand across all major AI platforms from one powerful dashboard.</p>
          </div>

          <div className="tl-features-grid">
            {features.map(f => (
              <div key={f.title} className="tl-feature-card">
                <div className="tl-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ HOW IT WORKS ═══════ */}
      <section className="tl-section" id="how-it-works">
        <div className="tl-section-inner">
          <div className="tl-section-header">
            <span className="tl-section-tag">How it Works</span>
            <h2>Start tracking in 3 simple steps</h2>
            <p>Set up in under 2 minutes. No technical skills required.</p>
          </div>

          <div className="tl-steps">
            {steps.map((s, i) => (
              <div key={s.num} className="tl-step">
                <div className="tl-step-num">{s.num}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
                {i < steps.length - 1 && <div className="tl-step-connector" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ WHY AI VISIBILITY ═══════ */}
      <section className="tl-section tl-section--dark">
        <div className="tl-section-inner">
          <div className="tl-section-header">
            <span className="tl-section-tag tl-section-tag--light">Why it Matters</span>
            <h2>AI is the new search. Are you visible?</h2>
            <p>40% of searches now use AI chatbots. If AI doesn't recommend you, you're invisible to a growing audience.</p>
          </div>

          <div className="tl-why-grid">
            <div className="tl-why-card">
              <div className="tl-why-stat">40%</div>
              <h3>Searches use AI</h3>
              <p>Users are shifting from Google to ChatGPT and Perplexity for buying decisions.</p>
            </div>
            <div className="tl-why-card">
              <div className="tl-why-stat">0%</div>
              <h3>SEO coverage in AI</h3>
              <p>Ranking #1 on Google doesn't mean AI will recommend you. Different signals matter.</p>
            </div>
            <div className="tl-why-card">
              <div className="tl-why-stat">GEO</div>
              <h3>Is the future</h3>
              <p>Generative Engine Optimization is how brands ensure they appear in AI-generated answers.</p>
            </div>
            <div className="tl-why-card">
              <div className="tl-why-stat">📋</div>
              <h3>Proof for clients</h3>
              <p>Real API responses, not screenshots. Export verifiable evidence as CSV reports.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ PRICING ═══════ */}
      <section className="tl-section" id="pricing">
        <div className="tl-section-inner">
          <div className="tl-section-header">
            <span className="tl-section-tag">Pricing</span>
            <h2>Simple, transparent pricing</h2>
            <p>Start free. Scale as you grow. Best value in AI visibility tracking.</p>
          </div>

          <div className="tl-pricing-grid">
            {pricingPlans.map(plan => (
              <div key={plan.name} className={`tl-price-card ${plan.featured ? 'tl-price-card--featured' : ''} ${plan.enterprise ? 'tl-price-card--enterprise' : ''}`}>
                {plan.featured && <div className="tl-price-badge">Most Popular</div>}
                <h3>{plan.name}</h3>
                <div className="tl-price-amount">
                  {plan.price}<span>/mo</span>
                </div>
                <p className="tl-price-sub">{plan.sub}</p>
                <ul className="tl-price-features">
                  {plan.features.map(f => (
                    <li key={f}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.3 4.3L6 11.6L2.7 8.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className={`tl-btn ${plan.featured ? 'tl-btn--primary' : 'tl-btn--outline'} tl-btn--full`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ TESTIMONIALS ═══════ */}
      <section className="tl-section tl-section--alt">
        <div className="tl-section-inner">
          <div className="tl-section-header">
            <span className="tl-section-tag">Testimonials</span>
            <h2>Trusted by marketers & agencies</h2>
            <p>See what people are saying about Trackly.</p>
          </div>

          <div className="tl-testimonials">
            {testimonials.map(t => (
              <div key={t.name} className="tl-testimonial-card">
                <div className="tl-testimonial-stars">★★★★★</div>
                <p className="tl-testimonial-text">&ldquo;{t.text}&rdquo;</p>
                <div className="tl-testimonial-author">
                  <div className="tl-testimonial-avatar">{t.initials}</div>
                  <div>
                    <div className="tl-testimonial-name">{t.name}</div>
                    <div className="tl-testimonial-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FAQ ═══════ */}
      <section className="tl-section" id="faq">
        <div className="tl-section-inner" style={{ maxWidth: 760 }}>
          <div className="tl-section-header">
            <span className="tl-section-tag">FAQ</span>
            <h2>Frequently Asked Questions</h2>
          </div>

          <div className="tl-faq-list">
            {faqs.map((f, i) => (
              <div key={i} className={`tl-faq-item ${openFaq === i ? 'tl-faq-item--open' : ''}`}>
                <button className="tl-faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{f.q}</span>
                  <svg className="tl-faq-chevron" width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div className="tl-faq-a">
                  <p>{f.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FINAL CTA ═══════ */}
      <section className="tl-cta">
        <div className="tl-cta-glow" />
        <div className="tl-cta-content">
          <h2>Ready to track your AI visibility?</h2>
          <p>Join 500+ brands already monitoring their presence across AI platforms.</p>
          <Link href="/signup" className="tl-btn tl-btn--white tl-btn--lg">
            Start Tracking Free <span className="tl-arrow">&rarr;</span>
          </Link>
          <span className="tl-cta-note">Plans start at $9/mo &middot; Set up in 2 minutes</span>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="tl-footer">
        <div className="tl-footer-inner">
          <div className="tl-footer-grid">
            <div className="tl-footer-brand">
              <div className="tl-logo" style={{ fontSize: 22 }}>Track<span>ly</span></div>
              <p>Track your brand's visibility across AI platforms. Know when ChatGPT, Perplexity, Claude, Gemini & Grok mention you.</p>
            </div>
            <div className="tl-footer-col">
              <h4>Product</h4>
              <Link href="/#features">Features</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/how-it-works">How it Works</Link>
              <Link href="/use-cases">Use Cases</Link>
              <Link href="/integrations">Integrations</Link>
            </div>
            <div className="tl-footer-col">
              <h4>Resources</h4>
              <Link href="/blog">Blog</Link>
              <Link href="/geo-optimization">GEO Guide</Link>
              <Link href="/about">About</Link>
              <Link href="/contact">Contact</Link>
              <Link href="/changelog">Changelog</Link>
            </div>
            <div className="tl-footer-col">
              <h4>Legal</h4>
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms of Service</Link>
              <Link href="/cookies">Cookie Policy</Link>
            </div>
          </div>
          <div className="tl-footer-bottom">
            <span>&copy; {new Date().getFullYear()} Trackly. All rights reserved.</span>
            <div className="tl-footer-social">
              <a href="mailto:hello@trackly.com" aria-label="Email">✉</a>
              <a href="https://x.com/trackly" target="_blank" rel="noopener noreferrer" aria-label="X">𝕏</a>
              <a href="https://linkedin.com/company/trackly" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">in</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
