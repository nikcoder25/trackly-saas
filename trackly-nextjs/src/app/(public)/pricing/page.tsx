import Link from 'next/link';
import SeoLayout, { Breadcrumbs } from '@/components/seo/SeoLayout';
import { PRICING_PLANS, PRICING_COMPARISON } from '@/lib/constants';

const monthlyPlans = PRICING_PLANS.map(p => ({
  ...p,
  period: '/mo' as const,
  highlighted: !!p.featured,
  href: '/signup',
}));

const comparisonData = PRICING_COMPARISON;

export default function PricingPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Pricing', url: '/pricing' }]} />
      <section className="py-20 px-6 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">Simple, transparent pricing</h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-2">Start with a 7-day free trial &mdash; all 5 AI platforms included.</p>
        <p className="text-sm text-gray-400 mb-12">No credit card required &middot; Cancel anytime &middot; 14-day money-back guarantee</p>

        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-6">
          {monthlyPlans.map((plan) => {
            const isCustom = plan.price === 'Custom';
            const isEnterprise = plan.name === 'Enterprise';
            const isFree = plan.name === 'Free';
            const showTrialBadge = !isCustom && !isFree;

            return (
              <div key={plan.name} className={`rounded-xl p-6 text-left ${plan.highlighted ? 'bg-[var(--brand)] text-white ring-2 ring-[var(--brand)] shadow-lg shadow-[var(--brand)]/20' : isEnterprise ? 'bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200' : 'bg-white border border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <h3 className={`text-lg font-bold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
                </div>
                <div className="mt-3 mb-1">
                  <span className={`text-3xl font-extrabold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>{plan.price}</span>
                  {!isCustom && <span className={`text-sm ${plan.highlighted ? 'text-white/70' : 'text-gray-400'}`}>{plan.period}</span>}
                </div>
                {isCustom && <p className="text-xs mb-4 text-indigo-500 font-medium">tailored to your needs</p>}
                {showTrialBadge && (
                  <p className={`text-xs mb-4 font-semibold ${plan.highlighted ? 'text-white/90' : 'text-green-600'}`}>
                    Start with 7-day free trial
                  </p>
                )}
                {isFree && <div className="mb-6" />}
                <ul className="space-y-2.5 mb-6">
                  {plan.features.map((f) => {
                    const isNegative = f.toLowerCase().startsWith('no ');
                    return (
                      <li key={f} className={`text-sm flex items-start gap-2 ${plan.highlighted ? 'text-white/90' : isNegative ? 'text-gray-400' : 'text-gray-500'}`}>
                        {isNegative ? (
                          <span className="mt-0.5 text-gray-300">&mdash;</span>
                        ) : (
                          <span className={`mt-0.5 ${plan.highlighted ? 'text-white' : 'text-green-500'}`}>&#10003;</span>
                        )}
                        {f}
                      </li>
                    );
                  })}
                </ul>
                {isEnterprise ? (
                  <a href="/contact" className="block text-center py-2.5 rounded-lg text-sm font-bold no-underline transition bg-indigo-600 text-white hover:bg-indigo-700">
                    {plan.cta}
                  </a>
                ) : (
                  <Link href={plan.href} className={`block text-center py-2.5 rounded-lg text-sm font-bold no-underline transition ${plan.highlighted ? 'bg-white text-[var(--brand)] hover:bg-gray-100' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
                    {plan.cta}
                  </Link>
                )}
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
            <table className="w-full text-sm border-collapse" aria-label="Livesov vs Ahrefs vs Semrush feature comparison">
              <caption className="sr-only">Feature comparison between Livesov, Ahrefs, and Semrush</caption>
              <thead>
                <tr>
                  {comparisonData.headers.map((h, i) => (
                    <th key={h} className={`py-3 px-4 text-left font-bold border-b-2 border-gray-200 ${i === 1 ? 'text-[var(--brand)]' : 'text-gray-700'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonData.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-gray-100">
                    {row.map((cell, ci) => (
                      <td key={ci} className={`py-3 px-4 ${ci === 0 ? 'font-medium text-gray-700' : ci === 1 ? 'text-[var(--brand)] font-semibold' : 'text-gray-500'}`}>
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
