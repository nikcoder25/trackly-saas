const stats = [
  {
    num: '1.8B',
    label: 'monthly active ChatGPT users — and growing every quarter.',
  },
  {
    num: '5x',
    label: 'faster category research than Google when buyers use an LLM.',
  },
  {
    num: '0',
    label: 'AI referral data inside Google Analytics. You need a different tool.',
  },
];

export default function Stats() {
  return (
    <section className="hp-section" aria-labelledby="hp-stats-title" style={{ background: 'var(--hp-bg-alt)' }}>
      <div className="hp-container">
        <span className="hp-eyebrow">Why now</span>
        <h2 id="hp-stats-title" className="hp-section-title">
          LLM SEO is the new SEO.
        </h2>
        <p className="hp-section-sub">
          AI assistants are replacing the top of the funnel. Every brand that won search
          will need to win the LLM, too — and most are not yet measuring it.
        </p>

        <div className="hp-stats">
          {stats.map((s) => (
            <div key={s.num}>
              <div className="hp-stat-num">{s.num}</div>
              <div className="hp-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
