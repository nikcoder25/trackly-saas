import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing | Rank Tracking + AI Visibility from $19/mo | Livesov',
  description: 'Google rank tracking from the city level plus AI brand monitoring for ChatGPT, Perplexity, Claude, Gemini and Grok, from $19/mo. Start a 7-day free trial, no card needed.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing | Rank Tracking + AI Visibility from $19/mo | Livesov',
    description: 'Google rank tracking from the city level plus AI brand monitoring for ChatGPT, Perplexity, Claude, Gemini and Grok, from $19/mo. Start a 7-day free trial, no card needed.',
    url: 'https://livesov.com/pricing',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Livesov pricing - generative engine optimization tools and plans' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing | Rank Tracking + AI Visibility from $19/mo | Livesov',
    description: 'Google rank tracking from the city level plus AI brand monitoring for ChatGPT, Perplexity, Claude, Gemini and Grok, from $19/mo. Start a 7-day free trial, no card needed.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
