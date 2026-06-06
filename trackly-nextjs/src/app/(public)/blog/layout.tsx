import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Livesov Blog | LLM SEO & AI Search Optimization',
  description: 'Guides on LLM SEO, AI search optimization, GEO strategy, and AI share of voice across ChatGPT, Perplexity, Claude, Gemini, and Grok.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Livesov Blog | LLM SEO & AI Search Optimization',
    description: 'Guides on LLM SEO, AI search optimization, GEO strategy, and AI share of voice across ChatGPT, Perplexity, Claude, Gemini, and Grok.',
    url: 'https://livesov.com/blog',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Livesov Blog - AI Visibility Insights' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov Blog | LLM SEO & AI Search Optimization',
    description: 'Guides on LLM SEO, AI search optimization, GEO strategy, and AI share of voice across ChatGPT, Perplexity, Claude, Gemini, and Grok.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
