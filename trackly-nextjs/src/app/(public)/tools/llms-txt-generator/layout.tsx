import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free llms.txt Generator | Build Yours Fast | Livesov',
  description: 'Free llms.txt generator. Crawl your sitemap, group URLs, and download a valid llms.txt so AI crawlers understand your site. No signup.',
  keywords: 'llms.txt generator, llms.txt, ai crawler, llms.txt file, generate llms.txt',
  alternates: { canonical: '/tools/llms-txt-generator' },
  openGraph: {
    title: 'Free llms.txt Generator | Livesov',
    description: 'Generate a valid llms.txt file for your site in seconds. Free, no signup.',
    url: 'https://livesov.com/tools/llms-txt-generator',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Free llms.txt Generator - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free llms.txt Generator | Livesov',
    description: 'Build a valid llms.txt for your site in seconds. Free, no signup.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
