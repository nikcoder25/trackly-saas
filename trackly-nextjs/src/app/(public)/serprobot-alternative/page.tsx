import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 4 alternative page of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// A Google rank tracking alternative, so it does not use the AI visibility
// AlternativePage template. Say nothing about SERPROBOT's own pricing or features:
// only what Livesov does.
const PATH = '/serprobot-alternative';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'SERPROBOT Alternative | Rank Tracking Plus AI Visibility | Livesov';
const DESCRIPTION =
  'SERPROBOT alternative with city level Google rank tracking, client reports and AI visibility in one tool. Import your keywords. Free 7-day trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'serprobot alternative, serprobot alternatives, alternative to serprobot, serprobot replacement, switch from serprobot',
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
        alt: 'SERPROBOT Alternative | Livesov',
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
    question: 'Can I import my keywords from SERPROBOT?',
    answer:
      'Yes, if you can export them as a CSV with a keyword column. Livesov also reads URL, location, device, date and rank columns when they are there, so past positions come with the keywords.',
  },
  {
    question: 'Does the import use my credits?',
    answer:
      'The past checks you import are free. The keywords then join the weekly schedule, and those new checks use rank credits like any other keyword.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      'Yes. Every plan starts with a 7-day free trial, and no credit card is needed to start.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'SERPROBOT Alternative',
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

export default function SerprobotAlternativePage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'SERPROBOT Alternative', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="SERPROBOT Alternative"
        subtitle="A SERPROBOT alternative that tracks Google rankings and AI visibility in one place. Import your keywords, keep your history, and add client reports."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="serprobot alternative"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            SERPROBOT alternative searches often come from people who want more than a rank check. Livesov tracks your Google position by city, sends client reports, and shows whether AI assistants recommend you.
          </p>

          <h2>Bring your keywords and history</h2>
          <p>
            Export your keywords as a CSV and upload it under Rank tracking, then Add keywords,
            then Import from a CSV. Livesov reads keyword, URL, location, device, date and rank
            columns, so your past positions come across and your trend lines start full. Imported
            history costs nothing.
          </p>

          <h2>Google rankings by city</h2>
          <ul>
            <li>Organic positions from cities, states and countries worldwide</li>
            <li>Desktop and mobile</li>
            <li>Top 30 on every plan, top 100 on Pro and Agency</li>
            <li>Weekly checks, or daily on Agency</li>
          </ul>

          <h2>Reports and client access</h2>
          <ul>
            <li>PDF, HTML and CSV reports, emailed weekly or monthly</li>
            <li>A read-only login for each client on Pro and Agency</li>
            <li>White-label PDFs with your logo and colors on Agency</li>
            <li>Rank drop alerts by email or Slack</li>
          </ul>

          <h2>AI visibility in the same tool</h2>
          <p>
            Rankings are only part of the picture now. Buyers also ask ChatGPT, Gemini and
            Perplexity, and read Google&apos;s AI Overview before the results. Livesov shows your AI
            share of voice next to your Google position for the same brand, without a second tool.
          </p>

          <h2>Clear pricing</h2>
          <p>
            One credit is one keyword check to the top 30. Starter at $19 a month covers 250
            keywords checked weekly, Pro covers 1,000 and Agency covers 5,000. Every plan starts
            with a 7-day free trial, and you see the credit cost before you add keywords.
          </p>

          <h2>Is it the right fit?</h2>
          <p>
            Livesov fits agencies and local businesses that want Google rankings and AI visibility
            in one place. If you only need a single national rank for thousands of keywords, a
            pure rank tracker may suit you better. See every feature on the 
            <Link href="/rank-tracker">rank tracker</Link> page, or compare plans on 
            <Link href="/pricing">pricing</Link>.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="SERPROBOT Alternative: FAQ" items={faqs} />

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
