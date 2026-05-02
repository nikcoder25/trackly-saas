import Link from 'next/link';

export default function Hero() {
  return (
    <section className="hp-hero" aria-labelledby="hp-hero-title">
      <div className="hp-hero-inner">
        <h1 id="hp-hero-title">
          The <span className="hp-accent">AI visibility tracker</span> for ChatGPT,
          Perplexity, Claude, Gemini, and Grok.
        </h1>
        <p className="hp-hero-sub">
          Trackly is the AI visibility platform that shows you how ChatGPT, Perplexity,
          Claude, Gemini, and Grok answer when buyers ask about your brand, your
          competitors, and your category.
        </p>
        <div className="hp-hero-ctas">
          <Link href="/signup" className="hp-btn hp-btn-primary hp-btn-lg">
            Start free trial
          </Link>
          <Link href="#pricing" className="hp-btn hp-btn-ghost hp-btn-lg">
            See pricing
          </Link>
        </div>
        <div className="hp-hero-fineprint">
          Free plan available. No credit card required.
        </div>

        <div className="hp-hero-mock" role="img" aria-label="Trackly dashboard preview showing AI share of voice growing to 42%.">
          <div className="hp-mock-bar">
            <div className="hp-mock-dots">
              <span className="hp-mock-dot" />
              <span className="hp-mock-dot" />
              <span className="hp-mock-dot" />
            </div>
            <div style={{ fontSize: 12, color: '#71717a', fontFamily: 'ui-monospace, monospace' }}>
              app.trackly.com / dashboard
            </div>
          </div>
          <div className="hp-mock-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  AI share of voice
                </div>
                <div className="hp-mock-stat">
                  <span className="hp-mock-stat-num">42%</span>
                  <span className="hp-mock-stat-delta">+8.2% vs last month</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span style={{ padding: '4px 10px', borderRadius: 999, background: '#f4f4f5', color: '#52525b' }}>30d</span>
                <span style={{ padding: '4px 10px', borderRadius: 999, background: '#18181b', color: '#fff' }}>90d</span>
                <span style={{ padding: '4px 10px', borderRadius: 999, background: '#f4f4f5', color: '#52525b' }}>1y</span>
              </div>
            </div>
            <div className="hp-mock-chart">
              <div className="hp-mock-line" />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap', fontSize: 12, color: '#52525b' }}>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#6366f1' }} /> Your brand
              </span>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#a1a1aa' }} /> Competitor A
              </span>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#d4d4d8' }} /> Competitor B
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
