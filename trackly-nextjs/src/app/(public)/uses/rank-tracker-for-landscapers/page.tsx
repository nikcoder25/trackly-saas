import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 4 niche page of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Organic Google positions only (no Maps grid or local pack).
const PATH = '/uses/rank-tracker-for-landscapers';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Rank Tracker for Landscapers | Google Rankings by City | Livesov';
const DESCRIPTION =
  'Rank tracker for landscapers. Track lawn care, landscape design and hardscaping keywords on Google from every city you serve. Start a free trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'rank tracker for landscapers, landscaping rank tracker, lawn care seo rank tracker, landscaping keyword rank tracking, track landscaper rankings',
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
        alt: 'Rank Tracker for Landscapers | Livesov',
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
    question: 'Which landscaping keywords should I track?',
    answer:
      'Track recurring services like lawn care, project work like patios and design, and seasonal cleanups, with city versions for your area.',
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
  name: 'Rank Tracker for Landscapers',
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

export default function RankTrackerForLandscapersPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Rank Tracker for Landscapers', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Rank Tracker for Landscapers"
        subtitle="A rank tracker for landscapers that checks Google from the neighborhoods you work in. See where you rank for lawn care, design and hardscaping."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="rank tracker for landscapers"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A rank tracker for landscapers shows which neighborhoods can find you. Lawn care is local by nature, and Google ranks it street by street. Livesov checks each keyword from the town you pick.
          </p>

          <h2>Track the searches that bring work</h2>
          <ul>
            <li>lawn care service</li>
            <li>landscape design</li>
            <li>paver patio installation</li>
            <li>yard cleanup</li>
            <li>landscaper charlotte</li>
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

          <h2>Spring rush ready</h2>
          <p>
            Most landscaping searches start in early spring. Track your keywords through winter, so you start the season knowing where you rank.
          </p>

          <h2>Know when a ranking drops</h2>
          <p>
            Weekly checks come with every plan, daily checks with Agency. Set a rank drop alert and
            get an email or a Slack message when a money keyword falls.
          </p>

          <h2>For the agencies that serve landscapers</h2>
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

      <FaqSection title="Rank Tracker for Landscapers: FAQ" items={faqs} />

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
