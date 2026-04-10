import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Livesov — AI Visibility Tracker | Track Your Brand Across ChatGPT, Perplexity, Claude, Gemini, Grok & Google AI Overviews',
  description:
    'Monitor how AI platforms mention your brand. Track share of voice, sentiment, and competitors across ChatGPT, Perplexity, Claude, Gemini, Grok & Google AI Overviews. Free plan available.',
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
    title: 'Livesov — Is Your Brand Visible in AI Answers?',
    description:
      'Track how ChatGPT, Perplexity, Claude, Gemini, Grok & Google AI Overviews mention your brand. Get real proof, measure share of voice, and optimize your AI visibility.',
    type: 'website',
    url: 'https://livesov.com/',
    siteName: 'Livesov',
    images: [{
      url: 'https://livesov.com/og-image.png',
      width: 1200,
      height: 630,
      alt: 'Livesov — AI Visibility Tracker for brands across ChatGPT, Perplexity, Claude, Gemini, Grok, and Google AI Overviews',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov — AI Visibility Tracker',
    description:
      'Monitor your brand across 6 AI platforms. Track mentions, sentiment & share of voice. Free plan available.',
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
      description: 'AI Visibility Tracker — Monitor your brand across ChatGPT, Perplexity, Claude, Gemini, Grok & Google AI Overviews.',
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
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is AI visibility tracking?',
          acceptedAnswer: { '@type': 'Answer', text: 'AI visibility tracking monitors how AI platforms like ChatGPT, Perplexity, Claude, Gemini, Grok, and Google AI Overviews mention your brand when users ask questions. It reveals your brand\'s presence in the new AI-driven discovery layer.' },
        },
        {
          '@type': 'Question',
          name: 'Which AI platforms does Livesov support?',
          acceptedAnswer: { '@type': 'Answer', text: 'Livesov tracks your brand across 6 major AI platforms: ChatGPT (OpenAI), Perplexity AI, Claude (Anthropic), Google Gemini, Grok (xAI), and Google AI Overviews (DataForSEO).' },
        },
        {
          '@type': 'Question',
          name: 'What is Share of Voice in AI?',
          acceptedAnswer: { '@type': 'Answer', text: 'Share of Voice (SOV) in AI measures what percentage of AI-generated responses mention your brand when relevant queries are asked. A higher SOV means AI is more likely to recommend you.' },
        },
        {
          '@type': 'Question',
          name: 'How is this different from traditional SEO tools?',
          acceptedAnswer: { '@type': 'Answer', text: 'SEO tools track Google Search rankings. Livesov tracks your visibility in AI-generated answers — a completely different discovery channel that\'s growing rapidly.' },
        },
        {
          '@type': 'Question',
          name: 'Can I use Livesov for client reporting?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes. Livesov saves complete AI responses as proof, exportable as CSV reports. Agencies use it to deliver data-backed AI visibility audits to clients.' },
        },
        {
          '@type': 'Question',
          name: 'How much does Livesov cost?',
          acceptedAnswer: { '@type': 'Answer', text: 'Livesov has a free plan to get started. Paid plans start at $9/mo (Starter), with Pro at $29/mo and Agency at $89/mo.' },
        },
      ],
    },
  ],
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
