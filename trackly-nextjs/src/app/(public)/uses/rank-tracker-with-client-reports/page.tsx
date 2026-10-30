import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 2, page 6 of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Report formats, columns and schedules follow src/lib/rank-tracking/reports.ts.
// Keep the focus on reports and client access; branding has its own page
// (/uses/white-label-rank-tracker).
const PATH = '/uses/rank-tracker-with-client-reports';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Rank Tracker with Client Reports | Sent on Schedule | Livesov';
const DESCRIPTION =
  'Rank tracker with client reports. Send Google ranking reports as PDF, HTML or CSV, weekly or monthly, and give each client a login. Free 7-day trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'rank tracker with client reports, keyword rank tracker with client reports, rank tracking reports for clients, seo rank report for clients, automated rank reports',
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
        alt: 'Rank Tracker with Client Reports | Livesov',
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
    question: 'Who can receive a scheduled report?',
    answer:
      'Up to 10 email addresses per report. Each scheduled report covers the last week or the last month, depending on its schedule.',
  },
  {
    question: 'Can a report cover only some keywords?',
    answer:
      'Yes. A report can cover a whole website, one keyword group, or only the keywords you starred.',
  },
  {
    question: 'Can I put my agency logo on reports?',
    answer:
      'Yes, on the Agency plan. Reports can carry your agency name, logo and colors. See the white label rank tracker page for details.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Rank Tracker with Client Reports',
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

export default function RankTrackerWithClientReportsPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Rank Tracker with Client Reports', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Rank Tracker with Client Reports"
        subtitle="A rank tracker with client reports built in. Pick the keywords, pick the format, and Livesov emails the report to your client every week or month."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="rank tracker with client reports"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A rank tracker with client reports saves the hours you spend copying positions into
            slides. Set a report up once. Livesov builds it from fresh checks and sends it on time.
          </p>

          <h2>Six report formats</h2>
          <ul>
            <li>PDF, with or without ranking graphs</li>
            <li>HTML, with or without ranking graphs</li>
            <li>CSV with every position by date</li>
            <li>CSV of changes: start rank, end rank and the move</li>
          </ul>

          <h2>What each report shows</h2>
          <ul>
            <li>Keyword, city and device</li>
            <li>Current rank and best rank</li>
            <li>The page that ranks</li>
            <li>Group and starred keywords</li>
            <li>Optional: whether the keyword shows up in AI answers</li>
          </ul>

          <h2>Sent on a schedule</h2>
          <p>
            Choose weekly or monthly and add up to 10 recipients. A weekly report covers the last
            week, a monthly report the last month. Need a one-off? Pick any date range and download
            it.
          </p>

          <h2>Only the keywords that matter</h2>
          <p>
            Clients do not want 500 rows. Build a report for one keyword group, like &quot;service
            pages&quot;, or only for starred keywords. Each client gets the report that fits them.
          </p>

          <h2>A login between reports</h2>
          <p>
            On Pro and Agency, give each client a private link to a read-only view of their
            rankings. They check in any time, and the report becomes a summary, not a surprise.
          </p>

          <h2>Less reporting work every month</h2>
          <p>
            Most agencies lose a day a month to rank reports: export, clean up, paste into slides,
            send. Here the report builds itself from the latest checks. You spend that time on the
            work that moves rankings, and the client still gets a clear report on the same day each
            week or month.
          </p>

          <h2>Google rank and AI in one report</h2>
          <p>
            Turn on the AI section and the same report shows whether ChatGPT, Gemini and
            Google&apos;s AI Overview mention the client. See every feature on the{' '}
            <Link href="/rank-tracker">rank tracker</Link> page, or put your own brand on the
            reports with the <Link href="/uses/white-label-rank-tracker">white label rank
            tracker</Link>.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Rank Tracker with Client Reports: FAQ" items={faqs} />

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
