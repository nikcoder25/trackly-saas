import type { Metadata } from 'next';
import Link from 'next/link';
import SeoLayout from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Pricing — Livesov AI Visibility Tracker',
  description: 'Simple, transparent pricing for AI brand tracking. Start free, upgrade as you grow. Track your brand across ChatGPT, Claude, Gemini, Perplexity & Grok.',
  alternates: { canonical: '/pricing' },
};

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    desc: 'Try it out with basic tracking.',
    features: ['1 brand', '5 prompts/month', '2 AI platforms', 'Manual runs only', 'Basic dashboard'],
    limitations: ['No competitors', 'No sentiment analysis', 'No scheduled runs'],
    cta: 'Get Started Free',
    href: '/signup',
    highlighted: false,
  },
  {
    name: 'Starter',
    price: '$9',
    period: '/mo',
    desc: 'For solo founders getting started.',
    features: ['1 brand', '30 prompts/month', '2 AI platforms', 'Scheduled runs (weekly)', 'Basic dashboard'],
    limitations: ['No competitors', 'No sentiment analysis'],
    cta: 'Get Started',
    href: '/signup',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/mo',
    desc: 'For growing brands that need deeper insight.',
    features: ['5 brands', '250 prompts/month', '5 AI platforms', 'Daily scheduled runs', 'Sentiment analysis', 'Competitor tracking (5)', 'Email alerts'],
    limitations: [],
    cta: 'Start Pro',
    href: '/signup',
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    name: 'Agency',
    price: '$89',
    period: '/mo',
    desc: 'For agencies managing multiple clients.',
    features: ['20 brands', '1,000 prompts/month', '5 AI platforms', '12-hour schedule', 'Competitor tracking (20)', 'Team collaboration', 'Sentiment analysis'],
    limitations: [],
    cta: 'Start Agency',
    href: '/signup',
    highlighted: false,
  },
  {
    name: 'Enterprise',
    price: '$499',
    period: '/mo',
    desc: 'For large orgs with custom needs.',
    features: ['100 brands', '10,000+ prompts', '5 AI platforms', '6-hour schedule', 'Unlimited competitors', 'API access', 'Priority support', 'Custom integrations'],
    limitations: [],
    cta: 'Contact Sales',
    href: '/contact',
    highlighted: false,
  },
];

const comparisonFeatures = [
  { feature: 'Brands', free: '1', starter: '1', pro: '5', agency: '20', enterprise: '100' },
  { feature: 'Prompts / month', free: '5', starter: '30', pro: '250', agency: '1,000', enterprise: '10,000+' },
  { feature: 'AI Platforms', free: '2', starter: '2', pro: '5', agency: '5', enterprise: '5' },
  { feature: 'Competitors', free: '—', starter: '—', pro: '5', agency: '20', enterprise: '100' },
  { feature: 'Scheduled Runs', free: '—', starter: 'Weekly', pro: 'Daily', agency: '12 hrs', enterprise: '6 hrs' },
  { feature: 'Sentiment Analysis', free: '—', starter: '—', pro: 'check', agency: 'check', enterprise: 'check' },
  { feature: 'Team Collaboration', free: '—', starter: '—', pro: '—', agency: 'check', enterprise: 'check' },
  { feature: 'API Access', free: '—', starter: '—', pro: '—', agency: '—', enterprise: 'check' },
  { feature: 'Priority Support', free: '—', starter: '—', pro: '—', agency: '—', enterprise: 'check' },
];

const faqs = [
  { q: 'Can I switch plans anytime?', a: 'Yes. Upgrade or downgrade at any time. Changes take effect immediately and billing is prorated.' },
  { q: 'What counts as a prompt?', a: 'Each query sent to an AI platform counts as one prompt. For example, checking one query across 5 platforms uses 5 prompts.' },
  { q: 'Is there a free trial?', a: 'The Free plan is free forever with 5 prompts/month. No credit card required to get started.' },
  { q: 'What AI platforms do you support?', a: 'We track brand mentions across ChatGPT, Claude, Gemini, Perplexity, and Grok — with more coming soon.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Cancel anytime from your dashboard. No long-term contracts or hidden fees.' },
  { q: 'Do you offer annual billing?', a: 'Not yet — but annual plans with a discount are coming soon. All plans are currently billed monthly.' },
];

