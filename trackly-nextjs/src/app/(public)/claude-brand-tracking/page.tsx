import type { Metadata } from 'next';
import SeoLayout, { SeoHero, SeoContent } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Claude Brand Tracking — Monitor Anthropic AI Mentions | Livesov',
  description: 'Track how Anthropic\'s Claude mentions your brand. Monitor visibility in Claude\'s responses and optimize your AI presence.',
  keywords: 'claude brand tracking, anthropic ai monitoring, claude visibility, claude brand mentions',
  alternates: { canonical: '/claude-brand-tracking' },
};

export default function ClaudeBrandTrackingPage() {
  return (
    <SeoLayout>
      <SeoHero
        title={<>Track Your Brand in <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#d97706] to-[#b45309]">Claude</span></>}
        subtitle="Monitor how Anthropic's Claude AI mentions, recommends, and describes your brand in its responses."
      />
      <SeoContent>
        <h2>Why Track Claude Visibility</h2>
        <p>Claude by Anthropic is widely used by businesses and professionals for research, recommendations, and decision-making. As Claude&apos;s user base grows, your brand&apos;s visibility in its responses increasingly impacts business outcomes.</p>

        <h2>What Livesov Tracks in Claude</h2>
        <ul>
          <li>Brand mention rates across Claude Sonnet and Opus models</li>
          <li>Position in recommendation lists</li>
          <li>Sentiment and tone of brand descriptions</li>
          <li>Competitor co-occurrence analysis</li>
          <li>Hallucination detection for brand facts</li>
        </ul>

        <h2>Claude&apos;s Unique Characteristics</h2>
        <p>Claude is known for thoughtful, nuanced responses. Tracking your brand in Claude helps you understand how a careful, analytical AI positions your brand relative to alternatives.</p>
      </SeoContent>
    </SeoLayout>
  );
}
