'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function HomePage() {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--white)', overflow: 'hidden' }}>

      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-4 bg-white/92 border-b border-black/[.06] sticky top-0 z-50 backdrop-blur-[20px] flex-wrap">
        <div className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Live<span className="text-[var(--primary)]">sov</span>
        </div>

        {/* Hamburger */}
        <button
          className="flex md:hidden flex-col gap-1 p-2 border border-[var(--card-border)] rounded-md"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span className="block w-[18px] h-0.5 bg-[var(--text-primary)]" />
          <span className="block w-[18px] h-0.5 bg-[var(--text-primary)]" />
          <span className="block w-[18px] h-0.5 bg-[var(--text-primary)]" />
        </button>

        {/* Nav links */}
        <div className={`${menuOpen ? 'flex' : 'hidden'} md:flex flex-col md:flex-row gap-0 md:gap-8 order-3 md:order-none w-full md:w-auto mt-3 md:mt-0 pt-3 md:pt-0 border-t md:border-0 border-[var(--card-border)] md:ml-12 md:mr-auto`}>
          <a href="#features" onClick={() => setMenuOpen(false)} className="text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] transition py-2.5 md:py-0">{t.nav.features}</a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] transition py-2.5 md:py-0">{t.nav.howItWorks}</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)} className="text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] transition py-2.5 md:py-0">{t.nav.pricing}</a>
          <a href="#use-cases" onClick={() => setMenuOpen(false)} className="text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] transition py-2.5 md:py-0">{t.nav.useCases}</a>
          <a href="#faq" onClick={() => setMenuOpen(false)} className="text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] transition py-2.5 md:py-0">{t.nav.faq}</a>
        </div>

        {/* Right side */}
        <div className="flex gap-3 items-center order-2 md:order-none ml-auto md:ml-0">
          <LanguageSwitcher variant="light" />
          <Link href="/login" className="hidden sm:inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold text-[var(--text-secondary)] border border-[var(--card-border)] rounded-lg hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-section)] transition">
            {t.nav.login}
          </Link>
          <Link href="/signup" className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold text-white bg-[var(--primary)] rounded-lg shadow-[0_1px_2px_rgba(255,97,84,.3)] hover:bg-[var(--primary-hover)] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(255,97,84,.3)] transition">
            {t.nav.getStarted}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 pt-16 md:pt-20 pb-14 bg-gradient-to-b from-white to-[var(--bg-section)]">
        <div className="text-[13px] font-semibold text-[var(--primary)] border border-[var(--primary-border)] px-4 py-1.5 rounded-full bg-[var(--primary-light)] tracking-wider mb-7">
          {t.hero.badge}
        </div>
        <h1 className="text-[clamp(38px,5.5vw,62px)] font-extrabold tracking-[-2px] leading-[1.08] mb-6 max-w-[780px] text-[var(--text-primary)]">
          {t.hero.title}<span className="bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] bg-clip-text text-transparent">{t.hero.titleHighlight}</span>
        </h1>
        <p className="text-[var(--text-secondary)] text-lg max-w-[580px] leading-relaxed mb-10">{t.hero.description}</p>
        <div className="flex gap-3.5 items-center justify-center flex-col sm:flex-row w-full max-w-xs sm:max-w-none">
          <Link href="/signup" className="w-full sm:w-auto inline-flex items-center justify-center px-9 py-3.5 text-base font-bold text-white bg-[var(--primary)] rounded-lg shadow-[0_1px_2px_rgba(255,97,84,.3)] hover:bg-[var(--primary-hover)] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(255,97,84,.3)] transition">
            {t.hero.cta} &rarr;
          </Link>
          <a href="#demo-section" className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3.5 text-[15px] font-semibold text-[var(--text-secondary)] border border-[var(--card-border)] rounded-lg hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-section)] transition">
            {t.hero.ctaDemo}
          </a>
        </div>
      </section>

      {/* Social Proof */}
      <section className="flex flex-col items-center px-6 pt-12 pb-4">
        <div className="flex gap-6 sm:gap-10 flex-wrap justify-center">
          <div className="text-center"><div className="text-[22px] font-extrabold text-[var(--text-primary)]">500+</div><div className="text-xs text-[var(--text-muted)] mt-0.5">{t.socialProof.brandsTracked}</div></div>
          <div className="text-center"><div className="text-[22px] font-extrabold text-[var(--text-primary)]">7</div><div className="text-xs text-[var(--text-muted)] mt-0.5">{t.socialProof.aiPlatforms}</div></div>
          <div className="text-center"><div className="text-[22px] font-extrabold text-[var(--text-primary)]">50K+</div><div className="text-xs text-[var(--text-muted)] mt-0.5">{t.socialProof.queriesRun}</div></div>
          <div className="text-center"><div className="text-[22px] font-extrabold text-[var(--text-primary)]">Real-time</div><div className="text-xs text-[var(--text-muted)] mt-0.5">{t.socialProof.liveResults}</div></div>
        </div>
      </section>

      {/* Platform Chips */}
      <section className="flex justify-center gap-3 px-6 pt-9 pb-12 flex-wrap">
        {[
          { name: 'ChatGPT', color: '#19c37d', icon: '\u2B21' },
          { name: 'Perplexity', color: '#9b72ff', icon: '\u25CE' },
          { name: 'Claude', color: '#d97706', icon: '\u25C8' },
          { name: 'Gemini', color: '#4285f4', icon: '\u2726' },
          { name: 'Grok', color: '#1d9bf0', icon: '\u26A1' },
        ].map(p => (
          <div key={p.name} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[var(--card-border)] rounded-full text-[13px] font-semibold text-[var(--text-secondary)] shadow-[var(--card-shadow)] hover:-translate-y-0.5 hover:shadow-[var(--card-shadow-lg)] transition">
            <span style={{ color: p.color, fontSize: 16 }}>{p.icon}</span> {p.name}
          </div>
        ))}
      </section>

      {/* Live Demo */}
      <section className="px-6 pb-16 max-w-[960px] mx-auto" id="demo-section">
        <div className="bg-white border border-[var(--card-border)] rounded-xl overflow-hidden shadow-[var(--card-shadow-lg)]">
          <div className="px-5 py-3.5 bg-[var(--bg-section)] border-b border-[var(--card-border)] flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--success)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--card-border)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--card-border)]" />
            <span className="text-[11px] font-semibold text-[var(--text-muted)] ml-3">{t.demo.query}</span>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {[
              { name: 'ChatGPT', color: '#19c37d', icon: '\u2B21', found: true, text: t.demo.chatgptResponse },
              { name: 'Perplexity', color: '#9b72ff', icon: '\u25CE', found: true, text: t.demo.perplexityResponse },
              { name: 'Claude', color: '#d97706', icon: '\u25C8', found: true, text: t.demo.claudeResponse },
              { name: 'Gemini', color: '#4285f4', icon: '\u2726', found: true, text: t.demo.geminiResponse },
              { name: 'Grok', color: '#1d9bf0', icon: '\u26A1', found: false, text: t.demo.grokResponse },
            ].map(d => (
              <div key={d.name} className={`bg-[var(--bg-section)] border border-[var(--card-border)] rounded-lg p-4 relative hover:border-[var(--text-muted)] hover:-translate-y-px transition ${!d.found ? 'opacity-70' : ''}`}>
                <div className="flex items-center gap-2 mb-2.5 text-[13px] font-bold text-[var(--text-primary)]">
                  <span style={{ color: d.color, fontSize: 16 }}>{d.icon}</span> {d.name}
                </div>
                <span className={`absolute top-3 right-3 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                  d.found
                    ? 'bg-[var(--success-light)] text-[var(--success)] border-[rgba(16,185,129,.2)]'
                    : 'bg-[var(--danger-light)] text-[var(--red)] border-[rgba(239,68,68,.2)]'
                }`}>
                  {d.found ? t.demo.mentioned : t.demo.notFound}
                </span>
                <div className="text-xs text-[var(--text-secondary)] leading-relaxed [&_mark]:bg-[var(--primary-light)] [&_mark]:text-[var(--primary)] [&_mark]:rounded [&_mark]:px-1" dangerouslySetInnerHTML={{ __html: d.text }} />
              </div>
            ))}
          </div>
        </div>
        <div className="text-center mt-8">
          <Link href="/signup" className="inline-flex items-center justify-center px-9 py-3.5 text-[15px] font-bold text-white bg-[var(--primary)] rounded-lg shadow-[0_1px_2px_rgba(255,97,84,.3)] hover:bg-[var(--primary-hover)] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(255,97,84,.3)] transition">
            {t.demo.tryIt} &rarr;
          </Link>
          <p className="text-xs text-[var(--text-muted)] mt-2.5">{t.demo.plansStart}</p>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 max-w-[1080px] mx-auto" id="features">
        <div className="text-[13px] font-bold tracking-wider text-[var(--primary)] uppercase mb-2.5 text-center">{t.features.label}</div>
        <h2 className="text-4xl font-extrabold tracking-tight text-center mb-3.5 text-[var(--text-primary)]">{t.features.title}</h2>
        <p className="text-[var(--text-secondary)] text-base text-center mb-13 max-w-[520px] mx-auto leading-relaxed mb-12">{t.features.subtitle}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {t.features.items.map(f => (
            <div key={f.title} className="bg-white border border-[var(--card-border)] rounded-xl p-8 hover:-translate-y-1 hover:shadow-[var(--card-shadow-lg)] hover:border-transparent transition">
              <div className="text-[28px] mb-4 w-12 h-12 flex items-center justify-center bg-[var(--primary-light)] rounded-lg">{f.icon}</div>
              <h3 className="text-base font-bold mb-2.5 text-[var(--text-primary)]">{f.title}</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 px-6 max-w-[1080px] mx-auto" id="how-it-works">
        <div className="text-[13px] font-bold tracking-wider text-[var(--primary)] uppercase mb-2.5 text-center">{t.howItWorks.label}</div>
        <h2 className="text-4xl font-extrabold tracking-tight text-center mb-3.5 text-[var(--text-primary)]">{t.howItWorks.title}</h2>
        <p className="text-[var(--text-secondary)] text-base text-center mb-12 max-w-[520px] mx-auto leading-relaxed">{t.howItWorks.subtitle}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {t.howItWorks.steps.map(s => (
            <div key={s.num} className="text-center p-8 bg-white border border-[var(--card-border)] rounded-xl">
              <div className="inline-flex items-center justify-center w-10 h-10 text-sm font-extrabold text-[var(--primary)] bg-[var(--primary-light)] rounded-full mb-4">{s.num}</div>
              <h3 className="text-base font-bold mb-2.5 text-[var(--text-primary)]">{s.title}</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-6 max-w-[1080px] mx-auto" id="pricing">
        <div className="text-[13px] font-bold tracking-wider text-[var(--primary)] uppercase mb-2.5 text-center">{t.pricing.label}</div>
        <h2 className="text-4xl font-extrabold tracking-tight text-center mb-3.5 text-[var(--text-primary)]">{t.pricing.title}</h2>
        <p className="text-[var(--text-secondary)] text-base text-center mb-12 max-w-[520px] mx-auto leading-relaxed">{t.pricing.subtitle}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {t.pricing.plans.map((plan, i) => (
            <div key={plan.name} className={`bg-white border rounded-xl p-7 text-center relative hover:-translate-y-1 hover:shadow-[var(--card-shadow-lg)] transition ${
              plan.featured ? 'border-[var(--primary)] shadow-[0_0_0_1px_var(--primary),var(--card-shadow-lg)]' : plan.enterprise ? 'border-[var(--purple)]' : 'border-[var(--card-border)]'
            }`}>
              {plan.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold bg-[var(--primary)] text-white px-4 py-1 rounded-full tracking-wider">
                  {t.pricing.mostPopular}
                </span>
              )}
              <h3 className={`text-[15px] font-bold uppercase tracking-wider mb-1 ${plan.enterprise ? 'text-[var(--purple)]' : 'text-[var(--text-secondary)]'}`}>{plan.name}</h3>
              <div className="text-[40px] font-extrabold text-[var(--text-primary)] mt-4 mb-1">{plan.price}<span className="text-base text-[var(--text-muted)] font-normal">{t.pricing.perMonth}</span></div>
              <div className="text-[13px] text-[var(--text-muted)] mb-5">{plan.sub}</div>
              <ul className="text-left mb-6">
                {plan.features.map(f => (
                  <li key={f} className="text-sm text-[var(--text-secondary)] py-2 border-b border-[var(--bg-section)] before:content-['\u2713_'] before:text-[var(--success)] before:font-bold">{f}</li>
                ))}
              </ul>
              <Link href="/signup" className="w-full inline-flex items-center justify-center px-6 py-2.5 text-sm font-bold text-white bg-[var(--primary)] rounded-lg shadow-[0_1px_2px_rgba(255,97,84,.3)] hover:bg-[var(--primary-hover)] hover:-translate-y-px transition">
                {i === 0 ? t.pricing.getStarted : i === 1 ? t.pricing.startPro : i === 2 ? t.pricing.startAgency : t.pricing.contactSales}
              </Link>
            </div>
          ))}
        </div>

        {/* Comparison Table */}
        <div className="max-w-[900px] mx-auto mt-12">
          <h3 className="text-xl font-bold text-center mb-1.5">{t.pricing.comparison.title}</h3>
          <p className="text-[var(--text-secondary)] text-base text-center mb-6">{t.pricing.comparison.subtitle}</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-xs text-center">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {t.pricing.comparison.headers.map((h, i) => (
                    <th key={h} className={`p-2.5 font-semibold ${i === 0 ? 'text-left text-[var(--muted)]' : i === 1 ? 'text-[var(--primary)] font-bold' : 'text-[var(--muted)]'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.pricing.comparison.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-[var(--border)]">
                    {row.map((cell, ci) => (
                      <td key={ci} className={`p-2 ${ci === 0 ? 'text-left' : ''} ${ci === 1 ? 'text-[var(--primary)] font-bold' : ''} ${cell.includes('\u2713') && ci !== 1 ? 'text-[var(--green)]' : ''} ${cell.includes('\u2717') ? 'text-[var(--red)]' : ''}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Why AI Visibility */}
      <section className="py-20 px-6 max-w-[1080px] mx-auto">
        <div className="text-[13px] font-bold tracking-wider text-[var(--primary)] uppercase mb-2.5 text-center">{t.whyAI.label}</div>
        <h2 className="text-4xl font-extrabold tracking-tight text-center mb-3.5 text-[var(--text-primary)]">{t.whyAI.title}</h2>
        <p className="text-[var(--text-secondary)] text-base text-center mb-12 max-w-[520px] mx-auto leading-relaxed">{t.whyAI.subtitle}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {t.whyAI.items.map(item => (
            <article key={item.title} className="bg-white border border-[var(--card-border)] rounded-xl p-8 hover:-translate-y-1 hover:shadow-[var(--card-shadow-lg)] hover:border-transparent transition">
              <div className="text-[28px] mb-4 w-12 h-12 flex items-center justify-center bg-[var(--primary-light)] rounded-lg">{item.icon}</div>
              <h3 className="text-base font-bold mb-2.5 text-[var(--text-primary)]">{item.title}</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20 px-6 max-w-[1080px] mx-auto" id="use-cases">
        <div className="text-[13px] font-bold tracking-wider text-[var(--primary)] uppercase mb-2.5 text-center">{t.useCases.label}</div>
        <h2 className="text-4xl font-extrabold tracking-tight text-center mb-3.5 text-[var(--text-primary)]">{t.useCases.title}</h2>
        <p className="text-[var(--text-secondary)] text-base text-center mb-12 max-w-[520px] mx-auto leading-relaxed">{t.useCases.subtitle}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {t.useCases.items.map(item => (
            <article key={item.title} className="bg-white border border-[var(--card-border)] rounded-xl p-8 hover:-translate-y-1 hover:shadow-[var(--card-shadow-lg)] hover:border-transparent transition">
              <div className="text-[28px] mb-4 w-12 h-12 flex items-center justify-center bg-[var(--primary-light)] rounded-lg">{item.icon}</div>
              <h3 className="text-base font-bold mb-2.5 text-[var(--text-primary)]">{item.title}</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6 max-w-[1080px] mx-auto" id="faq">
        <div className="text-[13px] font-bold tracking-wider text-[var(--primary)] uppercase mb-2.5 text-center">{t.faq.label}</div>
        <h2 className="text-4xl font-extrabold tracking-tight text-center mb-3.5 text-[var(--text-primary)]">{t.faq.title}</h2>
        <p className="text-[var(--text-secondary)] text-base text-center mb-12 max-w-[520px] mx-auto leading-relaxed">{t.faq.subtitle}</p>
        <div className="max-w-[700px] mx-auto">
          {t.faq.items.map(item => (
            <details key={item.q} className="bg-white border border-[var(--card-border)] rounded-lg mb-2.5 overflow-hidden hover:border-[var(--text-muted)] transition group open:border-[var(--primary-border)] open:bg-[var(--primary-light)]">
              <summary className="px-6 py-[18px] text-[15px] font-semibold cursor-pointer text-[var(--text-primary)] flex justify-between items-center [&::-webkit-details-marker]:hidden after:content-['+'] after:text-xl after:text-[var(--primary)] after:font-semibold group-open:after:content-['\u2212']">
                {item.q}
              </summary>
              <p className="px-6 pb-5 text-sm text-[var(--text-secondary)] leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-6 max-w-[1080px] mx-auto">
        <h2 className="text-4xl font-extrabold tracking-tight text-center mb-3.5 text-[var(--text-primary)]">{t.testimonials.title}</h2>
        <p className="text-[var(--text-secondary)] text-base text-center mb-12 max-w-[520px] mx-auto leading-relaxed">{t.testimonials.subtitle}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {t.testimonials.items.map(item => (
            <div key={item.name} className="bg-white border border-[var(--card-border)] rounded-xl p-7 hover:shadow-[var(--card-shadow-lg)] hover:-translate-y-0.5 transition">
              <div className="text-[var(--warning)] text-base tracking-widest mb-3.5">{'\u2733'}{'\u2733'}{'\u2733'}{'\u2733'}{'\u2733'}</div>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-5 italic">{item.text}</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] text-white flex items-center justify-center text-[13px] font-bold shrink-0">{item.initials}</div>
                <div>
                  <div className="text-[13px] font-semibold text-[var(--text-primary)]">{item.name}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">{item.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-6 mb-20 rounded-xl bg-gradient-to-br from-[var(--text-primary)] to-[#2d1b4e] text-white py-20 px-10 text-center max-w-[1080px] lg:mx-auto">
        <h2 className="text-4xl font-extrabold text-white mb-4">{t.cta.title}</h2>
        <p className="text-white/70 text-base mb-9 max-w-[520px] mx-auto">{t.cta.subtitle}</p>
        <Link href="/signup" className="inline-flex items-center justify-center px-11 py-4 text-base font-bold text-white bg-[var(--primary)] rounded-lg shadow-[0_1px_2px_rgba(255,97,84,.3)] hover:bg-[var(--primary-hover)] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(255,97,84,.3)] transition">
          {t.cta.button} &rarr;
        </Link>
        <p className="text-[13px] text-white/50 mt-4">{t.cta.note}</p>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--card-border)] bg-[var(--bg-section)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-10 p-8 md:p-12 max-w-[1080px] mx-auto">
          <div className="max-w-[280px]">
            <div className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight mb-3">Live<span className="text-[var(--primary)]">sov</span></div>
            <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">{t.footer.desc}</p>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-primary)] mb-1">{t.footer.product}</div>
            <Link href="/#features" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] transition">{t.footer.links.features}</Link>
            <Link href="/pricing" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] transition">{t.footer.links.pricing}</Link>
            <Link href="/how-it-works" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] transition">{t.footer.links.howItWorks}</Link>
            <Link href="/use-cases" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] transition">{t.footer.links.useCases}</Link>
            <Link href="/integrations" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] transition">{t.footer.links.integrations}</Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-primary)] mb-1">{t.footer.resources}</div>
            <Link href="/blog" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] transition">{t.footer.links.blog}</Link>
            <Link href="/geo-optimization" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] transition">{t.footer.links.geoGuide}</Link>
            <Link href="/about" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] transition">{t.footer.links.about}</Link>
            <Link href="/contact" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] transition">{t.footer.links.contact}</Link>
            <Link href="/changelog" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] transition">{t.footer.links.changelog}</Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-primary)] mb-1">{t.footer.legal}</div>
            <Link href="/privacy" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] transition">{t.footer.links.privacy}</Link>
            <Link href="/terms" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] transition">{t.footer.links.terms}</Link>
            <Link href="/cookies" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] transition">{t.footer.links.cookies}</Link>
          </div>
        </div>
        <div className="flex justify-between items-center px-8 md:px-12 py-5 border-t border-[var(--card-border)] max-w-[1080px] mx-auto flex-wrap gap-3">
          <div className="text-[13px] text-[var(--text-muted)]">&copy; {new Date().getFullYear()} {t.footer.copyright}</div>
          <div className="flex gap-4">
            <a href="mailto:hello@livesov.com" className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)] text-base font-bold border border-[var(--card-border)] rounded-full hover:text-[var(--primary)] hover:border-[var(--primary-border)] transition" aria-label="Email">{'\u2709'}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
