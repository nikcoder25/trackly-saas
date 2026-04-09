import type { Metadata } from 'next';
import Link from 'next/link';
import { DollarSign, BarChart3, HeadphonesIcon } from 'lucide-react';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Agency Partner Program — Livesov AI Visibility Tracker',
  description: 'Partner with Livesov to offer AI visibility tracking to your clients. Earn recurring commissions, get white-label reports, and grow your agency.',
  alternates: { canonical: '/partners' },
  openGraph: {
    title: 'Agency Partner Program — Livesov AI Visibility Tracker',
    description: 'Partner with Livesov to offer AI visibility tracking to your clients. Earn recurring commissions, get white-label reports, and grow your agency.',
    url: 'https://livesov.com/partners',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Agency Partner Program — Livesov AI Visibility Tracker' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agency Partner Program — Livesov AI Visibility Tracker',
    description: 'Partner with Livesov to offer AI visibility tracking to your clients. Earn recurring commissions, get white-label reports, and grow your agency.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const benefitIcons = {
  'Recurring Revenue': DollarSign,
  'White-Label Reports': BarChart3,
  'Priority Support': HeadphonesIcon,
};

const benefits = [
  {
    title: 'Recurring Revenue',
    description: 'Earn 20% recurring commission for the lifetime of every client you refer. Average partner earns $500-2,000/month.',
  },
  {
    title: 'White-Label Reports',
    description: 'Generate branded AI visibility reports for your clients. Your logo, your brand, your insights.',
  },
  {
    title: 'Priority Support',
    description: 'Dedicated partner manager, priority onboarding for your clients, and early access to new features.',
  },
];

const steps = [
  { step: '1', title: 'Apply', description: 'Fill out a quick application form.' },
  { step: '2', title: 'Get Approved', description: 'We review and set up your partner dashboard within 24 hours.' },
  { step: '3', title: 'Start Earning', description: 'Share your unique referral link and earn on every conversion.' },
];

const audiences = [
  'SEO & Digital Marketing Agencies',
  'PR & Communications Firms',
  'Brand Strategy Consultancies',
  'Marketing Freelancers & Consultants',
];

const tiers = [
  { tier: 'Silver', referrals: '1-5 clients', commission: '20%', perks: 'Partner badge, priority support' },
  { tier: 'Gold', referrals: '6-20 clients', commission: '25%', perks: '+ White-label reports, co-marketing' },
  { tier: 'Platinum', referrals: '21+ clients', commission: '30%', perks: '+ Custom integrations, dedicated manager' },
];

const faqs = [
  {
    question: 'How does commission work?',
    answer: 'You earn a percentage of every payment your referred clients make, for as long as they remain active.',
  },
  {
    question: 'Is there a minimum commitment?',
    answer: 'No. Refer as many or as few clients as you\'d like.',
  },
  {
    question: 'Can I white-label the reports?',
    answer: 'Yes, Gold and Platinum partners get fully white-labeled reports.',
  },
  {
    question: 'How do I track my referrals?',
    answer: 'You\'ll get access to a partner dashboard showing all referrals, conversions, and earnings.',
  },
];

export default function PartnersPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Partners', url: '/partners' }]} />
      {/* Hero */}
      <SeoHero
        title={<>Grow Your Agency with <span className="text-[var(--brand)]">AI Visibility Tracking</span></>}
        subtitle="Partner with Livesov to offer AI brand monitoring to your clients. Earn 20% recurring commission on every referral."
        hideCta
      />

      {/* Override hero CTA */}
      <section className="land-section" style={{ paddingTop: 0, textAlign: 'center', marginTop: -24 }}>
        <Link href="/contact" className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 16 }}>
          Apply to Partner Program
        </Link>
      </section>

      {/* Benefits */}
      <section className="land-section">
        <h2 className="text-center text-3xl font-bold mb-12" style={{ color: 'var(--text-primary)' }}>
          Partner Benefits
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto px-6">
          {benefits.map((b) => (
            <div
              key={b.title}
              className="rounded-xl p-8 text-center"
              style={{ background: 'var(--bg-section, #f5f3f0)', border: '1px solid var(--card-border, #e8e5e1)' }}
            >
              <div className="text-4xl mb-4">{(() => { const Icon = benefitIcons[b.title as keyof typeof benefitIcons]; return Icon ? <Icon className="w-10 h-10 text-[var(--brand)] mx-auto" /> : null; })()}</div>
              <h3 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{b.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{b.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="land-section">
        <h2 className="text-center text-3xl font-bold mb-12" style={{ color: 'var(--text-primary)' }}>
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto px-6">
          {steps.map((s) => (
            <div key={s.step} className="text-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg mx-auto mb-4"
                style={{ background: 'var(--brand)' }}
              >
                {s.step}
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{s.title}</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who It's For */}
      <section className="land-section">
        <h2 className="text-center text-3xl font-bold mb-8" style={{ color: 'var(--text-primary)' }}>
          Who It&apos;s For
        </h2>
        <div className="max-w-2xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {audiences.map((a) => (
              <div
                key={a}
                className="flex items-center gap-3 rounded-lg p-4"
                style={{ background: 'var(--bg-section, #f5f3f0)', border: '1px solid var(--card-border, #e8e5e1)' }}
              >
                <span className="text-[var(--brand)] font-bold text-lg">&#10003;</span>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{a}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partner Tiers */}
      <section className="land-section">
        <h2 className="text-center text-3xl font-bold mb-8" style={{ color: 'var(--text-primary)' }}>
          Partner Tiers
        </h2>
        <div className="max-w-4xl mx-auto px-6 overflow-x-auto">
          <table className="w-full text-sm" style={{ color: 'var(--text-primary)' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--card-border, #e8e5e1)' }}>
                <th className="text-left py-3 px-4 font-semibold">Tier</th>
                <th className="text-left py-3 px-4 font-semibold">Referrals</th>
                <th className="text-left py-3 px-4 font-semibold">Commission</th>
                <th className="text-left py-3 px-4 font-semibold">Perks</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.tier} style={{ borderBottom: '1px solid var(--card-border, #e8e5e1)' }}>
                  <td className="py-3 px-4 font-semibold" style={{ color: 'var(--brand)' }}>{t.tier}</td>
                  <td className="py-3 px-4" style={{ color: 'var(--text-secondary)' }}>{t.referrals}</td>
                  <td className="py-3 px-4 font-semibold">{t.commission}</td>
                  <td className="py-3 px-4" style={{ color: 'var(--text-secondary)' }}>{t.perks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CTA */}
      <section className="land-section" style={{ textAlign: 'center' }}>
        <h2 className="text-3xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          Ready to Partner?
        </h2>
        <p className="text-base mb-8 max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
          Join our partner program and help your clients dominate AI search.
        </p>
        <Link href="/contact" className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 16 }}>
          Apply Now
        </Link>
      </section>

      {/* FAQ */}
      <section className="land-section">
        <h2 className="text-center text-3xl font-bold mb-8" style={{ color: 'var(--text-primary)' }}>
          Frequently Asked Questions
        </h2>
        <div className="max-w-3xl mx-auto px-6 space-y-6">
          {faqs.map((faq) => (
            <div
              key={faq.question}
              className="rounded-lg p-6"
              style={{ background: 'var(--bg-section, #f5f3f0)', border: '1px solid var(--card-border, #e8e5e1)' }}
            >
              <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{faq.question}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </SeoLayout>
  );
}
