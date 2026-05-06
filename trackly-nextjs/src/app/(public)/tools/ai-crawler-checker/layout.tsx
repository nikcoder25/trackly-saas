import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Crawler Checker | Test GPTBot, ClaudeBot, PerplexityBot Access',
  description: 'Check if AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) can access your URL. Free, no signup.',
  keywords: 'ai crawler checker, gptbot checker, claudebot, perplexitybot, google-extended, robots.txt ai',
  alternates: { canonical: '/tools/ai-crawler-checker' },
  openGraph: {
    title: 'AI Crawler URL Checker | Livesov',
    description: 'See whether GPTBot, ClaudeBot, PerplexityBot and Google-Extended can crawl your URL.',
    url: 'https://livesov.com/tools/ai-crawler-checker',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'AI Crawler Checker - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Crawler URL Checker | Livesov',
    description: 'See whether AI crawlers can access your URL. Free, no signup.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
