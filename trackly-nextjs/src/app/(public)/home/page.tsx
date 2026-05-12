'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { PRICING_PLANS, PRICING_COMPARISON } from '@/lib/constants';
import { MARKETING_NAV_LINKS } from '@/lib/marketing-nav';
import { CookiePreferencesButton } from '@/components/CookieConsent';

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

/* ─── SVG Icon components ─── */
const icons = {
  search: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>,
  chart: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>,
  shield: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>,
  target: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  settings: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
  trending: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  users: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  zap: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
};

const features = [
  { icon: icons.search, title: 'Multi-Platform Tracking', desc: 'Monitor your brand across ChatGPT, Perplexity, Claude, Gemini & Grok - all from a single dashboard.', accent: '#6366f1' },
  { icon: icons.chart, title: 'Share of Voice', desc: 'Measure what percentage of AI responses mention your brand vs competitors. Track SOV trends over time.', accent: '#8b5cf6' },
  { icon: icons.shield, title: 'Evidence & Proof', desc: 'Save full AI responses as verifiable proof. Export to CSV, share with clients, build trust with real data.', accent: '#06b6d4' },
  { icon: icons.target, title: 'Sentiment Analysis', desc: 'Know whether AI recommends your brand positively, negatively, or neutrally. Spot reputation shifts early.', accent: '#10b981' },
  { icon: icons.settings, title: 'Custom Queries', desc: 'Define exactly what your customers ask. Track performance per query, per platform, per location.', accent: '#f59e0b' },
  { icon: icons.trending, title: 'Competitor Intelligence', desc: 'Add competitors to see how they appear in AI responses alongside your brand. Benchmark and outrank.', accent: '#ef4444' },
];

const steps = [
  { num: '01', title: 'Add Your Brand', desc: 'Enter your brand name, industry, and location. Smart default queries are generated automatically.' },
  { num: '02', title: 'Auto-Track Daily', desc: 'Livesov queries all 5 AI platforms on your schedule. Results flow into your real-time dashboard.' },
  { num: '03', title: 'Analyze & Report', desc: 'See what each AI says about you. Track trends, export proof, and share data-backed reports.' },
];

const pricingPlans = PRICING_PLANS;
const pricingComparison = PRICING_COMPARISON;

const faqs = [
  { q: 'What is AI visibility tracking?', a: 'AI visibility tracking monitors how AI platforms like ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand when users ask questions. It reveals your brand\'s presence in the new AI-driven discovery layer.' },
  { q: 'Which AI platforms does Livesov support?', a: 'Livesov tracks your brand across 5 major AI platforms: ChatGPT (OpenAI), Perplexity AI, Claude (Anthropic), Google Gemini, and Grok (xAI).' },
  { q: 'What is Share of Voice in AI?', a: 'Share of Voice (SOV) in AI measures what percentage of AI-generated responses mention your brand when relevant queries are asked. A higher SOV means AI is more likely to recommend you.' },
  { q: 'How is this different from traditional SEO tools?', a: 'SEO tools track Google Search rankings. Livesov tracks your visibility in AI-generated answers - a completely different discovery channel that\'s growing rapidly.' },
  { q: 'Can I use Livesov for client reporting?', a: 'Yes. Livesov saves complete AI responses as proof, exportable as CSV reports. Agencies use it to deliver data-backed AI visibility audits to clients.' },
  { q: 'How much does Livesov cost?', a: 'Livesov has a free plan with 150 AI credits/month, 1 brand, 5 tracked prompts per brand, and 2 AI platforms. Paid plans start at $9/mo (Starter) with 750 credits, 3 brands, 15 prompts per brand, and 20 GEO audits. Pro ($29/mo) adds unlimited brands, 2,500 credits, 3 AI platforms, daily auto-runs, sentiment analysis, and 75 GEO audits. Agency ($89/mo) scales to 8,000 credits, all 5 AI platforms, premium AI models, priority support, API access, and 300 GEO audits.' },
];

