import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog - AI Visibility Insights & GEO Strategies | Livesov',
  description: 'Learn about AI visibility tracking, generative engine optimization (GEO), and how to get your brand recommended by ChatGPT, Claude, Gemini, Perplexity, Grok & Google AI Overviews.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Blog - AI Visibility Insights & GEO Strategies | Livesov',
    description: 'Learn about AI visibility tracking, generative engine optimization (GEO), and how to get your brand recommended by AI platforms.',
    url: 'https://livesov.com/blog',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Livesov Blog - AI Visibility Insights' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog - AI Visibility Insights | Livesov',
    description: 'Learn about AI visibility tracking, GEO strategies, and how to optimize your brand for AI platforms.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
