import type { Metadata } from 'next';
import SeoLayout, { SeoHero } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Blog — AI Visibility Insights | Livesov',
  description: 'Articles on AI visibility, generative engine optimization, brand tracking across ChatGPT, Claude, Gemini, and more.',
  alternates: { canonical: '/blog' },
};

const posts = [
  {
    title: 'What is Generative Engine Optimization (GEO)?',
    desc: 'Learn how GEO is changing the way brands appear in AI-generated answers and why it matters for your marketing strategy.',
    tag: 'GEO',
  },
  {
    title: 'AI Visibility vs Traditional SEO: What\u2019s the Difference?',
    desc: 'Ranking #1 on Google doesn\u2019t mean AI will recommend you. Here\u2019s why AI visibility tracking is a completely different game.',
    tag: 'Strategy',
  },
  {
    title: 'How to Track Your Brand Across ChatGPT, Perplexity & More',
    desc: 'A step-by-step guide to monitoring your brand\u2019s presence in AI platforms and measuring your share of voice.',
    tag: 'Guide',
  },
];

export default function BlogPage() {
  return (
    <SeoLayout>
      <SeoHero
        title="Livesov Blog"
        subtitle="Insights on AI visibility, generative engine optimization, and brand tracking across AI platforms."
      />
      <section className="px-6 pb-20">
        <p className="text-gray-400 text-center text-sm mb-10">Blog posts coming soon. Follow us for updates on AI visibility trends and strategies.</p>
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {posts.map(post => (
            <div key={post.title} className="rounded-xl border border-gray-200 bg-white p-6 relative opacity-85">
              <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 mb-3">{post.tag}</span>
              <h3 className="text-base font-bold text-gray-900 mb-2 leading-snug">{post.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">{post.desc}</p>
              <span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-[#FF6154]/10 text-[#FF6154]">Coming Soon</span>
            </div>
          ))}
        </div>
      </section>
    </SeoLayout>
  );
}
