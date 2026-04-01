import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Livesov — AI Visibility Tracker | Track Your Brand Across ChatGPT, Perplexity, Claude, Gemini & Grok',
  description:
    'Monitor how AI platforms mention your brand. Track share of voice, sentiment, and competitors across ChatGPT, Perplexity, Claude, Gemini & Grok. Plans from $9/mo.',
  keywords: [
    'AI visibility tracking',
    'AI brand monitoring',
    'ChatGPT brand tracking',
    'Perplexity tracking',
    'Claude tracking',
    'Gemini tracking',
    'Grok tracking',
    'AI share of voice',
    'GEO optimization',
    'generative engine optimization',
    'AI SEO',
    'brand monitoring AI',
  ],
  openGraph: {
    title: 'Livesov — Is Your Brand Visible in AI Answers?',
    description:
      'Track how ChatGPT, Perplexity, Claude, Gemini & Grok mention your brand. Get real proof, measure share of voice, and optimize your AI visibility.',
    type: 'website',
    url: 'https://livesov.com/home',
    siteName: 'Livesov',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov — AI Visibility Tracker',
    description:
      'Monitor your brand across 5 AI platforms. Track mentions, sentiment & share of voice. Plans from $9/mo.',
  },
  alternates: {
    canonical: 'https://livesov.com/home',
  },
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
