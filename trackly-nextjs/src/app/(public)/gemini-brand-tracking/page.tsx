import type { Metadata } from 'next';
import SeoLayout, { SeoHero, SeoContent } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Gemini Brand Tracking — Monitor Google AI Mentions | Livesov',
  description: 'Track how Google Gemini mentions your brand. Monitor visibility in Google\'s AI responses across Gemini models.',
  keywords: 'gemini brand tracking, google ai monitoring, gemini visibility, google ai brand mentions',
  alternates: { canonical: '/gemini-brand-tracking' },
};

export default function GeminiBrandTrackingPage() {
  return (
    <SeoLayout>
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
