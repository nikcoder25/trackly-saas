import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  FeatureGrid,
  FaqSection,
  Callout,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';
import EmailOff from '@/components/EmailOff';

export const metadata: Metadata = {
  title: 'Livesov Data Access: Webhooks, Exports & Integrations',
  description:
    'How to get Livesov data out today - outbound webhooks, JSON and CSV exports, Google Sheets sync, Linear and Jira - and where the public REST API stands.',
  keywords:
    'livesov api, ai visibility api, geo api, llm tracking api, ai visibility webhooks, livesov data export',
  alternates: { canonical: '/integrations/api' },
  openGraph: {
    title: 'Livesov Data Access: Webhooks, Exports & Integrations',
    description: 'Every way to get Livesov data into your own systems today.',
    url: 'https://livesov.com/integrations/api',
    siteName: 'Livesov',
    type: 'article',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Livesov Data Access',
      },
    ],
  },
};

const available = [
  {
    icon: '🪝',
    title: 'Outbound webhook',
    description: 'A per-brand HTTPS endpoint that receives Fix Engine notifications as a JSON body with a text field. Slack-incoming-webhook compatible, so it also works with Zapier, Make, n8n, or your own service.',
  },
  {
    icon: '📄',
    title: 'JSON brand export',
    description: 'Download a brand and its full run history as JSON, straight from the dashboard. This is the complete record, not a summary.',
  },
  {
    icon: '📊',
    title: 'CSV export',
    description: 'Fix Engine results export to CSV for spreadsheets, BI tools, and client reporting.',
  },
  {
    icon: '📑',
    title: 'Scheduled PDF reports',
    description: 'Weekly or monthly client-ready reports, generated and emailed to a distribution list you configure.',
  },
  {
    icon: '🎫',
    title: 'Linear & Jira',
    description: 'Native tracker integrations. A fix becomes a real issue in your backlog, with the context attached.',
  },
  {
    icon: '🗒',
    title: 'Google Sheets',
    description: 'Connect a sheet and let Livesov write into it - the path most agencies use for always-current client dashboards.',
  },
];

const planned = [
  { icon: '🔑', title: 'API keys', description: 'Per-workspace keys with separate read and write scopes.' },
  { icon: '🌐', title: 'REST endpoints', description: 'Brands, prompts, runs, metrics, and citations over plain HTTP with bearer auth.' },
  { icon: '✍️', title: 'Signed webhooks', description: 'HMAC-SHA256 signatures and typed event payloads, so you can verify and route by event.' },
  { icon: '📦', title: 'SDKs', description: 'Thin TypeScript and Python wrappers over the REST surface.' },
];

const faqs = [
  {
    question: 'Does Livesov have a public REST API today?',
    answer:
      'No. There are no API keys to issue and no documented /v1 endpoints. Getting data out today means the outbound webhook, the JSON and CSV exports, the Google Sheets connection, or the Linear and Jira integrations - all of which are shipped and covered above. A REST API is in development; we would rather say that plainly than publish an endpoint table you cannot call.',
  },
  {
    question: 'How do I get Livesov data into my own systems right now?',
    answer:
      'Three routes, in rough order of how most teams use them. Point the brand webhook at a Zapier or Make catch hook and fan out from there. Connect a Google Sheet and read from it downstream. Or export the brand as JSON and load it into your own store - that export carries the full run history, so it is the right choice for a one-off backfill or an audit.',
  },
  {
    question: 'Are webhook requests signed?',
    answer:
      'Not today. Livesov POSTs a JSON body to the URL you configured, with no signature header. Treat the webhook URL itself as the secret, and prefer an endpoint that does not act on the payload without its own checks. Signed payloads ship with the public API.',
  },
  {
    question: 'Can I bring my own LLM API keys?',
    answer:
      'Yes, and this one is shipped. Agency-plan tenants can supply their own OpenAI, Anthropic, Google, Perplexity, and xAI keys, so every measurement call is billed and attributed to their own accounts. Everything else - parsing, scoring, dashboards, reports - works identically.',
  },
  {
    question: 'When will the API be available?',
    answer:
      'No date we are willing to commit to in public. If API access is what decides whether Livesov fits your stack, email us with what you need to call and we will tell you honestly where it stands rather than sell you a roadmap.',
  },
  {
    question: 'Can I trigger a measurement run programmatically?',
    answer:
      'Not through a public endpoint. Runs happen on the schedule you configure per brand, or on demand from the dashboard. Programmatic runs are part of the planned REST surface.',
  },
];