export default function PricingPage() {
  return (
    <SeoLayout>
      {/* Hero */}
      <section style={{ padding: '80px 24px 48px', textAlign: 'center', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--primary)', background: 'var(--primary-light, rgba(255,97,84,.08))', padding: '6px 16px', borderRadius: 20, marginBottom: 20 }}>
          Pricing
        </div>
        <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1.15, color: 'var(--text-primary)', marginBottom: 16 }}>
          Simple, transparent pricing
        </h1>
        <p style={{ fontSize: 18, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 560, margin: '0 auto' }}>
          Start free. Upgrade as your AI visibility needs grow. No hidden fees, no surprises.
        </p>
      </section>

      {/* Plans Grid */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 64px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'start' }}>
          {plans.map((plan) => (
            <div
              key={plan.name}
              style={{
                position: 'relative',
                background: plan.highlighted ? 'var(--primary)' : 'var(--card-bg, #fff)',
                border: plan.highlighted ? '2px solid var(--primary)' : '1px solid var(--card-border, #e8e5e1)',
                borderRadius: 'var(--radius, 12px)',
                padding: plan.highlighted ? '32px 24px 28px' : '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform .2s, box-shadow .2s',
              }}
            >
              {plan.badge && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: '#fff', color: 'var(--primary)', fontSize: 11, fontWeight: 800,
                  padding: '4px 14px', borderRadius: 20, letterSpacing: .5,
                  boxShadow: '0 2px 8px rgba(255,97,84,.25)', whiteSpace: 'nowrap',
                }}>
                  {plan.badge}
                </div>
              )}

              <h3 style={{ fontSize: 18, fontWeight: 700, color: plan.highlighted ? '#fff' : 'var(--text-primary)', marginBottom: 4 }}>
                {plan.name}
              </h3>
              <p style={{ fontSize: 13, color: plan.highlighted ? 'rgba(255,255,255,.75)' : 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                {plan.desc}
              </p>

              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-1px', color: plan.highlighted ? '#fff' : 'var(--text-primary)' }}>
                  {plan.price}
                </span>
                {plan.period && (
                  <span style={{ fontSize: 14, color: plan.highlighted ? 'rgba(255,255,255,.6)' : 'var(--text-muted)', fontWeight: 400 }}>
                    {plan.period}
                  </span>
                )}
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', flex: 1 }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: plan.highlighted ? 'rgba(255,255,255,.92)' : 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
                    <span style={{ color: plan.highlighted ? '#fff' : 'var(--success, #22c55e)', fontSize: 14, marginTop: 1, flexShrink: 0 }}>&#10003;</span>
                    {f}
                  </li>
                ))}
                {plan.limitations.map((l) => (
                  <li key={l} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: plan.highlighted ? 'rgba(255,255,255,.4)' : 'var(--text-muted, #999)', marginBottom: 8, lineHeight: 1.5 }}>
                    <span style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }}>&#10005;</span>
                    {l}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                style={{
                  display: 'block', textAlign: 'center', padding: '12px 20px', borderRadius: 'var(--radius-xs, 8px)',
                  fontSize: 14, fontWeight: 700, textDecoration: 'none', transition: 'all .2s',
                  background: plan.highlighted ? '#fff' : 'var(--text-primary, #1a1a2e)',
                  color: plan.highlighted ? 'var(--primary)' : '#fff',
                  border: 'none',
                }}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px 80px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, textAlign: 'center', letterSpacing: '-.5px', color: 'var(--text-primary)', marginBottom: 8 }}>
          Compare plans
        </h2>
        <p style={{ textAlign: 'center', fontSize: 15, color: 'var(--text-secondary)', marginBottom: 32 }}>
          Everything you need at every stage.
        </p>

        <div style={{ overflowX: 'auto', borderRadius: 'var(--radius, 12px)', border: '1px solid var(--card-border, #e8e5e1)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
            <thead>
              <tr style={{ background: 'var(--bg-section, #f5f3f0)' }}>
                <th style={{ textAlign: 'left', padding: '14px 20px', fontWeight: 600, color: 'var(--text-primary)' }}>Feature</th>
                {['Free', 'Starter', 'Pro', 'Agency', 'Enterprise'].map(p => (
                  <th key={p} style={{
                    padding: '14px 16px', fontWeight: 700, textAlign: 'center', fontSize: 12,
                    letterSpacing: .5, textTransform: 'uppercase',
                    color: p === 'Pro' ? 'var(--primary)' : 'var(--text-secondary)',
                  }}>
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonFeatures.map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--card-border, #e8e5e1)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 20px', fontWeight: 500, color: 'var(--text-primary)' }}>{row.feature}</td>
                  {(['free', 'starter', 'pro', 'agency', 'enterprise'] as const).map(p => {
                    const val = row[p];
                    const isCheck = val === 'check';
                    const isDash = val === '—';
                    return (
                      <td key={p} style={{
                        padding: '12px 16px', textAlign: 'center',
                        color: isCheck ? 'var(--success, #22c55e)' : isDash ? 'var(--text-muted)' : p === 'pro' ? 'var(--primary)' : 'var(--text-primary)',
                        fontWeight: p === 'pro' ? 700 : 400,
                        fontFamily: !isCheck && !isDash ? 'var(--mono, monospace)' : 'inherit',
                      }}>
                        {isCheck ? '✓' : val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 80px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, textAlign: 'center', letterSpacing: '-.5px', color: 'var(--text-primary)', marginBottom: 8 }}>
          Frequently asked questions
        </h2>
        <p style={{ textAlign: 'center', fontSize: 15, color: 'var(--text-secondary)', marginBottom: 32 }}>
          Got questions? We have answers.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {faqs.map((faq, i) => (
            <div key={i} style={{
              background: 'var(--card-bg, #fff)', border: '1px solid var(--card-border, #e8e5e1)',
              borderRadius: 'var(--radius, 12px)', padding: '20px 24px',
            }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.4 }}>
                {faq.q}
              </h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </section>
    </SeoLayout>
  );
}
