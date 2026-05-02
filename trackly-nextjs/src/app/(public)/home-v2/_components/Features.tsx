const features = [
  {
    title: 'AI share of voice',
    desc: 'Measure what % of AI answers mention your brand vs competitors — across every model.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
    ),
  },
  {
    title: 'Sentiment analysis',
    desc: 'Know whether AI talks about you positively, negatively, or neutrally — and watch trends.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/></svg>
    ),
  },
  {
    title: 'Citation tracking',
    desc: 'Every URL the LLM cited as a source, ranked by frequency across prompts.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
    ),
  },
  {
    title: 'Competitor benchmarks',
    desc: 'Add up to 20 competitors. See where you rank in the AI consideration set, weekly.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
    ),
  },
  {
    title: 'GEO content audits',
    desc: 'Score any URL for AI discoverability and get specific edits that earn citations.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    ),
  },
  {
    title: 'Exportable evidence',
    desc: 'Save full AI responses as proof. Export to CSV, share with clients, win the room.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    ),
  },
];

export default function Features() {
  return (
    <section className="hp-section" id="features" aria-labelledby="hp-features-title">
      <div className="hp-container">
        <span className="hp-eyebrow">Features</span>
        <h2 id="hp-features-title" className="hp-section-title">
          A generative engine optimization tool built for serious brands.
        </h2>
        <p className="hp-section-sub">
          Everything you need to win the AI answer. One dashboard. All five LLMs.
        </p>

        <div className="hp-feat-grid">
          {features.map((f) => (
            <article key={f.title} className="hp-feat">
              <span className="hp-feat-icon" aria-hidden="true">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
