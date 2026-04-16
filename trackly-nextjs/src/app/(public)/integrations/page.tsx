import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Integrations — AI Platforms We Track | Livesov',
  description: 'Livesov integrates with ChatGPT, Claude, Gemini, Perplexity, Grok, and Google AI Overviews for comprehensive AI visibility tracking. Webhook alerts and email reports included.',
  alternates: { canonical: '/integrations' },
  openGraph: {
    title: 'Integrations — AI Platforms We Track | Livesov',
    description: 'Livesov integrates with ChatGPT, Claude, Gemini, Perplexity, Grok, and Google AI Overviews for comprehensive AI visibility tracking. Webhook alerts and email reports included.',
    url: 'https://livesov.com/integrations',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Integrations — AI Platforms We Track | Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Integrations — AI Platforms We Track | Livesov',
    description: 'Livesov integrates with ChatGPT, Claude, Gemini, Perplexity, Grok, and Google AI Overviews for comprehensive AI visibility tracking. Webhook alerts and email reports included.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const platforms = [
  { icon: '⬡', name: 'ChatGPT', color: '#10a37f', models: 'GPT-4o, GPT-4o-mini, GPT-4o Search', desc: 'Track brand mentions in OpenAI\'s flagship AI assistant.' },
  { icon: '◈', name: 'Claude', color: '#d97706', models: 'Claude 4, Claude 3.5 Sonnet', desc: 'Monitor how Anthropic\'s Claude references your brand.' },
  { icon: '✦', name: 'Gemini', color: '#4285f4', models: 'Gemini 2.5 Flash, Gemini 2.5 Pro', desc: 'See what Google\'s AI says about your brand.' },
  { icon: '◎', name: 'Perplexity', color: '#9b72ff', models: 'Sonar models with web search', desc: 'Track visibility in Perplexity\'s search-powered AI.' },
  { icon: '⚡', name: 'Grok', color: '#1d9bf0', models: 'Grok models with real-time X data', desc: 'Monitor mentions in xAI\'s Grok with live data.' },
  { icon: '🔍', name: 'Google AI Overviews', color: '#34a853', models: 'DataForSEO API', desc: 'Track your brand in AI-generated summaries atop Google Search results.' },
];

const extras = [
  {
    title: 'Notifications & Alerts',
    icon: '🔔',
    items: ['Email alerts for visibility changes', 'Webhook notifications for custom integrations', 'Scheduled email reports (weekly/monthly)', 'In-app notifications'],
  },
  {
    title: 'Export & Reporting',
    icon: '📊',
    items: ['CSV export for all analytics data', 'JSON export for developer integrations', 'PDF invoice downloads', 'Full AI response proof exports'],
  },
];

export default function IntegrationsPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Integrations', url: '/integrations' }]} />
      <SeoHero
        title={<>Integrated with <span className="text-[var(--brand)]">6 AI Platforms</span></>}
        subtitle="Livesov connects directly to the APIs of all major AI platforms to track your brand visibility in real-time."
      />

      <section className="px-6 pb-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {platforms.map(p => (
            <div key={p.name} className="rounded-xl border border-gray-200 bg-white p-6 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl" style={{ color: p.color }} aria-hidden="true">{p.icon}</span>
                <h3 className="text-lg font-bold text-gray-900">{p.name}</h3>
              </div>
              <p className="text-sm text-gray-500 mb-3">{p.desc}</p>
              <p className="text-xs text-gray-400 font-mono">{p.models}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-5">
          {extras.map(section => (
            <div key={section.title} className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl" role="img" aria-label={section.title}>{section.icon}</span>
                <h3 className="text-lg font-bold text-gray-900">{section.title}</h3>
              </div>
              <ul className="space-y-2">
                {section.items.map(item => (
                  <li key={item} className="text-sm text-gray-500 flex items-start gap-2">
                    <span className="text-green-500 mt-0.5" aria-hidden="true">&#10003;</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </SeoLayout>
  );
}
