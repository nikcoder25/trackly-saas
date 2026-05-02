const steps = [
  {
    num: 'Step 01',
    title: 'Add your brand',
    desc: 'Tell us your brand, your category, and the buyer prompts you care about. Smart defaults included.',
  },
  {
    num: 'Step 02',
    title: 'Auto-track daily',
    desc: 'Trackly re-runs every prompt across ChatGPT, Perplexity, Claude, Gemini, and Grok every day.',
  },
  {
    num: 'Step 03',
    title: 'Optimize and grow',
    desc: 'See what to write, where to get cited, and what to fix to climb the AI consideration set.',
  },
];

export default function HowItWorks() {
  return (
    <section className="hp-section" id="how-it-works" aria-labelledby="hp-how-title" style={{ background: 'var(--hp-bg-alt)' }}>
      <div className="hp-container">
        <span className="hp-eyebrow">How it works</span>
        <h2 id="hp-how-title" className="hp-section-title">
          Set up once. Track forever.
        </h2>
        <div className="hp-steps">
          {steps.map((s) => (
            <article key={s.num} className="hp-step">
              <div className="hp-step-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
