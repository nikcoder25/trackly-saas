import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 3 niche page of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Organic Google positions only (no Maps grid or local pack). Links to the
// matching AI visibility page so both sides of the niche cluster connect.
const PATH = '/uses/rank-tracker-for-roofers';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Rank Tracker for Roofers | Track Google by City | Livesov';
const DESCRIPTION =
  'Rank tracker for roofers. Track roof repair, replacement and storm damage keywords on Google from every city you serve. Start a 7-day free trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'rank tracker for roofers, roofing rank tracker, roofer seo rank tracker, roofing keyword rank tracking, track roofing google rankings',
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
        alt: 'Rank Tracker for Roofers | Livesov',
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
    question: 'Which roofing keywords should I track?',
    answer:
      'Track repair, replacement and storm terms, the roof types you install, and city versions for each town in your service area.',
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
  name: 'Rank Tracker for Roofers',
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

export default function RankTrackerForRoofersPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Rank Tracker for Roofers', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Rank Tracker for Roofers"
        subtitle="A rank tracker for roofers that checks Google from the towns you work in. See where you rank for repair, replacement and storm damage jobs."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="rank tracker for roofers"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A rank tracker for roofers matters because roofers win jobs from Google, and
            most of those searches name a service and a city. Livesov tracks your position for
            each one, from the city where the customer searches.
          </p>

          <h2>Track the searches that bring calls</h2>
          <ul>
            <li>roof repair</li>
            <li>roof replacement</li>
            <li>storm damage roof repair</li>
            <li>metal roofing contractor</li>
            <li>roofer tampa</li>
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

          <h2>Ready for storm season</h2>
          <p>
            After a storm, searches spike in the towns that were hit. Track those towns ahead of time, so you know where you already rank and where you need work before the calls start.
          </p>

          <h2>Know when a ranking drops</h2>
          <p>
            Weekly checks come with every plan, daily checks with Agency. Set a rank drop alert and
            get an email or a Slack message when a money keyword falls, before the phone goes quiet.
          </p>

          <h2>For the agencies that serve roofers</h2>
          <p>
            Track every client from one login, send scheduled PDF reports, and give each client a
            read-only view of their rankings. Starter covers 250 keywords checked weekly for $19 a
            month.
          </p>

          <h2>And what AI says about you</h2>
          <p>
            More customers now ask ChatGPT or read Google&apos;s AI Overview before they call. See
            if they name you on <Link href="/uses/ai-visibility-for-roofers">AI visibility for roofers</Link>, or see every feature on
            the <Link href="/rank-tracker">rank tracker</Link> page.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Rank Tracker for Roofers: FAQ" items={faqs} />

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
