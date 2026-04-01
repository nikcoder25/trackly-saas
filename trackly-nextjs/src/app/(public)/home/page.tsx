'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

/* ─── Animated counter hook (fixed memory leak) ─── */
function useCounter(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setStarted(true); observer.disconnect(); }
    }, { threshold: 0.3 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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

  return { count, ref: nodeRef };
}

/* ─── Smooth scroll helper ─── */
function smoothScrollTo(e: React.MouseEvent<HTMLAnchorElement>, closeMenu?: () => void) {
  const href = e.currentTarget.getAttribute('href');
  if (href?.startsWith('#')) {
    e.preventDefault();
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    closeMenu?.();
  }
}

/* ─── Platform data ─── */
const platforms = [
  { name: 'ChatGPT', color: '#10a37f', icon: '⬡', href: '/chatgpt-brand-tracking' },
  { name: 'Perplexity', color: '#9b72ff', icon: '◎', href: '/perplexity-brand-tracking' },
  { name: 'Claude', color: '#d97706', icon: '◈', href: '/claude-brand-tracking' },
  { name: 'Gemini', color: '#4285f4', icon: '✦', href: '/gemini-brand-tracking' },
  { name: 'Grok', color: '#1d9bf0', icon: '⚡', href: '/grok-brand-tracking' },
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
  { num: '02', title: 'Auto-Track Daily', desc: 'Livesov queries all 5 AI platforms on your schedule. Results flow into your real-time dashboard.' },
  { num: '03', title: 'Analyze & Report', desc: 'See what each AI says about you. Track trends, export proof, and share data-backed reports.' },
];

const pricingPlans = [
  { name: 'Starter', price: '$9', sub: 'Perfect for getting started', features: ['30 prompts/month', '1 brand', '2 AI platforms', 'Weekly tracking', 'SOV tracking & export'], cta: 'Get Started' },
  { name: 'Pro', price: '$29', sub: 'For growing businesses', featured: true, features: ['150 prompts/month', '3 brands', 'All 5 AI platforms', 'Daily tracking', 'Competitor tracking (3)', 'Sentiment analysis', 'Scheduled runs & webhooks'], cta: 'Start Pro' },
  { name: 'Agency', price: '$89', sub: 'For agencies & teams', features: ['500 prompts/month', '10 brands', 'All 5 AI platforms', 'Daily tracking', 'Competitor tracking (10)', 'Sentiment analysis', 'Scheduled runs & webhooks'], cta: 'Start Agency' },
  { name: 'Enterprise', price: '$499', sub: 'For large organizations', enterprise: true, features: ['10,000+ prompts/month', '100+ brands', 'All 5 AI platforms', 'Daily tracking', 'Unlimited competitors', 'API access', 'Priority support'], cta: 'Contact Sales' },
];

const useCases = [
  { icon: '🏢', title: 'Local Businesses', desc: 'See if AI recommends your business when locals search for services in your area. Track mentions across ChatGPT, Perplexity & more.' },
  { icon: '🚀', title: 'SaaS & Tech Companies', desc: 'Monitor how AI positions your product against competitors. Optimize your content strategy to improve AI-generated recommendations.' },
  { icon: '📱', title: 'Digital Agencies', desc: 'Offer AI visibility audits as a premium service. Use proof exports to create data-backed reports for every client.' },
  { icon: '🏥', title: 'Healthcare & Legal', desc: 'Ensure AI platforms provide accurate, positive information about your practice. Track sentiment and correct misinformation early.' },
  { icon: '🛒', title: 'E-commerce Brands', desc: 'Track whether AI recommends your products when shoppers ask for buying advice. Benchmark against top competitors.' },
  { icon: '🎓', title: 'Education & Consulting', desc: 'Monitor your personal or institutional brand presence in AI answers. Build authority in your niche through strategic optimization.' },
];

