import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 2, page 7 of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Numbers come from PRICING_PLANS and RANK_CREDITS_BY_PLAN: Starter $19 ($15
// billed yearly) = 1,000 credits = 250 keywords weekly to the top 30.
const PATH = '/uses/cheap-rank-tracker';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Cheap Rank Tracker | 250 Keywords for $19 a Month | Livesov';
const DESCRIPTION =
  'Cheap rank tracker for Google. Track 250 keywords weekly by city for $19 a month, with AI visibility included. Start with a 7-day free trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'cheap rank tracker, affordable rank tracker, low cost rank tracker, budget rank tracker, cheap keyword rank tracker',
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
        alt: 'Cheap Rank Tracker | Livesov',
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
    question: 'How many keywords does $19 cover?',
    answer:
      'Starter includes 1,000 rank credits a month. One credit is one keyword check to the top 30, and a weekly keyword uses 4 checks a month. That is 250 keywords checked weekly.',
  },
  {
    question: 'Is there a yearly price?',
    answer:
      'Yes. Starter is $15 a month when billed yearly.',
  },
  {
    question: 'What do I give up on Starter?',
    answer:
      'Top 100 checks start on Pro, and daily checks, white-label reports and rank drop alerts are on Agency. Starter checks the top 30 every week.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Cheap Rank Tracker',
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

export default function CheapRankTrackerPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Cheap Rank Tracker', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Cheap Rank Tracker"
        subtitle="A cheap rank tracker that still checks Google from your own city. Starter costs $19 a month and covers 250 keywords checked every week."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/rank-tracker-shot.webp"
          alt="cheap rank tracker"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A cheap rank tracker should not mean guessing. Livesov Starter checks your real Google
            position from the city you choose, every week, for $19 a month.
          </p>

          <h2>What $19 a month gets you</h2>
          <ul>
            <li>1,000 rank credits, enough for 250 keywords checked weekly</li>
            <li>City level tracking, on desktop or mobile</li>
            <li>Positions to the top 30</li>
            <li>3 brands and AI visibility on 2 AI platforms</li>
            <li>Google AI Overview and AI Mode tracking</li>
          </ul>

          <h2>Simple credit math</h2>
          <p>
            One credit is one keyword check to the top 30. A keyword checked weekly uses 4 credits
            a month. You see the cost before you add keywords, so there is no surprise bill.
          </p>

          <h2>Pay less with yearly billing</h2>
          <p>
            Starter drops to $15 a month when you pay for the year. Every plan starts with a 7-day
            free trial, and no credit card is needed to start.
          </p>

          <h2>Grow when you need to</h2>
          <ul>
            <li>Pro: 1,000 keywords weekly, top 100 and client share links</li>
            <li>Agency: 5,000 keywords weekly, daily checks, white-label reports and alerts</li>
          </ul>
          <p>
            Your keywords and history stay when you upgrade.
          </p>

          <h2>No corners cut on accuracy</h2>
          <p>
            Low price does not mean old data. Each check is a live Google search from the city and
            device you pick, and the ranking page is saved with it. You can see the full history for
            every keyword, group keywords by service, and export everything as CSV.
          </p>

          <h2>Who Starter fits</h2>
          <p>
            Freelancers, small businesses and new agencies tracking a few sites. If you outgrow 250
            keywords, move up a plan and keep your history.
          </p>

          <h2>Google rank and AI in one tool</h2>
          <p>
            Most low-cost rank trackers stop at Google. Livesov also shows whether ChatGPT and
            Google&apos;s AI Overview mention you, so one plan covers both. See every feature on the{' '}
            <Link href="/rank-tracker">rank tracker</Link> page or compare plans on{' '}
            <Link href="/pricing">pricing</Link>.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Cheap Rank Tracker: FAQ" items={faqs} />

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
