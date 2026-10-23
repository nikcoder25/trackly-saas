import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/seo/SeoLayout';
import SiteShell from '@/components/site/SiteShell';
import { PLAN_LIMITS } from '@/lib/constants';

export const metadata: Metadata = {
  title: { absolute: 'Features | AI Visibility Tracker for Agencies | Livesov' },
  description:
    'Share of voice, sentiment, cited sources and hallucination alerts across ChatGPT, Claude, Gemini, Perplexity and Grok. See every Livesov feature.',
  alternates: { canonical: '/features' },
  openGraph: {
    title: 'Features | AI Visibility Tracker for Agencies | Livesov',
    description:
      'Share of voice, sentiment, cited sources and hallucination alerts across ChatGPT, Claude, Gemini, Perplexity and Grok.',
    url: 'https://livesov.com/features',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Livesov features' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Features | AI Visibility Tracker for Agencies | Livesov',
    description:
      'Share of voice, sentiment, cited sources and hallucination alerts across ChatGPT, Claude, Gemini, Perplexity and Grok.',
    images: ['https://livesov.com/og-image.png'],
  },
};

/* Sample workspace data for the illustrations (fictional "Acme PM"). */
const ENGINES = [
  { name: 'ChatGPT', pct: 46 },
  { name: 'Claude', pct: 38 },
  { name: 'Gemini', pct: 31 },
  { name: 'Perplexity', pct: 24 },
  { name: 'Grok', pct: 18 },
];
const SENTIMENT = [60, 72, 66, 80, 76, 84, 40, 52, 70, 78, 86, 90];
const DROP_INDEX = 6;

const AGENCY = [
  { t: 'Client ready PDF reports', d: 'Export a clean report for each client in one click.' },
  { t: 'Multi brand workspaces', d: 'Unlimited brands on Pro and Agency plans.' },
  { t: 'Bulk GEO audits', d: `Up to ${PLAN_LIMITS.agency.geoAudits} audits a month to win new clients.` },
  { t: 'API access', d: 'Pipe data into your own dashboards on the Agency plan.' },
];

const STEPS = [
  { t: 'Connect your brand', d: 'Domain, competitors and buyer prompts, with suggested buyer prompts to start from.' },
  { t: 'We query the engines', d: 'Scheduled runs. Answers parsed for mentions, sentiment and sources.' },
  { t: 'Watch share of voice', d: 'Wins, losses and which page each engine cites.' },
];