const pricingComparison = {
  headers: ['Feature', 'Livesov', 'Ahrefs', 'Semrush', 'Manual Search'],
  rows: [
    ['AI platform tracking', '✓ 5 platforms', '✗', '✗', '~ 1 at a time'],
    ['Share of Voice (AI)', '✓ Automatic', '✗', '✗', '✗'],
    ['Sentiment analysis', '✓ Built-in', '✗', '✗', '✗'],
    ['Competitor tracking', '✓ Up to 10+', '✗', '✗', '~ Manual'],
    ['Proof & evidence export', '✓ CSV + API', '✗', '✗', '~ Screenshots'],
    ['AI response monitoring', '✓ Daily', '✗', '✗', '~ Occasional'],
    ['Price', 'From $9/mo', '$99/mo', '$119/mo', 'Free (your time)'],
  ],
};

const faqs = [
  { q: 'What is AI visibility tracking?', a: 'AI visibility tracking monitors how AI platforms like ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand when users ask questions. It reveals your brand\'s presence in the new AI-driven discovery layer.' },
  { q: 'Which AI platforms does Livesov support?', a: 'Livesov tracks your brand across 5 major AI platforms: ChatGPT (OpenAI), Perplexity AI, Claude (Anthropic), Google Gemini, and Grok (xAI).' },
  { q: 'What is Share of Voice in AI?', a: 'Share of Voice (SOV) in AI measures what percentage of AI-generated responses mention your brand when relevant queries are asked. A higher SOV means AI is more likely to recommend you.' },
  { q: 'How is this different from traditional SEO tools?', a: 'SEO tools track Google Search rankings. Livesov tracks your visibility in AI-generated answers — a completely different discovery channel that\'s growing rapidly.' },
  { q: 'Can I use Livesov for client reporting?', a: 'Yes. Livesov saves complete AI responses as proof, exportable as CSV reports. Agencies use it to deliver data-backed AI visibility audits to clients.' },
  { q: 'How much does Livesov cost?', a: 'Plans start at $9/mo (Starter). Pro is $29/mo and Agency is $89/mo — the best value in AI visibility tracking.' },
];

const testimonials = [
  { text: 'We had no idea ChatGPT was recommending our competitor. Within a month of optimizing, our AI Share of Voice went from 0% to 34%.', name: 'Sarah Kim', role: 'Head of Growth, NovaBrand', initials: 'SK' },
  { text: 'Livesov is like Ahrefs but for AI search. Our agency uses it for every client now. The proof exports make reporting effortless.', name: 'Marco Rivera', role: 'Founder, Altitude Digital', initials: 'MR' },
  { text: 'As a solo founder, I needed to know if AI platforms were recommending me. Livesov gave me clarity in minutes.', name: 'James Liu', role: 'Founder, StackPilot', initials: 'JL' },
];

const demoResults = [
  { name: 'ChatGPT', color: '#10a37f', icon: '⬡', found: true, text: 'Based on available information, <mark>CoolAir Pro</mark> is a well-regarded HVAC provider in Austin TX. Customers praise them for responsive service and transparent pricing...' },
  { name: 'Perplexity', color: '#9b72ff', icon: '◎', found: true, text: '<mark>CoolAir Pro</mark> is a leading HVAC company in Austin TX [1]. Reviews highlight professional technicians and fair pricing [2]...' },
  { name: 'Claude', color: '#d97706', icon: '◈', found: true, text: 'I can share that <mark>CoolAir Pro</mark> has developed a solid reputation in the Austin TX HVAC market for professional service...' },
  { name: 'Gemini', color: '#4285f4', icon: '✦', found: true, text: '<mark>CoolAir Pro</mark> is an HVAC provider in Austin TX with consistent 4+ star ratings. Professional, licensed, transparent...' },
  { name: 'Grok', color: '#1d9bf0', icon: '⚡', found: false, text: 'For HVAC in Austin TX, I\'d recommend AC Express, Stan\'s Heating, and Green Leaf Air. Solid reviews and competitive pricing...' },
];

