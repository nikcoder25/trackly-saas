import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free AI Brand Check — Is Your Brand Visible in ChatGPT? | Livesov',
  description: 'Check if AI platforms like ChatGPT mention your brand for free. Enter your brand name and see instant results across AI platforms.',
  keywords: 'free ai brand check, chatgpt brand check, ai visibility test, is my brand on chatgpt, ai brand mention checker',
  alternates: { canonical: '/free-check' },
  openGraph: {
    title: 'Free AI Brand Check — Is Your Brand Visible in ChatGPT? | Livesov',
    description: 'Check if AI platforms like ChatGPT mention your brand for free. Instant results across AI platforms.',
    url: 'https://livesov.com/free-check',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Free AI Brand Visibility Check — Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free AI Brand Check | Livesov',
    description: 'Check if ChatGPT, Claude, Gemini, Perplexity & Grok mention your brand. Free instant results.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function FreeCheckLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
