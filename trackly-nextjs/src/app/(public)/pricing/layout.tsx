import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing | AI Visibility Tracking from $9/mo | Livesov',
  description: 'AI brand monitoring for ChatGPT, Perplexity, Claude, Gemini and Grok from $9/mo. See plan limits and costs. Start a 7-day free trial, no card needed.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing | AI Visibility Tracking from $9/mo | Livesov',
    description: 'AI brand monitoring for ChatGPT, Perplexity, Claude, Gemini and Grok from $9/mo. See plan limits and costs. Start a 7-day free trial, no card needed.',
    url: 'https://livesov.com/pricing',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Livesov pricing - generative engine optimization tools and plans' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing | AI Visibility Tracking from $9/mo | Livesov',
    description: 'AI brand monitoring for ChatGPT, Perplexity, Claude, Gemini and Grok from $9/mo. See plan limits and costs. Start a 7-day free trial, no card needed.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
