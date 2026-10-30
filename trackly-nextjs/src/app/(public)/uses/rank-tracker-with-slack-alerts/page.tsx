import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

// Batch 3 page of docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md.
// Rule types and channels follow src/lib/rank-tracking/rules.ts and alerts.ts
// (email, Slack incoming webhook, client logins; once per keyword per day).
// Pricing lists rank drop alerts on Agency.
const PATH = '/uses/rank-tracker-with-slack-alerts';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Rank Tracker with Slack Alerts | Know When Rankings Move | Livesov';
const DESCRIPTION =
  'Rank tracker with Slack alerts. Get a Slack message when a Google ranking drops, enters the top 10 or hits a new best. Start a 7-day free trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'rank tracker with slack alerts, rank tracking slack alerts, seo rank alerts slack, keyword ranking alerts, rank drop alerts',
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
        alt: 'Rank Tracker with Slack Alerts | Livesov',
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
    question: 'How do I connect Slack?',
    answer:
      'Create an incoming webhook in Slack for the channel you want, then paste its URL on the Clients tab of rank tracking. You can remove it at any time.',
  },
  {
    question: 'How often can an alert fire?',
    answer:
      'At most once per keyword per day, so a noisy keyword cannot flood the channel.',
  },
  {
    question: 'Which plan includes rank alerts?',
    answer:
      'Rank drop alerts are part of the Agency plan, along with daily checks and white-label reports.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Rank Tracker with Slack Alerts',
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

export default function RankTrackerWithSlackAlertsPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Rank Tracker', url: '/rank-tracker' },
          { name: 'Rank Tracker with Slack Alerts', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Rank Tracker with Slack Alerts"
        subtitle="A rank tracker with Slack alerts, so your team hears about a ranking change in the channel it already reads. Pick the rule, paste a webhook, done."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="rank tracker with slack alerts"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A rank tracker with Slack alerts puts ranking news where your team already talks. No
            one has to log in to notice a drop. The message lands in the channel the moment a check
            finishes.
          </p>

          <h2>Eight alert rules</h2>
          <ul>
            <li>Changes by more than a number of positions</li>
            <li>Gains or loses more than a number of positions</li>
            <li>Enters or leaves the top 3, top 10 or any top you set</li>
            <li>Reaches a new best or a new worst</li>
            <li>Gets mentioned by AI</li>
          </ul>

          <h2>Scope each rule</h2>
          <p>
            Apply a rule to one website, one keyword group or only starred keywords. Send money
            keyword drops to the team channel and keep the long tail quiet.
          </p>

          <h2>Slack, email or both</h2>
          <p>
            Each rule picks its channels. Slack goes to the channel behind your webhook. Email goes
            to the account owner. Client logins that can see the keyword get the alert too, so the
            client hears good news from you first.
          </p>

          <h2>No alert storms</h2>
          <p>
            A rule fires at most once per keyword per day. Dropping out of the results counts as a
            loss, and coming back counts as a gain, so you never miss the big moves.
          </p>

          <h2>Daily checks catch it sooner</h2>
          <p>
            Alerts fire after each check. On the Agency plan you can check money keywords daily,
            so a drop on Tuesday reaches Slack on Tuesday, not next week.
          </p>

          <h2>AI mentions too</h2>
          <p>
            The &quot;gets mentioned by AI&quot; rule tells you when ChatGPT, Gemini or Google&apos;s
            AI Overview starts naming your brand for a keyword. See every feature on the{' '}
            <Link href="/rank-tracker">rank tracker</Link> page, or check daily with the{' '}
            <Link href="/uses/daily-rank-tracker">daily rank tracker</Link>.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Rank Tracker with Slack Alerts: FAQ" items={faqs} />

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
