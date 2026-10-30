import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 2, page 10 of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Device is set per keyword ('desktop' | 'mobile'); a keyword tracked on both
// devices is two keywords and uses credits twice (rt_keywords unique key
// includes device).
const PATH = '/uses/mobile-rank-tracker';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Mobile Rank Tracker | Google Mobile Rankings by City | Livesov';
const DESCRIPTION =
  'Mobile rank tracker for Google. See your mobile search position from any city, compare it with desktop, and track changes over time. Free 7-day trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'mobile rank tracker, mobile keyword rank tracker, google mobile rank tracker, mobile serp tracker, track mobile rankings',
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
        alt: 'Mobile Rank Tracker | Livesov',
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
    question: 'Why do mobile and desktop rankings differ?',
    answer:
      'Google builds the mobile results page differently, and local searches on phones lean on location. Your position can move several places between devices.',
  },
  {
    question: 'Can I track both devices for one keyword?',
    answer:
      'Yes. Add the keyword once for mobile and once for desktop. Each one is its own keyword and uses its own credits.',
  },
  {
    question: 'Can I import mobile rankings from another tool?',
    answer:
      'Yes. If your CSV export has a device column, mobile rows come in as mobile keywords with their history.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Mobile Rank Tracker',
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

export default function MobileRankTrackerPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Mobile Rank Tracker', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Mobile Rank Tracker"
        subtitle="A mobile rank tracker for the searches that happen on phones. Check your Google position on mobile, from the city you choose, every week or every day."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/rank-tracker-shot.webp"
          alt="mobile rank tracker"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A mobile rank tracker shows the position most of your visitors see. Most local searches
            happen on a phone, and Google ranks mobile results on their own. A desktop rank alone
            can look better or worse than reality.
          </p>

          <h2>Mobile and desktop, side by side</h2>
          <ul>
            <li>Pick mobile or desktop for each keyword</li>
            <li>Track both to compare the gap</li>
            <li>The ranking page saved with each check</li>
          </ul>

          <h2>From the city your customers search in</h2>
          <p>
            Phones search from where people are. Set a city for each keyword and Livesov checks the
            mobile results from there, anywhere in the world.
          </p>

          <h2>Weekly or daily checks</h2>
          <p>
            Every plan checks weekly, to the top 30. Pro adds the top 100, and Agency adds daily
            checks and rank drop alerts by email or Slack.
          </p>

          <h2>Clear credit math</h2>
          <p>
            One credit is one keyword check to the top 30. A mobile keyword checked weekly uses 4
            credits a month. Starter at $19 a month covers 250 weekly keywords on any mix of
            devices.
          </p>

          <h2>Mobile rankings in your reports</h2>
          <p>
            Reports and CSV exports list the device for every keyword, so clients see mobile and
            desktop positions clearly. Moving from another tool? Import a CSV with a device column
            and the mobile history comes along.
          </p>

          <h2>Find mobile-only drops</h2>
          <p>
            A slow page or a layout issue on phones can push you down on mobile while desktop holds
            steady. Tracking both devices shows the gap the day it opens, so you can fix the page
            before leads fall off.
          </p>

          <h2>Plus AI visibility</h2>
          <p>
            Phone users also ask ChatGPT and see Google&apos;s AI Overview first. Livesov tracks
            those answers next to your rankings. See every feature on the{' '}
            <Link href="/rank-tracker">rank tracker</Link> page, or track by town with{' '}
            <Link href="/uses/city-level-rank-tracking">city level rank tracking</Link>.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Mobile Rank Tracker: FAQ" items={faqs} />

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
