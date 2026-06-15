import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing | Generative Engine Optimization Tools from $9/mo | Livesov',
  description: 'Livesov is AI brand monitoring software with generative engine optimization tools from $9/mo across ChatGPT, Perplexity, Claude, Gemini, and Grok. 7-day free trial, no credit card to start.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing | Generative Engine Optimization Tools from $9/mo | Livesov',
    description: 'Livesov is AI brand monitoring software with generative engine optimization tools from $9/mo across ChatGPT, Perplexity, Claude, Gemini, and Grok. 7-day free trial, no credit card to start.',
    url: 'https://livesov.com/pricing',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Livesov pricing - generative engine optimization tools and plans' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing | Generative Engine Optimization Tools from $9/mo | Livesov',
    description: 'Livesov is AI brand monitoring software with generative engine optimization tools from $9/mo across ChatGPT, Perplexity, Claude, Gemini, and Grok. 7-day free trial, no credit card to start.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
