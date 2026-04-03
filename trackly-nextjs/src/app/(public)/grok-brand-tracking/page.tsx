import type { Metadata } from 'next';
import SeoLayout, { SeoHero, SeoContent, Breadcrumbs } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Grok Brand Tracking — Monitor xAI Mentions | Livesov',
  description: 'Track how xAI\'s Grok mentions your brand. Monitor visibility in Grok responses on X (Twitter) and optimize your AI presence.',
  keywords: 'grok brand tracking, xai monitoring, grok visibility, x ai brand mentions, twitter ai',
  alternates: { canonical: '/grok-brand-tracking' },
  openGraph: {
    title: 'Grok Brand Tracking — Monitor xAI Mentions | Livesov',
    description: 'Track how xAI\'s Grok mentions your brand. Monitor visibility in Grok responses on X (Twitter) and optimize your AI presence.',
    url: 'https://livesov.com/grok-brand-tracking',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Grok Brand Tracking — Monitor xAI Mentions | Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Grok Brand Tracking — Monitor xAI Mentions | Livesov',
    description: 'Track how xAI\'s Grok mentions your brand. Monitor visibility in Grok responses on X (Twitter) and optimize your AI presence.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function GrokBrandTrackingPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Grok Brand Tracking', url: '/grok-brand-tracking' }]} />
      <SeoHero
        title={<>Track Your Brand in <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1d9bf0] to-[#1a8cd8]">Grok</span></>}
        subtitle="Monitor how xAI's Grok mentions and recommends your brand, powered by real-time X (Twitter) data."
      />
      <SeoContent>
        <h2>Why Grok Matters</h2>
        <p>Grok by xAI has unique access to real-time X (Twitter) data, making its recommendations influenced by current social conversations. Tracking your brand in Grok reveals how social sentiment impacts AI recommendations.</p>

        <h2>What Livesov Tracks in Grok</h2>
        <ul>
          <li>Brand mention frequency in Grok responses</li>
          <li>Social sentiment influence on recommendations</li>
          <li>Real-time vs knowledge-based mentions</li>
          <li>Competitor analysis in Grok responses</li>
          <li>Recommendation positioning</li>
        </ul>
      </SeoContent>
    </SeoLayout>
  );
}
