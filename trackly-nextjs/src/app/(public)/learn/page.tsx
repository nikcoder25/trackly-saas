import type { Metadata } from 'next';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, SectionHeader } from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'Learn AI Visibility & GEO — Pillar Guides | Livesov',
  description:
    'In-depth pillar guides on LLM SEO, AI search optimization, AI Overviews optimization, and the full GEO playbook. Free, no signup, written by the team behind Livesov.',
  alternates: { canonical: '/learn' },
  openGraph: {
    title: 'Learn AI Visibility & GEO — Pillar Guides | Livesov',
    description:
      'In-depth pillar guides on LLM SEO, AI search optimization, AI Overviews optimization, and the full GEO playbook.',
    url: 'https://livesov.com/learn',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Learn AI Visibility & GEO — Pillar Guides | Livesov',
      },
    ],
  },
};

interface Guide {
  slug: string;
  title: string;
  description: string;
  readingTime: string;
}

const GUIDES: Guide[] = [
  {
    slug: 'llm-seo',
    title: 'LLM SEO: The Complete 2026 Guide',
    description:
      'How Large Language Models rank, retrieve, and cite content — and how to make sure they cite yours.',
    readingTime: '12 min read',
  },
  {
    slug: 'ai-search-optimization',
    title: 'AI Search Optimization: The Complete 2026 Guide',
    description:
      'Ranking inside ChatGPT Search, Perplexity, Google AI Overviews, Gemini, and Bing Copilot.',
    readingTime: '11 min read',
  },
  {
    slug: 'ai-overviews-optimization',
    title: 'AI Overviews Optimization (Google)',
    description:
      'How to win — and hold — a citation inside Google AI Overviews. Ranking factors, on-page patterns, measurement.',
    readingTime: '9 min read',
  },
];

export default function LearnHubPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Learn', url: '/learn' }]} />

      <SeoHero
        title={
          <>
            Learn AI{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              Visibility & GEO
            </span>
          </>
        }
        subtitle="In-depth pillar guides on LLM SEO, AI search optimization, AI Overviews optimization, and the full GEO playbook. Free, no signup, written by the team behind Livesov."
        ctaText="Start your free trial"
      />

      <Section pad="40px 24px 80px" width={1080}>
        <SectionHeader
          label="Pillar guides"
          title="Everything we know about ranking in AI answers"
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
          }}
        >
          {GUIDES.map((g) => (
            <Link
              key={g.slug}
              href={`/learn/${g.slug}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: '#fff',
                borderRadius: 14,
                padding: 26,
                boxShadow: '0 4px 20px rgba(0,0,0,.06)',
                textDecoration: 'none',
                color: 'inherit',
                border: '1px solid #f0f0f0',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: 'var(--brand, #6366f1)',
                  marginBottom: 10,
                }}
              >
                {g.readingTime}
              </div>
              <h2 style={{ fontSize: 19, fontWeight: 700, color: '#1a1a2e', margin: '0 0 10px', lineHeight: 1.3 }}>
                {g.title}
              </h2>
              <p style={{ fontSize: 14, color: '#4b5563', margin: 0, lineHeight: 1.65, flex: 1 }}>
                {g.description}
              </p>
              <div style={{ marginTop: 18, fontSize: 13, fontWeight: 700, color: 'var(--brand)' }}>
                Read guide →
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </SeoLayout>
  );
}
