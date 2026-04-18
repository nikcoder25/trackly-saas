import type { Metadata } from 'next';
import SeoLayout, { SeoHero, SeoContent, Breadcrumbs } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Google AI Overviews Tracking - Monitor Your Brand in AI Search Results | Livesov',
  description: 'Track how Google AI Overviews mentions your brand. See when your business appears in AI-generated search summaries above organic results.',
  keywords: 'Google AI Overviews tracking, Google AI Overviews brand monitoring, AI Overviews visibility, Google SGE tracking, AI search results tracking, Google AI brand mentions',
  alternates: { canonical: '/google-ai-overviews-tracking' },
  openGraph: {
    title: 'Google AI Overviews Tracking - Monitor Your Brand in AI Search Results | Livesov',
    description: 'Track how Google AI Overviews mentions your brand. See when your business appears in AI-generated search summaries above organic results.',
    url: 'https://livesov.com/google-ai-overviews-tracking',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Google AI Overviews Tracking - Monitor Your Brand in AI Search Results | Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Google AI Overviews Tracking - Monitor Your Brand in AI Search Results | Livesov',
    description: 'Track how Google AI Overviews mentions your brand. See when your business appears in AI-generated search summaries above organic results.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function GoogleAIOverviewsTrackingPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Google AI Overviews Tracking', url: '/google-ai-overviews-tracking' }]} />
      <SeoHero
        title={<>Track Your Brand in <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4285f4] to-[#34a853]">Google AI Overviews</span></>}
        subtitle="Google AI Overviews appear above organic search results for millions of queries. Monitor whether your brand is featured in these AI-generated summaries."
      />
      <SeoContent>
        <h2>Why Track Google AI Overviews?</h2>
        <p>Google AI Overviews (formerly Search Generative Experience / SGE) displays AI-generated summaries at the top of search results. These overviews appear for a growing percentage of queries and are seen before any organic result. If your brand isn&apos;t appearing in AI Overviews, you&apos;re losing visibility to competitors who are.</p>
        <p>Livesov monitors your brand&apos;s presence in Google AI Overviews using the DataForSEO API, capturing the full AI-generated summary so you can see exactly how Google presents your brand.</p>

        <h2>How Google AI Overviews Tracking Works</h2>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 my-6">
          <h3>1. Add Your Keywords</h3>
          <p>Enter the search queries your customers use - e.g., &quot;Best HVAC company in Austin TX&quot;, &quot;Top rated plumber near me&quot;, &quot;Which CRM is best for small business?&quot;</p>
          <h3>2. Run Tracking</h3>
          <p>Livesov queries Google via the DataForSEO API and captures the AI Overview summary that appears above organic results.</p>
          <h3>3. See Your Results</h3>
          <p className="!mb-0">View the full AI Overview text, check if your brand is mentioned, track your visibility over time, and compare against competitors.</p>
        </div>

        <h2>What Makes AI Overviews Different</h2>
        <ul>
          <li><strong>Prime placement</strong> - AI Overviews appear above all organic results, getting the first view from searchers</li>
          <li><strong>AI-curated content</strong> - Google&apos;s AI selects and summarizes information from across the web</li>
          <li><strong>Direct links</strong> - AI Overviews include cited sources, driving traffic to featured brands</li>
          <li><strong>Growing coverage</strong> - Google is expanding AI Overviews to more query types and regions</li>
        </ul>

        <h2>What You Get</h2>
        <ul>
          <li>Full AI Overview text captured via DataForSEO API</li>
          <li>Brand mention and citation detection</li>
          <li>Historical tracking of your AI Overview visibility</li>
          <li>Competitor comparison - see who Google features instead of you</li>
          <li>Evidence export for client reporting and SEO audits</li>
        </ul>

        <h2>Who Should Track AI Overviews?</h2>
        <p><strong>Local businesses</strong> - When someone searches for services in your area, does Google&apos;s AI Overview mention your business?</p>
        <p><strong>SEO agencies</strong> - Demonstrate to clients whether their brand appears in AI-generated search summaries alongside traditional rankings.</p>
        <p><strong>E-commerce brands</strong> - Monitor if Google&apos;s AI recommends your products when users search for product categories.</p>
        <p><strong>SaaS companies</strong> - Track whether AI Overviews feature your product when users search for solutions in your category.</p>

        <h2>Track More AI Platforms</h2>
        <p>Google AI Overviews is just one platform. Livesov also tracks your brand across <a href="/chatgpt-brand-tracking">ChatGPT</a>, <a href="/perplexity-brand-tracking">Perplexity AI</a>, <a href="/gemini-brand-tracking">Google Gemini</a>, <a href="/claude-brand-tracking">Claude AI</a>, and <a href="/grok-brand-tracking">Grok (xAI)</a>. Learn more about optimizing for all AI platforms in our <a href="/geo-optimization">GEO Optimization Guide</a>.</p>
      </SeoContent>
    </SeoLayout>
  );
}
