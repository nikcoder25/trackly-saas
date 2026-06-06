import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free GEO Score Checker | AI Readiness | Livesov',
  description: 'Free GEO score checker. Get a generative engine optimization score for any page in seconds. Per-category scoring, no signup.',
  keywords: 'geo score checker, free geo score, generative engine optimization score',
  alternates: { canonical: '/tools/geo-score-checker' },
  openGraph: {
    title: 'Free GEO Score Checker | AI Readiness | Livesov',
    description: 'Free GEO score checker. Get a generative engine optimization score for any page in seconds. Per-category scoring, no signup.',
    url: 'https://livesov.com/tools/geo-score-checker',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Free GEO Score Checker - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free GEO Score Checker | AI Readiness | Livesov',
    description: 'Free GEO score checker. Get a generative engine optimization score for any page in seconds. Per-category scoring, no signup.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
