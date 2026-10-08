import type { Metadata } from 'next';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  // Keyword first, brand last (absolute so no template can prepend the brand).
  title: { absolute: 'AI Visibility Tracker for Agencies | ChatGPT & Gemini | Livesov' },
  description:
    'AI visibility tracker for agencies and local businesses. See how ChatGPT, Gemini, Perplexity, Claude and Grok mention each client. Free 7-day trial.',
  keywords: [
    'AI visibility tracker',
    'AI visibility tracker for agencies',
    'AI visibility tool for agencies',
    'AI visibility tool',
    'AI visibility platform',
    'generative engine optimization',
    'AI brand monitoring',
    'ChatGPT brand tracking',
    'Perplexity tracking',
    'Claude tracking',
    'Gemini tracking',
    'Grok tracking',
    'AI share of voice',
    'AI SEO',
  ],
  openGraph: {
    title: 'AI Visibility Tracker for Agencies | Livesov',
    description:
      'Track how ChatGPT, Gemini, Perplexity, Claude and Grok mention every client. White label reports, daily tracking, plans from $9/mo.',
    type: 'website',
    url: 'https://livesov.com/',
    siteName: 'Livesov',
    images: [{
      url: 'https://livesov.com/og-image.png',
      width: 1200,
      height: 630,
      alt: 'Livesov - AI visibility tracker for brands across ChatGPT, Perplexity, Claude, Gemini, and Grok',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Visibility Tracker for Agencies | Livesov',
    description:
      'Track how ChatGPT, Gemini, Perplexity, Claude and Grok mention every client. White label reports, daily tracking, plans from $9/mo.',
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
      '@id': 'https://livesov.com/#organization',
      name: 'Livesov',
      url: 'https://livesov.com',
      logo: {
        '@type': 'ImageObject',
        url: 'https://livesov.com/android-chrome-512x512.png',
        width: 512,
        height: 512,
      },
      description: 'AI visibility tracker for agencies - monitor every client across ChatGPT, Perplexity, Claude, Gemini & Grok.',
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
      '@type': 'WebSite',
      '@id': 'https://livesov.com/#website',
      name: 'Livesov',
      url: 'https://livesov.com',
      publisher: { '@id': 'https://livesov.com/#organization' },
      inLanguage: 'en',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Livesov',
      url: 'https://livesov.com',
      description: 'AI visibility tracker for agencies. Tracks brand mentions, rank and citations in ChatGPT, Gemini, Perplexity, Claude and Grok.',
      image: 'https://livesov.com/dashboard-shot.png',
      publisher: { '@id': 'https://livesov.com/#organization' },
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
