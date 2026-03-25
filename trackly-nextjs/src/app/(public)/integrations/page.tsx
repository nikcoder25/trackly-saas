import type { Metadata } from 'next';
import SeoLayout, { SeoHero, SeoContent } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Integrations — AI Platforms We Track | Livesov',
  description: 'Livesov integrates with ChatGPT, Claude, Gemini, Perplexity, and Grok for comprehensive AI visibility tracking. Webhook alerts and email reports included.',
  alternates: { canonical: '/integrations' },
};

export default function IntegrationsPage() {
  return (
    <SeoLayout>
      <SeoHero
        title={<>Integrated with <span className="text-[#FF6154]">5 AI Platforms</span></>}
        subtitle="Livesov connects directly to the APIs of all major AI platforms to track your brand visibility in real-time."
      />
      <SeoContent>
        <h2>AI Platforms</h2>
        <ul>
          <li>ChatGPT (OpenAI) — GPT-4o, GPT-4o-mini, GPT-4o Search</li>
          <li>Claude (Anthropic) — Claude Sonnet, Claude Opus</li>
          <li>Gemini (Google) — Gemini 2.5 Flash, Gemini 2.5 Pro</li>
          <li>Perplexity — Sonar models with web search</li>
          <li>Grok (xAI) — Grok models with real-time X data</li>
        </ul>

        <h2>Notifications & Alerts</h2>
        <ul>
          <li>Email alerts for visibility changes</li>
          <li>Webhook notifications for custom integrations</li>
          <li>Scheduled email reports (weekly/monthly)</li>
          <li>In-app notifications</li>
        </ul>

        <h2>Data Export</h2>
        <ul>
          <li>CSV export for all analytics data</li>
          <li>JSON export for developer integrations</li>
          <li>PDF invoice downloads</li>
        </ul>
      </SeoContent>
    </SeoLayout>
  );
}
