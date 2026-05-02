import Link from 'next/link';

export default function CTABanner() {
  return (
    <section className="hp-section-tight" aria-labelledby="hp-cta-title">
      <div className="hp-cta-banner">
        <h2 id="hp-cta-title">Track your brand across every AI platform.</h2>
        <p>Free plan. No credit card required. Set up in under 2 minutes.</p>
        <Link href="/signup" className="hp-btn hp-btn-light hp-btn-lg">
          Start free trial
        </Link>
      </div>
    </section>
  );
}
