import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free GEO Audit - Check Your Page\'s AI Readiness | Livesov',
  description: 'Analyze any URL for AI visibility optimization. Get a free GEO audit score with actionable recommendations to improve how AI platforms reference your content.',
  keywords: 'geo audit, ai seo audit, generative engine optimization audit, ai readiness check, geo score checker',
  alternates: { canonical: '/geo-audit' },
  openGraph: {
    title: 'Free GEO Audit - Check Your Page\'s AI Readiness | Livesov',
    description: 'Analyze any URL for AI visibility optimization. Get a free GEO audit score with actionable recommendations.',
    url: 'https://livesov.com/geo-audit',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Free GEO Audit - Livesov AI Readiness Checker' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free GEO Audit | Livesov',
    description: 'Check your page\'s AI readiness score. Get actionable GEO optimization recommendations.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function GeoAuditLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