/* ─── Typing animation hook ─── */
function useTypingEffect(text: string, speed = 50) {
  const [displayed, setDisplayed] = useState('');
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!started || done) return;
    if (displayed.length >= text.length) { setDone(true); return; }
    const timer = setTimeout(() => setDisplayed(text.slice(0, displayed.length + 1)), speed);
    return () => clearTimeout(timer);
  }, [started, displayed, text, speed, done]);

  return { displayed, done, start: () => setStarted(true) };
}

/* ─── Social Proof with animated counters ─── */
function SocialProofBar() {
  const brands = useCounter(500, 2000);
  const platforms = useCounter(5, 1000);
  const queries = useCounter(50, 1500);

  return (
    <section className="tl-proof">
      <div className="tl-proof-inner">
        <div className="tl-proof-item" ref={brands.ref}>
          <span className="tl-proof-val">{brands.count}+</span>
          <span className="tl-proof-label">Brands tracked</span>
        </div>
        <div className="tl-proof-divider" />
        <div className="tl-proof-item" ref={platforms.ref}>
          <span className="tl-proof-val">{platforms.count}</span>
          <span className="tl-proof-label">AI platforms</span>
        </div>
        <div className="tl-proof-divider" />
        <div className="tl-proof-item" ref={queries.ref}>
          <span className="tl-proof-val">{queries.count}K+</span>
          <span className="tl-proof-label">Queries analyzed</span>
        </div>
        <div className="tl-proof-divider" />
        <div className="tl-proof-item">
          <span className="tl-proof-val">Real-time</span>
          <span className="tl-proof-label">Live results</span>
        </div>
      </div>
    </section>
  );
}

