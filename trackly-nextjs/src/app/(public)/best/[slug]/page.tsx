import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  StatsBar,
  FaqSection,
  Callout,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';
import { BEST_CATEGORIES, getCategory, getAllCategorySlugs } from '@/data/best-categories';

const SUFFIX = '-chatgpt-recommends';

interface PageProps {
  params: Promise<{ slug: string }>;
}

function resolveCategory(rawSlug: string) {
  if (!rawSlug.endsWith(SUFFIX)) return null;
  const categorySlug = rawSlug.slice(0, -SUFFIX.length);
  return getCategory(categorySlug) ?? null;
}

export async function generateStaticParams() {
  return getAllCategorySlugs().map((slug) => ({ slug: `${slug}${SUFFIX}` }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = resolveCategory(slug);
  if (!category) {
    return {
      title: 'Page not found | Livesov',
      robots: { index: false, follow: false },
    };
  }

  const title = `Best ${category.category} ChatGPT recommends in 2026 (Top ${category.brands.length}) | Livesov`;
  const description = `What ChatGPT actually recommends when asked for the best ${category.category} ${category.audience}. Top ${category.brands.length} brands ranked by AI mention rate, with the reason ChatGPT cites each one.`;

  return {
    title,
    description,
    keywords: `best ${category.category} chatgpt, ${category.category} chatgpt recommends, what chatgpt recommends for ${category.category}, top ${category.category} 2026, ai recommended ${category.category}`,
    alternates: { canonical: `/best/${slug}` },
    openGraph: {
      title,
      description,
      url: `https://livesov.com/best/${slug}`,
      siteName: 'Livesov',
      type: 'article',
      images: [
        {
          url: 'https://livesov.com/og-image.png',
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['https://livesov.com/og-image.png'],
    },
  };
}

export default async function BestCategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const category = resolveCategory(slug);
  if (!category) notFound();

  const top = category.brands[0];
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Best ${category.category} ChatGPT recommends`,
    itemListElement: category.brands.map((b) => ({
      '@type': 'ListItem',
      position: b.rank,
      name: b.name,
      url: b.url,
    })),
  };

  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Best (AI recommends)', url: '/best' },
          { name: `${category.category}`, url: `/best/${slug}` },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />

      <SeoHero
        title={
          <>
            Best {category.category}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              ChatGPT recommends
            </span>{' '}
            in 2026
          </>
        }
        subtitle={`${category.intro} Updated continuously as ChatGPT's recommendation set evolves.`}
        ctaText="Track your own AI mention rate"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: `${category.brands.length}`, label: 'Brands in the recommendation set' },
            { value: top?.mentionRate ?? '—', label: `Mention rate for #1 (${top?.name})` },
            { value: '5', label: 'LLMs we measure against' },
            { value: 'Live', label: 'Refreshed continuously' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
        <SectionHeader
          label="What ChatGPT asks first"
          title={`How ChatGPT picks the best ${category.category}`}
          subtitle={`When asked to recommend ${category.pluralNoun} ${category.audience}, ChatGPT typically tries to narrow on these factors before naming a brand.`}
        />
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {category.buyerCriteria.map((crit) => (
              <li
                key={crit}
                style={{
                  background: '#fff',
                  border: '1px solid var(--card-border, #e8e5e1)',
                  borderRadius: 12,
                  padding: '14px 18px',
                  fontSize: 15,
                  color: 'var(--text-primary)',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ color: 'var(--brand, #6366f1)', fontWeight: 700 }}>◆</span>
                {crit}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section pad="80px 24px" width={1000}>
        <SectionHeader
          label="The ranked list"
          title={`Top ${category.brands.length} ${category.pluralNoun} ChatGPT recommends`}
          subtitle="Ranked by mention rate inside ChatGPT answers, with the reason each brand is cited."
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {category.brands.map((b) => (
            <div
              key={b.name}
              style={{
                background: '#fff',
                border: '1px solid var(--card-border, #e8e5e1)',
                borderRadius: 16,
                padding: '24px 28px',
                display: 'grid',
                gridTemplateColumns: '60px 1fr',
                gap: 20,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--brand, #6366f1), #8b5cf6)',
                  color: '#fff',
                  fontSize: 22,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                #{b.rank}
              </div>
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 12,
                    flexWrap: 'wrap',
                    marginBottom: 6,
                  }}
                >
                  <h3
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                      margin: 0,
                    }}
                  >
                    {b.url ? (
                      <a
                        href={b.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none' }}
                      >
                        {b.name}
                      </a>
                    ) : (
                      b.name
                    )}
                  </h3>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      color: 'var(--brand, #6366f1)',
                      background: 'rgba(99,102,241,.08)',
                      padding: '4px 10px',
                      borderRadius: 100,
                    }}
                  >
                    {b.mentionRate} mention rate
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: '0 0 8px',
                  }}
                >
                  {b.positioning}
                </p>
                <p
                  style={{
                    fontSize: 14,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  <strong style={{ color: 'var(--text-primary)' }}>Why ChatGPT cites it: </strong>
                  {b.whyChatGptCites}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <LongForm>
          <h2>How we measure “what ChatGPT recommends”</h2>
          <p>
            Mention rate is calculated by running a panel of 40+ buyer-intent prompts for{' '}
            {category.pluralNoun} through ChatGPT continuously, then logging which brands are
            named in the first paragraph of each response. The set is refreshed daily across
            both the default model and ChatGPT Search.
          </p>
          <p>
            Brands shift positions as ChatGPT&apos;s training data and live retrieval evolve. If
            your brand is missing from this list, the cause is almost always one of four: no
            training-corpus presence, no retrievable URL, weak cross-source consensus, or low
            extractability. See our <a href="/learn/llm-seo">LLM SEO guide</a> for the full
            diagnostic playbook.
          </p>

          <h2>What buyers ask after the initial recommendation</h2>
          <p>
            The first recommendation is rarely the end of the conversation. Buyers almost always
            ask one of these follow-ups — and the brand that wins the follow-up is the one that
            actually closes the deal.
          </p>
          <ul>
            {category.followUps.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>

          <Callout title="Track your share of the recommendation set" variant="tip">
            Livesov measures mention rate, citation share, and rank for any brand across
            ChatGPT, Claude, Gemini, Perplexity, and Grok — continuously. If you want to know
            whether ChatGPT recommends <em>you</em> for {category.category},{' '}
            <a href="/signup">start free</a>.
          </Callout>
        </LongForm>
      </Section>

      <FaqSection
        title={`Best ${category.category} — FAQ`}
        subtitle="Common questions about how ChatGPT picks, and how to influence it."
        items={[
          {
            question: `Which ${category.category} does ChatGPT recommend most often?`,
            answer: `${top?.name} is the most-mentioned brand in ChatGPT responses about ${category.category}, with a ${top?.mentionRate} mention rate across our prompt panel. It is positioned as "${top?.positioning}".`,
          },
          {
            question: `How does ChatGPT actually decide what ${category.category} to recommend?`,
            answer: `ChatGPT combines training-corpus weight (how often a brand appears in its training data), live retrieval (for ChatGPT Search), and cross-source consensus across reviews on G2/Capterra, Reddit threads, Wikipedia, and major publishers. Brands that win across all three are the ones recommended in the first paragraph.`,
          },
          {
            question: `How is this list different from a Google "best ${category.category}" SERP?`,
            answer: `Google SERPs are driven by classic ranking signals — backlinks, intent match, and on-page SEO. ChatGPT recommendations are driven by cross-source consensus and extractability. The overlap is roughly 60% — but the rank order and the rationale are different.`,
          },
          {
            question: `How often does this ranking change?`,
            answer: `Our panel refreshes daily. Material rank changes typically happen on a 2–6 week cycle for ChatGPT Search (live retrieval) and a 3–6 month cycle for the default ChatGPT model (training cutoff).`,
          },
          {
            question: `My brand should be on this list. How do I get added?`,
            answer: `The list is generated algorithmically from mention rate, not pay-to-play. If your brand has crossed the inclusion threshold, it appears automatically on the next refresh. For brands below the threshold, the fastest path in is the diagnostic in our LLM SEO guide.`,
          },
          {
            question: `Can I track how often ChatGPT recommends my brand specifically?`,
            answer: `Yes — Livesov tracks mention rate, citation share, sentiment, and rank for any brand across ChatGPT, Claude, Gemini, Perplexity, and Grok, continuously. Start free and you will see your share of voice for ${category.category} within minutes.`,
          },
        ]}
      />

      <PillarLinks
        title="Related AI-recommendation lists"
        links={[
          ...BEST_CATEGORIES.filter((c) => c.slug !== category.slug)
            .slice(0, 5)
            .map((c) => ({
              href: `/best/${c.slug}${SUFFIX}`,
              label: `Best ${c.category} ChatGPT recommends`,
              description: `Top ${c.brands.length} ${c.pluralNoun} ${c.audience}, by mention rate.`,
            })),
          {
            href: '/learn/llm-seo',
            label: 'LLM SEO playbook',
            description: 'How to become the brand ChatGPT recommends in your category.',
          },
        ]}
      />
    </SeoLayout>
  );
}
