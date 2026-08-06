import type { Metadata } from 'next';

// This page owns the whole llms.txt tool cluster: generator, validator and
// checker. Live SERP testing (Aug 2026) found "llms.txt generator" (590/mo),
// "llms.txt checker" (110/mo) and "llms.txt validator" (90/mo) all return a
// near-identical page 1 - same #1 result, overlapping sites, and no AI Overview
// on any of them. Splitting them across two URLs would just have the two pages
// competing, so both jobs live here and the metadata claims both vocabularies.
const TITLE = 'Free llms.txt Generator & Validator | Build and Check Yours | Livesov';
const DESCRIPTION =
  'Free llms.txt generator and validator. Crawl your sitemap to build a valid llms.txt, or check an existing file against the spec - errors, warnings and a score. No signup.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords:
    'llms.txt generator, llms.txt validator, llms.txt checker, free llms.txt generator, llms.txt, ai crawler, llms.txt file, generate llms.txt, validate llms.txt, check llms.txt, llms.txt validation, llms txt checker online',
  alternates: { canonical: '/tools/llms-txt-generator' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://livesov.com/tools/llms-txt-generator',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Free llms.txt Generator and Validator - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
