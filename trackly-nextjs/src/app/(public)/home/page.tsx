'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MARKETING_NAV_LINKS } from '@/lib/marketing-nav';
import { newsreader, hankenGrotesk } from './fonts';
import '@/styles/livesov-home.css';

/* ──────────────────────────────────────────────────────────────────────────
   Livesov editorial home page - recreated from the Claude Design handoff
   (Livesov.html + home-*.jsx). Visuals match the prototype; CTAs/nav are
   wired to real routes and the canonical MARKETING_NAV_LINKS set.
   ────────────────────────────────────────────────────────────────────────── */

/* In-page smooth scroll for hrefs that contain a hash to a section on this page. */
function smoothScrollTo(e: React.MouseEvent<HTMLAnchorElement>, closeMenu?: () => void) {
  const href = e.currentTarget.getAttribute('href') || '';
  const hashIndex = href.indexOf('#');
  if (hashIndex === -1) { closeMenu?.(); return; }
  const hash = href.slice(hashIndex);
  const el = typeof document !== 'undefined' ? document.querySelector(hash) : null;
  if (el) {
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  closeMenu?.();
}

/* ─── Shared primitives ─── */
function Mark({ size = 26 }: { size?: number }) {
  return (
    <span className="lv-mk" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none">
        <path d="M4 14 L8 14 L11 7 L14 17 L17 11 L20 11" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Logo({ size = 26, word = true }: { size?: number; word?: boolean }) {
  return (
    <div className="lv-logo">
      <Mark size={size} />
      {word && <span className="lv-word">livesov</span>}
    </div>
  );
}

function Reveal({
  children, delay = 0, as: As = 'div', className = '', ...rest
}: { children: React.ReactNode; delay?: number; as?: React.ElementType; className?: string } & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setTimeout(() => el.classList.add('in'), delay); io.disconnect(); }
    }, { threshold: 0.12 });
    io.observe(el);
    const fallback = setTimeout(() => el.classList.add('in'), 2000 + delay);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, [delay]);
  return <As ref={ref} className={'reveal ' + className} {...rest}>{children}</As>;
}

/* Renders the final stat value directly. Earlier versions used a scroll-
   triggered count-up that initialised at zero, which meant SSR and the
   no-JS HTML showed "0" to crawlers and to anyone on a slow connection. */
function Counter({ to, suffix = '', prefix = '', decimals = 0 }:
  { to: number; suffix?: string; prefix?: string; decimals?: number }) {
  return <span>{prefix}{to.toFixed(decimals)}{suffix}</span>;
}

function SecHead({ eyebrow, title, sub, center = false, className = '' }:
  { eyebrow?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; center?: boolean; className?: string }) {
  return (
    <div className={'sec-head ' + (center ? 'center ' : '') + className}>
      {eyebrow && <div className="eyebrow"><span className="dot" /> {eyebrow}</div>}
      <h2>{title}</h2>
      {sub && <p className="sub">{sub}</p>}
    </div>
  );
}

/* ─── Navigation ─── */
function Nav() {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const closeMenu = () => setOpen(false);
  return (
    <nav className={'lv-nav' + (solid ? ' solid' : '') + (open ? ' open' : '')}>
      <div className="container lv-nav-inner">
        <Link href="/" aria-label="Livesov home"><Logo /></Link>
        <ul className="lv-nav-links">
          {MARKETING_NAV_LINKS.map((link) => {
            const href = link.homeHref ?? link.href;
            return (
              <li key={link.href}>
                <Link href={href} onClick={(e) => smoothScrollTo(e)}>{link.label}</Link>
              </li>
            );
          })}
        </ul>
        <div className="lv-nav-cta">
          <Link className="btn btn-ghost" href="/login">Sign in</Link>
          <Link className="btn btn-pri" href="/signup">Start free trial</Link>
        </div>
        <button className="lv-burger" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <span /><span /><span />
        </button>
      </div>
      <div className="lv-sheet">
        <ul>
          {MARKETING_NAV_LINKS.map((link) => {
            const href = link.homeHref ?? link.href;
            return (
              <li key={link.href}>
                <Link href={href} onClick={(e) => smoothScrollTo(e, closeMenu)}>{link.label}</Link>
              </li>
            );
          })}
        </ul>
        <div className="lv-sheet-cta">
          <Link className="btn btn-out btn-lg" href="/login" onClick={closeMenu}>Sign in</Link>
          <Link className="btn btn-pri btn-lg" href="/signup" onClick={closeMenu}>Start free trial</Link>
        </div>
      </div>
    </nav>
  );
}

