import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd, Callout } from '@/components/seo/SeoSections';

// NOTE: Livesov has no logo upload, custom domain or report rebranding today
// (see src/lib/pdf-report.ts header). Keep this page honest: describe the
// branding options that exist (custom report title + note, API, JSON export)
// and do not promise "your logo" until the feature ships.
const PATH = '/uses/white-label-ai-visibility-report';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'White Label AI Visibility Report | Agency Options | Livesov';
const DESCRIPTION =
  'Looking for a white label AI visibility report? See what Livesov client reports include and how agencies brand the data today. Try it free.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords:
    'white label ai visibility report, ai visibility report for clients, agency ai search report, chatgpt visibility report, ai seo client report',
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
        alt: 'White label AI visibility report options for agencies | Livesov',
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
    question: 'Can I put my agency logo on Livesov reports?',
    answer:
      'Not yet. Exported PDFs carry Livesov branding. You can set a custom title and note on custom reports, and on the Agency plan you can pull the data through the API into your own branded template.',
  },
  {
    question: 'Which AI platforms does the report cover?',
    answer:
      'ChatGPT, Gemini, Claude, Perplexity and Grok. The Agency plan includes all five. Lower plans track two or three platforms.',
  },
  {
    question: 'Which plan includes PDF reports?',
    answer:
      'PDF reports and scheduled weekly or monthly reports are available on Pro and Agency. The free trial lets you test them first.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'White Label AI Visibility Report',
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

export default function WhiteLabelAiVisibilityReportPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Use Cases', url: '/uses' },
          { name: 'White Label AI Visibility Report', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="White Label AI Visibility Report"
        subtitle="Give every client a clear report on how ChatGPT, Gemini, Claude and Perplexity talk about their business. Here is what Livesov reports include today, and how agencies make them their own."
        ctaText="Try it free"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="White label AI visibility report dashboard"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 80px">
        <LongForm>
          <p>
            A white label AI visibility report lets an agency show clients how AI assistants
            mention their brand, under the agency&apos;s own name. Clients now ask &ldquo;does
            ChatGPT recommend us?&rdquo; and they want the answer in a report, not a screenshot.
            Livesov gives you the data and the report. Here is exactly what you get, so there are
            no surprises.
          </p>

          <h2>Branding your report: what works today</h2>
          <Callout title="Straight answer" variant="note">
            Livesov does not offer full white label yet. There is no logo upload or custom domain,
            and exported PDFs carry Livesov branding.
          </Callout>
          <p>What you can do today:</p>
          <ul>
            <li>
              <strong>Custom report title and note.</strong> The custom report builder lets you
              pick the prompts and mentions to include and set your own title and note, such as
              &ldquo;Prepared by your agency for your client&rdquo;.
            </li>
            <li>
              <strong>API access on the Agency plan.</strong> Pull the numbers into your own
              branded template, slide deck or client portal.
            </li>
            <li>
              <strong>Data export.</strong> Export a brand&apos;s full tracking data as JSON and
              rebuild it in any reporting tool you already use.
            </li>
          </ul>
          <p>
            If you want a ready layout to drop the numbers into, start from our free{' '}
            <Link href="/resources/ai-visibility-report-template">AI visibility report template</Link>.
          </p>

          <h2>One dashboard for every client</h2>
          <p>
            Pro and Agency plans include unlimited brands. Each client is its own brand with its
            own prompts, competitors and history, and you switch between them from one login. On
            Pro and Agency, tracking runs automatically every day, so the data is fresh when you
            open the report.
          </p>

          <h2>What the report shows</h2>
          <p>The standard PDF report covers:</p>
          <ul>
            <li>An executive summary with share of voice and the change since the last run</li>
            <li>A breakdown for each AI platform you track</li>
            <li>Top performing prompts and their mention rate</li>
            <li>Competitors named in the same AI answers</li>
            <li>The source domains AI cited in its answers</li>
            <li>Suggested next steps to grow AI share of voice</li>
          </ul>
          <p>
            You can also schedule a new PDF weekly or monthly. Each one is saved to report
            history, ready to download before the client call.
          </p>

          <h2>Add AI visibility to your retainer</h2>
          <p>
            For a local SEO agency, AI visibility is a natural add on. You already fix citations,
            reviews and Google Business Profiles. Now you can show whether that work gets the
            client named by ChatGPT and Gemini. A monthly report gives you something concrete to
            review together and a reason to keep the retainer going.
          </p>
          <p>
            See how other agencies set this up on the{' '}
            <Link href="/solutions/agencies">Livesov for agencies</Link> page, or{' '}
            <Link href="/signup">start free</Link> and build your first client report today.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="White label AI visibility report: FAQ" items={faqs} />

      <Section pad="56px 24px 80px" width={820}>
        <div style={{ textAlign: 'center' }}>
          <Link href="/signup" className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 16 }}>
            Build your first client report free
          </Link>
        </div>
      </Section>
    </SeoLayout>
  );
}
