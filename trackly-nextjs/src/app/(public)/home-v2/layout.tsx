import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Visibility Tracker for ChatGPT, Perplexity, Claude & Gemini',
  description:
    'Track how ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand. Free plan. From $9/mo.',
  alternates: { canonical: '/home-v2' },
  robots: { index: false, follow: false },
};

export default function HomeV2Layout({ children }: { children: React.ReactNode }) {
  return children;
}
