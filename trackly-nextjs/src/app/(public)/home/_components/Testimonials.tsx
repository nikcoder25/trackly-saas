const items = [
  {
    text: 'I started watching it weekly and within the first month spotted two questions our SaaS was being missed on. We rewrote our pillar pages and we now show up in ChatGPT.',
    name: 'Hannah V.',
    role: 'Head of Growth, B2B SaaS',
    initials: 'HV',
  },
  {
    text: 'Trackly is the cheapest, cleanest AI visibility tool I’ve found. Cut my agency’s monthly research time from 6 hours to 20 minutes.',
    name: 'Marcus L.',
    role: 'Founder, digital agency',
    initials: 'ML',
  },
  {
    text: 'We compared Trackly, Profound, and Peec AI. Trackly gave us the same answer for a fraction of the cost — and the GEO audits are genuinely useful.',
    name: 'Priya S.',
    role: 'SEO Lead, Series A startup',
    initials: 'PS',
  },
];

export default function Testimonials() {
  return (
    <section className="hp-section" aria-labelledby="hp-testimonials-title" style={{ background: 'var(--hp-bg-alt)' }}>
      <div className="hp-container">
        <span className="hp-eyebrow">Customer love</span>
        <h2 id="hp-testimonials-title" className="hp-section-title">
          “Finally, an AI visibility tool we trust.”
        </h2>
        <div className="hp-testimonials">
          {items.map((t) => (
            <article key={t.name} className="hp-testimonial">
              <p>“{t.text}”</p>
              <div className="hp-testimonial-foot">
                <span className="hp-avatar" aria-hidden="true">{t.initials}</span>
                <div>
                  <div className="hp-testimonial-name">{t.name}</div>
                  <div className="hp-testimonial-role">{t.role}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
