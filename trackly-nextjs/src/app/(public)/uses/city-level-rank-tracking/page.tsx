import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 2, page 9 of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Locations: DataForSEO's Google location list, or the bundled ~41k GeoNames
// cities (rank-tracking/locations.ts). Organic results only: no Maps grid or
// local pack (providers/types.ts), so do not promise either.
const PATH = '/uses/city-level-rank-tracking';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'City Level Rank Tracking | See Google Rankings by City | Livesov';
const DESCRIPTION =
  'City level rank tracking for Google. Check where you rank in each city you serve, on desktop and mobile, weekly or daily. Start a 7-day free trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'city level rank tracking, rank tracker by city, track keyword rankings by city, local keyword rank tracking, city rank checker',
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
        alt: 'City Level Rank Tracking | Livesov',
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
    question: 'Which cities can I track from?',
    answer:
      'Cities, states and countries worldwide. Start typing a place and pick it from the list.',
  },
  {
    question: 'Does this track Google Maps or the local pack?',
    answer:
      'No. Livesov tracks your organic Google position from that city. Maps and local pack results are not counted as a ranking.',
  },
  {
    question: 'Can one keyword be tracked from several cities?',
    answer:
      'Yes. Add the same keyword once for each city. Each city is its own keyword and uses its own credits.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'City Level Rank Tracking',
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

export default function CityLevelRankTrackingPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'City Level Rank Tracking', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="City Level Rank Tracking"
        subtitle="City level rank tracking shows the Google results people in each town really see. Pick a city for each keyword and track your position there."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/rank-tracker-shot.webp"
          alt="city level rank tracking"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            City level rank tracking matters because Google shows different results in every town.
            You may rank #2 in Austin and #14 in Dallas for the same search. A national rank hides
            that.
          </p>

          <h2>Pick any city</h2>
          <ul>
            <li>Cities, states and countries worldwide</li>
            <li>Start typing and pick the place from the list</li>
            <li>Track one keyword from as many cities as you serve</li>
          </ul>

          <h2>Keywords that name a place</h2>
          <p>
            A search like &quot;plumber austin&quot; should be checked from Austin. Livesov can spot
            the place in the keyword and check it from there, even when you add a batch with a
            different default city.
          </p>

          <h2>Desktop and mobile</h2>
          <p>
            Local searches happen on phones. Track mobile, desktop or both for each city to see the
            result your customers get.
          </p>

          <h2>See every city in one view</h2>
          <p>
            Each website shows its keywords with the city next to each one. Group keywords by city
            to compare markets, and star the ones you watch most.
          </p>

          <h2>Weekly or daily</h2>
          <p>
            Every plan checks weekly. The Agency plan adds daily checks. One credit is one keyword
            check, so a keyword tracked in three cities uses three times the credits.
          </p>

          <h2>Spot the cities where you are losing</h2>
          <p>
            A drop in one city is easy to miss in an average. City by city tracking shows exactly
            where a competitor is pulling ahead, so you know which location page, citation or
            review push to work on next. Reports list the city for every keyword.
          </p>

          <h2>Built for local businesses and agencies</h2>
          <p>
            Service businesses rank city by city, and so do the agencies that serve them. Add the AI
            side to see if ChatGPT and Google&apos;s AI Overview recommend you in those cities too.
            See every feature on the <Link href="/rank-tracker">rank tracker</Link> page, or how
            agencies run many clients on <Link href="/uses/rank-tracker-for-agencies">rank tracker
            for agencies</Link>.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="City Level Rank Tracking: FAQ" items={faqs} />

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
