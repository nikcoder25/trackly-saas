import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 1, page 4 of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// A Google rank tracking alternative, so it does not use the AI visibility
// AlternativePage template. The import is src/lib/rank-tracking/import.ts via
// the "Import from a CSV" panel on /dashboard/rank-tracking/add. Say nothing
// about Serpfox's own pricing or features: only what Livesov does.
const PATH = '/serpfox-alternative';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Serpfox Alternative | Import Your Keywords and History | Livesov';
const DESCRIPTION =
  'Serpfox alternative with CSV import. Bring your keywords and ranking history, track Google by city, and add AI visibility. Free 7-day trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'serpfox alternative, serpfox alternatives, serpfox replacement, switch from serpfox, serpfox import',
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
        alt: 'Serpfox alternative | Livesov',
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
    question: 'Which CSV files can I import?',
    answer:
      'A Serpfox export, or any rank tracker CSV with a keyword column. Livesov reads URL, location, device, date and rank columns when they are there, in either one row per keyword or one row per check.',
  },
  {
    question: 'Does the import use my credits?',
    answer:
      'The past checks you import are free. The keywords then join the weekly schedule, and those new checks use rank credits like any other keyword.',
  },
  {
    question: 'What if a keyword has no location?',
    answer:
      'Pick a city on the import form. Livesov checks those keywords from there. Rows whose place cannot be matched are skipped and listed after the import.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Serpfox Alternative',
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

export default function SerpfoxAlternativePage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Serpfox Alternative', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Serpfox Alternative"
        subtitle="A Serpfox alternative that keeps your history. Upload your export, and your keywords and past rankings move over in one step. Then add AI visibility on top."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/rank-tracker-shot.webp"
          alt="serpfox alternative"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            Serpfox alternative searches usually start with one worry: losing years of ranking
            history. With Livesov you keep it. The import reads your CSV and brings every keyword
            with its past positions.
          </p>

          <h2>Move over in three steps</h2>
          <ol>
            <li>Export your keywords as a CSV</li>
            <li>In Livesov, open Rank tracking, then Add keywords, then Import from a CSV</li>
            <li>Upload the file. Keywords, sites, cities, devices and past ranks come across</li>
          </ol>
          <p>
            Imported history is free. Your trend lines start full on day one, and new checks
            continue from there.
          </p>

          <h2>Keep your setup tidy after the move</h2>
          <p>
            Each site in your file becomes its own website in Livesov. Sort keywords into groups
            by service, city or campaign. Star the ones a client watches most. Keywords that name
            a place, like &quot;plumber austin&quot;, can be checked from that place on their own.
          </p>

          <h2>Google rankings by city</h2>
          <ul>
            <li>Organic positions from any US city</li>
            <li>Desktop and mobile</li>
            <li>Top 30 on every plan, top 100 on Pro and Agency</li>
            <li>Weekly checks, or daily on Agency</li>
          </ul>

          <h2>Reports and client access</h2>
          <ul>
            <li>PDF, HTML and CSV reports, emailed weekly or monthly</li>
            <li>A read-only login for each client on Pro and Agency</li>
            <li>White-label PDFs with your logo and colors on Agency</li>
            <li>Rank drop alerts by email or Slack on Agency</li>
          </ul>

          <h2>What you get on top: AI visibility</h2>
          <p>
            Ranking on Google is half the picture now. Buyers also ask ChatGPT, Gemini and
            Perplexity. Livesov shows your AI share of voice next to your Google position for the
            same brand, so you see where you rank and where AI leaves you out.
          </p>

          <h2>Plans</h2>
          <p>
            One credit is one keyword check to the top 30. Starter at $19 a month covers 250
            keywords checked weekly, Pro covers 1,000 and Agency covers 5,000. Every plan starts
            with a 7-day free trial. See <Link href="/pricing">pricing</Link>, all features on
            the <Link href="/rank-tracker">rank tracker</Link> page, or how agencies run every
            client on <Link href="/uses/rank-tracker-for-agencies">rank tracker for agencies</Link>.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Serpfox alternative: FAQ" items={faqs} />

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
