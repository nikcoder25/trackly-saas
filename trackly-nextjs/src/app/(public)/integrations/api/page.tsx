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

export const metadata: Metadata = {
  title: 'Livesov API: Programmatic AI Visibility Tracking (REST + Webhooks)',
  description:
    'Build directly against the Livesov AI visibility platform. REST endpoints for mention rate, citations, sentiment, and rank. Webhooks for real-time events.',
  keywords:
    'livesov api, ai visibility api, geo api, llm tracking api, chatgpt mention api, ai search api, generative engine optimization api',
  alternates: { canonical: '/integrations/api' },
  openGraph: {
    title: 'Livesov API: Programmatic AI Visibility',
    description: 'REST endpoints and webhooks for AI mention rate, citations, sentiment, and rank.',
    url: 'https://livesov.com/integrations/api',
    siteName: 'Livesov',
    type: 'article',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Livesov API: Programmatic AI Visibility',
      },
    ],
  },
};

const endpoints = [
  { icon: 'GET', title: '/v1/brands', description: 'List, create, update, and delete tracked brands. Includes competitor sets and tracked URLs.' },
  { icon: 'GET', title: '/v1/prompts', description: 'Manage the prompt panel for any brand - list, add, update, delete, or bulk-import.' },
  { icon: 'GET', title: '/v1/runs', description: 'Trigger a measurement run or fetch results from a previous run, scoped by brand, prompt, or LLM.' },
  { icon: 'GET', title: '/v1/metrics', description: 'Aggregated mention rate, citation share, sentiment, and rank-in-answer over any time range.' },
  { icon: 'GET', title: '/v1/citations', description: 'The full list of cited URLs detected for any brand or prompt across grounded LLM surfaces.' },
  { icon: 'POST', title: '/v1/reports', description: 'Generate a PDF or CSV report on demand for any brand and time range.' },
];

const webhooks = [
  { icon: '◆', title: 'mention_rate.dropped', description: 'A tracked brand\'s mention rate dropped past your configured threshold on an LLM.' },
  { icon: '◆', title: 'competitor.passed', description: 'A competitor overtook your brand on mention rate, citation share, or rank.' },
  { icon: '◆', title: 'citation.created', description: 'A new third-party URL began citing your brand on a grounded LLM surface.' },
  { icon: '◆', title: 'sentiment.shifted', description: 'Net sentiment for a brand or prompt moved past your threshold.' },
  { icon: '◆', title: 'report.ready', description: 'A scheduled or on-demand report finished generating and is ready to fetch.' },
  { icon: '◆', title: 'run.completed', description: 'A measurement run completed (useful for cron-driven measurement flows).' },
];

const sample = `curl https://api.livesov.com/v1/metrics \\
  -H "Authorization: Bearer $LIVESOV_API_KEY" \\
  -d brand_id=br_abc123 \\
  -d range=30d \\
  -d llms=chatgpt,perplexity,gemini

# {
#   "brand_id": "br_abc123",
#   "range": "30d",
#   "metrics": {
#     "chatgpt":    { "mention_rate": 0.64, "citation_share": 0.21, ... },
#     "perplexity": { "mention_rate": 0.71, "citation_share": 0.18, ... },
#     "gemini":     { "mention_rate": 0.58, "citation_share": 0.14, ... }
#   }
# }`;

const sampleWebhook = `POST https://your.app/webhooks/livesov
Content-Type: application/json
X-Livesov-Signature: sha256=...

{
  "type": "mention_rate.dropped",
  "id": "evt_01h...",
  "occurred_at": "2026-06-06T09:31:22Z",
  "brand": { "id": "br_abc123", "name": "Northwind" },
  "llm": "chatgpt",
  "metric": {
    "previous": 0.64,
    "current": 0.51,
    "delta_pp": -13
  },
  "prompts_affected": [ "prompt_01h...", "prompt_01h..." ]
}`;

