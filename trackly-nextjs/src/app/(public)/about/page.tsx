import type { Metadata } from 'next';
import SeoLayout, { SeoHero, SeoContent, Breadcrumbs } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'About Livesov — AI Visibility Tracking Platform',
  description: 'Livesov helps brands track and optimize their visibility across AI platforms like ChatGPT, Claude, Gemini, Perplexity, Grok, and Google AI Overviews.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About Livesov — AI Visibility Tracking Platform',
    description: 'Livesov helps brands track and optimize their visibility across AI platforms like ChatGPT, Claude, Gemini, Perplexity, Grok, and Google AI Overviews.',
    url: 'https://livesov.com/about',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'About Livesov — AI Visibility Tracking Platform' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Livesov — AI Visibility Tracking Platform',
    description: 'Livesov helps brands track and optimize their visibility across AI platforms like ChatGPT, Claude, Gemini, Perplexity, Grok, and Google AI Overviews.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function AboutPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'About', url: '/about' }]} />
      <SeoHero
        title={<>About <span className="text-[var(--brand)]">Livesov</span></>}
        subtitle="We're building the analytics layer for AI visibility — helping brands understand and optimize how AI platforms mention and recommend them."
      />
      <SeoContent>
        <h2>Our Mission</h2>
        <p>AI is changing how people discover brands. When someone asks ChatGPT &quot;what&apos;s the best CRM?&quot; or Claude &quot;recommend a project management tool,&quot; the AI&apos;s response directly influences purchasing decisions. Livesov gives brands the tools to track, measure, and optimize their presence in these AI responses.</p>

        <h2>What We Do</h2>
        <p>Livesov systematically queries AI platforms with industry-relevant prompts, parses the responses, and provides actionable analytics. We track mention rates, recommendation rankings, sentiment, competitor co-occurrence, hallucinations, and citations — giving you the complete picture of your AI visibility.</p>

        <h2>Our Platform</h2>
        <ul>
          <li>Track 6 AI platforms: ChatGPT, Claude, Gemini, Perplexity, Grok, Google AI Overviews</li>
          <li>Automated scheduled monitoring</li>
          <li>Real-time streaming results</li>
          <li>Competitor benchmarking</li>
          <li>Hallucination detection</li>
          <li>AI-powered recommendations</li>
        </ul>
      </SeoContent>
    </SeoLayout>
  );
}
