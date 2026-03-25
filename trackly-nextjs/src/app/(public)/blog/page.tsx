import type { Metadata } from 'next';
import SeoLayout, { SeoHero } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Blog — AI Visibility Insights | Livesov',
  description: 'Articles on AI visibility, generative engine optimization, brand tracking across ChatGPT, Claude, Gemini, and more.',
  alternates: { canonical: '/blog' },
};

export default function BlogPage() {
  return (
    <SeoLayout>
      <SeoHero
        title="Livesov Blog"
        subtitle="Insights on AI visibility, generative engine optimization, and brand tracking across AI platforms."
      />
      <div className="max-w-3xl mx-auto px-6 pb-16">
        <p className="text-gray-500 text-center">Blog posts coming soon. Follow us for updates on AI visibility trends and strategies.</p>
      </div>
    </SeoLayout>
  );
}
