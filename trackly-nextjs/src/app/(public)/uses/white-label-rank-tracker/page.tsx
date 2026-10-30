import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 1, page 3 of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Branding = agency name, logo and accent color (src/lib/rank-tracking/
// reports.ts getBranding), used on HTML/PDF reports and the /client/<token>
// view. The custom domain field is saved but nothing serves the client view on
// it yet, so do not promise a custom domain here.
const PATH = '/uses/white-label-rank-tracker';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'White Label Rank Tracker | Your Logo on Every Report | Livesov';
const DESCRIPTION =
  'White label rank tracker for agencies. Send Google ranking reports and client logins with your logo, agency name and colors. Free 7-day trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'white label rank tracker, white label rank tracking, white label keyword rank tracker, white label seo rank reports, branded rank tracking reports',
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
        alt: 'White label rank tracker | Livesov',
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
    question: 'Which plan includes white label reports?',
    answer:
      'The Agency plan. It includes white-label PDF reports, daily checks, rank drop alerts and 20,000 rank credits a month. Every plan starts with a 7-day free trial.',
  },
  {
    question: 'What can I brand?',
    answer:
      'Your agency name, your logo and your accent color. They appear on PDF and HTML rank reports and on the read-only view each client logs in to.',
  },
  {
    question: 'Can I use my own domain for the client view?',
    answer:
      'Not yet. Client links open on livesov.com, with your logo, name and colors on the page.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'White Label Rank Tracker',
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

export default function WhiteLabelRankTrackerPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'White Label Rank Tracker', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="White Label Rank Tracker"
        subtitle="A white label rank tracker puts your agency in front of the client, not the software. Send Google ranking reports and client logins with your logo, name and colors."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="white label rank tracker"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            White label rank tracker reports from Livesov carry your brand from top to bottom.
            Set your branding once. Every report and every client view uses it.
          </p>

          <h2>Your brand on every report</h2>
          <ul>
            <li>Your agency name in the header</li>
            <li>Your logo in place of ours</li>
            <li>Your accent color on charts and links</li>
            <li>Turn branding on or off for each report</li>
          </ul>

          <h2>PDF, HTML and CSV reports</h2>
          <p>
            Pick the format the client likes. PDF and HTML come with or without ranking graphs.
            CSV gives the raw positions, or only the keywords that changed. Each report can cover
            a whole website, one keyword group or only starred keywords.
          </p>

          <h2>Reports that send themselves</h2>
          <p>
            Schedule a report weekly or monthly and add up to 10 recipients. It lands in the
            client&apos;s inbox with your brand on it. You do not open a spreadsheet.
          </p>

          <h2>A branded login for each client</h2>
          <p>
            Give a client a private link to a read-only view of their rankings. Your logo, name
            and colors sit at the top of the page. You choose what they see, and you can revoke
            the link at any time.
          </p>

          <h2>Rankings worth putting your name on</h2>
          <ul>
            <li>Organic Google positions from the client&apos;s own city</li>
            <li>Desktop and mobile</li>
            <li>Top 30, or top 100 on Pro and Agency</li>
            <li>Daily checks on Agency</li>
          </ul>

          <h2>Built for agencies and freelancers</h2>
          <p>
            Local SEO agencies, freelancers and marketing teams use it to report on many clients
            without showing a third-party tool. There is no cap on client websites. Rank credits
            cover the checks: Agency includes 20,000 a month, enough for 5,000 keywords checked
            weekly.
          </p>

          <h2>Add AI visibility to the same report</h2>
          <p>
            Clients now ask if ChatGPT recommends them. Add the AI visibility section to a report
            and show Google rank and AI share of voice together. See all rank tracking features on
            the <Link href="/rank-tracker">rank tracker</Link> page, or how agencies run every
            client in one login on <Link href="/uses/rank-tracker-for-agencies">rank tracker for
            agencies</Link>.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="White label rank tracker: FAQ" items={faqs} />

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
