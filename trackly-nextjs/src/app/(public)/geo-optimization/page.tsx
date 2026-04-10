import type { Metadata } from 'next';
import SeoLayout, { SeoHero, SeoContent, Breadcrumbs } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Generative Engine Optimization (GEO) Guide | Livesov',
  description: 'Learn how to optimize your brand for AI search engines. Complete guide to Generative Engine Optimization (GEO) for ChatGPT, Claude, Gemini, Perplexity, Grok & Google AI Overviews.',
  keywords: 'generative engine optimization, geo seo, ai search optimization, llm optimization, ai visibility optimization',
  alternates: { canonical: '/geo-optimization' },
  openGraph: {
    title: 'Generative Engine Optimization (GEO) Guide | Livesov',
    description: 'Learn how to optimize your brand for AI search engines. Complete guide to Generative Engine Optimization (GEO) for ChatGPT, Claude, Gemini, Perplexity, Grok & Google AI Overviews.',
    url: 'https://livesov.com/geo-optimization',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Generative Engine Optimization (GEO) Guide | Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Generative Engine Optimization (GEO) Guide | Livesov',
    description: 'Learn how to optimize your brand for AI search engines. Complete guide to Generative Engine Optimization (GEO) for ChatGPT, Claude, Gemini, Perplexity, Grok & Google AI Overviews.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function GeoOptimizationPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'GEO Optimization', url: '/geo-optimization' }]} />
      <SeoHero
        title={<>Generative Engine <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">Optimization (GEO)</span></>}
        subtitle="The complete guide to optimizing your brand's visibility across AI-powered search engines and language models."
      />
      <SeoContent>
        <h2>What is Generative Engine Optimization?</h2>
        <p>GEO is the practice of optimizing your brand&apos;s digital presence so that AI models (ChatGPT, Claude, Gemini, Perplexity, Grok, Google AI Overviews) accurately mention, recommend, and cite your brand in their responses.</p>

        <h2>Key GEO Strategies</h2>
        <ul>
          <li>Create comprehensive, authoritative content that LLMs can reference</li>
          <li>Build strong E-E-A-T signals across your digital presence</li>
          <li>Ensure consistent NAP (Name, Address, Phone) across directories</li>
          <li>Get cited on high-authority sources that LLMs reference</li>
          <li>Structure data with schema markup for better AI comprehension</li>
          <li>Monitor and correct AI hallucinations about your brand</li>
        </ul>

        <h2>How Livesov Helps with GEO</h2>
        <p>Livesov is the measurement tool for your GEO strategy. Track your visibility across all major AI platforms, identify which queries mention your brand, and measure the impact of your optimization efforts over time.</p>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 my-6">
          <h3>GEO vs SEO</h3>
          <p className="!mb-0">Traditional SEO focuses on website rankings in search results. GEO focuses on how AI models mention your brand in generated responses. Both are important — GEO is becoming essential as AI-powered search grows.</p>
        </div>
      </SeoContent>
    </SeoLayout>
  );
}
