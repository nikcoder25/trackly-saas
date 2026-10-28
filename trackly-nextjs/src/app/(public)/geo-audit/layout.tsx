import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Visibility Checker | Free, No Sign Up | Livesov',
  description: 'AI visibility checker that scores how ready your page is to be cited by ChatGPT, Gemini and Perplexity. Free, no sign up, results in seconds.',
  keywords: 'ai visibility checker, free ai visibility checker, ai search visibility, geo audit tool, geo audit, ai seo audit, generative engine optimization audit, geo score checker',
  alternates: { canonical: '/geo-audit' },
  openGraph: {
    title: 'AI Visibility Checker | Free, No Sign Up | Livesov',
    description: 'AI visibility checker that scores how ready your page is to be cited by ChatGPT, Gemini and Perplexity. Free, no sign up, results in seconds.',
    url: 'https://livesov.com/geo-audit',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Free AI visibility checker by Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Visibility Checker | Free, No Sign Up | Livesov',
    description: 'AI visibility checker that scores how ready your page is to be cited by ChatGPT, Gemini and Perplexity. Free, no sign up, results in seconds.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function GeoAuditLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
