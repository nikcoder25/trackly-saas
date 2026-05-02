const queries = [
  'best CRM for startups',
  'top ai visibility tools',
  'alternatives to Profound',
  'cheapest geo audit software',
  'enterprise SEO platforms 2026',
  'is Livesov worth it',
  'B2B marketing tools comparison',
  'how to track AI mentions',
  'GEO vs SEO',
];

export default function QueryTracking() {
  return (
    <section className="hp-section" aria-labelledby="hp-track-title" style={{ background: 'var(--hp-bg-alt)' }}>
      <div className="hp-container">
        <span className="hp-eyebrow">Prompt tracking</span>
        <h2 id="hp-track-title" className="hp-section-title">
          Track what your buyers ask.
        </h2>
        <p className="hp-section-sub">
          Add the exact prompts your customers type into ChatGPT, Perplexity, and Claude.
          We re-run them daily and show how the answer changes over time.
        </p>

        <div className="hp-pills">
          {queries.map((q) => (
            <span key={q} className="hp-pill">
              <span className="hp-pill-dot" aria-hidden="true" />
              {q}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
