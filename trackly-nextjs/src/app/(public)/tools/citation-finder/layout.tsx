import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Citation Finder | Find Where AI Cites You | Livesov',
  description: 'Find which URLs AI platforms cite when discussing your brand. Free instant check.',
  keywords: 'ai citation finder, ai citation tracker, find ai citations, perplexity citations',
  alternates: { canonical: '/tools/citation-finder' },
  openGraph: {
    title: 'AI Citation Finder | Livesov',
    description: 'See which URLs AI cites in answers about your brand.',
    url: 'https://livesov.com/tools/citation-finder',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'AI Citation Finder - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Citation Finder | Livesov',
    description: 'See which URLs AI cites in answers about your brand.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
