import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Prompt Generator for Brand Tracking | Free | Livesov',
  description: 'Generate brand monitoring prompts in seconds. Input your industry and get 50+ tracking prompts.',
  keywords: 'ai prompt generator, brand tracking prompts, ai prompts for brand monitoring',
  alternates: { canonical: '/tools/prompt-generator' },
  openGraph: {
    title: 'AI Prompt Generator for Brand Tracking | Livesov',
    description: 'Generate 50+ brand monitoring prompts in seconds.',
    url: 'https://livesov.com/tools/prompt-generator',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'AI Prompt Generator - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Prompt Generator for Brand Tracking | Livesov',
    description: 'Generate 50+ brand monitoring prompts in seconds.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
