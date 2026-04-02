'use client';

import { useState } from 'react';
import Link from 'next/link';
import SeoLayout from '@/components/seo/SeoLayout';

const monthlyPlans = [
  { name: 'Free', price: '$0', annualPrice: '$0', period: '/mo', features: ['1 brand', '5 prompts/month', '2 AI platforms', 'Manual runs', 'Basic dashboard', '3 GEO audits/month'], cta: 'Start Free', highlighted: false, href: '/signup' },
  { name: 'Starter', price: '$9', annualPrice: '$7', period: '/mo', features: ['1 brand', '30 prompts/month', '2 AI platforms', 'Every 3 days schedule', 'SOV tracking', 'Competitor tracking (2)', 'Sentiment analysis', '25 GEO audits/month'], cta: 'Get Started', highlighted: false, href: '/signup' },
  { name: 'Pro', price: '$29', annualPrice: '$23', period: '/mo', features: ['5 brands', '250 prompts/month', '5 AI platforms', 'Daily schedule', 'Sentiment analysis', 'Competitor tracking (5)', 'Email alerts', '100 GEO audits/month'], cta: 'Start Pro', highlighted: true, href: '/signup' },
  { name: 'Agency', price: '$89', annualPrice: '$71', period: '/mo', features: ['20 brands', '1,000 prompts/month', '5 AI platforms', '6-hour schedule', 'Competitor tracking (20)', 'Team collaboration', 'Priority support', '500 GEO audits/month'], cta: 'Start Agency', highlighted: false, href: '/signup' },
];

const comparisonData = {
  headers: ['Feature', 'Livesov', 'Ahrefs', 'Semrush'],
  rows: [
    ['AI Brand Tracking', '\u2713 (5 platforms)', '\u2717', '\u2717'],
    ['Starting Price', '$0/mo', '$99/mo', '$129/mo'],
    ['AI Response Proof', '\u2713', '\u2717', '\u2717'],
    ['Share of Voice', '\u2713', 'Limited', 'Limited'],
    ['Sentiment Analysis', '\u2713', '\u2717', '\u2717'],
    ['GEO URL Audits', '\u2713 (up to 5,000/mo)', '\u2717', '\u2717'],
  ],
};

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <SeoLayout>
      <section className="py-20 px-6 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">Simple, transparent pricing</h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-2">Start free. Upgrade as your AI visibility needs grow.</p>
        <p className="text-sm text-gray-400 mb-8">No credit card required &middot; 14-day money-back guarantee</p>

        {/* Monthly / Annual toggle */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <span className={`text-sm font-medium ${!annual ? 'text-gray-900' : 'text-gray-400'}`}>Monthly</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${annual ? 'bg-[#FF6154]' : 'bg-gray-300'}`}
            aria-label="Toggle annual pricing"
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className={`text-sm font-medium ${annual ? 'text-gray-900' : 'text-gray-400'}`}>Annual</span>
          {annual && (
            <span className="ml-1 inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">Save 20%</span>
          )}
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {monthlyPlans.map((plan) => {
            const displayPrice = annual ? plan.annualPrice : plan.price;
            const showStrike = annual && plan.price !== '$0' && plan.price !== plan.annualPrice;

            return (
              <div key={plan.name} className={`rounded-xl p-6 text-left ${plan.highlighted ? 'bg-[#FF6154] text-white ring-2 ring-[#FF6154] shadow-lg shadow-[#FF6154]/20' : 'bg-white border border-gray-200'}`}>
                <h3 className={`text-lg font-bold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
                <div className="mt-3 mb-1">
                  {showStrike && (
                    <span className={`text-lg line-through mr-2 ${plan.highlighted ? 'text-white/50' : 'text-gray-300'}`}>{plan.price}</span>
                  )}
                  <span className={`text-3xl font-extrabold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>{displayPrice}</span>
                  <span className={`text-sm ${plan.highlighted ? 'text-white/70' : 'text-gray-400'}`}>{plan.period}</span>
                </div>
                {annual && plan.price !== '$0' && (
                  <p className={`text-xs mb-4 ${plan.highlighted ? 'text-white/60' : 'text-gray-400'}`}>billed annually</p>
                )}
                {(!annual || plan.price === '$0') && <div className="mb-6" />}
                <ul className="space-y-2.5 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className={`text-sm flex items-start gap-2 ${plan.highlighted ? 'text-white/90' : 'text-gray-500'}`}>
                      <span className={`mt-0.5 ${plan.highlighted ? 'text-white' : 'text-green-500'}`}>&#10003;</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={plan.href} className={`block text-center py-2.5 rounded-lg text-sm font-bold no-underline transition ${plan.highlighted ? 'bg-white text-[#FF6154] hover:bg-gray-100' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
                  {plan.cta}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center mb-8">How Livesov compares</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {comparisonData.headers.map((h, i) => (
                    <th key={h} className={`py-3 px-4 text-left font-bold border-b-2 border-gray-200 ${i === 1 ? 'text-[#FF6154]' : 'text-gray-700'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonData.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-gray-100">
                    {row.map((cell, ci) => (
                      <td key={ci} className={`py-3 px-4 ${ci === 0 ? 'font-medium text-gray-700' : ci === 1 ? 'text-[#FF6154] font-semibold' : 'text-gray-500'}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </SeoLayout>
  );
}
