import type { Metadata } from 'next';
import SeoLayout, { SeoHero, SeoContent, Breadcrumbs } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Gemini Brand Tracking — Monitor Google AI Mentions | Livesov',
  description: 'Track how Google Gemini mentions your brand. Monitor visibility in Google\'s AI responses across Gemini models.',
  keywords: 'gemini brand tracking, google ai monitoring, gemini visibility, google ai brand mentions',
  alternates: { canonical: '/gemini-brand-tracking' },
  openGraph: {
    title: 'Gemini Brand Tracking — Monitor Google AI Mentions | Livesov',
    description: 'Track how Google Gemini mentions your brand. Monitor visibility in Google\'s AI responses across Gemini models.',
    url: 'https://livesov.com/gemini-brand-tracking',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Gemini Brand Tracking — Monitor Google AI Mentions | Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gemini Brand Tracking — Monitor Google AI Mentions | Livesov',
    description: 'Track how Google Gemini mentions your brand. Monitor visibility in Google\'s AI responses across Gemini models.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function GeminiBrandTrackingPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Gemini Brand Tracking', url: '/gemini-brand-tracking' }]} />
      <SeoHero
        title={<>Track Your Brand in <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4285f4] to-[#34a853]">Google Gemini</span></>}
        subtitle="Monitor how Google's Gemini AI mentions, recommends, and describes your brand across all Gemini models."
      />
      <SeoContent>
        <h2>Why Google Gemini Matters</h2>
        <p>Google Gemini is integrated into Google Search (AI Overviews), Google Workspace, and Android devices. With billions of users accessing Gemini-powered features daily, your brand&apos;s visibility in Gemini responses is critical.</p>

        <h2>What Livesov Tracks in Gemini</h2>
        <ul>
          <li>Brand mentions across Gemini 2.5 Flash and Pro models</li>
          <li>Share of voice compared to competitors</li>
          <li>Recommendation ranking and positioning</li>
          <li>Sentiment of brand descriptions</li>
          <li>Response consistency across model versions</li>
        </ul>

        <h2>Gemini and Google Search AI Overviews</h2>
        <p>As Google integrates Gemini into Search results via AI Overviews, tracking your visibility in Gemini becomes as important as traditional Google SEO. Livesov helps you understand how AI-generated answers feature your brand.</p>
      </SeoContent>
    </SeoLayout>
  );
}
