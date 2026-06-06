import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free AI Readiness Audit | Test Your Site | Livesov',
  description: 'Free AI readiness audit across 50+ checkpoints. Test your site for ChatGPT, Perplexity, and Gemini visibility. PDF report.',
  keywords: 'free ai readiness audit, ai readiness, ai search audit, geo readiness',
  alternates: { canonical: '/tools/ai-readiness-audit' },
  openGraph: {
    title: 'Free AI Readiness Audit | Livesov',
    description: 'Test your site for ChatGPT, Perplexity, and Gemini visibility. 50+ checkpoints.',
    url: 'https://livesov.com/tools/ai-readiness-audit',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'AI Readiness Audit - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free AI Readiness Audit | Livesov',
    description: 'Test your site for ChatGPT, Perplexity, and Gemini visibility.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
