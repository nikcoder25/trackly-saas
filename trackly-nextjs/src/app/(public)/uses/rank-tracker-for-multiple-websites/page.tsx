import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 4 page of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// No cap on websites: limits are rank credits (RANK_CREDITS_BY_PLAN) only.
// Client logins on Pro and up, white-label PDFs and daily checks on Agency.
const PATH = '/uses/rank-tracker-for-multiple-websites';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Rank Tracker for Multiple Websites | No Site Limit | Livesov';
const DESCRIPTION =
  'Rank tracker for multiple websites. Track Google rankings for every site you run in one dashboard, with no limit on websites. Start a 7-day free trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'rank tracker for multiple websites, multi site rank tracker, track rankings for multiple websites, rank tracker multiple domains, unlimited websites rank tracker',
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
        alt: 'Rank Tracker for Multiple Websites | Livesov',
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
    question: 'Is there a limit on websites?',
    answer:
      'No. Add as many websites as you need. Your plan sets the rank credits, and one credit is one keyword check to the top 30.',
  },
  {
    question: 'Can each site use different cities?',
    answer:
      'Yes. Each keyword has its own city and device, so one site can track Austin and another can track London.',
  },
  {
    question: 'Can I see all sites at once?',
    answer:
      'Yes. The overview shows top 3, top 10, dropped keywords and average position across every website.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Rank Tracker for Multiple Websites',
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

export default function RankTrackerForMultipleWebsitesPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Rank Tracker for Multiple Websites', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Rank Tracker for Multiple Websites"
        subtitle="A rank tracker for multiple websites with no cap on how many sites you add. Every site, every keyword and every city in one dashboard."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="rank tracker for multiple websites"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A rank tracker for multiple websites should not charge you per site. Livesov has no limit
            on websites. You pay for keyword checks, and spread them across as many sites as you run.
          </p>

          <h2>All your sites in one view</h2>
          <ul>
            <li>Each website listed with its keyword count and average position</li>
            <li>Top 3, top 10 and not ranking at a glance</li>
            <li>Moved up and moved down since the last check</li>
            <li>An 8 week trend for every site</li>
          </ul>

          <h2>Each site set up its own way</h2>
          <p>
            Every keyword has its own city, device, depth and schedule. One site can track Austin on
            mobile every week, another can track London on desktop every day.
          </p>

          <h2>Who runs many sites</h2>
          <ul>
            <li>Agencies and freelancers with many clients</li>
            <li>Businesses with a site per location or brand</li>
            <li>Publishers and niche site owners</li>
            <li>In-house teams with country sites</li>
          </ul>

          <h2>Credits shared across every site</h2>
          <p>
            One credit is one keyword check to the top 30. Starter covers 250 keywords checked weekly,
            Pro 1,000 and Agency 5,000, split across sites however you like. You see the cost before
            you add keywords.
          </p>

          <h2>Reports per site or per group</h2>
          <p>
            Build a report for one website or one keyword group, and schedule it weekly or monthly.
            Each site owner gets only what is theirs.
          </p>

          <h2>Plus AI visibility</h2>
          <p>
            Each site&apos;s brand can also be tracked in ChatGPT, Gemini and Google&apos;s AI
            Overview. See every feature on the <Link href="/rank-tracker">rank tracker</Link> page.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Rank Tracker for Multiple Websites: FAQ" items={faqs} />

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
