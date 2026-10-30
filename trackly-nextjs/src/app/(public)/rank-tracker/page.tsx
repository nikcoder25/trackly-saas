import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, PillarLinks, JsonLd } from '@/components/seo/SeoSections';

// Hub for the Google rank tracking pages (compact keyword plan in
// docs/seo/2026-10-30-rank-tracker-bofu-page-plan.md). Keep the claims in line
// with src/lib/rank-tracking/* and the rankFeatures in lib/constants.ts:
// organic positions only (no Maps grid, no local pack), daily checks and
// white-label PDFs on Agency, top 100 on Pro and up. Link each new
// rank tracking page from a PillarLinks group here when it ships.
const PATH = '/rank-tracker';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'Rank Tracker and AI Visibility | Google + ChatGPT | Livesov';
const DESCRIPTION =
  'Rank tracker and AI visibility in one tool. Track Google rankings by city next to how ChatGPT, Gemini and Perplexity mention you. Free 7-day trial.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords:
    'rank tracker and ai visibility, seo and ai visibility tracker, google rank tracker with ai visibility, keyword rank tracker, rank tracker for agencies',
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
        alt: 'Rank tracker and AI visibility | Livesov',
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

const AI_PAGES = [
  {
    href: '/uses/ai-overview-tracker',
    label: 'AI Overview tracker',
    description: 'See if Google\'s AI Overview and AI Mode name you, and which pages they cite.',
  },
  {
    href: '/chatgpt-rank-tracker',
    label: 'ChatGPT rank tracker',
    description: 'See where ChatGPT names your brand for the prompts your buyers ask.',
  },
  {
    href: '/gemini-rank-tracker',
    label: 'Gemini rank tracker',
    description: 'Track your position in Gemini answers over time.',
  },
  {
    href: '/perplexity-rank-tracker',
    label: 'Perplexity rank tracker',
    description: 'Track Perplexity mentions and the sources it cites.',
  },
  {
    href: '/llm-rank-tracker',
    label: 'LLM rank tracker',
    description: 'One view of every AI engine: ChatGPT, Gemini, Claude, Perplexity and Grok.',
  },
];

const AGENCY_PAGES = [
  {
    href: '/uses/rank-tracker-for-agencies',
    label: 'Rank tracker for agencies',
    description: 'Every client website, a read-only client login and branded reports.',
  },
  {
    href: '/uses/white-label-rank-tracker',
    label: 'White label rank tracker',
    description: 'Rank reports and client logins with your logo, name and colors.',
  },
  {
    href: '/solutions/agencies',
    label: 'Livesov for agencies',
    description: 'Every client, their Google rankings and their AI visibility in one login.',
  },
  {
    href: '/pricing',
    label: 'Rank tracking plans',
    description: 'Rank credits per plan, from 250 keywords checked weekly on Starter.',
  },
];

const SWITCH_PAGES = [
  {
    href: '/serpfox-alternative',
    label: 'Serpfox alternative',
    description: 'Import your Serpfox CSV with its ranking history in one step.',
  },
];

const faqs = [
  {
    question: 'What does the rank tracker check?',
    answer:
      'Your organic Google position for each keyword, from the city you choose, on desktop or mobile. Checks go to the top 30, or the top 100 on Pro and Agency. Ads, the local pack and AI Overviews are not counted as a ranking.',
  },
  {
    question: 'How often are rankings checked?',
    answer:
      'Weekly on every paid plan. Daily checks are available on the Agency plan.',
  },
  {
    question: 'Can I send branded rank reports to clients?',
    answer:
      'Yes. Pro includes client share links. Agency adds white-label PDF reports with your agency name, logo and colors, plus rank drop alerts.',
  },
  {
    question: 'Can I move my keywords from another rank tracker?',
    answer:
      'Yes. Upload a Serpfox export, or any rank tracker CSV in the same shape, and your keywords and their ranking history come with it.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Rank Tracker and AI Visibility',
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

export default function RankTrackerHubPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Rank Tracker', url: PATH }]} />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="Rank Tracker and AI Visibility in One Tool"
        subtitle="Rank tracker and AI visibility, side by side. See where you rank on Google in each city, and whether ChatGPT, Gemini and Perplexity name you for the same search."
        ctaText="Start free trial"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="rank tracker and AI visibility dashboard"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 64px">
        <LongForm>
          <p>
            A rank tracker and AI visibility tool answers two questions in one place. Where do I
            rank on Google? Does AI recommend me? Most teams pay for two tools to get both. With
            Livesov, both numbers sit in the same row.
          </p>

          <h2>Google rankings by city</h2>
          <p>Pick a keyword and a city. Livesov checks your organic position there.</p>
          <ul>
            <li>Any US city, so a plumber in Dallas sees Dallas results</li>
            <li>Desktop and mobile</li>
            <li>Top 30 on every plan, top 100 on Pro and Agency</li>
            <li>Weekly checks, or daily on Agency</li>
          </ul>

          <h2>AI visibility next to every ranking</h2>
          <p>
            A page can rank #1 on Google and still be missing from ChatGPT. Livesov shows your
            Google position and your AI share of voice for the same brand, so you see the gap
            right away. For the AI side on its own, see the engine trackers below.
          </p>

          <h2>Reports your clients will read</h2>
          <ul>
            <li>Client share links on Pro</li>
            <li>White-label PDF reports with your logo and colors on Agency</li>
            <li>Rank drop alerts, including to Slack, on Agency</li>
            <li>CSV exports of every check</li>
          </ul>

          <h2>Bring your keywords with you</h2>
          <p>
            Moving from Serpfox or another tool? Upload the CSV export. Your keywords, cities and
            ranking history come across, so the trend lines start full.
          </p>

          <h2>Plans and credits</h2>
          <p>
            One credit is one keyword check to the top 30. Starter at $19 a month covers 250
            keywords checked weekly. Pro covers 1,000 and Agency covers 5,000. Every plan starts
            with a 7-day free trial. See the full breakdown on <Link href="/pricing">pricing</Link>.
          </p>
        </LongForm>
      </Section>

      <PillarLinks title="Track AI rankings by engine" links={AI_PAGES} />
      <PillarLinks title="For agencies" links={AGENCY_PAGES} />
      <PillarLinks title="Switching rank trackers" links={SWITCH_PAGES} />

      <FaqSection title="Rank tracker: FAQ" items={faqs} />

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
