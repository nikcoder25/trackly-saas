import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free ChatGPT Brand Mention Checker | Livesov',
  description: 'Free ChatGPT brand mention checker. See if ChatGPT mentions your brand and which competitors show up. Instant check, no signup.',
  keywords: 'chatgpt brand mention checker, chatgpt mention checker, chatgpt brand visibility',
  alternates: { canonical: '/tools/chatgpt-mention-checker' },
  openGraph: {
    title: 'Free ChatGPT Brand Mention Checker | Livesov',
    description: 'Free ChatGPT brand mention checker. See if ChatGPT mentions your brand and which competitors show up. Instant check, no signup.',
    url: 'https://livesov.com/tools/chatgpt-mention-checker',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Free ChatGPT Brand Mention Checker - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free ChatGPT Brand Mention Checker | Livesov',
    description: 'Free ChatGPT brand mention checker. See if ChatGPT mentions your brand and which competitors show up. Instant check, no signup.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
