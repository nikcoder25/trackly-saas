import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Competitor Finder | See Who AI Recommends',
  description: 'Free AI competitor finder. Enter your industry to see the top 10 brands AI recommends in your vertical. No signup needed.',
  keywords: 'ai competitor finder, ai recommendations, who does chatgpt recommend',
  alternates: { canonical: '/tools/competitor-finder' },
  openGraph: {
    title: 'AI Competitor Finder | See Who AI Recommends',
    description: 'Free AI competitor finder. Enter your industry to see the top 10 brands AI recommends in your vertical. No signup needed.',
    url: 'https://livesov.com/tools/competitor-finder',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'AI Competitor Finder - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Competitor Finder | See Who AI Recommends',
    description: 'Free AI competitor finder. Enter your industry to see the top 10 brands AI recommends in your vertical. No signup needed.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