/* ─── Demo section with typing effect ─── */
function DemoSection() {
  const queryText = '"Best HVAC company in Austin TX"';
  const typing = useTypingEffect(queryText, 40);
  const [showResults, setShowResults] = useState(false);
  const sectionRef = (node: HTMLElement | null) => {
    if (!node) return;
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { typing.start(); observer.unobserve(node); }
    }, { threshold: 0.3 });
    observer.observe(node);
  };

  useEffect(() => {
    if (typing.done) {
      const timer = setTimeout(() => setShowResults(true), 300);
      return () => clearTimeout(timer);
    }
  }, [typing.done]);

  return (
    <section className="tl-section" id="demo-section" ref={sectionRef}>
      <div className="tl-section-inner">
        <div className="tl-section-header">
          <span className="tl-section-tag">Live Demo</span>
          <h2>See Livesov in Action</h2>
          <p>Here&apos;s what happens when you track a brand across all 5 AI platforms.</p>
        </div>

        <div className="tl-demo-window">
          <div className="tl-demo-toolbar">
            <div className="tl-demo-dots">
              <span className="tl-dot tl-dot--red" />
              <span className="tl-dot tl-dot--yellow" />
              <span className="tl-dot tl-dot--green" />
            </div>
            <div className="tl-demo-query">
              <span className="tl-demo-query-icon">&#x1F50D;</span>
              {typing.displayed}<span className="tl-cursor">|</span>
            </div>
          </div>
          <div className={`tl-demo-grid ${showResults ? 'tl-demo-grid--visible' : 'tl-demo-grid--hidden'}`}>
            {demoResults.map((d, i) => (
              <div key={d.name} className={`tl-demo-card ${!d.found ? 'tl-demo-card--missed' : ''}`} style={{ animationDelay: `${i * 0.1}s` }}>
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
  );
}

/* ─── Interactive Brand Checker ─── */
function BrandChecker() {
  const [brand, setBrand] = useState('');
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [scanIndex, setScanIndex] = useState(-1);
  const scanPlatforms = [
    { name: 'ChatGPT', color: '#10a37f', icon: '⬡', found: true, delay: 600 },
    { name: 'Perplexity', color: '#9b72ff', icon: '◎', found: true, delay: 900 },
    { name: 'Claude', color: '#d97706', icon: '◈', found: true, delay: 1200 },
    { name: 'Gemini', color: '#4285f4', icon: '✦', found: false, delay: 1500 },
    { name: 'Grok', color: '#1d9bf0', icon: '⚡', found: false, delay: 1800 },
  ];

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand.trim() || phase === 'scanning') return;
    setPhase('scanning');
    setScanIndex(-1);

    scanPlatforms.forEach((_, i) => {
      setTimeout(() => setScanIndex(i), scanPlatforms[i].delay);
    });
    setTimeout(() => setPhase('done'), 2400);
  };

  const handleReset = () => {
    setPhase('idle');
    setBrand('');
    setScanIndex(-1);
  };

  const foundCount = scanPlatforms.filter(p => p.found).length;

  return (
    <div className="tl-checker">
      {phase === 'idle' && (
        <form className="tl-checker-form" onSubmit={handleScan}>
          <div className="tl-checker-input-wrap">
            <svg className="tl-checker-search-icon" width="18" height="18" viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2"/>
              <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Enter your brand name..."
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="tl-checker-input"
            />
            <button type="submit" className="tl-btn tl-btn--primary">
              Check Visibility
            </button>
          </div>
          <p className="tl-checker-hint">Free instant check &middot; No signup required</p>
        </form>
      )}

      {phase === 'scanning' && (
        <div className="tl-checker-scanning">
          <p className="tl-checker-scanning-label">
            Scanning AI platforms for <strong>&ldquo;{brand}&rdquo;</strong>...
          </p>
          <div className="tl-checker-platforms">
            {scanPlatforms.map((p, i) => (
              <div key={p.name} className={`tl-checker-plat ${i <= scanIndex ? 'tl-checker-plat--done' : i === scanIndex + 1 ? 'tl-checker-plat--active' : ''}`}>
                <span className="tl-checker-plat-icon" style={{ color: p.color }}>{p.icon}</span>
                <span className="tl-checker-plat-name">{p.name}</span>
                {i <= scanIndex ? (
                  <span className={`tl-checker-plat-result ${p.found ? 'tl-checker-plat-result--found' : 'tl-checker-plat-result--missed'}`}>
                    {p.found ? '✓' : '✗'}
                  </span>
                ) : (
                  <span className="tl-checker-plat-spinner" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="tl-checker-results">
          <div className="tl-checker-results-header">
            <div className="tl-checker-score">
              <span className="tl-checker-score-num">{foundCount}/{scanPlatforms.length}</span>
              <span className="tl-checker-score-label">AI platforms mention <strong>&ldquo;{brand}&rdquo;</strong></span>
            </div>
            <p className="tl-checker-verdict">
              {foundCount >= 4 ? 'Good visibility! But are they recommending you positively?' :
               foundCount >= 2 ? 'You\'re partially visible. There\'s room to grow.' :
               'Low visibility. Most AI platforms don\'t mention you yet.'}
            </p>
          </div>
          <div className="tl-checker-results-actions">
            <Link href="/signup" className="tl-btn tl-btn--primary tl-btn--lg">
              Get Full Report <span className="tl-arrow">&rarr;</span>
            </Link>
            <button onClick={handleReset} className="tl-btn tl-btn--ghost">
              Try another brand
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Auto-rotating Testimonial Carousel ─── */
function TestimonialCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setActive(prev => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [paused]);

  return (
    <div className="tl-carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="tl-carousel-track" style={{ transform: `translateX(-${active * 100}%)` }}>
        {testimonials.map(t => (
          <div key={t.name} className="tl-carousel-slide">
            <div className="tl-carousel-quote">
              <svg className="tl-carousel-quote-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M6 18C6 14.5 8 12 12 10L13 12C10 13.5 9.5 15.5 9.5 16.5H13V22H6V18ZM18 18C18 14.5 20 12 24 10L25 12C22 13.5 21.5 15.5 21.5 16.5H25V22H18V18Z" fill="currentColor" opacity="0.15"/>
              </svg>
              <p>&ldquo;{t.text}&rdquo;</p>
            </div>
            <div className="tl-carousel-author">
              <div className="tl-testimonial-avatar">{t.initials}</div>
              <div>
                <div className="tl-testimonial-name">{t.name}</div>
                <div className="tl-testimonial-role">{t.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="tl-carousel-dots">
        {testimonials.map((_, i) => (
          <button key={i} className={`tl-carousel-dot ${active === i ? 'tl-carousel-dot--active' : ''}`}
            onClick={() => setActive(i)} aria-label={`Testimonial ${i + 1}`} />
        ))}
      </div>
    </div>
  );
}

/* ─── Email capture component ─── */
function EmailCapture() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) { setStatus('error'); return; }
    // TODO: integrate with email service
    setStatus('success');
    setEmail('');
  };

  return (
    <form className="tl-email-form" onSubmit={handleSubmit}>
      {status === 'success' ? (
        <div className="tl-email-success">
          <span>✓</span> Thanks! You&apos;re on the list.
        </div>
      ) : (
        <>
          <div className="tl-email-input-wrap">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setStatus('idle'); }}
              className={`tl-email-input ${status === 'error' ? 'tl-email-input--error' : ''}`}
              required
            />
            <button type="submit" className="tl-btn tl-btn--primary">
              Subscribe
            </button>
          </div>
          {status === 'error' && <p className="tl-email-error">Please enter a valid email address.</p>}
        </>
      )}
    </form>
  );
}

export default function LivesovHomePage() {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
      setShowBackToTop(window.scrollY > 600);
      // Close mobile menu on scroll
      if (menuOpen) setMenuOpen(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [menuOpen]);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.tl-mobile-menu') && !target.closest('.tl-hamburger')) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [menuOpen]);

  // Scroll fade-in animation
  useEffect(() => {
    const els = document.querySelectorAll('.tl-animate');
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('tl-animate--visible'); observer.unobserve(e.target); } }),
      { threshold: 0.15 }
    );
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="trackly-landing">

      {/* ═══════ NAVIGATION ═══════ */}
      <nav className={`tl-nav ${scrolled ? 'tl-nav--scrolled' : ''}`}>
        <div className="tl-nav-inner">
          <Link href="/" className="tl-logo">
            Live<span>sov</span>
          </Link>

          <button className="tl-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            <span className={menuOpen ? 'open' : ''} />
            <span className={menuOpen ? 'open' : ''} />
            <span className={menuOpen ? 'open' : ''} />
          </button>

          <div className={`tl-nav-links ${menuOpen ? 'tl-nav-links--open' : ''}`}>
            <a href="#features" onClick={(e) => smoothScrollTo(e, closeMenu)}>{t.nav.features}</a>
            <a href="#how-it-works" onClick={(e) => smoothScrollTo(e, closeMenu)}>{t.nav.howItWorks}</a>
            <a href="#use-cases" onClick={(e) => smoothScrollTo(e, closeMenu)}>{t.nav.useCases}</a>
            <a href="#pricing" onClick={(e) => smoothScrollTo(e, closeMenu)}>{t.nav.pricing}</a>
            <a href="#faq" onClick={(e) => smoothScrollTo(e, closeMenu)}>{t.nav.faq}</a>
          </div>

          <div className="tl-nav-actions">
            <LanguageSwitcher variant="light" />
            <Link href="/login" className="tl-btn tl-btn--ghost">{t.nav.login}</Link>
            <Link href="/signup" className="tl-btn tl-btn--primary">{t.nav.getStarted}</Link>
          </div>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="tl-mobile-menu">
          <a href="#features" onClick={(e) => smoothScrollTo(e, closeMenu)}>{t.nav.features}</a>
          <a href="#how-it-works" onClick={(e) => smoothScrollTo(e, closeMenu)}>{t.nav.howItWorks}</a>
          <a href="#use-cases" onClick={(e) => smoothScrollTo(e, closeMenu)}>{t.nav.useCases}</a>
          <a href="#pricing" onClick={(e) => smoothScrollTo(e, closeMenu)}>{t.nav.pricing}</a>
          <a href="#faq" onClick={(e) => smoothScrollTo(e, closeMenu)}>{t.nav.faq}</a>
          <div className="tl-mobile-menu-actions">
            <Link href="/login" className="tl-btn tl-btn--ghost" style={{ width: '100%' }}>{t.nav.login}</Link>
            <Link href="/signup" className="tl-btn tl-btn--primary" style={{ width: '100%' }}>{t.nav.getStarted}</Link>
          </div>
        </div>
      )}

      {/* ═══════ HERO ═══════ */}
      <section className="tl-hero">
        <div className="tl-hero-glow" />
        <div className="tl-hero-content">
          <div className="tl-badge">
            <span className="tl-badge-dot" />
            {t.hero.badge}
          </div>
          <h1>
            {t.hero.title}
            <span className="tl-gradient-text">{t.hero.titleHighlight}</span>
          </h1>
          <p className="tl-hero-sub">
            {t.hero.description}
          </p>
          {/* Interactive Brand Checker */}
          <BrandChecker />
          <p className="tl-hero-note">Plans start at $9/mo &middot; Set up in 2 minutes</p>
        </div>

        {/* Platform pills floating */}
        <div className="tl-hero-platforms">
          {platforms.map(p => (
            <Link key={p.name} href={p.href} className="tl-platform-pill" style={{ '--platform-color': p.color } as React.CSSProperties}>
              <span className="tl-platform-icon">{p.icon}</span>
              {p.name}
            </Link>
          ))}
        </div>
      </section>

      {/* ═══════ SOCIAL PROOF BAR ═══════ */}
      <SocialProofBar />

      {/* ═══════ LIVE DEMO ═══════ */}
      <DemoSection />

      {/* ═══════ FEATURES ═══════ */}
      <section className="tl-section tl-section--alt tl-animate" id="features">
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
      <section className="tl-section tl-animate" id="how-it-works">
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
                {i < steps.length - 1 && (
                  <div className="tl-step-connector">
                    <svg width="40" height="12" viewBox="0 0 40 12" fill="none">
                      <path d="M0 6H32M32 6L26 1M32 6L26 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3"/>
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ WHY AI VISIBILITY ═══════ */}
      <section className="tl-section tl-section--dark tl-animate">
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

      {/* ═══════ USE CASES ═══════ */}
      <section className="tl-section tl-section--alt tl-animate" id="use-cases">
        <div className="tl-section-inner">
          <div className="tl-section-header">
            <span className="tl-section-tag">Use Cases</span>
            <h2>Built for every type of business</h2>
            <p>From local shops to global agencies — Livesov helps you track and improve your AI visibility.</p>
          </div>

          <div className="tl-features-grid">
            {useCases.map(u => (
              <div key={u.title} className="tl-feature-card">
                <div className="tl-feature-icon">{u.icon}</div>
                <h3>{u.title}</h3>
                <p>{u.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ PRICING ═══════ */}
      <section className="tl-section tl-animate" id="pricing">
        <div className="tl-section-inner">
          <div className="tl-section-header">
            <span className="tl-section-tag">Pricing</span>
            <h2>Simple, transparent pricing</h2>
            <p>Plans from $9/mo. Scale as you grow. Best value in AI visibility tracking.</p>
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

          {/* Comparison Table */}
          <div className="tl-comparison">
            <h3 className="tl-comparison-title">How Livesov compares</h3>
            <p className="tl-comparison-sub">Purpose-built for AI visibility. Not a bolt-on feature.</p>
            <div className="tl-comparison-wrap">
              <table className="tl-comparison-table">
                <thead>
                  <tr>
                    {pricingComparison.headers.map((h, i) => (
                      <th key={h} className={i === 1 ? 'tl-comparison-highlight' : ''}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pricingComparison.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className={`${ci === 1 ? 'tl-comparison-highlight' : ''} ${cell.includes('✓') ? 'tl-cell-yes' : cell.includes('✗') ? 'tl-cell-no' : ''}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tl-comparison-disclaimer">Comparison based on publicly available features as of 2026. Subject to change.</p>
          </div>
        </div>
      </section>

      {/* ═══════ TESTIMONIALS ═══════ */}
      <section className="tl-section tl-section--alt tl-animate">
        <div className="tl-section-inner">
          <div className="tl-section-header">
            <span className="tl-section-tag">Testimonials</span>
            <h2>Trusted by marketers & agencies</h2>
            <p>See what people are saying about Livesov.</p>
          </div>

          <TestimonialCarousel />
        </div>
      </section>

      {/* ═══════ FAQ ═══════ */}
      <section className="tl-section tl-animate" id="faq">
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

      {/* ═══════ EMAIL CAPTURE ═══════ */}
      <section className="tl-section tl-animate" id="newsletter">
        <div className="tl-section-inner" style={{ maxWidth: 620 }}>
          <div className="tl-section-header">
            <span className="tl-section-tag">Stay Updated</span>
            <h2>Get AI visibility tips in your inbox</h2>
            <p>Weekly insights on GEO strategy, AI search trends, and brand optimization. No spam.</p>
          </div>
          <EmailCapture />
        </div>
      </section>

      {/* ═══════ FINAL CTA ═══════ */}
      <section className="tl-cta">
        <div className="tl-cta-glow" />
        <div className="tl-cta-content">
          <h2>{t.cta.title}</h2>
          <p>{t.cta.subtitle}</p>
          <Link href="/signup" className="tl-btn tl-btn--white tl-btn--lg">
            {t.cta.button} <span className="tl-arrow">&rarr;</span>
          </Link>
          <span className="tl-cta-note">{t.cta.note}</span>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="tl-footer">
        <div className="tl-footer-inner">
          <div className="tl-footer-grid">
            <div className="tl-footer-brand">
              <div className="tl-logo" style={{ fontSize: 22 }}>Live<span>sov</span></div>
              <p>{t.footer.desc}</p>
            </div>
            <div className="tl-footer-col">
              <h4>{t.footer.product}</h4>
              <Link href="/home#features">{t.footer.links.features}</Link>
              <Link href="/pricing">{t.footer.links.pricing}</Link>
              <Link href="/how-it-works">{t.footer.links.howItWorks}</Link>
              <Link href="/use-cases">{t.footer.links.useCases}</Link>
              <Link href="/integrations">{t.footer.links.integrations}</Link>
            </div>
            <div className="tl-footer-col">
              <h4>{t.footer.resources}</h4>
              <Link href="/blog">{t.footer.links.blog}</Link>
              <Link href="/geo-optimization">{t.footer.links.geoGuide}</Link>
              <Link href="/about">{t.footer.links.about}</Link>
              <Link href="/contact">{t.footer.links.contact}</Link>
              <Link href="/changelog">{t.footer.links.changelog}</Link>
            </div>
            <div className="tl-footer-col">
              <h4>AI Platforms</h4>
              <Link href="/chatgpt-brand-tracking">ChatGPT Tracking</Link>
              <Link href="/perplexity-brand-tracking">Perplexity Tracking</Link>
              <Link href="/claude-brand-tracking">Claude Tracking</Link>
              <Link href="/gemini-brand-tracking">Gemini Tracking</Link>
              <Link href="/grok-brand-tracking">Grok Tracking</Link>
            </div>
            <div className="tl-footer-col">
              <h4>{t.footer.legal}</h4>
              <Link href="/privacy">{t.footer.links.privacy}</Link>
              <Link href="/terms">{t.footer.links.terms}</Link>
              <Link href="/cookies">{t.footer.links.cookies}</Link>
              <Link href="/vs/ahrefs">Livesov vs Ahrefs</Link>
              <Link href="/vs/semrush">Livesov vs Semrush</Link>
            </div>
          </div>
          <div className="tl-footer-bottom">
            <span>&copy; {new Date().getFullYear()} {t.footer.copyright}</span>
            <div className="tl-footer-social">
              <a href="mailto:hello@livesov.com" aria-label="Email">✉</a>
              <a href="https://x.com/livesov" target="_blank" rel="noopener noreferrer" aria-label="X">𝕏</a>
              <a href="https://linkedin.com/company/livesov" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">in</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ═══════ BACK TO TOP ═══════ */}
      {showBackToTop && (
        <button
          className="tl-back-to-top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 15V5M10 5L5 10M10 5L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}
