import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Prompt Generator for Brand Tracking | Livesov',
  description: 'Free AI prompt generator. Enter your industry and get 50+ brand monitoring prompts your buyers ask AI. Copy or download CSV.',
  keywords: 'ai prompt generator, brand tracking prompts, ai prompts for brand monitoring',
  alternates: { canonical: '/tools/prompt-generator' },
  openGraph: {
    title: 'AI Prompt Generator for Brand Tracking | Livesov',
    description: 'Free AI prompt generator. Enter your industry and get 50+ brand monitoring prompts your buyers ask AI. Copy or download CSV.',
    url: 'https://livesov.com/tools/prompt-generator',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'AI Prompt Generator - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Prompt Generator for Brand Tracking | Livesov',
    description: 'Free AI prompt generator. Enter your industry and get 50+ brand monitoring prompts your buyers ask AI. Copy or download CSV.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
