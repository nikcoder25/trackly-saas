import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 2, page 8 of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Daily checks are Agency only (DAILY_PLANS in rank-tracking/credits.ts). A
// daily keyword uses 30 credits a month, so Agency's 20,000 = about 660
// keywords daily at top 30. Say Agency plainly.
const PATH = '/uses/daily-rank-tracker';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Daily Rank Tracker | Google Rankings Checked Every Day | Livesov';
const DESCRIPTION =
  'Daily rank tracker for Google. Check positions every day from any city, get alerts when rankings drop, and see each daily move in reports. Free trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'daily rank tracker, daily rank tracking, daily keyword rank tracker, daily serp tracker, check rankings daily',
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
        alt: 'Daily Rank Tracker | Livesov',
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
    question: 'Which plan includes daily checks?',
    answer:
      'The Agency plan, at $129 a month. Pro and Starter check weekly.',
  },
  {
    question: 'How many keywords can I check daily?',
    answer:
      'A daily keyword uses 30 credits a month. Agency includes 20,000 credits, which covers about 660 keywords checked daily to the top 30, or a mix of daily and weekly keywords.',
  },
  {
    question: 'Can some keywords be daily and others weekly?',
    answer:
      'Yes. You pick the frequency each time you add keywords, so you can check money keywords daily and the rest weekly.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Daily Rank Tracker',
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

export default function DailyRankTrackerPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Daily Rank Tracker', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Daily Rank Tracker"
        subtitle="A daily rank tracker for the keywords you cannot wait a week on. Livesov checks your Google position every day and tells you when it drops."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/rank-tracker-shot.webp"
          alt="daily rank tracker"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A daily rank tracker catches a drop the morning it happens, not a week later. Livesov
            checks your keywords on Google every day and keeps the full history.
          </p>

          <h2>Every day, from the right city</h2>
          <ul>
            <li>A fresh check every 24 hours</li>
            <li>Checked from the city you choose, on desktop or mobile</li>
            <li>Top 30 or top 100</li>
            <li>The ranking page saved with each check</li>
          </ul>

          <h2>Alerts when it matters</h2>
          <p>
            Set a rank drop alert and Livesov tells you by email or in Slack when a keyword falls.
            You see it the same day and can act before traffic slips.
          </p>

          <h2>Daily where it counts, weekly for the rest</h2>
          <p>
            Pick the frequency for each set of keywords you add. Check your money keywords daily and
            the long tail weekly. You see the credit cost before you save.
          </p>

          <h2>What it costs</h2>
          <p>
            Daily checks are on the Agency plan at $129 a month. A daily keyword uses 30 credits a
            month, and Agency includes 20,000. That covers about 660 keywords checked daily, or more
            if some are weekly. The plan also adds white-label reports and rank drop alerts.
          </p>

          <h2>Daily data in your reports</h2>
          <p>
            Reports and CSV exports carry every daily position, so clients see the full trend line.
            Add the AI section and they see AI visibility next to it.
          </p>

          <h2>When daily checks pay off</h2>
          <ul>
            <li>After a site migration or redesign</li>
            <li>During a Google core update</li>
            <li>For money keywords that drive most leads</li>
            <li>When a client wants proof a fix worked this week</li>
          </ul>

          <h2>Not sure you need daily?</h2>
          <p>
            Most keywords move slowly, and weekly checks on Starter or Pro are enough. Start with
            the 7-day free trial, then compare plans on <Link href="/pricing">pricing</Link> or see
            every feature on the <Link href="/rank-tracker">rank tracker</Link> page.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Daily Rank Tracker: FAQ" items={faqs} />

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
