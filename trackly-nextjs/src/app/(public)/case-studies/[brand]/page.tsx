import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  StatsBar,
  Callout,
  LongForm,
  PillarLinks,
  ProcessSteps,
} from '@/components/seo/SeoSections';
import { getCaseStudy, getAllCaseStudySlugs, CASE_STUDIES } from '@/data/case-studies';

interface PageProps {
  params: Promise<{ brand: string }>;
}

export async function generateStaticParams() {
  return getAllCaseStudySlugs().map((brand) => ({ brand }));
}

// Slugs are a closed set from the data module; reject unknown ones at the
// router level too. NOTE: the load-bearing soft-404 fix was removing the
// (public)/loading.tsx Suspense boundary - with it present, the 200 shell
// streamed before any notFound() could set a real 404 status.
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brand } = await params;
  const c = getCaseStudy(brand);
  // Guard in generateMetadata as well as the page body: if a Suspense
  // boundary (e.g. a route-group loading.tsx) is ever reintroduced above
  // this page, a body-only notFound() would stream a 200 shell (soft-404).
  if (!c) notFound();

  // Keep the title SERP-length; the full summary stays in the description.
  const title = `${c.brand} Case Study: AI Visibility in ${c.industry} | Livesov`;
  return {
    title,
    description: c.summary,
    keywords: `${c.brand.toLowerCase()} case study, ${c.industry.toLowerCase()} ai visibility, geo case study, llm seo case study, chatgpt mention case study`,
    alternates: { canonical: `/case-studies/${c.slug}` },
    openGraph: {
      title,
      description: c.summary,
      url: `https://livesov.com/case-studies/${c.slug}`,
      siteName: 'Livesov',
      type: 'article',
      publishedTime: c.publishedAt,
      images: [
        {
          url: 'https://livesov.com/og-image.png',
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
  };
}

export default async function CaseStudyPage({ params }: PageProps) {
  const { brand } = await params;
  const c = getCaseStudy(brand);
  if (!c) notFound();

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${c.brand} Case Study: ${c.summary}`,
    datePublished: c.publishedAt,
    author: { '@type': 'Organization', name: 'Livesov' },
    publisher: {
      '@type': 'Organization',
      name: 'Livesov',
      logo: { '@type': 'ImageObject', url: 'https://livesov.com/og-image.png' },
    },
  };

  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Case Studies', url: '/case-studies' },
          { name: c.brand, url: `/case-studies/${c.slug}` },
        ]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />

      <SeoHero
        title={
          <>
            {c.brand}:{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              {c.segment}
            </span>{' '}
            case study
          </>
        }
        subtitle={c.summary}
        ctaText="Run the same playbook"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar stats={c.outcomes} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px">
        <LongForm>
          <h2>The challenge</h2>
          <p>{c.challenge}</p>
        </LongForm>
      </Section>

      <Section pad="72px 24px">
        <SectionHeader
          label="The playbook"
          title="What actually moved the numbers"
          subtitle="The same five-step approach we use with every Livesov client - adapted to this team's stack and category."
        />
        <ProcessSteps steps={c.approach.map((title) => ({ title, description: '' }))} />
      </Section>

      {c.quote && (
        <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
          <div style={{ maxWidth: 780, margin: '0 auto' }}>
            <Callout title="In their words" variant="tip">
              <blockquote
                style={{
                  margin: 0,
                  fontSize: 18,
                  lineHeight: 1.6,
                  fontStyle: 'italic',
                  color: 'var(--text-primary)',
                }}
              >
                &ldquo;{c.quote.text}&rdquo;
              </blockquote>
              <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{c.quote.author}</strong> -{' '}
                {c.quote.title}
              </div>
            </Callout>
          </div>
        </Section>
      )}

      <Section pad="72px 24px">
        <LongForm>
          <h2>The takeaway</h2>
          <p>
            {c.brand}&apos;s win was not a single tactic - it was the diagnostic plus the
            measurement loop. Most teams that try to compete inside ChatGPT and Perplexity skip
            the diagnostic and ship content. The diagnostic determines which lever actually
            moves the needle.
          </p>
          <p>
            If you want to baseline your own brand the same way {c.brand} did - in under an hour,
            free - start with the <a href="/geo-audit">free GEO audit</a> or skip straight to a{' '}
            <a href="/signup">free Livesov account</a>. The full diagnostic plus continuous
            tracking across all five LLMs is included.
          </p>
        </LongForm>
      </Section>

      <PillarLinks
        title="More like this"
        links={[
          ...CASE_STUDIES.filter((x) => x.slug !== c.slug)
            .slice(0, 4)
            .map((x) => ({
              href: `/case-studies/${x.slug}`,
              label: `${x.brand} (${x.segment})`,
              description: x.summary,
            })),
          { href: '/learn/llm-seo', label: 'LLM SEO playbook', description: 'The full operating model behind every case study.' },
        ]}
      />
    </SeoLayout>
  );
}
