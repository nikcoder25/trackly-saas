import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Livesov Pricing | AI Visibility Tracker from $9/mo',
  description: 'AI visibility tracker pricing. Free plan, paid from $9/mo across ChatGPT, Perplexity, Claude, Gemini, and Grok. No credit card to start.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Livesov Pricing | AI Visibility Tracker from $9/mo',
    description: 'AI visibility tracker pricing. Free plan, paid from $9/mo across ChatGPT, Perplexity, Claude, Gemini, and Grok. No credit card to start.',
    url: 'https://livesov.com/pricing',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Livesov Pricing - AI Visibility Tracker Plans' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov Pricing | AI Visibility Tracker from $9/mo',
    description: 'AI visibility tracker pricing. Free plan, paid from $9/mo across ChatGPT, Perplexity, Claude, Gemini, and Grok. No credit card to start.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
