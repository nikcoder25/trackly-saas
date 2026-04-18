import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing - Livesov AI Visibility Tracker',
  description: 'Simple, transparent pricing for AI brand tracking. Start free, upgrade as you grow. Track your brand across ChatGPT, Claude, Gemini, Perplexity, Grok & Google AI Overviews.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing - Livesov AI Visibility Tracker',
    description: 'Simple, transparent pricing for AI brand tracking. Start free, upgrade as you grow.',
    url: 'https://livesov.com/pricing',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Livesov Pricing - AI Visibility Tracker Plans' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing - Livesov AI Visibility Tracker',
    description: '7-day free trial on every plan. No credit card required. Track your brand across 6 AI platforms from $9/mo.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
