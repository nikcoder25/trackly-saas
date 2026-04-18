import type { Metadata } from 'next';
import SeoLayout, { SeoHero, SeoContent, Breadcrumbs } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Use Cases - AI Visibility Tracking | Livesov',
  description: 'Discover how SaaS companies, agencies, e-commerce brands, and enterprises use Livesov to track and optimize their AI visibility.',
  alternates: { canonical: '/use-cases' },
  openGraph: {
    title: 'Use Cases - AI Visibility Tracking | Livesov',
    description: 'Discover how SaaS companies, agencies, e-commerce brands, and enterprises use Livesov to track and optimize their AI visibility.',
    url: 'https://livesov.com/use-cases',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Use Cases - AI Visibility Tracking | Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Use Cases - AI Visibility Tracking | Livesov',
    description: 'Discover how SaaS companies, agencies, e-commerce brands, and enterprises use Livesov to track and optimize their AI visibility.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function UseCasesPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Use Cases', url: '/use-cases' }]} />
      <SeoHero
        title={<>Who Uses <span className="text-[var(--brand)]">Livesov</span>?</>}
        subtitle="From startups to enterprises, brands across industries use Livesov to track and optimize their AI visibility."
      />
      <SeoContent>
        <h2>SaaS Companies</h2>
        <p>Track how AI platforms recommend your software compared to competitors. Understand which queries drive mentions and optimize your positioning in AI-powered evaluations.</p>

        <h2>Digital Marketing Agencies</h2>
        <p>Offer AI visibility tracking as a service to your clients. Monitor multiple brands across all platforms and deliver data-driven reports showing AI share of voice trends.</p>

        <h2>E-commerce Brands</h2>
        <p>Monitor how AI shopping assistants recommend your products. Track brand sentiment and ensure AI platforms have accurate product information.</p>

        <h2>Enterprise Companies</h2>
        <p>Protect your brand reputation across AI platforms. Detect hallucinations early, monitor competitor positioning, and get enterprise-grade reporting for stakeholders.</p>

        <h2>SEO Professionals</h2>
        <p>Add AI visibility to your SEO toolkit. Track the new frontier of search - AI-generated answers - alongside traditional search rankings.</p>
      </SeoContent>
    </SeoLayout>
  );
}
