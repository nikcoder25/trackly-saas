import type { Metadata } from 'next';
import SeoLayout, { SeoHero } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Changelog — What\'s New | Livesov',
  description: 'Latest updates and improvements to Livesov AI visibility tracker.',
  alternates: { canonical: '/changelog' },
};

export default function ChangelogPage() {
  return (
    <SeoLayout>
      <SeoHero
        title="Changelog"
        subtitle="Track every improvement, new feature, and bug fix we ship."
      />
      <div className="max-w-3xl mx-auto px-6 pb-16 space-y-8">
        <div className="border-l-2 border-[#FF6154] pl-6">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">March 2026</p>
          <h3 className="text-lg font-bold text-gray-900 mt-1">Next.js Migration</h3>
          <p className="text-gray-500 text-sm mt-1">Migrated from Express to Next.js for improved SSR, SEO, and performance. All existing features preserved with the same database.</p>
        </div>
        <div className="border-l-2 border-gray-200 pl-6">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">February 2026</p>
          <h3 className="text-lg font-bold text-gray-900 mt-1">Accuracy Monitor</h3>
          <p className="text-gray-500 text-sm mt-1">Detect AI hallucinations about your brand with our canonical fact store. Set known facts and automatically flag incorrect AI responses.</p>
        </div>
        <div className="border-l-2 border-gray-200 pl-6">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">January 2026</p>
          <h3 className="text-lg font-bold text-gray-900 mt-1">5-Platform Support</h3>
          <p className="text-gray-500 text-sm mt-1">Added Grok (xAI) tracking, completing support for all 5 major AI platforms: ChatGPT, Claude, Gemini, Perplexity, and Grok.</p>
        </div>
      </div>
    </SeoLayout>
  );
}
