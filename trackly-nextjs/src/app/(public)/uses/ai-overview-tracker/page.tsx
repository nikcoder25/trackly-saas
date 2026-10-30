import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 1, page 5 of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Google AI Overview and AI Mode are tracked as AI platforms
// (GOOGLE_AI_ENGINES in lib/constants.ts, fetched in lib/ai-platforms.ts from
// the brand's city). They do not count toward a plan's AI platform limit, so
// every plan gets them. The Google rank tracker itself excludes AI Overviews
// from organic positions (rank-tracking/providers/types.ts).
const PATH = '/uses/ai-overview-tracker';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'AI Overview Tracker | See If Google AI Names You | Livesov';
const DESCRIPTION =
  'AI Overview tracker for your keywords. See when Google shows an AI Overview, if it names your brand, and which pages it cites. Free 7-day trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'ai overview tracker, google ai overview tracker, ai overviews tracker, track ai overviews, ai overview rank tracker, google ai mode tracker',
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
        alt: 'AI Overview tracker | Livesov',
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

const faqs = [
  {
    question: 'Which plans include AI Overview tracking?',
    answer:
      'Every plan. Google AI Overview and Google AI Mode do not count toward your AI platform limit, so they are tracked next to the ChatGPT, Gemini or other engines you pick.',
  },
  {
    question: 'What happens when Google shows no AI Overview?',
    answer:
      'Livesov records it as "not shown". That is a real result, not an error, and you can watch when Google starts or stops showing one for a search.',
  },
  {
    question: 'Is this the same as my Google ranking?',
    answer:
      'No. Your Google ranking is your organic position. The AI Overview is the AI answer above the results. Livesov tracks both, so you can see a page that ranks #3 but is left out of the AI Overview.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AI Overview Tracker',
  url: PAGE_URL,
  description: DESCRIPTION,
  isPartOf: { '@type': 'WebSite', name: 'Livesov', url: 'https://livesov.com/' },
  about: {
    '@type': 'SoftwareApplication',
    name: 'Livesov',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
  },
};

export default function AiOverviewTrackerPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'AI Overview Tracker', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="AI Overview Tracker"
        subtitle="An AI Overview tracker for the searches that bring you customers. See when Google shows an AI Overview, whether it names your brand, and which pages it cites."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="AI Overview tracker"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            AI Overview tracking shows what Google&apos;s AI answer says about you, search by
            search. The AI Overview sits above the blue links. Many buyers read it and never
            scroll. If it names a competitor and not you, a #1 ranking can still lose the click.
          </p>

          <h2>What the tracker checks</h2>
          <ul>
            <li>Whether Google shows an AI Overview for the search</li>
            <li>Whether your brand is named in it</li>
            <li>Which competitors are named next to you</li>
            <li>Which pages and sites the AI Overview cites</li>
          </ul>

          <h2>Checked from your own city</h2>
          <p>
            AI Overviews change by location. Livesov runs each search from your brand&apos;s city,
            so a dentist in Denver sees the AI answer Denver patients see, not a national one.
          </p>

          <h2>Google AI Mode too</h2>
          <p>
            Google AI Mode is the full chat-style answer inside Search. Livesov tracks it next to
            the AI Overview, so you see both of Google&apos;s AI answers for the same search.
          </p>

          <h2>Next to your Google ranking</h2>
          <p>
            Add a keyword to the rank tracker and tick &quot;also check AI answers&quot;. You get
            your organic position and your AI visibility in one row. That is how you spot a page
            that ranks well but is missing from the AI answer. See how it works on the{' '}
            <Link href="/rank-tracker">rank tracker</Link> page.
          </p>

          <h2>Watch it change over time</h2>
          <p>
            AI Overviews come and go. Google adds one to a search, drops it a week later, or swaps
            the sites it cites. Livesov saves every answer it checks, so you can look back and see
            when your brand first appeared, when a competitor took your spot, and which of your
            pages Google trusts enough to cite.
          </p>

          <h2>And the other AI engines</h2>
          <p>
            Buyers ask ChatGPT, Gemini and Perplexity as well. Track them on the same dashboard
            and compare share of voice across every engine. Want to win more AI Overviews? Read
            the <Link href="/learn/ai-overviews-optimization">AI Overviews optimization guide</Link>.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="AI Overview tracker: FAQ" items={faqs} />

      <Section pad="56px 24px 80px" width={820}>
        <div style={{ textAlign: 'center' }}>
          <Link href="/signup" className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 16 }}>
            Start free trial
          </Link>
        </div>
      </Section>
    </SeoLayout>
  );
}
