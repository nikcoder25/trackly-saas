import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 4 page of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// No cap on websites: limits are rank credits (RANK_CREDITS_BY_PLAN) only.
// Client logins on Pro and up, white-label PDFs and daily checks on Agency.
const PATH = '/uses/rank-tracker-for-seo-freelancers';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Rank Tracker for SEO Freelancers | Every Client from $19 | Livesov';
const DESCRIPTION =
  'Rank tracker for SEO freelancers. Track every client site on Google by city, send scheduled reports and look bigger than you are. Free 7-day trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'rank tracker for seo freelancers, freelance seo rank tracker, rank tracker for freelancers, seo consultant rank tracker, rank tracking for consultants',
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
        alt: 'Rank Tracker for SEO Freelancers | Livesov',
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
    question: 'How many client sites can I add?',
    answer:
      'As many as you like. There is no limit on websites, only on rank credits. Starter covers 250 keywords checked weekly across all your clients.',
  },
  {
    question: 'Can I send reports under my own name?',
    answer:
      'Every report has its own title. On the Agency plan, reports also carry your logo and colors.',
  },
  {
    question: 'Can clients see their rankings without a login?',
    answer:
      'On Pro and Agency, each client gets a private link to a read-only view of their own rankings.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Rank Tracker for SEO Freelancers',
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

export default function RankTrackerForSeoFreelancersPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Rank Tracker for SEO Freelancers', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Rank Tracker for SEO Freelancers"
        subtitle="A rank tracker for SEO freelancers that keeps every client in one login. Track Google by city, send reports on schedule, and keep your monthly cost low."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="rank tracker for seo freelancers"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A rank tracker for SEO freelancers has to be cheap to run and quick to report from. You
            have no team to build slides. Livesov tracks every client and sends the report for you.
          </p>

          <h2>Every client, one login</h2>
          <ul>
            <li>No limit on client websites</li>
            <li>Group keywords by service or city for each client</li>
            <li>Star the keywords each client watches most</li>
            <li>See top 3, top 10 and dropped keywords across every client</li>
          </ul>

          <h2>Costs that fit a freelance budget</h2>
          <p>
            Starter is $19 a month for 250 keywords checked weekly, shared across all clients. Pro
            covers 1,000 keywords and adds the top 100 and client links. You can bill tracking into
            each retainer and keep the margin.
          </p>

          <h2>Reports without the late nights</h2>
          <p>
            Set up a PDF, HTML or CSV report per client and schedule it weekly or monthly. It goes
            out on its own, built from the latest checks. Add the AI section and the client also
            sees what ChatGPT and Google&apos;s AI Overview say about them.
          </p>

          <h2>Look like a bigger shop</h2>
          <p>
            On Pro, each client gets a private link to a read-only view of their rankings. On Agency,
            reports carry your logo and colors. Clients see a clear system, not a spreadsheet.
          </p>

          <h2>Win the next client with data</h2>
          <p>
            Add a prospect&apos;s site, track a handful of their keywords for a week, and walk into
            the sales call with real positions from their own city. It costs a few credits.
          </p>

          <h2>Bring your old data</h2>
          <p>
            Moving from another tool? Import a CSV and keep your ranking history. See every feature
            on the <Link href="/rank-tracker">rank tracker</Link> page, or how bigger teams use it on{' '}
            <Link href="/uses/rank-tracker-for-agencies">rank tracker for agencies</Link>.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Rank Tracker for SEO Freelancers: FAQ" items={faqs} />

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
