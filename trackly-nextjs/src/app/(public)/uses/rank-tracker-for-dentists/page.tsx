import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 3 niche page of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Organic Google positions only (no Maps grid or local pack). Links to the
// matching AI visibility page so both sides of the niche cluster connect.
const PATH = '/uses/rank-tracker-for-dentists';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Rank Tracker for Dentists | Track Google by City | Livesov';
const DESCRIPTION =
  'Rank tracker for dentists. Track implant, emergency and family dental keywords on Google from the neighborhoods you serve. Start a 7-day free trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'rank tracker for dentists, dental rank tracker, dentist seo rank tracker, dental keyword rank tracking, track dental practice rankings',
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
        alt: 'Rank Tracker for Dentists | Livesov',
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
    question: 'Which dental keywords should I track?',
    answer:
      'Track each treatment you want more patients for, emergency terms, and city or neighborhood versions for the areas you serve.',
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
  name: 'Rank Tracker for Dentists',
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

export default function RankTrackerForDentistsPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Rank Tracker for Dentists', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Rank Tracker for Dentists"
        subtitle="A rank tracker for dentists that checks Google from the neighborhoods your patients live in. See where you rank for implants, emergencies and family care."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/rank-tracker-shot.webp"
          alt="rank tracker for dentists"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A rank tracker for dentists matters because dentists win new patients from Google, and
            most of those searches name a service and a city. Livesov tracks your position for
            each one, from the city where the patient searches.
          </p>

          <h2>Track the searches that bring patients</h2>
          <ul>
            <li>emergency dentist</li>
            <li>dental implants</li>
            <li>teeth whitening</li>
            <li>family dentist</li>
            <li>dentist denver</li>
          </ul>
          <p>
            Add them in one batch. Keywords that name a city, like the last one, are checked from
            that city on their own.
          </p>

          <h2>Checked from your patients&apos; neighborhoods, on mobile</h2>
          <p>
            Most of these searches happen on a phone, close to home. Pick a city for each keyword,
            pick mobile or desktop, and see the result your patients see. Track several towns in
            your service area to find where you are strong and where you are not.
          </p>

          <h2>High value treatments in focus</h2>
          <p>
            Implants and cosmetic work bring in the most per patient. Group those keywords, star them, and watch them closely in every report.
          </p>

          <h2>Know when a ranking drops</h2>
          <p>
            Weekly checks come with every plan, daily checks with Agency. Set a rank drop alert and
            get an email or a Slack message when a money keyword falls, before bookings slow down.
          </p>

          <h2>For the agencies that serve dentists</h2>
          <p>
            Track every client from one login, send scheduled PDF reports, and give each client a
            read-only view of their rankings. Starter covers 250 keywords checked weekly for $19 a
            month.
          </p>

          <h2>And what AI says about you</h2>
          <p>
            More patients now ask ChatGPT or read Google&apos;s AI Overview before they call. See
            if they name you on <Link href="/uses/ai-visibility-for-dentists">AI visibility for dentists</Link>, or see every feature on
            the <Link href="/rank-tracker">rank tracker</Link> page.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Rank Tracker for Dentists: FAQ" items={faqs} />

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
