import type { Metadata } from 'next';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, SectionHeader, LongForm, PillarLinks } from '@/components/seo/SeoSections';
import { GLOSSARY, type GlossaryTerm } from '@/data/glossary';

export const metadata: Metadata = {
  title: 'AI Search & LLM SEO Glossary: GEO, AEO, RAG, llms.txt & 30+ Terms Defined | Livesov',
  description:
    'The definitive glossary of AI search and LLM SEO terminology. Clear definitions of GEO, AEO, LLM SEO, RAG, grounding, mention rate, citation share, llms.txt, GPTBot, ClaudeBot, and more.',
  keywords:
    'ai search glossary, llm seo glossary, geo glossary, what is geo, what is aeo, what is llm seo, what is rag, what is llms.txt, ai search terminology',
  alternates: { canonical: '/glossary' },
  openGraph: {
    title: 'AI Search & LLM SEO Glossary',
    description:
      '30+ terms defined: GEO, AEO, LLM SEO, RAG, grounding, citation share, llms.txt, every major crawler, and the measurement metrics that matter.',
    url: 'https://livesov.com/glossary',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AI Search & LLM SEO Glossary | Livesov',
      },
    ],
  },
};

const CATEGORIES: GlossaryTerm['category'][] = [
  'Core concepts',
  'Surfaces & platforms',
  'Signals & ranking',
  'Measurement',
  'Crawlers & infrastructure',
];

export default function GlossaryPage() {
  const byCategory = CATEGORIES.map((cat) => ({
    category: cat,
    terms: GLOSSARY.filter((t) => t.category === cat).sort((a, b) => a.term.localeCompare(b.term)),
  }));

  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Glossary', url: '/glossary' }]} />

      <SeoHero
        title={
          <>
            AI Search &amp; LLM SEO{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              Glossary
            </span>
          </>
        }
        subtitle={`${GLOSSARY.length}+ terms defined, plain English. The category itself is new - most teams need shared vocabulary before they can ship a program.`}
        ctaText="Track your AI visibility"
      />

      <Section pad="0 24px 80px" width={1000}>
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--card-border, #e8e5e1)',
            borderRadius: 14,
            padding: '20px 24px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'center',
          }}
        >
          {CATEGORIES.map((c) => (
            <a
              key={c}
              href={`#${c.replace(/\s+/g, '-').toLowerCase()}`}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--brand, #6366f1)',
                background: 'rgba(99,102,241,.06)',
                padding: '8px 16px',
                borderRadius: 100,
                textDecoration: 'none',
              }}
            >
              {c}
            </a>
          ))}
        </div>
      </Section>

      {byCategory.map(({ category, terms }) => (
        <Section
          key={category}
          background={category === 'Surfaces & platforms' || category === 'Measurement' ? 'var(--bg-section, #f7f5f1)' : undefined}
          pad="72px 24px"
          width={1080}
        >
          <div id={category.replace(/\s+/g, '-').toLowerCase()}>
            <SectionHeader
              label={`${terms.length} terms`}
              title={category}
            />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 16,
            }}
          >
            {terms.map((t) => (
              <Link
                key={t.slug}
                href={`/glossary/${t.slug}`}
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
                <h3
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    margin: '0 0 4px',
                  }}
                >
                  {t.term} <span style={{ color: 'var(--brand, #6366f1)' }}>→</span>
                </h3>
                {t.acronym && (
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--brand, #6366f1)',
                      marginBottom: 8,
                    }}
                  >
                    {t.acronym}
                  </div>
                )}
                <p
                  style={{
                    fontSize: 13.5,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.65,
                    margin: 0,
                  }}
                >
                  {t.shortDef}
                </p>
              </Link>
            ))}
          </div>
        </Section>
      ))}

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
        <LongForm>
          <h2>Why this glossary exists</h2>
          <p>
            AI search is a new category and the language is still settling. Two teams will use
            &quot;GEO&quot;, &quot;AEO&quot;, and &quot;LLM SEO&quot; for slightly different
            things; vendors will pick whichever sounds best in a deck. This glossary picks one
            definition for each term and sticks with it, so internal conversations and external
            content stop talking past each other.
          </p>
          <p>
            Suggestions or corrections: <a href="mailto:hello@livesov.com">hello@livesov.com</a>.
          </p>
        </LongForm>
      </Section>

      <PillarLinks
        title="Apply the vocabulary"
        links={[
          { href: '/learn/llm-seo', label: 'LLM SEO: the 2026 guide', description: 'The complete playbook for ranking inside ChatGPT, Claude, Gemini, Perplexity, and Grok.' },
          { href: '/learn/ai-search-optimization', label: 'AI search optimization', description: 'Companion pillar focused on the AI search surfaces themselves.' },
          { href: '/learn/ai-overviews-optimization', label: 'AI Overviews optimization', description: 'Google AI Overviews - how to win and hold a citation.' },
          { href: '/ai-search-statistics-2026', label: 'AI search statistics 2026', description: '120+ data points on AI search adoption and citations.' },
          { href: '/generative-engine-optimization-tool', label: 'GEO tool', description: 'Continuous, multi-platform AI visibility measurement.' },
          { href: '/geo-audit', label: 'Free GEO audit', description: 'Score any URL for LLM citation-readiness in under 30 seconds.' },
        ]}
      />
    </SeoLayout>
  );
}
