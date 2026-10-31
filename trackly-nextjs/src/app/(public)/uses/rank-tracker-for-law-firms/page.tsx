import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 4 niche page of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Organic Google positions only (no Maps grid or local pack).
const PATH = '/uses/rank-tracker-for-law-firms';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Rank Tracker for Law Firms | Rankings by Practice Area | Livesov';
const DESCRIPTION =
  'Rank tracker for law firms. Track practice area keywords on Google from every city you serve, and report on them to partners. Start a free trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'rank tracker for law firms, law firm rank tracker, lawyer seo rank tracker, legal keyword rank tracking, attorney rank tracker',
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
        alt: 'Rank Tracker for Law Firms | Livesov',
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
    question: 'Which legal keywords should I track?',
    answer:
      'Track each practice area you want cases in, the case types inside it, and city versions for every office and nearby town.',
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
  name: 'Rank Tracker for Law Firms',
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

export default function RankTrackerForLawFirmsPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Rank Tracker for Law Firms', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Rank Tracker for Law Firms"
        subtitle="A rank tracker for law firms that checks Google by practice area and city. See where you rank for the cases you want, and report it to partners."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="rank tracker for law firms"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A rank tracker for law firms tracks the searches that turn into cases. Each practice area has its own keywords, and each city has its own results. Livesov checks them all from the place you pick.
          </p>

          <h2>Track the searches that bring cases</h2>
          <ul>
            <li>personal injury lawyer</li>
            <li>car accident attorney</li>
            <li>divorce lawyer</li>
            <li>estate planning attorney</li>
            <li>dui lawyer san diego</li>
          </ul>
          <p>
            Add them in one batch. Keywords that name a city are checked from that city on their
            own.
          </p>

          <h2>Checked from your service area, on mobile</h2>
          <p>
            Pick a city for each keyword, pick mobile or desktop, and see the result potential clients
            see. Track several towns to find where you are strong and where you are not.
          </p>

          <h2>One group per practice area</h2>
          <p>
            Group keywords by practice area, so each partner sees the area they run. Star the case types with the highest value and keep them at the top of every report.
          </p>

          <h2>Know when a ranking drops</h2>
          <p>
            Weekly checks come with every plan, daily checks with Agency. Set a rank drop alert and
            get an email or a Slack message when a money keyword falls.
          </p>

          <h2>For the agencies that serve law firms</h2>
          <p>
            Track every client from one login, send scheduled PDF reports, and give each client a
            read-only view of their rankings. Starter covers 250 keywords checked weekly for $19 a
            month.
          </p>

          <h2>And what AI says about you</h2>
          <p>
            More people now ask ChatGPT or read Google&apos;s AI Overview before they call a firm. Livesov
            tracks that next to your rankings. See every feature on the{' '}
            <Link href="/rank-tracker">rank tracker</Link> page, or see <Link href="/uses/rank-tracker-with-client-reports">rank tracker with client reports</Link>.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Rank Tracker for Law Firms: FAQ" items={faqs} />

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
