import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free ChatGPT Brand Mention Checker | Livesov',
  description: 'Check if ChatGPT mentions your brand. Free instant check. No signup required.',
  keywords: 'chatgpt brand mention checker, chatgpt mention checker, chatgpt brand visibility',
  alternates: { canonical: '/tools/chatgpt-mention-checker' },
  openGraph: {
    title: 'Free ChatGPT Brand Mention Checker | Livesov',
    description: 'Find out if ChatGPT mentions your brand for any question. Free, no signup.',
    url: 'https://livesov.com/tools/chatgpt-mention-checker',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Free ChatGPT Brand Mention Checker - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free ChatGPT Brand Mention Checker | Livesov',
    description: 'Check whether ChatGPT mentions your brand. Free, no signup.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
