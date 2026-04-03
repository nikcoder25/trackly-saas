import type { Metadata } from 'next';
import SeoLayout, { SeoHero, SeoContent, Breadcrumbs } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'How Livesov Works — AI Brand Tracking Methodology',
  description: 'Learn how Livesov tracks your brand across AI platforms. Our methodology for measuring AI visibility, share of voice, and brand mentions.',
  alternates: { canonical: '/how-it-works' },
  openGraph: {
    title: 'How Livesov Works — AI Brand Tracking Methodology',
    description: 'Learn how Livesov tracks your brand across AI platforms. Our methodology for measuring AI visibility, share of voice, and brand mentions.',
    url: 'https://livesov.com/how-it-works',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'How Livesov Works — AI Brand Tracking Methodology' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'How Livesov Works — AI Brand Tracking Methodology',
    description: 'Learn how Livesov tracks your brand across AI platforms. Our methodology for measuring AI visibility, share of voice, and brand mentions.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function HowItWorksPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'How It Works', url: '/how-it-works' }]} />
      <SeoHero
        title={<>How <span className="text-[#FF6154]">Livesov</span> Works</>}
        subtitle="A systematic, data-driven approach to tracking your brand's visibility across AI platforms."
      />
      <SeoContent>
        <h2>Step 1: Set Up Your Brand</h2>
        <p>Enter your brand name, website, and key details. Livesov generates relevant tracking queries based on your industry — the questions real users ask AI platforms about products and services like yours.</p>

        <h2>Step 2: Configure Tracking</h2>
        <p>Choose which AI platforms to monitor (ChatGPT, Claude, Gemini, Perplexity, Grok). Add your own custom queries, set competitors to track, and configure your monitoring schedule.</p>

        <h2>Step 3: Automated Monitoring</h2>
        <p>Livesov automatically queries each AI platform on your schedule. Each query is sent as a real user would ask it, and the full response is captured and analyzed.</p>

        <h2>Step 4: AI Response Analysis</h2>
        <p>Our parser extracts key data from each AI response:</p>
        <ul>
          <li>Whether your brand was mentioned (mention rate)</li>
          <li>Position in recommendation lists (rank tracking)</li>
          <li>Sentiment of the description (positive/neutral/negative)</li>
          <li>Competitor mentions (co-occurrence)</li>
          <li>Citations and source URLs</li>
          <li>Factual accuracy (hallucination detection)</li>
        </ul>

        <h2>Step 5: Actionable Insights</h2>
        <p>View your dashboard to see share of voice trends, platform-by-platform breakdowns, competitor comparisons, and AI-generated recommendations for improving your visibility.</p>
      </SeoContent>
    </SeoLayout>
  );
}
