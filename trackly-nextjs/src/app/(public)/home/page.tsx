'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PRICING_PLANS } from '@/lib/constants';
import SiteShell from '@/components/site/SiteShell';

/* ──────────────────────────────────────────────────────────────────────────
   Livesov home page - recreated from the "Livesov Website" Claude Design
   canvas (Home artboard). Header links render from MARKETING_NAV_LINKS in
   SiteHeader; the in-page anchors below (#features, #how-it-works) are the
   homeHref targets of that list.
   ────────────────────────────────────────────────────────────────────────── */

const ENGINES = [
  { name: 'ChatGPT', pct: 46 },
  { name: 'Claude', pct: 38 },
  { name: 'Gemini', pct: 31 },
  { name: 'Perplexity', pct: 24 },
  { name: 'Grok', pct: 18 },
];

/* ─── Hero + product preview ─── */
function Hero() {
  return (
    <>
      <section className="ls-wrap ls-hero-c">
        <div className="ls-pill" style={{ alignSelf: 'center' }}><span className="ls-dot" />Live share of voice for AI search</div>
        <h1 className="ls-h1 xl">AI visibility tracker <span className="ls-em acc">for agencies.</span></h1>
        <p className="ls-lead xl">
          Livesov tracks how ChatGPT, Claude, Gemini, Perplexity and Grok answer your customers&apos; questions, and shows whether each client is mentioned, recommended or ignored.
        </p>
        <div className="ls-cta-row">
          <Link href="/geo-audit" className="ls-btn ls-btn-pri ls-btn-lg">Run my free audit</Link>
          <Link href="/pricing" className="ls-btn ls-btn-out ls-btn-lg">See pricing</Link>
        </div>
        <p className="ls-trust">No credit card · Report in about 90 seconds · Plans from $19/mo</p>
      </section>

      <section className="ls-wrap" style={{ paddingTop: 24, paddingBottom: 64 }}>
        <div className="ls-shot" role="img" aria-label="Livesov dashboard: brand health, share of voice by engine and latest AI mentions">
          <div className="ls-shot-in">
            <div className="ls-shot-top">
              <div className="ls-shot-ws"><span className="ls-shot-av">A</span>Acme PM workspace</div>
              <div style={{ display: 'flex', gap: 8 }}><span className="ls-chip">Last 30 days</span><span className="ls-chip">5 engines</span></div>
            </div>
            <div className="ls-shot-grid">
              <div className="ls-shot-col" style={{ gap: 20 }}>
                <div className="ls-cap">Brand health</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div className="ls-ring" style={{ width: 120, height: 120 }}>
                    <div style={{ width: 92, height: 92 }}>
                      <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1 }}>78</span>
                      <span style={{ fontSize: 11, color: 'var(--ls-subtle)' }}>of 100</span>
                    </div>
                  </div>
                  <div className="ls-stack ls-gap-8" style={{ fontSize: 14, color: 'var(--ls-muted)' }}>
                    <span>Visibility</span><span>Sentiment</span><span>Accuracy</span><span>Competitive</span>
                  </div>
                </div>
              </div>
              <div className="ls-shot-col">
                <div className="ls-cap">Share of voice by engine</div>
                {ENGINES.map((e, i) => (
                  <div key={e.name} className="ls-stack" style={{ gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                      <span>{e.name}</span><span className="ls-mono">{e.pct}%</span>
                    </div>
                    <div className="ls-bar"><i style={{ width: `${e.pct * 2}%`, opacity: 1 - i * 0.14 }} /></div>
                  </div>
                ))}
              </div>
              <div className="ls-shot-col">
                <div className="ls-cap">Latest mentions</div>
                <div className="ls-mention">
                  <div className="ls-mention-h"><span style={{ color: 'var(--ls-green-ink)' }}>Recommended</span><span>ChatGPT</span></div>
                  <div className="ls-mention-t">&ldquo;best project tool for small agencies&rdquo;</div>
                </div>
                <div className="ls-mention">
                  <div className="ls-mention-h"><span style={{ color: 'var(--ls-accent-ink)' }}>Mentioned</span><span>Perplexity</span></div>
                  <div className="ls-mention-t">&ldquo;Acme PM vs competitor pricing&rdquo;</div>
                </div>
                <div className="ls-mention warn">
                  <div className="ls-mention-h"><span style={{ color: 'var(--ls-warm-ink)' }}>Hallucination</span><span>Grok</span></div>
                  <div className="ls-mention-t">Wrong price quoted. Proof saved.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ls-band">
        <div className="ls-wrap ls-engines">
          <span className="ls-cap">Queried on schedule</span>
          <div className="ls-engines-list">
            {ENGINES.map((e) => <span key={e.name}>{e.name}</span>)}
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── Problem ─── */
function Problem() {
  return (
    <section className="ls-wrap ls-sec" style={{ paddingTop: 112, paddingBottom: 56, gap: 48 }}>
      <div className="ls-sec-head">
        <span className="ls-eyebrow">The problem</span>
        <h2 className="ls-h2">Your SEO tools are blind <span className="ls-em">to AI search.</span></h2>
        <p className="ls-body" style={{ fontSize: 18 }}>
          Ahrefs, Semrush and Search Console are built around Google rankings. Where the suites track AI answers at all, it is a paid add-on on top of the base plan.
        </p>
      </div>
      <div className="ls-grid ls-grid-2">
        <div className="ls-vs-card old">
          <h3 style={{ fontWeight: 600, fontSize: 20 }}>The old way</h3>
          <ul>
            <li>Google rankings only</li>
            <li>Counting clicks</li>
            <li>Keyword based tracking</li>
            <li>No idea what AI says</li>
          </ul>
        </div>
        <div className="ls-vs-card new">
          <h3 style={{ fontWeight: 600, fontSize: 20 }}>With Livesov</h3>
          <ul>
            <li>Up to five AI engines, on a schedule</li>
            <li>Share of voice and sentiment</li>
            <li>Natural language buyer prompts</li>
            <li>Cited sources and hallucination flags</li>
          </ul>
        </div>
      </div>
      {/* The 52% figure is third-party, so it links to the page that shows
          the sourcing instead of sitting on the homepage unattributed. */}
      <div className="ls-grid ls-grid-4 ls-stats">
        <div className="ls-stack ls-gap-8">
          <span className="ls-stat-v">52%</span>
          <span className="ls-small">of B2B tech buyers use generative AI when weighing vendors</span>
          <Link href="/ai-search-statistics-2026" className="ls-mono" style={{ fontSize: 12 }}>Source</Link>
        </div>
        <div className="ls-stack ls-gap-8">
          <span className="ls-stat-v">$19</span>
          <span className="ls-small">a month to start, no SEO suite or add-on needed</span>
        </div>
        <div className="ls-stack ls-gap-8">
          <span className="ls-stat-v">5</span>
          <span className="ls-small">AI engines you can query on a schedule</span>
        </div>
      </div>
    </section>
  );
}

/* ─── How it works ─── */
function HowItWorks() {
  const steps = [
    { n: '01', t: 'Connect your brand', d: 'Add the domain, competitors and buyer prompts. Start fast with suggested buyer prompts.' },
    { n: '02', t: 'We query the engines', d: 'Prompts run on a schedule. Every answer is parsed for mentions, sentiment and cited sources.' },
    { n: '03', t: 'Watch share of voice', d: 'See wins, losses, and the pages search-enabled engines cite for every client.' },
  ];
  return (
    <section className="ls-wrap ls-sec" id="how-it-works">
      <div className="ls-sec-row">
        <div className="ls-sec-head">
          <span className="ls-eyebrow">How it works</span>
          <h2 className="ls-h2">Set up in under <span className="ls-em">two minutes.</span></h2>
        </div>
        <Link href="/features" className="ls-link">Explore all features</Link>
      </div>
      <div className="ls-grid ls-grid-3">
        {steps.map((s) => (
          <div key={s.n} className="ls-card ls-stack ls-gap-14">
            <span className="ls-kicker">{s.n}</span>
            <h3 className="ls-h3">{s.t}</h3>
            <p className="ls-body">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Features ─── */
function Features() {
  const feats = [
    { t: 'Share of voice', d: 'A daily percentage of how often each client shows up across the engines you track.' },
    { t: 'Evidence and proof', d: 'Verbatim output, the exact prompt and every cited source. Drill to the exact line.' },
    { t: 'Sentiment', d: 'Every mention scored and charted, with alerts when tone drops.' },
    { t: 'Hallucination detection', d: 'Flags invented features, wrong pricing or false facts before buyers see them.' },
    { t: 'Competitor benchmarks', d: 'Track rivals in real time and get alerted the day one overtakes you.' },
    { t: 'Custom queries', d: 'Add your own buyer questions and long tail prompts for every client.' },
  ];
  return (
    <section className="ls-wrap ls-sec" id="features">
      <div className="ls-sec-head">
        <span className="ls-eyebrow">Features</span>
        <h2 className="ls-h2">Your complete <span className="ls-em">AI visibility tracker.</span></h2>
      </div>
      <div className="ls-feat-grid">
        {feats.map((f) => (
          <div key={f.t} className="ls-feat">
            <span className="ls-feat-ic">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15l4-4 3 3 5-6" /></svg>
            </span>
            <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>{f.t}</h3>
            <p className="ls-small">{f.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Compare ─── */
function Compare() {
  const rows = [
    { k: 'Google rankings', a: 'Yes, by city', b: 'Yes', c: 'Yes' },
    { k: 'AI answer tracking', a: 'Up to five engines', b: 'Paid add-on', c: 'Paid add-on' },
    { k: 'AI share of voice', a: 'Yes', b: 'With add-on', c: 'With add-on' },
    { k: 'Sentiment', a: 'Yes', b: 'No', c: 'Partial' },
    { k: 'Hallucination detection', a: 'Yes', b: 'No', c: 'No' },
    { k: 'Cited source attribution', a: 'Yes', b: 'With add-on', c: 'With add-on' },
    { k: 'Starting price', a: '$19/mo', b: '$99/mo', c: '$129/mo' },
    { k: 'Setup time', a: '2 min', b: 'About 1 hr', c: 'About 1 hr' },
  ];
  return (
    <section className="ls-wrap ls-sec" id="compare">
      <div className="ls-sec-head">
        <span className="ls-eyebrow">Compare</span>
        <h2 className="ls-h2">The SEO tools haven&apos;t <span className="ls-em">caught up yet.</span></h2>
      </div>
      <div className="ls-table-box">
        <table className="ls-table" style={{ fontSize: 16 }}>
          <caption className="ls-sr">Livesov compared with Ahrefs and Semrush</caption>
          <thead>
            <tr>
              <th className="lbl" scope="col"><span className="ls-sr">Feature</span></th>
              <th className="hl-dark" scope="col">Livesov</th>
              <th scope="col">Ahrefs</th>
              <th scope="col">Semrush</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k}>
                <th scope="row" className="k">{r.k}</th>
                <td className="hl">{r.a}</td>
                <td>{r.b}</td>
                <td>{r.c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ls-faint)' }}>Pricing as of May 2026, from vendor pricing pages. Ahrefs Brand Radar and the Semrush AI Toolkit are sold as paid add-ons; check their current engine list before comparing.</p>
    </section>
  );
}

/* ─── Who it's for ─── */
function UseCases() {
  const rest = [
    { t: 'SaaS marketing', d: 'Catch the moment engines recommend a competitor. Suggested buyer prompts to start from.' },
    { t: 'E-commerce', d: 'Track product queries and review site citations across the engines you track.' },
    { t: 'Enterprise brands', d: 'Daily hallucination checks, corrections and share of voice drop alerts.' },
  ];
  return (
    <section className="ls-wrap ls-sec">
      <div className="ls-sec-head">
        <span className="ls-eyebrow">Who it&apos;s for</span>
        <h2 className="ls-h2">Built for teams who <span className="ls-em">sell to AI search.</span></h2>
      </div>
      <div className="ls-grid ls-grid-4">
        <div className="ls-card dark ls-stack ls-gap-12" style={{ padding: 28, minHeight: 240 }}>
          <span className="ls-mono" style={{ fontSize: 12, color: 'var(--ls-lime)' }}>MOST POPULAR</span>
          <h3 className="ls-h3">Agencies</h3>
          <p className="ls-small" style={{ color: 'var(--ls-on-dark)' }}>Client ready PDF reports, multi brand workspaces and bulk audits. 100 tracked prompts per Agency workspace.</p>
        </div>
        {rest.map((c) => (
          <div key={c.t} className="ls-card ls-stack ls-gap-12" style={{ padding: 28 }}>
            <h3 className="ls-h3" style={{ marginTop: 26 }}>{c.t}</h3>
            <p className="ls-small">{c.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Pricing ─── */
function Pricing() {
  // Derived from PRICING_PLANS in src/lib/constants.ts - the same source the
  // /pricing page reads - so the homepage can never disagree with /pricing.
  // Free is hidden here as on /pricing: the copy promises trial-backed plans.
  const tiers = PRICING_PLANS.filter((p) => p.name !== 'Free').map((p) => ({
    k: p.name,
    price: p.price,
    // headline is "8,000 AI credits/month" - the card renders the unit itself.
    credits: p.headline.replace(/\s*AI credits\/month\s*$/i, ''),
    f: p.features,
    pop: !!p.featured,
  }));
  return (
    <section className="ls-wrap ls-sec" id="pricing-plans">
      <div className="ls-sec-row">
        <div className="ls-sec-head">
          <span className="ls-eyebrow">Pricing</span>
          <h2 className="ls-h2">One coffee a month to see <span className="ls-em">what AI says about you.</span></h2>
        </div>
        <Link href="/pricing" className="ls-link">Compare all plans</Link>
      </div>
      <div className="ls-grid ls-grid-3w" style={{ alignItems: 'stretch' }}>
        {tiers.map((t) => (
          <div key={t.k} className={'ls-plan' + (t.pop ? ' pop' : '')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 600 }}>{t.k}</span>
              {t.pop && <span className="ls-badge">Most popular</span>}
            </div>
            <div className="ls-plan-price"><b>{t.price}</b><span>/mo</span></div>
            <div className="ls-plan-cred">{t.credits} AI credits / month</div>
            <div className="ls-plan-feat">{t.f.join(' · ')}</div>
            <Link href="/signup" className={'ls-btn ls-btn-block ' + (t.pop ? 'ls-btn-pri' : 'ls-btn-out')}>Start 7 day trial</Link>
          </div>
        ))}
      </div>
      <p className="ls-note">No credit card. 1 credit = 1 prompt checked on 1 engine. Annual billing saves 20%.</p>
    </section>
  );
}

/* ─── Final CTA ─── */
function CTA() {
  const router = useRouter();
  const [domain, setDomain] = useState('');
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const d = domain.trim();
    router.push(d ? `/geo-audit?url=${encodeURIComponent(d)}` : '/geo-audit');
  };
  return (
    <section className="ls-wrap" style={{ paddingTop: 40, paddingBottom: 112 }} id="audit">
      <div className="ls-cta-band center">
        <h2 className="ls-h2" style={{ fontSize: 'clamp(34px, 5vw, 60px)', maxWidth: 820 }}>
          See what AI says about your brand <span className="ls-em">in 90 seconds.</span>
        </h2>
        <p style={{ fontSize: 18, lineHeight: 1.6, maxWidth: 600 }}>
          Free GEO audit, no signup. We score how citable your page is for ChatGPT, Perplexity and Google AI.
        </p>
        <form className="ls-cta-form" onSubmit={go}>
          <label htmlFor="home-domain" className="ls-sr">Your website</label>
          <input id="home-domain" type="text" placeholder="yourclient.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <button type="submit" className="ls-btn ls-btn-dark ls-btn-lg" style={{ fontSize: 16, padding: '16px 24px' }}>Run my audit</button>
        </form>
      </div>
    </section>
  );
}

export default function LivesovHomePage() {
  return (
    <SiteShell>
      <Hero />
      <Problem />
      <HowItWorks />
      <Features />
      <Compare />
      <UseCases />
      <Pricing />
      <CTA />
    </SiteShell>
  );
}
