import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 3 niche page of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Organic Google positions only (no Maps grid or local pack). Links to the
// matching AI visibility page so both sides of the niche cluster connect.
const PATH = '/uses/rank-tracker-for-hvac-companies';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Rank Tracker for HVAC Companies | Track Google by City | Livesov';
const DESCRIPTION =
  'Rank tracker for HVAC companies. Track AC repair and furnace keywords on Google from every city you serve, on mobile and desktop. Free 7-day trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'rank tracker for hvac companies, hvac rank tracker, hvac keyword rank tracking, hvac seo rank tracker, track hvac google rankings',
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
        alt: 'Rank Tracker for HVAC Companies | Livesov',
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
    question: 'Which HVAC keywords should I track?',
    answer:
      'Start with each service you sell plus the cities you serve, like ac repair, furnace repair and heat pump installation, then add the city name to the ones people search that way.',
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
  name: 'Rank Tracker for HVAC Companies',
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

export default function RankTrackerForHvacCompaniesPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Rank Tracker for HVAC Companies', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Rank Tracker for HVAC Companies"
        subtitle="A rank tracker for HVAC companies that checks Google the way homeowners search: by service, by city, on a phone. See where you rank for every job you want."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="rank tracker for hvac companies"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A rank tracker for HVAC companies matters because HVAC companies win jobs from Google, and
            most of those searches name a service and a city. Livesov tracks your position for
            each one, from the city where the customer searches.
          </p>

          <h2>Track the searches that bring calls</h2>
          <ul>
            <li>ac repair</li>
            <li>furnace repair</li>
            <li>heat pump installation</li>
            <li>emergency hvac service</li>
            <li>ac repair austin</li>
          </ul>
          <p>
            Add them in one batch. Keywords that name a city, like the last one, are checked from
            that city on their own.
          </p>

          <h2>Checked from your service area, on mobile</h2>
          <p>
            Most of these searches happen on a phone, close to home. Pick a city for each keyword,
            pick mobile or desktop, and see the result your customers see. Track several towns in
            your service area to find where you are strong and where you are not.
          </p>

          <h2>Seasonal swings, side by side</h2>
          <p>
            AC keywords peak in summer and furnace keywords in winter. Keep the full ranking history for both, so you can see whether last season&apos;s work held before the next rush starts.
          </p>

          <h2>Know when a ranking drops</h2>
          <p>
            Weekly checks come with every plan, daily checks with Agency. Set a rank drop alert and
            get an email or a Slack message when a money keyword falls, before the phone goes quiet.
          </p>

          <h2>For the agencies that serve HVAC companies</h2>
          <p>
            Track every client from one login, send scheduled PDF reports, and give each client a
            read-only view of their rankings. Starter covers 250 keywords checked weekly for $19 a
            month.
          </p>

          <h2>And what AI says about you</h2>
          <p>
            More customers now ask ChatGPT or read Google&apos;s AI Overview before they call. See
            if they name you on <Link href="/uses/ai-visibility-for-hvac-companies">AI visibility for HVAC companies</Link>, or see every feature on
            the <Link href="/rank-tracker">rank tracker</Link> page.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Rank Tracker for HVAC Companies: FAQ" items={faqs} />

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
