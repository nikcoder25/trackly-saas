import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — Livesov AI Visibility Tracker',
  description: 'Simple, transparent pricing for AI brand tracking. Start free, upgrade as you grow. Track your brand across ChatGPT, Claude, Gemini, Perplexity & Grok.',
  alternates: { canonical: '/pricing' },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