const faqs = [
  { question: 'How do I get an API key?', answer: 'Settings → API in your Livesov dashboard. Keys are per-workspace; rotate any time. Read and write scopes are separate.' },
  { question: 'What are the rate limits?', answer: 'Default: 60 requests per minute per workspace, 10,000 per day. Higher limits available on Scale and Enterprise plans.' },
  { question: 'Is the API REST or GraphQL?', answer: 'REST today. We use standard HTTP verbs, JSON request/response bodies, and bearer-token auth. A GraphQL layer is on the roadmap for late 2026.' },
  { question: 'How are webhooks authenticated?', answer: 'HMAC-SHA256 signatures via the X-Livesov-Signature header. Use the signing secret from your webhook config to verify every payload.' },
  { question: 'Is there a Node / Python SDK?', answer: 'Official TypeScript and Python SDKs ship in the docs. Both wrap REST + webhook signature verification + retries.' },
  { question: 'Can I use the API on the free plan?', answer: 'Read-only API access is included on the free trial. Write endpoints and webhooks require any paid plan.' },
];

export default function ApiIntegrationPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Integrations', url: '/integrations' }, { name: 'API', url: '/integrations/api' }]} />

      <SeoHero
        title={
          <>
            Livesov{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              REST API
            </span>
          </>
        }
        subtitle="Programmatic access to every Livesov surface - brands, prompts, runs, metrics, citations, and reports. REST endpoints plus signed webhooks for real-time events."
        ctaText="Get an API key"
        ctaHref="/signup"
      />

      <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px">
        <SectionHeader label="Endpoints" title="Six resources, full CRUD" subtitle="REST conventions, JSON in and out, bearer-token auth." />
        <FeatureGrid items={endpoints} columns={3} />
      </Section>

      <Section pad="64px 24px" width={820}>
        <SectionHeader title="A request, end-to-end" subtitle="Fetch mention rate across three LLMs for one brand over 30 days." />
        <pre
          style={{
            background: '#0f172a',
            color: '#e2e8f0',
            padding: 24,
            borderRadius: 12,
            overflowX: 'auto',
            fontSize: 13.5,
            lineHeight: 1.6,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          }}
        >
          {sample}
        </pre>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px">
        <SectionHeader label="Webhooks" title="Six real-time events" subtitle="Signed with HMAC-SHA256, delivered with automatic retry + idempotency keys." />
        <FeatureGrid items={webhooks} columns={3} />
      </Section>

      <Section pad="64px 24px" width={820}>
        <SectionHeader title="A webhook payload" />
        <pre
          style={{
            background: '#0f172a',
            color: '#e2e8f0',
            padding: 24,
            borderRadius: 12,
            overflowX: 'auto',
            fontSize: 13.5,
            lineHeight: 1.6,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          }}
        >
          {sampleWebhook}
        </pre>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
        <LongForm>
          <h2>What teams build on the API</h2>
          <ul>
            <li><strong>Custom dashboards.</strong> Stream metrics into your own data warehouse, then visualise in Looker / Metabase / Tableau.</li>
            <li><strong>White-label client reports.</strong> Agencies render branded PDFs nightly via the report endpoint.</li>
            <li><strong>CRM enrichment.</strong> Append AI share-of-voice to every account record in Salesforce or HubSpot.</li>
            <li><strong>Programmatic prompt management.</strong> Auto-generate prompt panels from a content calendar or product launch list.</li>
            <li><strong>Real-time PR rapid-response.</strong> Webhook into PagerDuty or Linear when a competitor lands a major citation.</li>
          </ul>

          <Callout title="Docs and SDKs" variant="info">
            Full REST reference, webhook signature verification, and official TypeScript + Python
            SDKs live at <a href="/docs">/docs</a>.
          </Callout>
        </LongForm>
      </Section>

      <FaqSection title="API FAQ" items={faqs} />

      <PillarLinks
        title="More ways to plug Livesov in"
        links={[
          { href: '/integrations/slack', label: 'Slack integration', description: 'Native real-time alerts in Slack channels.' },
          { href: '/integrations/zapier', label: 'Zapier integration', description: '5,000+ apps without code.' },
          { href: '/integrations', label: 'All integrations', description: 'Every LLM, alert route, and export format.' },
          { href: '/docs', label: 'Docs', description: 'API reference, SDKs, and integration guides.' },
        ]}
      />
    </SeoLayout>
  );
}
