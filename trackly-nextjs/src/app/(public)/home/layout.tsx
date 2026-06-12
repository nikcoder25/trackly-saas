import type { Metadata } from 'next';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: 'AI Visibility Tracker for ChatGPT, Gemini & Claude',
  description:
    'Livesov is the AI visibility tracker for ChatGPT, Perplexity, Claude, Gemini, and Grok. Track brand mentions and share of voice. 7-day free trial, plans from $9/mo.',
  keywords: [
    'AI visibility tracking',
    'AI brand monitoring',
    'ChatGPT brand tracking',
    'Perplexity tracking',
    'Claude tracking',
    'Gemini tracking',
    'Grok tracking',
    'AI share of voice',
    'GEO optimization',
    'generative engine optimization',
    'AI SEO',
    'brand monitoring AI',
  ],
  openGraph: {
    title: 'AI Visibility Tracker for ChatGPT, Gemini & Claude',
    description:
      'Livesov is the AI visibility tracker for ChatGPT, Perplexity, Claude, Gemini, and Grok. Track brand mentions and share of voice. 7-day free trial, plans from $9/mo.',
    type: 'website',
    url: 'https://livesov.com/',
    siteName: 'Livesov',
    images: [{
      url: 'https://livesov.com/og-image.png',
      width: 1200,
      height: 630,
      alt: 'Livesov - AI Visibility Tracker for brands across ChatGPT, Perplexity, Claude, Gemini, and Grok',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Visibility Tracker for ChatGPT, Gemini & Claude',
    description:
      'Livesov is the AI visibility tracker for ChatGPT, Perplexity, Claude, Gemini, and Grok. Track brand mentions and share of voice. 7-day free trial, plans from $9/mo.',
  },
  alternates: {
    canonical: '/',
  },
};

/* JSON-LD structured data for rich search results */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'Livesov',
      url: 'https://livesov.com',
      description: 'AI Visibility Tracker - Monitor your brand across ChatGPT, Perplexity, Claude, Gemini & Grok.',
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'hello@livesov.com',
        contactType: 'customer support',
      },
      sameAs: [
        'https://x.com/livesov',
        'https://linkedin.com/company/livesov',
      ],
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Livesov',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      offers: [
        { '@type': 'Offer', name: 'Starter', price: '9', priceCurrency: 'USD', url: 'https://livesov.com/signup' },
        { '@type': 'Offer', name: 'Pro', price: '29', priceCurrency: 'USD', url: 'https://livesov.com/signup' },
        { '@type': 'Offer', name: 'Agency', price: '89', priceCurrency: 'USD', url: 'https://livesov.com/signup' },
      ],
    },
    // NOTE: FAQPage schema intentionally omitted - the editorial homepage has
    // no visible FAQ section, and FAQ structured data without matching on-page
    // content violates Google's rich-results guidelines. The full FAQ lives on
    // /how-it-works and the tool pages.
  ],
};

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
