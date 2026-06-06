import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free AI Share of Voice Calculator | Livesov',
  description: 'Free AI share of voice calculator. Enter mentions and total responses, add competitors, and see live percentages. Export to CSV.',
  keywords: 'ai share of voice calculator, ai share of voice, sov calculator, brand share of voice ai',
  alternates: { canonical: '/tools/share-of-voice-calculator' },
  openGraph: {
    title: 'Free AI Share of Voice Calculator | Livesov',
    description: 'Free AI share of voice calculator. Enter mentions and total responses, add competitors, and see live percentages. Export to CSV.',
    url: 'https://livesov.com/tools/share-of-voice-calculator',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'AI Share of Voice Calculator - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free AI Share of Voice Calculator | Livesov',
    description: 'Free AI share of voice calculator. Enter mentions and total responses, add competitors, and see live percentages. Export to CSV.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
