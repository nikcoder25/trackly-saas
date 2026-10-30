import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 1, page 2 of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Claims follow src/lib/rank-tracking/{clients,reports,credits}.ts and the
// rankFeatures in lib/constants.ts: client logins on Pro and up, white-label
// PDFs, daily checks and rank drop alerts on Agency.
const PATH = '/uses/rank-tracker-for-agencies';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Rank Tracker for Agencies | Every Client in One Login | Livesov';
const DESCRIPTION =
  'Rank tracker for agencies. Track every client\'s Google rankings by city, give clients a read-only login and send branded reports. Free 7-day trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'rank tracker for agencies, agency rank tracker, rank tracker for seo agencies, rank tracking for agencies, seo agency rank tracker',
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
        alt: 'Rank tracker for agencies | Livesov',
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
    question: 'How many client websites can I track?',
    answer:
      'There is no limit on websites. The limit is rank credits: one credit is one keyword check to the top 30. Agency includes 20,000 credits a month, which covers 5,000 keywords checked weekly across all clients.',
  },
  {
    question: 'Can clients log in and see their own rankings?',
    answer:
      'Yes, on Pro and Agency. Each client gets a private link to a read-only view of their own websites, keyword groups or starred keywords. Revoke it at any time.',
  },
  {
    question: 'Can reports carry my agency brand?',
    answer:
      'Yes, on Agency. PDF reports use your agency name, logo and colors, and can be emailed to clients weekly or monthly.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Rank Tracker for Agencies',
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

export default function RankTrackerForAgenciesPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Rank Tracker for Agencies', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Rank Tracker for Agencies"
        subtitle="A rank tracker for agencies that keeps every client in one login. Track Google rankings city by city, give each client their own view, and send reports with your brand on them."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/rank-tracker-shot.webp"
          alt="rank tracker for agencies"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A rank tracker for agencies has one job: show each client where they rank, without
            hours of reporting work. Livesov keeps every client website, keyword and report in one
            dashboard.
          </p>

          <h2>Every client in one dashboard</h2>
          <ul>
            <li>Add a website for each client, with no cap on websites</li>
            <li>Group keywords by service, location or campaign</li>
            <li>Star the keywords a client cares about most</li>
            <li>See top 3, top 10 and dropped keywords across all clients at a glance</li>
          </ul>

          <h2>Rankings where the client&apos;s customers search</h2>
          <p>
            A roofer in Tampa does not care about national results. Check each keyword from the
            client&apos;s own city, on desktop or mobile. Weekly checks come with every plan, and
            daily checks with Agency.
          </p>

          <h2>A login for each client</h2>
          <p>
            Give a client a private link to a read-only view of their rankings. You choose what
            they see: whole websites, keyword groups or only starred keywords. Revoke the link at
            any time.
          </p>

          <h2>Branded reports that send themselves</h2>
          <ul>
            <li>PDF, HTML or CSV, with or without graphs</li>
            <li>Your agency name, logo and colors on Agency</li>
            <li>Emailed to clients weekly or monthly</li>
            <li>Optional AI visibility section, so the client sees ChatGPT and Gemini too</li>
          </ul>

          <h2>Know before the client does</h2>
          <p>
            Rank drop alerts tell you when a client keyword falls, by email or in Slack. You can
            fix it before the monthly call.
          </p>

          <h2>Google rank and AI visibility in one report</h2>
          <p>
            Clients now ask two questions: where do we rank on Google, and does ChatGPT recommend
            us? Livesov tracks both for the same brand. You show the Google position and the AI
            share of voice side by side, and you sell one retainer that covers both.
          </p>

          <h2>Switching from another tool</h2>
          <p>
            Upload a Serpfox CSV, or any export in the same shape. Keywords, cities and ranking
            history come across. See plans and credits on <Link href="/pricing">pricing</Link>,
            or read more about running client work on <Link href="/solutions/agencies">Livesov
            for agencies</Link>.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Rank tracker for agencies: FAQ" items={faqs} />

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
