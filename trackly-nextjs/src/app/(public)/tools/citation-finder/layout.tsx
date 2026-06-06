import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Citation Finder | See Where AI Cites You | Livesov',
  description: 'Free AI citation finder. See which URLs Perplexity and ChatGPT cite when discussing your brand, with your domain highlighted.',
  keywords: 'ai citation finder, ai citation tracker, find ai citations, perplexity citations',
  alternates: { canonical: '/tools/citation-finder' },
  openGraph: {
    title: 'AI Citation Finder | See Where AI Cites You | Livesov',
    description: 'Free AI citation finder. See which URLs Perplexity and ChatGPT cite when discussing your brand, with your domain highlighted.',
    url: 'https://livesov.com/tools/citation-finder',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'AI Citation Finder - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Citation Finder | See Where AI Cites You | Livesov',
    description: 'Free AI citation finder. See which URLs Perplexity and ChatGPT cite when discussing your brand, with your domain highlighted.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
