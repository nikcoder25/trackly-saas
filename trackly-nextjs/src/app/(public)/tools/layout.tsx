import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free GEO & AI Visibility Tools | Livesov',
  description: 'Free tools for AI visibility: llms.txt generator, GEO audit, share of voice calculator, more.',
  keywords: 'free geo tools, ai visibility tools, free seo tools, ai search tools, geo tools',
  alternates: { canonical: '/tools' },
  openGraph: {
    title: 'Free GEO & AI Visibility Tools | Livesov',
    description: 'Free tools for AI visibility: llms.txt generator, GEO audit, share of voice calculator and more.',
    url: 'https://livesov.com/tools',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Free GEO & AI Visibility Tools - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free GEO & AI Visibility Tools | Livesov',
    description: 'Free tools for AI visibility - llms.txt generator, GEO audit, more.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
