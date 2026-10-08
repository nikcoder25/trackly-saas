import type { Metadata } from 'next';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, LongForm, PillarLinks, JsonLd } from '@/components/seo/SeoSections';

const PATH = '/uses';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'AI Visibility Use Cases for Local SEO Agencies | Livesov';
const DESCRIPTION =
  'AI visibility use cases for local SEO agencies: track how ChatGPT, Gemini and Perplexity recommend local businesses and HVAC companies, and report it to clients.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords:
    'ai visibility use cases, local seo agency ai visibility, ai visibility for local businesses, ai visibility for hvac companies, ai visibility report for clients',
  alternates: { canonical: PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AI visibility use cases for local SEO agencies | Livesov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['https://livesov.com/og-image.png'],
  },
};

const USES = [
  {
    href: '/uses/ai-visibility-for-local-businesses',
    label: 'AI visibility for local businesses',
    description: 'Track near me and city prompts, see who AI names instead, and fix NAP citations.',
  },
  {
    href: '/uses/ai-visibility-for-hvac-companies',
    label: 'AI visibility for HVAC companies',
    description: 'See if ChatGPT and Gemini recommend you for AC repair and furnace prompts in your city.',
  },
  {
    href: '/uses/white-label-ai-visibility-report',
    label: 'AI visibility reports for clients',
    description: 'What Livesov client reports include and how agencies brand the data today.',
  },
];

const collectionSchema = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'AI Visibility Use Cases for Local SEO Agencies',
  url: PAGE_URL,
  description: DESCRIPTION,
  isPartOf: { '@type': 'WebSite', name: 'Livesov', url: 'https://livesov.com/' },
  hasPart: USES.map((u) => ({
    '@type': 'WebPage',
    name: u.label,
    url: `https://livesov.com${u.href}`,
  })),
};

export default function UsesHubPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Use Cases', url: PATH }]} />
      <JsonLd data={collectionSchema} />

      <SeoHero
        title="AI Visibility Use Cases for Local SEO Agencies"
        subtitle="How local SEO agencies use Livesov to see whether ChatGPT, Gemini, Perplexity, Claude and Grok recommend their clients, and to prove it in a report."
        ctaText="Start free"
        ctaHref="/signup"
      />

      <PillarLinks title="Use cases" links={USES} />

      <Section pad="24px 24px 80px">
        <LongForm>
          <p>
            AI visibility use cases for local SEO agencies all start the same way: pick the
            questions a client&apos;s customers ask an AI assistant, run them on a schedule, and
            see who gets named. Livesov handles the tracking, the competitor comparison and the
            client report. Your agency handles the fixes. For a wider view across SaaS, e-commerce
            and enterprise teams, see all <Link href="/use-cases">use cases</Link>.
          </p>
        </LongForm>
      </Section>
    </SeoLayout>
  );
}
