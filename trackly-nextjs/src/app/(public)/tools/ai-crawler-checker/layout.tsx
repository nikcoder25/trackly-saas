import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Crawler Checker | Test GPTBot & ClaudeBot Access',
  description: 'Free AI crawler checker. Test whether GPTBot, ClaudeBot, PerplexityBot, and Google-Extended can reach your URL. Reads your live robots.txt.',
  keywords: 'ai crawler checker, gptbot checker, claudebot, perplexitybot, google-extended, robots.txt ai',
  alternates: { canonical: '/tools/ai-crawler-checker' },
  openGraph: {
    title: 'AI Crawler Checker | Test GPTBot & ClaudeBot Access',
    description: 'Free AI crawler checker. Test whether GPTBot, ClaudeBot, PerplexityBot, and Google-Extended can reach your URL. Reads your live robots.txt.',
    url: 'https://livesov.com/tools/ai-crawler-checker',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'AI Crawler Checker - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Crawler Checker | Test GPTBot & ClaudeBot Access',
    description: 'Free AI crawler checker. Test whether GPTBot, ClaudeBot, PerplexityBot, and Google-Extended can reach your URL. Reads your live robots.txt.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
