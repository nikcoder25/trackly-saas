import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 4 niche page of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Organic Google positions only (no Maps grid or local pack).
const PATH = '/uses/rank-tracker-for-electricians';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Rank Tracker for Electricians | Google Rankings by City | Livesov';
const DESCRIPTION =
  'Rank tracker for electricians. Track panel upgrade, EV charger and emergency electrician keywords on Google from every city you serve. Free trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'rank tracker for electricians, electrician rank tracker, electrical contractor seo rank tracker, electrician keyword rank tracking, track electrician rankings',
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
        alt: 'Rank Tracker for Electricians | Livesov',
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
    question: 'Which electrician keywords should I track?',
    answer:
      'Track emergency terms, each service you sell, like panel upgrades and EV chargers, and city versions for your service area.',
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
  name: 'Rank Tracker for Electricians',
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

export default function RankTrackerForElectriciansPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Rank Tracker for Electricians', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Rank Tracker for Electricians"
        subtitle="A rank tracker for electricians that checks Google from the towns you work in. See where you rank for panel upgrades, EV chargers and emergency calls."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="rank tracker for electricians"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A rank tracker for electricians answers a simple question: when someone nearby needs an electrician, do they find you? Livesov checks each service from the town you serve.
          </p>

          <h2>Track the searches that bring work</h2>
          <ul>
            <li>emergency electrician</li>
            <li>electrical panel upgrade</li>
            <li>ev charger installation</li>
            <li>whole house generator installation</li>
            <li>electrician phoenix</li>
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

          <h2>New services, tracked from day one</h2>
          <p>
            EV chargers and home generators are growing fast. Add those keywords now and watch the trend line climb as your new pages get found.
          </p>

          <h2>Know when a ranking drops</h2>
          <p>
            Weekly checks come with every plan, daily checks with Agency. Set a rank drop alert and
            get an email or a Slack message when a money keyword falls.
          </p>

          <h2>For the agencies that serve electricians</h2>
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

      <FaqSection title="Rank Tracker for Electricians: FAQ" items={faqs} />

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
