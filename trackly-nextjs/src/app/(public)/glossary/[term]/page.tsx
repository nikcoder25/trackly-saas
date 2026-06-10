import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, LongForm, PillarLinks } from '@/components/seo/SeoSections';
import { getTerm, getAllTermSlugs, GLOSSARY } from '@/data/glossary';

interface PageProps {
  params: Promise<{ term: string }>;
}

export async function generateStaticParams() {
  return getAllTermSlugs().map((term) => ({ term }));
}

// Slugs are a closed set from the data module; reject unknown ones at the
// router level too. NOTE: the load-bearing soft-404 fix was removing the
// (public)/loading.tsx Suspense boundary - with it present, the 200 shell
// streamed before any notFound() could set a real 404 status.
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { term } = await params;
  const t = getTerm(term);
  // Guard in generateMetadata as well as the page body: if a Suspense
  // boundary (e.g. a route-group loading.tsx) is ever reintroduced above
  // this page, a body-only notFound() would stream a 200 shell (soft-404).
  if (!t) notFound();
  const title = `${t.term}${t.acronym ? ` (${t.acronym})` : ''} - Definition | Livesov AI Search Glossary`;
  return {
    title,
    description: t.shortDef,
    keywords: `what is ${t.term.toLowerCase()}, ${t.term.toLowerCase()} definition, ${t.acronym?.toLowerCase() || ''}, ai search glossary, llm seo glossary`,
    alternates: { canonical: `/glossary/${t.slug}` },
    openGraph: {
      title,
      description: t.shortDef,
      url: `https://livesov.com/glossary/${t.slug}`,
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
  };
}

export default async function GlossaryTermPage({ params }: PageProps) {
  const { term } = await params;
  const t = getTerm(term);
  if (!t) notFound();

  const related = (t.related || [])
    .map((slug) => GLOSSARY.find((g) => g.slug === slug))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const defSchema = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: t.term,
    description: t.shortDef,
    inDefinedTermSet: {
      '@type': 'DefinedTermSet',
      name: 'Livesov AI Search Glossary',
      url: 'https://livesov.com/glossary',
    },
  };

  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Glossary', url: '/glossary' },
          { name: t.term, url: `/glossary/${t.slug}` },
        ]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(defSchema) }} />

      <SeoHero
        title={
          <>
            What is{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              {t.term}
            </span>
            ?
          </>
        }
        subtitle={t.acronym ? `${t.acronym} - ${t.shortDef}` : t.shortDef}
        ctaText="Track your AI visibility"
      />

      <Section pad="40px 24px 64px">
        <LongForm>
          <h2>Definition</h2>
          <p>{t.longDef}</p>

          <h2>Why it matters</h2>
          <p>
            <strong>{t.term}</strong> sits in the &quot;{t.category}&quot; layer of the AI search
            stack. Teams that handle it well get cited more, recommended more, and earn more of
            the AI-mediated revenue in their category. Teams that ignore it spend a year
            wondering why their content investment never moves the needle inside ChatGPT or
            Perplexity.
          </p>

          {related.length > 0 && (
            <>
              <h2>Related terms</h2>
              <ul>
                {related.map((r) => (
                  <li key={r.slug}>
                    <a href={`/glossary/${r.slug}`}>
                      <strong>{r.term}</strong>
                    </a>{' '}
                    - {r.shortDef}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2>Apply it</h2>
          <p>
            The <a href="/learn/llm-seo">LLM SEO playbook</a> ties every concept in this glossary
            into a single operating model. If you want to see how your brand performs across all
            the LLMs at once - mention rate, citation share, sentiment, rank - start with the{' '}
            <a href="/geo-audit">free GEO audit</a> or skip straight to a{' '}
            <a href="/signup">free Livesov account</a>.
          </p>
        </LongForm>
      </Section>

      <PillarLinks
        title="Keep learning"
        links={[
          { href: '/glossary', label: '← Full AI search glossary', description: `${GLOSSARY.length}+ terms across concepts, surfaces, signals, and measurement.` },
          { href: '/learn/llm-seo', label: 'LLM SEO: the 2026 guide', description: 'The full playbook tying every glossary term into one operating model.' },
          { href: '/learn/ai-search-optimization', label: 'AI search optimization', description: 'The companion pillar for AI search surfaces.' },
          { href: '/ai-search-statistics-2026', label: 'AI search statistics 2026', description: '120+ data points on AI search adoption and citations.' },
        ]}
      />
    </SeoLayout>
  );
}