/* ─── Live dashboard preview ───
   Crisp, vector recreation of the product dashboard. Replaces the old
   low-resolution 924x540 PNG, which blurred badly when upscaled on wide /
   high-DPI screens. Sized entirely in `em` driven by container query units,
   so it stays sharp at any width or device-pixel-ratio. */
const DASH_METRICS = [
  { k: 'Visibility', v: 82, sub: '142 prompts tracked' },
  { k: 'Sentiment', v: 74, sub: '+0.62 avg score' },
  { k: 'Accuracy', v: 88, sub: '6 false claims open' },
  { k: 'Competitive', v: 68, sub: 'leads in 5 / 8 categories' },
];

function DashIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function DashboardUI() {
  const R = 32;
  const C = 2 * Math.PI * R;
  const health = 78;
  return (
    <div className="dash-ui" role="img" aria-label="Livesov dashboard showing brand visibility across the 5 AI engines">
      {/* top bar */}
      <div className="dash-top">
        <span className="dash-mk">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 14 L8 14 L11 7 L14 17 L17 11 L20 11" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span className="dash-word">livesov</span>
        <span className="dash-brand"><span className="av">AC</span> Acme PM <span className="frac">3 / 5</span> <span className="caret">⌄</span></span>
        <span className="dash-addbrand">+ Add brand</span>
        <span className="dash-search">
          <DashIcon d="M11 11a5 5 0 1 0-7.1 0 5 5 0 0 0 7.1 0ZM15 15l-3.5-3.5" />
          <span className="txt">Search prompts, mentions, sources…</span>
          <span className="kbd">⌘K</span>
        </span>
        <span className="dash-icons">
          <span className="dash-flame">
            <DashIcon d="M12 3c1 3-1 4-1 6a3 3 0 0 0 5 2c1 2 1 4-1 6a5 5 0 0 1-8-4c0-3 3-4 3-7 1 1 2 2 3-3Z" />1
          </span>
          <span className="dash-ico"><DashIcon d="M20 6 9 17l-5-5" /></span>
          <span className="dash-ico"><DashIcon d="M9 9a3 3 0 1 1 4 2.8c-.8.4-1 .8-1 1.7M12 17h.01" /></span>
          <span className="dash-ico"><DashIcon d="M18 8a6 6 0 1 0-12 0c0 7-2 8-2 8h16s-2-1-2-8M10.5 20a2 2 0 0 0 3 0" /></span>
          <span className="dash-team">TEAM</span>
          <span className="dash-me">N</span>
        </span>
      </div>

      {/* body */}
      <div className="dash-body">
        {/* sidebar */}
        <div className="dash-side">
          <span className="dash-run"><DashIcon d="M7 4v16l13-8z" />Run all engines</span>
          <div className="dash-onboard">
            <div className="dash-onboard-h"><span>New here? Start with these</span><span className="x">✕</span></div>
            <div className="dash-step"><span className="n">1</span><span><span className="st">Overview</span><br /><span className="sd">Your daily snapshot</span></span></div>
            <div className="dash-step"><span className="n">2</span><span><span className="st">Mentions</span><br /><span className="sd">Every AI answer about you</span></span></div>
            <div className="dash-step"><span className="n">3</span><span><span className="st">Recommendations</span><br /><span className="sd">Do these to win</span></span></div>
            <div className="dash-tour">· Take the 20-second tour</div>
          </div>
          <div className="dash-navlbl">Dashboard ⓘ</div>
          <div className="dash-nav">
            <span className="dash-navi on"><DashIcon d="M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 13h7v7H4z" />Overview</span>
            <span className="dash-navi"><DashIcon d="M21 12a8 8 0 1 1-3-6.2L21 5" />Mentions<span className="badge">1.2k</span></span>
            <span className="dash-navi"><DashIcon d="M9 11l3 3 8-8M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />Evidence &amp; Proof</span>
          </div>
        </div>

        {/* main */}
        <div className="dash-main">
          <div className="dash-crumbs">
            <span className="cr">Livesov</span><span className="sp">/</span>
            <span className="cr">Dashboard</span><span className="sp">/</span>
            <span className="cr on">Overview</span>
            <span className="right">
              <span className="dash-lastrun"><span className="live-dot" /> Last run · 2 min ago</span>
              <span className="dash-btn">Export</span>
              <span className="dash-btn">Share</span>
            </span>
          </div>

          <div className="dash-welcome">Welcome back, <em>Nikhil.</em></div>
          <div className="dash-introrow">
            <p className="dash-intro">Acme is mentioned across the 5 AI engines - here&apos;s what changed in the last 7 days.</p>
            <span className="acts">
              <span className="dash-btn">+ Compare brand</span>
              <span className="dash-btn pri">↗ View live</span>
            </span>
          </div>

          <div className="dash-health">
            <svg className="wave" viewBox="0 0 200 100" preserveAspectRatio="none">
              <path d="M0 78 C 35 78 50 34 88 32 S 158 14 200 8" stroke="#fff" strokeWidth="2.5" fill="none" />
            </svg>
            <div className="dash-health-top">
              <svg className="dash-gauge" viewBox="0 0 80 80">
                <circle className="dash-gauge-track" cx="40" cy="40" r={R} />
                <circle className="dash-gauge-val" cx="40" cy="40" r={R} strokeDasharray={`${(health / 100) * C} ${C}`} transform="rotate(-90 40 40)" />
                <text x="40" y="41">{health}</text>
              </svg>
              <div>
                <div className="dash-health-lbl">Brand health</div>
                <div className="dash-health-big">{health}<span>/100</span></div>
                <span className="dash-health-chip">▲ 6 vs last week</span>
              </div>
            </div>
            <div className="dash-metrics">
              {DASH_METRICS.map((m) => (
                <div className="dash-metric" key={m.k}>
                  <div className="mrow"><span className="mk">{m.k}</span><span className="mv">{m.v}</span></div>
                  <div className="mbar"><i style={{ width: `${m.v}%` }} /></div>
                  <div className="msub">{m.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Hero · Trust strip ─── */
function Hero() {
  return (
    <header className="hero" id="top">
      <div className="container hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><span className="dot" /> Generative Engine Optimization</div>
          <h1 className="serif hero-h1">AI is the new search.<br /><em>Track your AI visibility.</em></h1>
          <p className="hero-sub">Livesov is the AI visibility tool that shows exactly how ChatGPT, Claude, Gemini, Perplexity and Grok answer the questions your buyers ask - and whether your brand gets mentioned, recommended, or ignored.</p>
          <div className="hero-cta">
            <Link className="btn btn-pri btn-lg" href="/geo-audit">Run my free audit <span className="ar">→</span></Link>
          </div>
          <div className="hero-trust">No credit card · Report in ~90 seconds · Plans from $9/mo</div>
        </div>
        <div className="hero-visual">
          <div className="shot hero-shot live">
            <DashboardUI />
          </div>
          <div className="hero-badge">
            <span className="chip"><span className="pulse" /> Tracking 5 engines · live</span>
          </div>
        </div>
      </div>

    </header>
  );
}

function Check() {
  return <span className="ic ic-check"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
}
function X() {
  return <span className="ic ic-x"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></span>;
}

/* ─── Problem ─── */
function Problem() {
  const stats = [
    { v: 68, suf: '%', l: 'of B2B buyers now consult an LLM before they shortlist vendors' },
    { v: 0, suf: '', l: 'legacy SEO platforms that surface this in their dashboard today' },
    { v: 5, suf: '', l: 'AI engines Livesov queries on your behalf, every single day' },
  ];
  return (
    <section className="section problem">
      <div className="container">
        <SecHead
          eyebrow="The problem"
          title={<>Your SEO tools are blind <em>to AI search.</em></>}
          sub="Ahrefs, Semrush and Search Console can't see what an LLM said about your brand last Tuesday at 2:14pm. By the time you find out you weren't mentioned, a competitor already was - twice."
        />
        <div className="prob-grid">
          <Reveal className="prob-card prob-old card">
            <div className="prob-card-top">
              <span className="prob-kicker">The old way</span>
              <h3 className="prob-h">Built for Google&apos;s ten blue links</h3>
            </div>
            <ul className="prob-list">
              <li><X /> Tracks Google rankings only</li>
              <li><X /> No view into ChatGPT, Claude, Gemini, Perplexity or Grok</li>
              <li><X /> Counts clicks, never citations</li>
              <li><X /> Keyword-based, not the way buyers actually ask</li>
            </ul>
          </Reveal>
          <Reveal className="prob-card prob-new card" delay={120}>
            <div className="prob-card-top">
              <span className="prob-kicker acc">With Livesov</span>
              <h3 className="prob-h">Built for how AI actually answers</h3>
            </div>
            <ul className="prob-list">
              <li><Check /> Tracks all 5 major AI engines, on a schedule</li>
              <li><Check /> Share of voice, sentiment and the sources cited</li>
              <li><Check /> Natural-language queries, the way buyers ask</li>
              <li><Check /> Flags hallucinations &amp; stale facts about you</li>
            </ul>
          </Reveal>
        </div>

        <div className="prob-stats">
          {stats.map((s, i) => (
            <Reveal key={i} className="prob-stat" delay={i * 90}>
              <div className="prob-stat-v serif"><Counter to={s.v} suffix={s.suf} /></div>
              <div className="prob-stat-l">{s.l}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── How it works ─── */
function HowItWorks() {
  const steps = [
    { n: '01', t: 'Connect your brand', d: 'Add your domain, your competitors, and the prompts your buyers actually ask. We seed 50+ industry queries to get you started in minutes.' },
    { n: '02', t: 'We query the engines', d: 'Livesov asks ChatGPT, Claude, Gemini, Perplexity and Grok on a schedule. Every answer is parsed for mentions, sentiment and sources.' },
    { n: '03', t: 'Watch your share of voice', d: 'See where you win, where you lose, and exactly which page each engine cites - with proof you can put in front of your CMO on Monday.' },
  ];
  return (
    <section className="section how" id="how-it-works">
      <div className="container">
        <SecHead
          eyebrow="How it works"
          title={<>Set up in under <em>two minutes.</em></>}
          sub="No SDK to install, no script to add. Point Livesov at your domain - we handle the rest, every day, forever."
        />
        <div className="how-grid">
          {steps.map((s, i) => (
            <Reveal key={s.n} className="how-card" delay={i * 110}>
              <div className="how-n serif">{s.n}</div>
              <h3 className="how-t">{s.t}</h3>
              <p className="how-d">{s.d}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Features ─── */
type FeatIconName = 'bars' | 'quote' | 'smile' | 'flag' | 'compare' | 'search';
function FeatIcon({ name }: { name: FeatIconName }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'bars': return <svg {...p}><path d="M4 20V11M10 20V5M16 20V14M22 20H2" /></svg>;
    case 'quote': return <svg {...p}><path d="M5 15h9l4 4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2Z" /><path d="M7.5 9h7M7.5 12h4" /></svg>;
    case 'smile': return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8.5 14c.9 1.1 2.1 1.7 3.5 1.7s2.6-.6 3.5-1.7" /><path d="M9 9.5h.01M15 9.5h.01" /></svg>;
    case 'flag': return <svg {...p}><path d="M5 21V4M5 4l8 3 6-2v9l-6 2-8-3" /></svg>;
    case 'compare': return <svg {...p}><path d="M4 5h6v15H4zM14 9h6v11h-6z" /></svg>;
    case 'search': return <svg {...p}><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>;
    default: return null;
  }
}

function Features() {
  const feats: { t: string; d: string; icon: FeatIconName }[] = [
    { t: 'Share of voice', d: 'Daily % share across all five engines. Compare any brand to any competitor over any window.', icon: 'bars' },
    { t: 'Evidence & proof', d: 'Every mention links to the verbatim model output, the prompt behind it, and the sources cited.', icon: 'quote' },
    { t: 'Sentiment', d: 'Positive, neutral or negative - scored per mention, charted over time, with alerts on drops.', icon: 'smile' },
    { t: 'Hallucination detection', d: 'Catches when an engine invents features, pricing or facts about your brand. Send corrections.', icon: 'flag' },
    { t: 'Competitor benchmarks', d: 'Watch competitors’ mentions in real time. Get alerted the moment they overtake you.', icon: 'compare' },
    { t: 'Custom queries', d: 'Add your own buyer questions. Track variations, intents and long-tail prompts at scale.', icon: 'search' },
  ];
  return (
    <section className="section features" id="features">
      <div className="container">
        <SecHead
          eyebrow="What's inside"
          title={<>Your complete <em>AI visibility platform.</em></>}
          sub="Everything you need to make sure the answer is you - a full AI visibility platform built from scratch for how AI engines answer, not bolted onto a 2010 SEO tool."
        />
        <div className="feat-grid">
          {feats.map((f, i) => (
            <Reveal key={f.t} className="feat-card" delay={(i % 3) * 80}>
              <span className="feat-ic"><FeatIcon name={f.icon} /></span>
              <h3 className="feat-t">{f.t}</h3>
              <p className="feat-d">{f.d}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Showcase ─── */
function Showcase() {
  const points = [
    { t: 'One pane of glass', d: 'Every engine, every brand, every query - in a single live workspace.' },
    { t: 'Drill to the exact line', d: 'From share-of-voice down to the sentence where an engine named a competitor.' },
    { t: 'Proof, not vibes', d: 'See the prompt, the verbatim answer, and the page each engine cited.' },
  ];
  return (
    <section className="section showcase" id="dashboard">
      <div className="container">
        <SecHead
          center
          eyebrow="The dashboard"
          title={<>A real workspace, <em>not a report PDF.</em></>}
          sub="Livesov is an AI visibility tracker you actually work in: watch share of voice move day to day, then drill into any answer to see precisely why."
        />
      </div>
      <div className="container showcase-frame-wrap">
        <Reveal className="shot showcase-shot live">
          <div className="sc-bar">
            <span className="sc-dots"><i /><i /><i /></span>
            <span className="sc-url">livesov.app / acme / overview</span>
          </div>
          <DashboardUI />
        </Reveal>
      </div>
      <div className="container sc-points">
        {points.map((p, i) => (
          <Reveal key={i} className="sc-point" delay={i * 90}>
            <h3 className="sc-point-t">{p.t}</h3>
            <p className="sc-point-d">{p.d}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─── Compare ─── */
type CellValue = 'yes' | 'no' | 'partial' | { price: string } | string;
function Cell({ v, hero }: { v: CellValue; hero?: boolean }) {
  if (typeof v === 'object' && v.price) return <span className="cmp-price serif">{v.price}<i>/mo</i></span>;
  if (v === 'yes') return <span className={'cmp-mark' + (hero ? ' acc' : '')}><svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
  if (v === 'no') return <span className="cmp-dash">-</span>;
  if (v === 'partial') return <span className="cmp-partial">partial</span>;
  return <span className="cmp-text">{v as string}</span>;
}

function Compare() {
  const rows: { f: string; lv: CellValue; ah: CellValue; sm: CellValue }[] = [
    { f: 'Tracks Google rankings', lv: 'no', ah: 'yes', sm: 'yes' },
    { f: 'Tracks ChatGPT, Claude, Gemini, Perplexity, Grok', lv: 'yes', ah: 'no', sm: 'no' },
    { f: 'Share of voice across engines', lv: 'yes', ah: 'no', sm: 'no' },
    { f: 'Hallucination detection', lv: 'yes', ah: 'no', sm: 'no' },
    { f: 'Sentiment per mention', lv: 'yes', ah: 'no', sm: 'partial' },
    { f: 'Cited-source attribution', lv: 'yes', ah: 'no', sm: 'no' },
    { f: 'Starting price', lv: { price: '$9' }, ah: '$99', sm: '$129' },
    { f: 'Setup time', lv: '2 min', ah: '~1 hr', sm: '~1 hr' },
  ];
  return (
    <section className="section compare" id="compare">
      <div className="container">
        <SecHead
          eyebrow="How we compare"
          title={<>The SEO tools haven&apos;t <em>caught up yet.</em></>}
          sub="Ahrefs and Semrush are the best in the world at what they do - but they were built for Google. The five AI engines aren't on their roadmap. They're already on your buyer's screen."
        />
        <Reveal className="cmp-scroll">
          <table className="cmp">
            <thead>
              <tr>
                <th className="cmp-feat">Feature</th>
                <th className="cmp-us"><Logo size={22} /></th>
                <th>Ahrefs</th>
                <th>Semrush</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="cmp-feat">{r.f}</td>
                  <td className="cmp-us"><Cell v={r.lv} hero /></td>
                  <td><Cell v={r.ah} /></td>
                  <td><Cell v={r.sm} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
        <p className="cmp-note">Pricing as of May 2026, from vendor pricing pages.</p>
      </div>
    </section>
  );
}

/* ─── Use cases ─── */
function UseCases() {
  const cases = [
    { t: 'SaaS marketing teams', d: 'Track every prompt buyers ask about your category and catch the moment an engine starts recommending a competitor instead of you.', v: '50+', l: 'buyer-intent queries seeded at setup' },
    { t: 'Agencies', d: 'Add GEO to your client deck without hiring an AI team. White-label reports, client workspaces, bulk audits.', v: '100', l: 'tracked prompts per Agency workspace' },
    { t: 'E-commerce brands', d: 'When a shopper asks an AI “what’s the best running shoe for flat feet”, be in the answer - and track every review-site citation.', v: '5 / 5', l: 'engines tracked for product queries' },
    { t: 'Enterprise brand teams', d: 'Catch hallucinations about your products before they spread, submit corrections, and get alerted when share of voice drops.', v: 'Daily', l: 'hallucination checks on every tracked prompt' },
  ];
  return (
    <section className="section usecases">
      <div className="container">
        <SecHead
          eyebrow="Who it's for"
          title={<>Built for the teams <em>already in the meeting.</em></>}
          sub="Whoever owns brand visibility on Google now owns it on the engines too. Livesov fits every shape of that job."
        />
        <div className="uc-grid">
          {cases.map((c, i) => (
            <Reveal key={c.t} className="uc-card" delay={(i % 2) * 90}>
              <div className="uc-body">
                <h3 className="uc-t">{c.t}</h3>
                <p className="uc-d">{c.d}</p>
              </div>
              <div className="uc-stat">
                <span className="uc-v serif">{c.v}</span>
                <span className="uc-l">{c.l}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ─── */
function Tick() {
  return <span className="tick"><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
}

function Pricing() {
  const tiers: { k: string; p: string; credits: string; s: string; f: string[]; cta: string; href: string; pri?: boolean; badge?: string }[] = [
    {
      k: 'Starter', p: '$9', credits: '750', s: 'Perfect for getting started',
      f: ['3 brands', '15 tracked prompts', '2 AI platforms', 'Competitor tracking (3)', 'Auto-runs every 2 days', '20 GEO audits / month'],
      cta: 'Start 7-day trial', href: '/signup', pri: false,
    },
    {
      k: 'Pro', p: '$29', credits: '2,500', s: 'For growing businesses',
      f: ['Unlimited brands', '25 tracked prompts', '3 AI platforms', 'Competitor tracking (8)', 'Daily auto-runs', 'Sentiment analysis', '75 GEO audits / month'],
      cta: 'Start 7-day trial', href: '/signup', pri: true, badge: 'Most popular',
    },
    {
      k: 'Agency', p: '$89', credits: '8,000', s: 'For agencies & teams',
      f: ['Unlimited brands', '100 tracked prompts', '5 AI platforms (all)', 'Competitor tracking (20)', 'Premium AI models', 'Daily auto-runs', 'Sentiment analysis', 'White-label reports'],
      cta: 'Contact sales', href: '/contact', pri: false,
    },
  ];
  return (
    <section className="section pricing" id="pricing">
      <div className="container">
        <SecHead
          center
          eyebrow="Pricing"
          title={<>One coffee a month to see <em>what AI says about you.</em></>}
          sub="Three plans. Each starts with a 7-day free trial - no credit card required."
        />
        <div className="price-grid">
          {tiers.map((t, i) => (
            <Reveal key={t.k} className={'price-card' + (t.pri ? ' pri' : '')} delay={i * 70}>
              {t.badge && <span className="price-badge">{t.badge}</span>}
              <div className="price-k">{t.k}</div>
              <div className="price-p"><span className="serif">{t.p}</span><i>/mo</i></div>
              <div className="price-incl">
                <span className="price-incl-lbl">Includes</span>
                <span className="price-incl-v"><b>{t.credits}</b> AI credits / month</span>
              </div>
              <div className="price-s">{t.s}</div>
              <ul className="price-f">
                {t.f.map((x, j) => <li key={j}><Tick /> {x}</li>)}
              </ul>
              <Link className={'btn price-cta ' + (t.pri ? 'btn-invert' : 'btn-out')} href={t.href}>{t.cta}</Link>
            </Reveal>
          ))}
        </div>
        <p className="price-note">1 credit = 1 AI query checked across the engines. Annual billing saves 20%.</p>
      </div>
    </section>
  );
}

/* ─── Testimonials ─── */
function Testimonials() {
  const items = [
    { q: 'Livesov is the first dashboard I check in the morning. Ahrefs is the second.', a: 'Head of SEO', co: 'B2B SaaS · Series C' },
    { q: 'We caught Claude recommending a competitor on our own brand query, and fixed our docs the same day.', a: 'CMO', co: 'Dev-tools startup' },
    { q: 'For $29 it does what we were quoted $4k a month for. Genuinely wild.', a: 'Founder', co: 'E-commerce · DTC' },
    { q: 'The hallucination detector paid for the whole year in week one.', a: 'Brand Marketing Lead', co: 'Fintech' },
  ];
  return (
    <section className="section tst">
      <div className="container">
        <SecHead
          eyebrow="Early users"
          title={<>People who already <em>checked their share.</em></>}
          sub="Anonymized - beta users, May 2026."
        />
        <div className="tst-grid">
          {items.map((it, i) => (
            <Reveal key={i} className="tst-card" delay={(i % 2) * 90}>
              <blockquote className="serif">{it.q}</blockquote>
              <figcaption>
                <span className="tst-avatar" aria-hidden="true">{it.a.charAt(0)}</span>
                <span><span className="tst-a">{it.a}</span><span className="tst-co">{it.co}</span></span>
              </figcaption>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA ─── */
function CTA() {
  const router = useRouter();
  return (
    <section className="section cta" id="audit">
      <div className="container">
        <div className="cta-card">
          <div className="eyebrow"><span className="dot" /> Free GEO audit - no card</div>
          <h2 className="serif cta-h">See what AI says about your brand <em>in 90 seconds.</em></h2>
          <p className="cta-sub">Drop your domain. We&apos;ll run 50 buyer-intent queries across all five engines and send you a report with your share of voice, every mention, and where competitors are winning.</p>
          <form className="cta-form" onSubmit={(e) => { e.preventDefault(); router.push('/geo-audit'); }}>
            <input type="text" placeholder="yourbrand.com" aria-label="Your domain" />
            <button type="submit" className="btn btn-pri btn-lg">Run my audit <span className="ar">→</span></button>
          </form>
          <div className="cta-meta">No credit card · ~90 seconds · Report + live dashboard</div>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ─── */
/* Links written explicitly (not mapped) so the canonical public-footer
   destinations - including the `/#features` anchor - are pinned in source,
   mirroring src/components/seo/SeoLayout.tsx (see tests/nav-features-anchor). */
function Footer() {
  return (
    <footer className="ft">
      <div className="container ft-tag">
        <p className="serif">Somewhere right now, an AI is answering <em>“what’s the best tool for…”</em></p>
        <p className="ft-tag-sub">Make sure the answer is you. <Link href="/geo-audit">Run your free audit →</Link></p>
      </div>
      <div className="container ft-grid">
        <div className="ft-brand">
          <Logo size={26} />
          <p>See what AI says about your brand - across ChatGPT, Claude, Gemini, Perplexity and Grok, every day.</p>
          <span className="chip"><span className="pulse" /> All engines operational</span>
        </div>
        <div className="ft-col">
          <div className="ft-col-t">Platform</div>
          <ul>
            <li><Link href="/chatgpt-brand-tracking">ChatGPT tracker</Link></li>
            <li><Link href="/claude-brand-tracking">Claude tracker</Link></li>
            <li><Link href="/gemini-brand-tracking">Gemini tracker</Link></li>
            <li><Link href="/perplexity-brand-tracking">Perplexity tracker</Link></li>
            <li><Link href="/grok-brand-tracking">Grok tracker</Link></li>
          </ul>
        </div>
        <div className="ft-col">
          <div className="ft-col-t">Compare</div>
          <ul>
            <li><Link href="/vs/ahrefs">vs Ahrefs</Link></li>
            <li><Link href="/vs/semrush">vs Semrush</Link></li>
            <li><Link href="/vs/otterly">vs Otterly</Link></li>
            <li><Link href="/vs/profound">vs Profound</Link></li>
            <li><Link href="/vs/peec-ai">vs Peec AI</Link></li>
            <li><Link href="/how-it-works">How it works</Link></li>
            <li><Link href="/#features">Features</Link></li>
          </ul>
        </div>
        <div className="ft-col">
          <div className="ft-col-t">Resources</div>
          <ul>
            <li><Link href="/geo-audit">Free GEO audit</Link></li>
            <li><Link href="/blog">Blog</Link></li>
            <li><Link href="/tools">Free Tools</Link></li>
            <li><Link href="/glossary">Glossary</Link></li>
            <li><Link href="/docs">Docs</Link></li>
            <li><Link href="/resources">Templates &amp; Resources</Link></li>
            <li><Link href="/geo-optimization">GEO guide</Link></li>
            <li><Link href="/case-studies">Case studies</Link></li>
            <li><Link href="/changelog">Changelog</Link></li>
          </ul>
        </div>
        <div className="ft-col">
          <div className="ft-col-t">Company</div>
          <ul>
            <li><Link href="/about">About</Link></li>
            <li><Link href="/use-cases">Use cases</Link></li>
            <li><Link href="/#pricing">Pricing</Link></li>
            <li><Link href="/partners">Partners</Link></li>
            <li><Link href="/contact">Contact</Link></li>
          </ul>
        </div>
      </div>
      <div className="container ft-bot">
        <span>© {new Date().getFullYear()} Livesov, Inc.</span>
        <span className="ft-legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/cookies">Cookies</Link>
        </span>
        <span><b>livesov</b> = live share of voice, for AI search.</span>
      </div>
    </footer>
  );
}

export default function LivesovHomePage() {
  return (
    <div className={`lv-home ${newsreader.variable} ${hankenGrotesk.variable}`}>
      <Nav />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Features />
        <Showcase />
        <Compare />
        <UseCases />
        <Pricing />
        <Testimonials />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