export default function ApiIntegrationPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Integrations', url: '/integrations' }, { name: 'API & data access', url: '/integrations/api' }]} />

      <SeoHero
        title={
          <>
            Getting your data{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              out of Livesov
            </span>
          </>
        }
        subtitle="Webhooks, JSON and CSV exports, Google Sheets, Linear and Jira - the routes that exist today, and a straight answer on where the public REST API stands."
        ctaText="Start free"
        ctaHref="/signup"
      />

      <Section pad="56px 24px 0" width={1000}>
        <Callout title="Read this first" variant="note">
          <strong>Livesov has no public REST API yet.</strong> There are no API keys to issue and no{' '}
          <code>/v1</code> endpoints to call. Everything in the next section is shipped and usable
          today; everything in the section after it is not. If you found this page looking for API
          docs, that is the honest answer — and the export and webhook routes below cover more
          workflows than people expect.
        </Callout>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
        <SectionHeader
          label="Available today"
          title="Six ways to get data out"
          subtitle="All shipped, all usable without talking to us first."
        />
        <FeatureGrid items={available} columns={3} />
      </Section>

      <Section pad="72px 24px">
        <SectionHeader
          label="In development"
          title="Not shipped — do not plan against these"
          subtitle="Listed so you know what is coming, and so nobody builds against something that does not exist yet."
        />
        <FeatureGrid items={planned} columns={4} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
        <LongForm>
          <h2>Picking a route</h2>
          <p>
            <strong>Real-time push → webhook.</strong> Set a public HTTPS URL per brand in{' '}
            <strong>Dashboard → Alerts</strong>. Livesov POSTs{' '}
            <code>{'{ "text": "…" }'}</code> to it for Fix Engine notifications. Because that shape
            is Slack-compatible, the same field drives{' '}
            <a href="/integrations/slack">Slack</a>, <a href="/integrations/zapier">Zapier</a>,
            Make, n8n, or your own endpoint with no adapter.
          </p>
          <p>
            <strong>A live spreadsheet → Google Sheets.</strong> Connect a sheet and Livesov writes
            into it. For agencies this is usually the fastest path to a client-facing dashboard,
            because the client already knows how to read a spreadsheet.
          </p>
          <p>
            <strong>Everything, once → JSON export.</strong> The brand export carries the full
            historical run record rather than a rollup, which makes it the right input for a
            warehouse load, an analyst notebook, or an audit.
          </p>
          <p>
            <strong>Work that needs doing → Linear or Jira.</strong> Connect a tracker and fixes
            arrive as real issues with their context attached, instead of as messages someone has to
            re-type into a backlog.
          </p>

          <h2>Bring your own keys</h2>
          <p>
            Enterprise and regulated customers often need every AI API call attributed to their own
            org account — for compliance, cost transparency, or a negotiated rate limit. Agency-plan
            tenants can supply their own keys for any combination of OpenAI, Anthropic, Google,
            Perplexity, and xAI. This is shipped, and unrelated to the REST API work.
          </p>

          <h2>If you need the API</h2>
          <p>
            Tell us what you would call and why. It genuinely shapes what gets built first, and you
            will get a straight answer about timing rather than a roadmap page. Email{' '}
            <EmailOff>
              <a href="mailto:hello@livesov.com">hello@livesov.com</a>
            </EmailOff>
            .
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Data access FAQ" items={faqs} />

      <PillarLinks
        title="More ways to plug Livesov in"
        links={[
          { href: '/integrations/wordpress', label: 'WordPress plugin', description: 'Apply approved fixes straight to your site.' },
          { href: '/integrations/slack', label: 'Slack', description: 'Updates in the channel your team lives in.' },
          { href: '/integrations/zapier', label: 'Zapier', description: 'Fan updates out to 5,000+ apps.' },
          { href: '/integrations', label: 'All integrations', description: 'Every LLM, alert route, and export format.' },
        ]}
      />
    </SeoLayout>
  );
}
