import Link from 'next/link';

const cards = [
  {
    icon: '◎',
    title: 'ChatGPT is the new search box',
    desc: 'Buyers now ask ChatGPT for product recommendations, vendor shortlists, and category research before they ever open Google.',
  },
  {
    icon: '◇',
    title: 'AI answers shape decisions',
    desc: 'When an LLM names a vendor in its answer, that brand wins the consideration set. When it does not, you are not in the conversation.',
  },
  {
    icon: '✦',
    title: 'You are flying blind',
    desc: 'Traditional analytics show no referral data from AI chats. You have no idea whether ChatGPT, Claude, or Gemini even mention you.',
  },
];

export default function BuyersAskAI() {
  return (
    <section className="hp-section-tight" aria-labelledby="hp-buyers-title">
      <div className="hp-dark hp-container" style={{ padding: 0 }}>
        <div className="hp-dark-wrap" style={{ padding: '64px 48px' }}>
          <span className="hp-eyebrow">The new search</span>
          <h2 id="hp-buyers-title" className="hp-section-title">
            Buyers ask AI, not Google. Are you in the answer?
          </h2>
          <p className="hp-section-sub">
            When AI doesn’t recommend you, your competitor wins the deal. Here’s why
            every B2B brand needs an AI visibility tracker today.
          </p>

          <div className="hp-dark-grid">
            {cards.map((c) => (
              <article key={c.title} className="hp-dark-card">
                <span className="hp-dark-card-icon" aria-hidden="true">{c.icon}</span>
                <h3>{c.title}</h3>
                <p>{c.desc}</p>
              </article>
            ))}
          </div>

          <div className="hp-dark-cta">
            <Link href="/signup" className="hp-btn hp-btn-light">Start free trial</Link>
            <span>It&apos;s 100% free to check if your brand appears in AI answers.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