const testimonials = [
  { text: 'We discovered that ChatGPT was consistently recommending a competitor we hadn\'t even considered. Once we saw the data, we adjusted our content strategy and started showing up within weeks.', name: 'S.K.', role: 'Marketing Director at a SaaS startup', initials: 'SK' },
  { text: 'Our agency needed a way to show clients their AI visibility without manually querying six different chatbots. Livesov replaced hours of manual checking with an actual dashboard and exportable proof.', name: 'M.R.', role: 'Founder of a boutique digital agency', initials: 'MR' },
  { text: 'As a solo founder, I had no idea whether AI platforms even knew my product existed. Turns out they didn\'t. Now I can track my progress as I work on improving it.', name: 'J.L.', role: 'Indie SaaS founder', initials: 'JL' },
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

/* ─── Demo section with typing effect ─── */
function DemoSection() {
  const queryText = '"Best HVAC company in Austin TX"';
  const typing = useTypingEffect(queryText, 40);
  const [showResults, setShowResults] = useState(false);
  const sectionRef = (node: HTMLElement | null) => {
    if (!node) return;
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { typing.start(); observer.unobserve(node); }
    }, { threshold: 0.2 });
    observer.observe(node);
  };

  // Fallback: if typing hasn't started after 3s (e.g. section already in view), start it
  useEffect(() => {
    const fallback = setTimeout(() => { typing.start(); }, 3000);
    return () => clearTimeout(fallback);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const goTo = (index: number) => setActive(index);
  const goPrev = () => setActive((active - 1 + testimonials.length) % testimonials.length);
  const goNext = () => setActive((active + 1) % testimonials.length);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { goPrev(); setPaused(true); }
    else if (e.key === 'ArrowRight') { goNext(); setPaused(true); }
  };

  return (
    <div
      className="tl-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={handleKeyDown}
      role="region"
      aria-roledescription="carousel"
      aria-label="Customer testimonials"
    >
      <div className="tl-carousel-track" aria-live={paused ? 'polite' : 'off'} style={{ transform: `translateX(-${active * 100}%)` }}>
        {testimonials.map((testimonial, i) => (
          <div key={testimonial.name} className="tl-carousel-slide" role="group" aria-roledescription="slide" aria-label={`Testimonial ${i + 1} of ${testimonials.length}`} aria-hidden={active !== i}>
            <div className="tl-carousel-quote">
              <svg className="tl-carousel-quote-icon" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M6 18C6 14.5 8 12 12 10L13 12C10 13.5 9.5 15.5 9.5 16.5H13V22H6V18ZM18 18C18 14.5 20 12 24 10L25 12C22 13.5 21.5 15.5 21.5 16.5H25V22H18V18Z" fill="currentColor" opacity="0.15"/>
              </svg>
              <p>&ldquo;{testimonial.text}&rdquo;</p>
            </div>
            <div className="tl-carousel-author">
              <div className="tl-testimonial-avatar">{testimonial.initials}</div>
              <div>
                <div className="tl-testimonial-name">{testimonial.name}</div>
                <div className="tl-testimonial-role">{testimonial.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="tl-carousel-controls">
        <button className="tl-carousel-arrow" onClick={goPrev} aria-label="Previous testimonial">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div className="tl-carousel-dots">
          {testimonials.map((_, i) => (
            <button key={i} className={`tl-carousel-dot ${active === i ? 'tl-carousel-dot--active' : ''}`}
              onClick={() => goTo(i)} aria-label={`Go to testimonial ${i + 1}`} aria-current={active === i ? 'true' : undefined} />
          ))}
        </div>
        <button className="tl-carousel-arrow" onClick={goNext} aria-label="Next testimonial">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button
          className="tl-carousel-pause"
          onClick={() => setPaused(!paused)}
          aria-label={paused ? 'Play auto-rotation' : 'Pause auto-rotation'}
        >
          {paused ? '▶' : '⏸'}
        </button>
      </div>
    </div>
  );
}

/* ─── Email capture component ─── */
function EmailCapture() {
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) { setStatus('success'); return; }
    if (!email || !email.includes('@')) { setStatus('error'); setErrorMsg('Please enter a valid email address.'); return; }

    setStatus('loading');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website: honeypot }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setErrorMsg(data.error || 'Something went wrong.');
        return;
      }
      setStatus('success');
      setEmail('');
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Please try again.');
    }
  };

  return (
    <form className="tl-email-form" onSubmit={handleSubmit}>
      <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
        <label htmlFor="newsletter-website">Website</label>
        <input id="newsletter-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </div>
      {status === 'success' ? (
        <div className="tl-email-success">
          <span>✓</span> Thanks! You&apos;re on the list.
        </div>
      ) : (
        <>
          <div className="tl-email-input-wrap">
            <input
              type="email"
              name="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (status === 'error') setStatus('idle'); }}
              className={`tl-email-input ${status === 'error' ? 'tl-email-input--error' : ''}`}
              disabled={status === 'loading'}
              required
            />
            <button type="submit" className="tl-btn tl-btn--primary" disabled={status === 'loading'}>
              {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
            </button>
          </div>
          {status === 'error' && <p className="tl-email-error">{errorMsg}</p>}
        </>
      )}
    </form>
  );
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (config: Record<string, unknown>) => { requestAccessToken: () => void } } } };
  }
}

