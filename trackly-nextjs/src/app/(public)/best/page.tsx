import type { Metadata } from 'next';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, SectionHeader, LongForm, PillarLinks } from '@/components/seo/SeoSections';
import { BEST_CATEGORIES } from '@/data/best-categories';

export const metadata: Metadata = {
  title: 'What ChatGPT Recommends: AI-Generated Best-Of Lists by Category | Livesov',
  description:
    'Ranked, continuously updated lists of the brands ChatGPT actually recommends across CRM, project management, SEO tools, analytics, help desk, website builders and more.',
  keywords:
    'what chatgpt recommends, best products chatgpt, ai recommended brands, chatgpt best of, ai recommendation lists, chatgpt picks',
  alternates: { canonical: '/best' },
  openGraph: {
    title: 'What ChatGPT Recommends: AI-Generated Best-Of Lists',
    description:
      'Ranked, continuously updated lists of the brands ChatGPT actually recommends.',
    url: 'https://livesov.com/best',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'What ChatGPT Recommends | Livesov',
      },
    ],
  },
};

export default function BestIndexPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Best (AI recommends)', url: '/best' }]} />

      <SeoHero
        title={
          <>
            What ChatGPT{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              actually recommends
            </span>
          </>
        }
        subtitle="Ranked, continuously updated lists of the brands ChatGPT picks first when you ask for the best in a category. Mention rate, positioning, and the reason ChatGPT cites each brand."
        ctaText="Track your own mention rate"
      />

      <Section pad="40px 24px 80px" width={1080}>
        <SectionHeader
          label="Browse by category"
          title={`${BEST_CATEGORIES.length} categories ranked, refreshed continuously`}
          subtitle="Each list is generated from a 40+ prompt panel and refreshed continuously."
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 16,
          }}
        >
          {BEST_CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/best/${c.slug}-chatgpt-recommends`}
              style={{
                background: '#fff',
                border: '1px solid var(--card-border, #e8e5e1)',
                borderRadius: 14,
                padding: 22,
                textDecoration: 'none',
                transition: 'all .15s',
              }}
              className="pillar-link"
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: 'var(--brand, #6366f1)',
                  marginBottom: 8,
                }}
              >
                {c.brands.length} brands ranked
              </div>
              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: '0 0 6px',
                }}
              >
                Best {c.category}{' '}
                <span style={{ color: 'var(--brand, #6366f1)' }}>→</span>
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                Top pick: <strong>{c.brands[0]?.name}</strong> ({c.brands[0]?.mentionRate} mention
                rate)
              </p>
            </Link>
          ))}
        </div>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
        <LongForm>
          <h2>Why these lists exist</h2>
          <p>
            More than 1 billion people now ask ChatGPT for product recommendations every month. The
            brands ChatGPT names in the first paragraph of an answer are the ones that win the
            click - or in many cases, the deal itself.
          </p>
          <p>
            These lists make ChatGPT&apos;s recommendation set transparent: which brands are
            cited most, in which positioning, and <em>why</em> ChatGPT cites them. If your brand
            should be on a list and isn&apos;t, our <a href="/learn/llm-seo">LLM SEO guide</a>{' '}
            covers the four reasons LLMs ignore brands - and the playbook to fix it.
          </p>
        </LongForm>
      </Section>

      <PillarLinks
        title="Continue exploring"
        links={[
          { href: '/learn/llm-seo', label: 'LLM SEO playbook', description: 'How to become the brand ChatGPT recommends in your category.' },
          { href: '/learn/ai-search-optimization', label: 'AI search optimization', description: 'The companion pillar for AI search surfaces.' },
          { href: '/ai-search-statistics-2026', label: 'AI search statistics 2026', description: '120+ data points on AI search adoption and citations.' },
          { href: '/geo-audit', label: 'Free GEO audit', description: 'Score any URL for LLM citation-readiness in under 30 seconds.' },
          { href: '/generative-engine-optimization-tool', label: 'GEO tool', description: 'Continuous AI visibility measurement - purpose-built.' },
          { href: '/pricing', label: 'Pricing', description: 'Plans that scale from one brand to multi-brand programs.' },
        ]}
      />
    </SeoLayout>
  );
}
