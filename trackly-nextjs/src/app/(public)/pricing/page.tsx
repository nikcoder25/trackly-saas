import type { Metadata } from 'next';
import Link from 'next/link';
import SeoLayout from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Pricing — Livesov AI Visibility Tracker',
  description: 'Simple, transparent pricing for AI brand tracking. Start free, upgrade as you grow. Track your brand across ChatGPT, Claude, Gemini, Perplexity & Grok.',
  alternates: { canonical: '/pricing' },
};

const plans = [
  { name: 'Free', price: '$0', period: '/mo', features: ['1 brand', '5 prompts/month', '2 AI platforms', 'Manual runs', 'Basic dashboard'], cta: 'Start Free', highlighted: false },
  { name: 'Starter', price: '$9', period: '/mo', features: ['1 brand', '30 prompts/month', '2 AI platforms', 'Weekly schedule', 'SOV tracking'], cta: 'Get Started', highlighted: false },
  { name: 'Pro', price: '$29', period: '/mo', features: ['5 brands', '250 prompts/month', '5 AI platforms', 'Daily schedule', 'Sentiment analysis', 'Competitor tracking (5)', 'Email alerts'], cta: 'Start Pro', highlighted: true },
  { name: 'Agency', price: '$89', period: '/mo', features: ['20 brands', '1,000 prompts/month', '5 AI platforms', '6-hour schedule', 'Competitor tracking (20)', 'Team collaboration', 'Priority support'], cta: 'Start Agency', highlighted: false },
  { name: 'Enterprise', price: '$499', period: '/mo', features: ['100+ brands', '10,000+ prompts', '5 AI platforms', 'Hourly schedule', 'Unlimited competitors', 'Dedicated support', 'Custom integrations', 'White-label reports'], cta: 'Contact Sales', highlighted: false },
];

export default function PricingPage() {
  return (
    <SeoLayout>
      <section className="py-20 px-6 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">Simple, transparent pricing</h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-12">Start free. Upgrade as your AI visibility needs grow.</p>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {plans.map((plan) => (
            <div key={plan.name} className={`rounded-xl p-6 text-left ${plan.highlighted ? 'bg-[#FF6154] text-white ring-2 ring-[#FF6154] shadow-lg shadow-[#FF6154]/20' : 'bg-white border border-gray-200'}`}>
              <h3 className={`text-lg font-bold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
              <div className="mt-3 mb-6">
                <span className={`text-3xl font-extrabold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>{plan.price}</span>
                <span className={`text-sm ${plan.highlighted ? 'text-white/70' : 'text-gray-400'}`}>{plan.period}</span>
              </div>
              <ul className="space-y-2.5 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className={`text-sm flex items-start gap-2 ${plan.highlighted ? 'text-white/90' : 'text-gray-500'}`}>
                    <span className={`mt-0.5 ${plan.highlighted ? 'text-white' : 'text-green-500'}`}>&#10003;</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className={`block text-center py-2.5 rounded-lg text-sm font-bold no-underline transition ${plan.highlighted ? 'bg-white text-[#FF6154] hover:bg-gray-100' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </SeoLayout>
  );
}