export default function LivesovHomePage() {
  const { user, loginWithGoogle } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleClientIdRef = useRef<string | null>(null);
  const gsiLoadedRef = useRef(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Load Google Sign-In SDK
  useEffect(() => {
    if (user) return; // Skip if already logged in
    const initGoogle = (clientId: string) => {
      googleClientIdRef.current = clientId;
      if (!gsiLoadedRef.current && !document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => { gsiLoadedRef.current = true; setGoogleReady(true); };
        document.head.appendChild(s);
      } else {
        gsiLoadedRef.current = true;
        setGoogleReady(true);
      }
    };
    const envClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (envClientId) {
      initGoogle(envClientId);
    } else {
      fetch('/api/config').then(r => r.json()).then(d => {
        if (d.googleClientId) initGoogle(d.googleClientId);
      }).catch(() => {});
    }
  }, [user]);

  const handleGoogleSignIn = async () => {
    const clientId = googleClientIdRef.current;
    if (!clientId) return;
    if (!window.google?.accounts) {
      setGoogleLoading(true);
      await new Promise<void>((resolve, reject) => {
        let tries = 0;
        const check = setInterval(() => {
          if (window.google?.accounts) { clearInterval(check); resolve(); }
          if (++tries > 30) { clearInterval(check); reject(new Error('timeout')); }
        }, 200);
      }).catch(() => { setGoogleLoading(false); return; });
      setGoogleLoading(false);
    }
    if (!window.google?.accounts) return;
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      callback: async (tokenResponse: Record<string, string>) => {
        if (tokenResponse.error || !tokenResponse.access_token) return;
        setGoogleLoading(true);
        const result = await loginWithGoogle(tokenResponse.access_token);
        if (!result.error) {
          router.push('/dashboard');
        }
        setGoogleLoading(false);
      },
    });
    tokenClient.requestAccessToken();
  };

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

  // Scroll fade-in animation with 2s fallback
  useEffect(() => {
    const els = document.querySelectorAll('.tl-animate');
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('tl-animate--visible'); observer.unobserve(e.target); } }),
      { threshold: 0.15 }
    );
    els.forEach(el => observer.observe(el));
    const fallback = setTimeout(() => {
      els.forEach(el => el.classList.add('tl-animate--visible'));
    }, 2000);
    return () => { observer.disconnect(); clearTimeout(fallback); };
  }, []);

  return (
    <div className="trackly-landing">
      <a href="#main-content" className="skip-to-content">Skip to content</a>

      {/* ═══════ NAVIGATION ═══════ */}
      <nav className={`tl-nav ${scrolled ? 'tl-nav--scrolled' : ''}`}>
        <div className="tl-nav-inner">
          <Link href="/" className="tl-logo" aria-label="Livesov - Go to homepage">
            Live<span>sov</span>
          </Link>

          <button className="tl-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation menu" aria-expanded={menuOpen} aria-controls="tl-nav-links">
            <span className={menuOpen ? 'open' : ''} />
            <span className={menuOpen ? 'open' : ''} />
            <span className={menuOpen ? 'open' : ''} />
          </button>

          <div id="tl-nav-links" className={`tl-nav-links ${menuOpen ? 'tl-nav-links--open' : ''}`}>
            {MARKETING_NAV_LINKS.map((link) => {
              const href = link.homeHref ?? link.href;
              return <Link key={href} href={href} onClick={closeMenu}>{link.label}</Link>;
            })}
          </div>

          <div className="tl-nav-actions">
            <Link href="/login" className="tl-btn tl-btn--ghost">Login</Link>
            <Link href="/signup" className="tl-btn tl-btn--primary">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="tl-mobile-menu">
          {MARKETING_NAV_LINKS.map((link) => {
            const href = link.homeHref ?? link.href;
            return <Link key={href} href={href} onClick={closeMenu}>{link.label}</Link>;
          })}
          <div className="tl-mobile-menu-actions">
            <Link href="/login" className="tl-btn tl-btn--ghost" style={{ width: '100%' }}>Login</Link>
            <Link href="/signup" className="tl-btn tl-btn--primary" style={{ width: '100%' }}>Get Started</Link>
          </div>
        </div>
      )}

      <main id="main-content">
      {/* ═══════ HERO ═══════ */}
      <section className="tl-hero">
        <div className="tl-hero-grid-bg" />
        <div className="tl-hero-glow" />
        <div className="tl-hero-glow tl-hero-glow--2" />
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
            Track how ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand. Get real proof, measure share of voice, and optimize your GEO strategy.
          </p>
          <div className="tl-hero-ctas">
            <Link href="/signup" className="tl-btn tl-btn--primary tl-btn--lg">
              Start Tracking <span className="tl-arrow">&rarr;</span>
            </Link>
            <a href="#demo-section" onClick={(e) => smoothScrollTo(e)} className="tl-btn tl-btn--outline tl-btn--lg">
              See Demo
            </a>
          </div>

          <p className="tl-hero-note">7-day free trial &middot; No credit card required &middot; All 5 AI platforms included</p>
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
              <div key={f.title} className="tl-feature-card" style={{ '--card-accent': f.accent } as React.CSSProperties}>
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
            <p>A growing share of searches now use AI chatbots. If AI doesn't recommend you, you're invisible to a growing audience.</p>
          </div>

          <div className="tl-why-grid">
            <div className="tl-why-card">
              <div className="tl-why-stat">Growing</div>
              <h3>Searches use AI</h3>
              <p>Users are shifting from Google to ChatGPT and Perplexity for buying decisions.</p>
            </div>
            <div className="tl-why-card">
              <div className="tl-why-stat">&ne;</div>
              <h3>Traditional SEO wasn&apos;t built for AI platforms</h3>
              <p>Ranking #1 on Google doesn&apos;t guarantee AI will recommend you. AI visibility requires different signals.</p>
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
      <section className="tl-section tl-animate" id="pricing">
        <div className="tl-section-inner">
          <div className="tl-section-header">
            <span className="tl-section-tag">Pricing</span>
            <h2>Simple, transparent pricing</h2>
            <p>7-day free trial on every paid plan. No credit card required. Plans from $9/mo.</p>
          </div>

          <div className="tl-pricing-grid">
            {pricingPlans.map(plan => (
              <div key={plan.name} className={`tl-price-card ${plan.featured ? 'tl-price-card--featured' : ''}`}>
                {plan.featured && <div className="tl-price-badge">Most Popular</div>}
                <h3>{plan.name}</h3>
                <div className="tl-price-amount">
                  {plan.price}<span>/mo</span>
                </div>
                <div className="tl-price-includes">
                  <div className="tl-price-includes-label">Includes</div>
                  <div className="tl-price-includes-value">{plan.headline}</div>
                </div>
                <p className="tl-price-sub">{plan.sub}</p>
                <ul className="tl-price-features">
                  {plan.features.map(f => {
                    const isNegative = f.toLowerCase().startsWith('no ');
                    return (
                      <li key={f} style={isNegative ? { color: 'var(--tl-text-muted, #9ca3af)' } : undefined}>
                        {isNegative ? (
                          <span style={{ color: '#d1d5db', fontSize: 16, lineHeight: 1 }}>&mdash;</span>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.3 4.3L6 11.6L2.7 8.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        )}
                        {f}
                      </li>
                    );
                  })}
                </ul>
                <Link href="/signup" className={`tl-btn ${plan.featured ? 'tl-btn--primary' : 'tl-btn--outline'} tl-btn--full`}>
                  {plan.cta}
                </Link>
                {plan.name !== 'Free' && (
                  <p className="tl-price-trial">7-day free trial · No credit card</p>
                )}
              </div>
            ))}
          </div>

          <p className="tl-pricing-compare-link">
            Need a side-by-side breakdown? <Link href="/pricing">View the full plan comparison →</Link>
          </p>

          {/* Comparison Table */}
          <div className="tl-comparison">
            <h3 className="tl-comparison-title">How Livesov compares</h3>
            <p className="tl-comparison-sub">Purpose-built for AI visibility. Not a bolt-on feature.</p>
            <div className="tl-comparison-wrap">
              <table className="tl-comparison-table" aria-label="Livesov vs Ahrefs vs Semrush feature comparison">
                <caption className="sr-only">Feature comparison between Livesov, Ahrefs, and Semrush</caption>
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
                        <td key={ci} className={`${ci === 1 ? 'tl-comparison-highlight' : ''} ${cell.includes('\u2713') ? 'tl-cell-yes' : cell.includes('\u2717') ? 'tl-cell-no' : ''}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tl-comparison-disclaimer">Comparison based on publicly available features as of April 2026. Competitor pricing and features may have changed.</p>
          </div>

        </div>
      </section>

      {/* ═══════ TESTIMONIALS ═══════ */}
      <section className="tl-section tl-section--alt tl-animate">
        <div className="tl-section-inner">
          <div className="tl-section-header">
            <span className="tl-section-tag">Early Feedback</span>
            <h2>What Early Adopters Are Saying</h2>
            <p>Feedback from early adopters and beta testers.</p>
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

          <div className="tl-faq-list" role="list">
            {faqs.map((f, i) => (
              <div key={i} className={`tl-faq-item ${openFaq === i ? 'tl-faq-item--open' : ''}`} role="listitem">
                <button
                  className="tl-faq-q"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                  aria-controls={`faq-answer-${i}`}
                >
                  <span>{f.q}</span>
                  <svg className="tl-faq-chevron" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div className="tl-faq-a" id={`faq-answer-${i}`} role="region" aria-labelledby={`faq-q-${i}`}>
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
          <h2>Ready to track your AI visibility?</h2>
          <p>Start monitoring your presence across AI platforms today.</p>
          <Link href="/signup" className="tl-btn tl-btn--white tl-btn--lg">
            Start Tracking <span className="tl-arrow">&rarr;</span>
          </Link>
          <span className="tl-cta-note">Plans start at just $9/mo. Set up in under 2 minutes.</span>
        </div>
      </section>
      </main>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="tl-footer">
        <div className="tl-footer-inner">
          <div className="tl-footer-grid">
            <div className="tl-footer-brand">
              <div className="tl-logo" style={{ fontSize: 22 }}>Live<span>sov</span></div>
              <p>AI Visibility Tracker &mdash; Track how AI platforms mention your brand across ChatGPT, Perplexity, Claude, Gemini &amp; Grok.</p>
            </div>
            <div className="tl-footer-col">
              <h4>Product</h4>
              <Link href="/#features">Features</Link>
              <Link href="/#pricing">Pricing</Link>
              <Link href="/#how-it-works">How it Works</Link>
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
              <Link href="/partners">Partners</Link>
              <Link href="/vs/ahrefs">Livesov vs Ahrefs</Link>
              <Link href="/vs/semrush">Livesov vs Semrush</Link>
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
              <h4>Legal</h4>
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms of Service</Link>
              <Link href="/cookies">Cookie Policy</Link>
            </div>
          </div>
          <div className="tl-footer-bottom">
            <span>&copy; {new Date().getFullYear()} Livesov. All rights reserved.</span>
            <CookiePreferencesButton />
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
