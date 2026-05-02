export default function BrandMentions() {
  return (
    <section className="hp-section" aria-labelledby="hp-mentions-title">
      <div className="hp-container">
        <span className="hp-eyebrow">The data</span>
        <h2 id="hp-mentions-title" className="hp-section-title">
          Brand mentions and source citations.
        </h2>
        <p className="hp-section-sub">
          Track every time an LLM names your brand and every URL it cites as a source —
          so you know exactly what to fix, write, and pitch.
        </p>

        <div className="hp-twocol">
          <article className="hp-feature-card">
            <span className="hp-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <h3>Brand mentions</h3>
            <p>
              See every AI response that names your brand, scored by sentiment, position,
              and the prompt that triggered it.
            </p>
            <div className="hp-feature-card-visual">
              <div style={{ marginBottom: 8, color: '#71717a' }}>“Best AI visibility tools 2026”</div>
              <div>
                ChatGPT recommends <strong style={{ color: '#6366f1' }}>Trackly</strong>,
                Profound, and Peec AI as the leading platforms for…
              </div>
            </div>
          </article>

          <article className="hp-feature-card">
            <span className="hp-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </span>
            <h3>Source citations</h3>
            <p>
              Every URL the LLM cited, ranked by frequency. Reverse-engineer what content
              earns AI citations in your category — and replicate it.
            </p>
            <div className="hp-feature-card-visual">
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #e4e4e7' }}>
                <span>g2.com/ai-visibility-tools</span><span style={{ color: '#6366f1' }}>34</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #e4e4e7' }}>
                <span>trackly.com/blog/geo-guide</span><span style={{ color: '#6366f1' }}>21</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>reddit.com/r/SaaS</span><span style={{ color: '#6366f1' }}>17</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
