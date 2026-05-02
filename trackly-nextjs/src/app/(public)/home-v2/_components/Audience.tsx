const personas = [
  {
    icon: '🏢',
    title: 'Agencies',
    desc: 'Deliver AI visibility audits and monthly reports clients pay for. White-label CSV exports included.',
  },
  {
    icon: '🚀',
    title: 'SaaS founders',
    desc: 'Find out whether ChatGPT recommends you when buyers research your category — before you spend on ads.',
  },
  {
    icon: '📈',
    title: 'Marketing teams',
    desc: 'Track AI mentions, competitor benchmarks, and content that earns citations — all in one dashboard.',
  },
];

export default function Audience() {
  return (
    <section className="hp-section" aria-labelledby="hp-audience-title">
      <div className="hp-container">
        <span className="hp-eyebrow">Who it’s for</span>
        <h2 id="hp-audience-title" className="hp-section-title">
          An AI visibility tool for every team.
        </h2>
        <div className="hp-audience">
          {personas.map((p) => (
            <article key={p.title} className="hp-persona">
              <div className="hp-persona-icon" aria-hidden="true">{p.icon}</div>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
