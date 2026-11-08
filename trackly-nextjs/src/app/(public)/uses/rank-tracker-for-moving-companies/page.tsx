import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 4 niche page of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Organic Google positions only (no Maps grid or local pack).
const PATH = '/uses/rank-tracker-for-moving-companies';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Rank Tracker for Moving Companies | Google Rankings by City | Livesov';
const DESCRIPTION =
  'Rank tracker for moving companies. Track local, long distance and office move keywords on Google from every city you serve. Free 7-day trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'rank tracker for moving companies, movers rank tracker, moving company seo rank tracker, moving keyword rank tracking, track movers google rankings',
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
        alt: 'Rank Tracker for Moving Companies | Livesov',
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
    question: 'Which moving keywords should I track?',
    answer:
      'Track local, long distance and specialty moves, like piano or office moves, plus city versions for the places you pick up from and deliver to.',
  },
  {
    question: 'Does it track Google Maps?',
    answer:
      'No. Livesov tracks your organic Google position from the city you pick. Maps and local pack results are not counted.',
  },
  {
    question: 'How much does it cost?',
    answer:
      'Starter is $19 a month for 250 keywords checked weekly. Every plan starts with a 7-day free trial.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Rank Tracker for Moving Companies',
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

export default function RankTrackerForMovingCompaniesPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Rank Tracker for Moving Companies', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Rank Tracker for Moving Companies"
        subtitle="A rank tracker for moving companies that checks Google from both ends of the move. See where you rank for local, long distance and office moves."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="rank tracker for moving companies"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A rank tracker for moving companies has to watch more than one town. People search from the city they are leaving and the city they are moving to. Livesov checks each keyword from the place you pick.
          </p>

          <h2>Track the searches that bring work</h2>
          <ul>
            <li>local movers</li>
            <li>long distance movers</li>
            <li>office movers</li>
            <li>piano movers</li>
            <li>movers houston</li>
          </ul>
          <p>
            Add them in one batch. Keywords that name a city are checked from that city on their
            own.
          </p>

          <h2>Checked from your service area, on mobile</h2>
          <p>
            Pick a city for each keyword, pick mobile or desktop, and see the result your customers
            see. Track several towns to find where you are strong and where you are not.
          </p>

          <h2>Peak season in view</h2>
          <p>
            Most moves happen between May and September. Keep the ranking history for spring and summer keywords, so you know if last year&apos;s work holds before the busy months.
          </p>

          <h2>Know when a ranking drops</h2>
          <p>
            Weekly checks come with every plan, daily checks with Agency. Set a rank drop alert and
            get an email or a Slack message when a money keyword falls.
          </p>

          <h2>For the agencies that serve moving companies</h2>
          <p>
            Track every client from one login, send scheduled PDF reports, and give each client a
            read-only view of their rankings. Starter covers 250 keywords checked weekly for $19 a
            month.
          </p>

          <h2>And what AI says about you</h2>
          <p>
            More customers now ask ChatGPT or read Google&apos;s AI Overview before they call. Livesov
            tracks that next to your rankings. See every feature on the{' '}
            <Link href="/rank-tracker">rank tracker</Link> page, or see <Link href="/uses/rank-tracker-for-local-businesses">rank tracker for local businesses</Link>.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Rank Tracker for Moving Companies: FAQ" items={faqs} />

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
