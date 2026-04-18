import type { Metadata } from 'next';
import SeoLayout, { SeoHero, SeoContent, Breadcrumbs } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Perplexity Brand Tracking - Monitor AI Search Mentions | Livesov',
  description: 'Track how Perplexity AI mentions and cites your brand. Monitor share of voice in AI-powered search results and optimize your visibility.',
  keywords: 'perplexity brand tracking, perplexity ai monitoring, ai search visibility, perplexity brand mentions',
  alternates: { canonical: '/perplexity-brand-tracking' },
  openGraph: {
    title: 'Perplexity Brand Tracking - Monitor AI Search Mentions | Livesov',
    description: 'Track how Perplexity AI mentions and cites your brand. Monitor share of voice in AI-powered search results and optimize your visibility.',
    url: 'https://livesov.com/perplexity-brand-tracking',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Perplexity Brand Tracking - Monitor AI Search Mentions | Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Perplexity Brand Tracking - Monitor AI Search Mentions | Livesov',
    description: 'Track how Perplexity AI mentions and cites your brand. Monitor share of voice in AI-powered search results and optimize your visibility.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function PerplexityBrandTrackingPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Perplexity Brand Tracking', url: '/perplexity-brand-tracking' }]} />
      <SeoHero
        title={<>Track Your Brand in <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#20b8cd] to-[#1a96a5]">Perplexity</span></>}
        subtitle="Monitor how Perplexity AI references, cites, and recommends your brand in its AI-powered search results."
      />
      <SeoContent>
        <h2>Why Perplexity Matters for Your Brand</h2>
        <p>Perplexity is a leading AI search engine that combines large language models with real-time web search. Unlike traditional chatbots, Perplexity cites its sources - making it uniquely important for brand visibility tracking.</p>

        <h2>What Livesov Tracks in Perplexity</h2>
        <ul>
          <li>Brand mention frequency in Perplexity responses</li>
          <li>Citation tracking - which of your pages Perplexity references</li>
          <li>Competitor visibility in the same queries</li>
          <li>Recommendation position and sentiment</li>
          <li>Source domain analysis</li>
        </ul>

        <h2>Perplexity Citation Analysis</h2>
        <p>Perplexity uniquely provides citations with its answers. Livesov tracks which URLs are cited, whether they&apos;re your brand&apos;s pages or competitors&apos;, and how citation patterns change over time. This helps you understand which content drives AI visibility.</p>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 my-6">
          <h3>Pro Tip</h3>
          <p className="!mb-0">Perplexity heavily relies on web content quality. Improving your content&apos;s E-E-A-T signals (Experience, Expertise, Authoritativeness, Trustworthiness) directly improves your Perplexity visibility.</p>
        </div>
      </SeoContent>
    </SeoLayout>
  );
}
