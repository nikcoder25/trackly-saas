import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free GEO Audit Tool | Check Your AI Search Visibility | Livesov',
  description: 'Run our free GEO audit tool to score your page\'s AI search visibility in seconds. No signup. See how citable your content is across ChatGPT, Perplexity, and Google AI.',
  keywords: 'ai search visibility, geo audit tool, geo audit, ai seo audit, generative engine optimization audit, geo score checker',
  alternates: { canonical: '/geo-audit' },
  openGraph: {
    title: 'Free GEO Audit Tool | Check Your AI Search Visibility | Livesov',
    description: 'Run our free GEO audit tool to score your page\'s AI search visibility in seconds. No signup. See how citable your content is across ChatGPT, Perplexity, and Google AI.',
    url: 'https://livesov.com/geo-audit',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Free GEO audit tool - check your AI search visibility with Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free GEO Audit Tool | Check Your AI Search Visibility | Livesov',
    description: 'Run our free GEO audit tool to score your page\'s AI search visibility in seconds. No signup. See how citable your content is across ChatGPT, Perplexity, and Google AI.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function GeoAuditLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
