import Link from 'next/link';
import { PRICING_PLANS } from '@/lib/constants';

export default function Pricing() {
  return (
    <section className="hp-section" id="pricing" aria-labelledby="hp-pricing-title">
      <div className="hp-container">
        <span className="hp-eyebrow">Pricing</span>
        <h2 id="hp-pricing-title" className="hp-section-title">
          A free AI visibility tracker. Plans from $9/mo.
        </h2>
        <p className="hp-section-sub">
          Start free, upgrade when you need more brands, prompts, and platforms.
          No credit card required.
        </p>

        <div className="hp-pricing">
          {PRICING_PLANS.map((p) => (
            <article
              key={p.name}
              className={`hp-price${p.featured ? ' hp-price--featured' : ''}`}
            >
              {p.featured && <span className="hp-price-badge">Most popular</span>}
              <div className="hp-price-name">{p.name}</div>
              <div className="hp-price-sub">{p.sub}</div>
              <div>
                <span className="hp-price-amount">{p.price}</span>
                <span className="hp-price-period">/mo</span>
              </div>
              <div className="hp-price-cta">
                <Link
                  href="/signup"
                  className={`hp-btn ${p.featured ? 'hp-btn-light' : 'hp-btn-primary'}`}
                >
                  Start free trial
                </Link>
              </div>
              <div className="hp-price-feat">{p.headline}</div>
              <ul className="hp-price-feat-list">
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