export default function FeaturesPage() {
  return (
    <SiteShell>
      <Breadcrumbs items={[{ name: 'Features', url: '/features' }]} />

      {/* ── Hero ── */}
      <section className="ls-wrap ls-stack ls-gap-24" style={{ paddingTop: 96, paddingBottom: 72 }}>
        <span className="ls-eyebrow">Features</span>
        <h1 className="ls-h1 xl" style={{ fontSize: 'clamp(46px, 6.8vw, 80px)', maxWidth: 960 }}>
          Everything AI says about your clients, <span className="ls-em">in one pane of glass.</span>
        </h1>
        <p className="ls-lead xl" style={{ maxWidth: 640 }}>
          Share of voice, sentiment, cited sources and hallucination flags across five AI engines. Proof, not vibes.
        </p>
        <div className="ls-cta-row" style={{ justifyContent: 'flex-start' }}>
          <Link href="/signup" className="ls-btn ls-btn-pri ls-btn-lg">Start free trial</Link>
          <Link href="/geo-audit" className="ls-btn ls-btn-out ls-btn-lg">Run a free audit</Link>
        </div>
      </section>

      <section className="ls-wrap ls-stack ls-gap-24" style={{ paddingTop: 24, paddingBottom: 48 }}>
        {/* 01 Share of voice */}
        <div className="ls-feature-row light">
          <div className="ls-stack ls-gap-16">
            <span className="ls-kicker">01 · Share of voice</span>
            <h2 className="ls-h2 sm">Know your slice of <span className="ls-em">every AI answer.</span></h2>
            <p className="ls-body" style={{ fontSize: 17 }}>
              A daily percentage across ChatGPT, Claude, Gemini, Perplexity and Grok. See which engine loves your client and which one ignores them.
            </p>
          </div>
          <div className="ls-card soft ls-stack ls-gap-14" style={{ padding: 28 }} role="img" aria-label="Sample share of voice by engine">
            {ENGINES.map((e) => (
              <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 96, fontSize: 14, flex: 'none' }}>{e.name}</span>
                <div className="ls-bar" style={{ flex: 1, height: 12, background: 'var(--ls-line)' }}><i style={{ width: `${e.pct * 2}%` }} /></div>
                <span className="ls-mono" style={{ width: 40, textAlign: 'right', fontSize: 13 }}>{e.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* 02 Evidence */}
        <div className="ls-feature-row dark">
          <div className="ls-proof">
            <span className="cap">PROMPT</span>
            <span style={{ color: '#E6E7EF' }}>&ldquo;What is the best project tool for a small design agency?&rdquo;</span>
            <span className="cap" style={{ marginTop: 6 }}>CHATGPT ANSWER</span>
            <span style={{ color: 'var(--ls-on-dark-2)', lineHeight: 1.6 }}>
              For small agencies, <span className="ls-hl">Acme PM</span> is a strong pick because of client portals and simple pricing...
            </span>
            <span className="cap" style={{ marginTop: 6 }}>CITED SOURCES</span>
            <span className="ls-mono ls-stack" style={{ gap: 6, fontSize: 12, color: 'var(--ls-on-dark-2)' }}>
              <span>acmepm.com/pricing</span><span>review-site.com/acme-pm</span>
            </span>
          </div>
          <div className="ls-stack ls-gap-16">
            <span className="ls-mono" style={{ fontSize: 14, color: 'var(--ls-lime)' }}>02 · Evidence and proof</span>
            <h2 className="ls-h2 sm">Drill to <span className="ls-em">the exact line.</span></h2>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--ls-on-dark-2)' }}>
              Every result keeps the verbatim answer, the prompt and the sources the engine cited. Show clients real proof in every report.
            </p>
          </div>
        </div>

        <div className="ls-grid" style={{ gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' }}>
          {/* 03 Sentiment */}
          <div className="ls-card lg ls-stack ls-gap-16">
            <span className="ls-kicker">03 · Sentiment</span>
            <h3 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em' }}>Tone, scored per mention.</h3>
            <p className="ls-body">Charted over time with alerts the moment sentiment drops.</p>
            <div className="ls-sent-bars" role="img" aria-label="Sample sentiment trend with one drop">
              {SENTIMENT.map((h, i) => <i key={i} className={i === DROP_INDEX ? 'drop' : undefined} style={{ height: `${h}%` }} />)}
            </div>
          </div>

          {/* 04 Hallucinations */}
          <div className="ls-card lg ls-stack ls-gap-16" style={{ background: 'var(--ls-warm)', borderColor: 'var(--ls-warm-line)' }}>
            <span className="ls-mono" style={{ fontSize: 14, color: 'var(--ls-warm-ink)' }}>04 · Hallucination detection</span>
            <h3 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em' }}>Catch made up facts.</h3>
            <p className="ls-body">Flags invented features, wrong pricing or false claims, so you can correct them fast.</p>
            <div className="ls-stack" style={{ gap: 6, background: '#fff', border: '1px solid var(--ls-warm-line)', borderRadius: 14, padding: 16, fontSize: 14 }}>
              <span className="ls-mono" style={{ fontSize: 12, color: 'var(--ls-warm-ink)' }}>FLAGGED · GROK</span>
              <span>&ldquo;Acme PM costs $199 per month.&rdquo;</span>
              <span style={{ color: 'var(--ls-subtle)' }}>Actual: $49 per month. Correction suggested.</span>
            </div>
          </div>

          {/* 05 Competitors */}
          <div className="ls-card lg ls-stack ls-gap-16">
            <span className="ls-kicker">05 · Competitor benchmarks</span>
            <h3 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em' }}>Know when you get overtaken.</h3>
            <p className="ls-body">Track up to {PLAN_LIMITS.agency.competitors} competitors with overtake alerts.</p>
            <div className="ls-stack ls-gap-10">
              <div className="ls-rank you"><span>You</span><span className="ls-mono">#1</span></div>
              <div className="ls-rank"><span>Competitor A</span><span className="ls-mono">#2</span></div>
              <div className="ls-rank"><span>Competitor B</span><span className="ls-mono">#3</span></div>
            </div>
          </div>

          {/* 06 Custom queries */}
          <div className="ls-card lg ls-stack ls-gap-16">
            <span className="ls-kicker">06 · Custom queries</span>
            <h3 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em' }}>Ask what buyers ask.</h3>
            <p className="ls-body">Add your own buyer questions and long tail prompts, or start from suggested buyer prompts.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span className="ls-tag">best hvac company near me</span>
              <span className="ls-tag">who installs heat pumps</span>
              <span className="ls-tag">top rated plumber</span>
              <span className="ls-tag dark">+ Add prompt</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Agencies ── */}
      <section className="ls-wrap ls-sec">
        <div className="ls-sec-head">
          <span className="ls-eyebrow">Made for agencies</span>
          <h2 className="ls-h2 md">Run every client <span className="ls-em">from one account.</span></h2>
        </div>
        <div className="ls-grid ls-grid-4">
          {AGENCY.map((a) => (
            <div key={a.t} className="ls-topline">
              <h3 style={{ fontSize: 20, fontWeight: 600 }}>{a.t}</h3>
              <p className="ls-small">{a.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="ls-wrap ls-sec" id="how">
        <div className="ls-sec-row">
          <h2 className="ls-h2 md">How it works, <span className="ls-em">in three steps.</span></h2>
          <Link href="/how-it-works" className="ls-link">See the full walkthrough</Link>
        </div>
        <div className="ls-grid ls-grid-3">
          {STEPS.map((s, i) => (
            <div key={s.t} className="ls-card ls-stack ls-gap-14">
              <span className="ls-step-n">{i + 1}</span>
              <h3 className="ls-h3">{s.t}</h3>
              <p className="ls-body">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="ls-wrap" style={{ paddingTop: 40, paddingBottom: 112 }}>
        <div className="ls-cta-band row dark">
          <h2 className="ls-h2 md" style={{ fontSize: 'clamp(34px, 4vw, 48px)', maxWidth: 640 }}>
            Start tracking in <span className="ls-em lime">two minutes.</span>
          </h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/signup" className="ls-btn ls-btn-pri ls-btn-lg">Start 7 day free trial</Link>
            <Link href="/pricing" className="ls-btn ls-btn-light ls-btn-lg">See pricing</Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
