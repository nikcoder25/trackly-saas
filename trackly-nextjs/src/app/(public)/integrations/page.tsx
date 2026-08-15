import type { Metadata } from 'next';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  StatsBar,
  FaqSection,
  Callout,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'Livesov Integrations | AI Visibility Tracker & API',
  description:
    'Connect Livesov\'s AI visibility tracker to ChatGPT, Perplexity, Claude, Gemini, and Grok, with alerts, webhooks, and CSV, JSON, and PDF exports.',
  keywords:
    'livesov integrations, ai api integrations, chatgpt api integration, anthropic api integration, gemini api integration, perplexity api integration, xai api integration, webhook alerts, ai brand tracking integrations',
  alternates: { canonical: '/integrations' },
  openGraph: {
    title: 'Livesov Integrations | AI Visibility Tracker & API',
    description:
      'Connect Livesov\'s AI visibility tracker to ChatGPT, Perplexity, Claude, Gemini, and Grok, with alerts, webhooks, and CSV, JSON, and PDF exports.',
    url: 'https://livesov.com/integrations',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Integrations - AI Platforms, Alerts & Exports | Livesov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov Integrations | AI Visibility Tracker & API',
    description:
      'Connect Livesov\'s AI visibility tracker to ChatGPT, Perplexity, Claude, Gemini, and Grok, with alerts, webhooks, and CSV, JSON, and PDF exports.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const platforms = [
  {
    name: 'ChatGPT (OpenAI)',
    color: '#10a37f',
    href: '/chatgpt-brand-tracking',
    models: 'GPT-5 · GPT-5 mini · GPT-5 Search · o-series reasoning',
    desc: 'Track brand visibility across every ChatGPT model OpenAI ships. Direct API access with full request/response logging.',
    surfaces: ['ChatGPT consumer app', 'ChatGPT Enterprise', 'ChatGPT Search', 'API-embedded apps'],
  },
  {
    name: 'Claude (Anthropic)',
    color: '#d97706',
    href: '/claude-brand-tracking',
    models: 'Claude Opus 4.5 · Sonnet 4.5 · Haiku 4.5 · Sonnet 4 (legacy)',
    desc: 'Track every Claude tier from Opus to Haiku. Direct Anthropic API access with model-tier comparison built in.',
    surfaces: ['Claude.ai', 'Claude in Notion / Slack / Quora', 'Claude API integrations', 'Claude in Cursor / Windsurf'],
  },
  {
    name: 'Gemini (Google)',
    color: '#4285f4',
    href: '/gemini-brand-tracking',
    models: 'Gemini 3 Pro · 3 Flash · Flash-Lite · grounded variants',
    desc: 'Track Gemini API responses plus grounded variants that simulate Google AI Overviews. Vertex and AI Studio supported.',
    surfaces: ['Google AI Overviews', 'Gemini app (mobile + web)', 'Workspace AI (Gmail / Docs / Meet)', 'Android assistant'],
  },
  {
    name: 'Perplexity',
    color: '#20b8cd',
    href: '/perplexity-brand-tracking',
    models: 'Sonar · Sonar Pro · Sonar Reasoning · Sonar Deep Research',
    desc: 'Full Sonar-family API access with complete citation capture - every source URL logged in rank order.',
    surfaces: ['Perplexity.ai (web)', 'Perplexity mobile apps', 'Perplexity Pages', 'Embedded Perplexity widgets'],
  },
  {
    name: 'Grok (xAI)',
    color: '#1d9bf0',
    href: '/grok-brand-tracking',
    models: 'Grok 5 · Grok 4 · Grok 4 Mini · live-search variant',
    desc: 'Direct xAI API with real-time X (Twitter) signal correlation. Surface social-driven visibility shifts as they happen.',
    surfaces: ['Grok inside X (Twitter)', 'Grok standalone app', 'Grok web (grok.com)', 'xAI API integrations'],
  },
];

const channels = [
  {
    icon: '✉',
    title: 'Email alerts',
    items: [
      'Visibility-change alerts (configurable thresholds)',
      'Hallucination flags with the exact quote',
      'Competitor-overtake notifications',
      'Weekly / monthly scheduled summary reports',
    ],
  },
  {
    icon: '⟁',
    title: 'Outbound webhook',
    items: [
      'One HTTPS endpoint per brand, set in Dashboard → Alerts',
      'Slack-incoming-webhook payload shape',
      'Drives Slack, Zapier, Make, n8n, or your own service',
      'Carries Fix Engine notifications today',
    ],
  },
  {
    icon: '⇩',
    title: 'Data exports',
    items: [
      'JSON brand export with the full run history',
      'CSV export of Fix Engine results',
      'PDF reports (client-ready, one click)',
      'Google Sheets sync for live client dashboards',
    ],
  },
  {
    icon: '⚙',
    title: 'Bring your own keys',
    items: [
      'OpenAI key for ChatGPT tracking',
      'Anthropic key for Claude tracking',
      'Google AI Studio / Vertex for Gemini',
      'Perplexity + xAI keys for Sonar and Grok',
    ],
  },
];

const faqs = [
  {
    question: 'How does Livesov connect to each AI platform?',
    answer:
      'Direct API integration. Livesov calls the official OpenAI, Anthropic, Google, Perplexity, and xAI APIs for every query - no scraping, no proxies, no UI automation. That means audit-grade reliability and clean, reproducible measurement.',
  },
  {
    question: 'Do I have to bring my own API keys?',
    answer:
      'No - Livesov\'s credits cover all AI API calls out of the box. Bring-your-own-key is supported on the Agency plan for compliance, attribution, or to use your own enterprise rate limits.',
  },
  {
    question: 'Are there webhook integrations?',
    answer:
      'Yes, one: a per-brand outbound HTTPS webhook, configured in Dashboard → Alerts. It carries Fix Engine notifications as a JSON body with a text field. Requests are not signed today and there is no per-event-type routing or dashboard re-delivery - those ship with the public API. See the API page for what exists versus what is planned.',
  },
  {
    question: 'Can I send alerts directly to Slack?',
    answer:
      'You can point the brand webhook at a Slack incoming webhook - the payload shape matches, so messages render properly with no adapter. There is no Livesov app in the Slack directory and no OAuth flow; a native app is on the roadmap. Mention-rate and competitor alerts go out by email today rather than through the webhook.',
  },
  {
    question: 'What export formats are supported?',
    answer:
      'JSON (a full brand export including the complete run history), CSV (Fix Engine results), and PDF (client-ready reports, on demand or scheduled weekly or monthly). A Google Sheets connection is also available for teams who want a live sheet rather than a download.',
  },
  {
    question: 'Is there a public API?',
    answer:
      'Not yet. There are no API keys and no documented REST endpoints today - a public API is in development. Programmatic access right now means the outbound webhook, the JSON and CSV exports, or the Google Sheets connection. If API access decides whether Livesov fits your stack, email us and we will tell you honestly where it stands.',
  },
  {
    question: 'Will Livesov add support for new AI platforms as they launch?',
    answer:
      'Yes. We track the LLM landscape continuously and add new platforms or models within days of release. Recent additions: Claude 4.5 family, Gemini 3 family, Grok 5, Perplexity Sonar Deep Research.',
  },
];

export default function IntegrationsPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Integrations', url: '/integrations' }]} />

      <SeoHero
        title={
          <>
            Integrated with <span className="text-[var(--brand)]">5 AI platforms</span> - and your stack
          </>
        }
        subtitle="Direct API access to ChatGPT, Claude, Gemini, Perplexity, and Grok. Plus email alerts, an outbound webhook that drives Slack and Zapier, JSON / CSV / PDF exports, and bring-your-own-key support on Agency plans."
        ctaText="Start integrating - free"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '5', label: 'AI platforms (all majors)' },
            { value: '15+', label: 'AI models tracked' },
            { value: '3', label: 'Export formats (CSV / JSON / PDF)' },
            { value: 'BYOK', label: 'On Agency plans' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="AI platform integrations"
          title="Every major AI platform, every model that matters"
          subtitle="Direct API integration with the official OpenAI, Anthropic, Google, Perplexity, and xAI endpoints. No scraping, no simulation, no fragile UI automation."
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 18,
          }}
        >
          {platforms.map((p) => (
            <Link
              key={p.name}
              href={p.href}
              style={{
                display: 'block',
                background: '#fff',
                border: '1px solid var(--card-border, #e8e5e1)',
                borderRadius: 16,
                padding: 26,
                textDecoration: 'none',
                color: 'inherit',
                transition: 'all .18s',
              }}
              className="pillar-link"
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}
                >
                  {p.name}
                </h3>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    padding: '3px 9px',
                    borderRadius: 100,
                    color: p.color,
                    background: `${p.color}14`,
                    border: `1px solid ${p.color}33`,
                  }}
                >
                  Live
                </span>
              </div>
              <p
                style={{
                  fontSize: 14,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.7,
                  margin: '0 0 14px',
                }}
              >
                {p.desc}
              </p>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  color: 'var(--text-muted, #94a3b8)',
                  marginBottom: 4,
                }}
              >
                Models
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: 'var(--text-primary)',
                  marginBottom: 14,
                  lineHeight: 1.5,
                }}
              >
                {p.models}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  color: 'var(--text-muted, #94a3b8)',
                  marginBottom: 6,
                }}
              >
                Surfaces tracked
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {p.surfaces.map((s) => (
                  <li
                    key={s}
                    style={{
                      fontSize: 11.5,
                      padding: '3px 8px',
                      background: 'rgba(99,102,241,.06)',
                      border: '1px solid rgba(99,102,241,.16)',
                      borderRadius: 100,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
        <style>{`
          .pillar-link:hover {
            border-color: var(--brand, #6366f1) !important;
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(99,102,241,.1);
          }
        `}</style>
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="Alerts, exports, & data flow"
          title="Get your AI visibility data where you need it"
          subtitle="Email, webhooks, CSV, JSON, PDF - every metric Livesov captures can be pushed out to your existing tools."
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 18,
          }}
        >
          {channels.map((c) => (
            <div
              key={c.title}
              style={{
                background: '#fff',
                border: '1px solid var(--card-border, #e8e5e1)',
                borderRadius: 14,
                padding: 26,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'rgba(99,102,241,.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                  }}
                  aria-hidden="true"
                >
                  {c.icon}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  {c.title}
                </h3>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {c.items.map((item) => (
                  <li
                    key={item}
                    style={{
                      fontSize: 13.5,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.6,
                      marginBottom: 8,
                      paddingLeft: 18,
                      position: 'relative',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 1,
                        color: '#10b981',
                        fontWeight: 700,
                      }}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <LongForm>
          <h2>Why direct API integration matters</h2>
          <p>
            A lot of AI tracking tools claim &quot;ChatGPT tracking&quot; and quietly mean
            &quot;we screenshot the ChatGPT web UI.&quot; Screenshotting is fragile, rate-limited,
            cached, and breaks every time the platform ships a UI change. The data you get
            back is noisy and impossible to audit.
          </p>
          <p>
            Livesov uses official API access for every platform. That gives us four things that
            matter to you: <strong>reproducibility</strong> (the same prompt + the same model =
            the same call, every time), <strong>auditability</strong> (every metric links to a
            raw, billable API response with full headers and tokens), <strong>scale</strong>
            {' '}(hundreds of prompts per minute without anyone noticing), and{' '}
            <strong>completeness</strong> (citations, tool calls, model-specific metadata that
            the UI never surfaces).
          </p>

          <h2>Bring your own keys (Agency plan)</h2>
          <p>
            Enterprise and regulated customers often want every AI API call attributed to their
            own org account - for compliance, cost transparency, or to use a negotiated rate
            limit. Agency-plan tenants can drop in their own keys for any combination of OpenAI,
            Anthropic, Google, Perplexity, and xAI. All other Livesov functionality (parsing,
            scoring, dashboards, alerts) works identically.
          </p>

          <h2>Webhooks &amp; alerting</h2>
          <p>
            Each brand carries one outbound HTTPS webhook, set in{' '}
            <strong>Dashboard → Alerts</strong>. Livesov POSTs a JSON body with a{' '}
            <code>text</code> field, which is the shape Slack&rsquo;s incoming webhooks expect -
            so the same URL field drives Slack, a Zapier or Make catch hook, n8n, or your own
            endpoint without an adapter in between. Fix Engine notifications flow through it
            today; mention-rate drops, competitor moves, and scheduled reports go out by email.
          </p>
          <p>
            Two things it does not do yet, worth knowing before you design around it: requests
            carry no HMAC signature, and there is no per-event-type routing or re-delivery of
            failed sends. Both belong to the public API work.
          </p>

          <Callout title="What is not built yet" variant="note">
            There is no public REST API, no API keys, no Livesov app in the Slack or Zapier
            directories, and no native HubSpot, Salesforce, Teams, or n8n integration. All of
            that is roadmap. What exists today is the outbound webhook, the exports, the Google
            Sheets connection, native Linear and Jira trackers, and the{' '}
            <a href="/integrations/wordpress">WordPress plugin</a> - see{' '}
            <a href="/integrations/api">API &amp; data access</a> for the full picture.
          </Callout>

          <h2>Exports &amp; reporting</h2>
          <p>
            A brand exports to JSON carrying its complete historical run record rather than a
            rollup, which makes it the right input for a warehouse load or an analyst notebook.
            Fix Engine results export to CSV for spreadsheets and client reporting. PDF reports
            are built for client and stakeholder delivery - share of voice, sentiment, and
            citations, generated in one click on any plan.
          </p>
          <p>
            Scheduled reports (weekly or monthly) deliver the same PDFs by email to a
            distribution list you configure. Pair them with email alerts for an end-to-end
            measurement system that runs without anyone logging into the dashboard.
          </p>
        </LongForm>
      </Section>

      <FaqSection
        title="Integrations FAQ"
        subtitle="Common questions about Livesov&rsquo;s API access, alerts, exports, and BYOK support."
        items={faqs}
      />

      <PillarLinks
        title="Connect Livesov to your stack"
        links={[
          {
            href: '/integrations/wordpress',
            label: 'WordPress plugin',
            description: 'Apply approved llms.txt, schema, and draft page fixes to your site.',
          },
          {
            href: '/integrations/slack',
            label: 'Slack',
            description: 'Real-time alerts and weekly digests in any channel.',
          },
          {
            href: '/integrations/zapier',
            label: 'Zapier',
            description: '5,000+ apps via Zapier triggers and actions.',
          },
          {
            href: '/integrations/api',
            label: 'REST API',
            description: 'Read every metric and push events programmatically.',
          },
        ]}
      />

      <PillarLinks
        title="Explore Livesov by platform"
        links={[
          {
            href: '/chatgpt-brand-tracking',
            label: 'ChatGPT brand tracking',
            description: 'GPT-5, GPT-5 mini, ChatGPT Search - all tracked.',
          },
          {
            href: '/perplexity-brand-tracking',
            label: 'Perplexity brand tracking',
            description: 'Full Sonar family with complete citation capture.',
          },
          {
            href: '/claude-brand-tracking',
            label: 'Claude brand tracking',
            description: 'Opus, Sonnet, Haiku - tuned for nuanced answers.',
          },
          {
            href: '/gemini-brand-tracking',
            label: 'Gemini brand tracking',
            description: 'Pro, Flash, Flash-Lite + AI Overviews simulation.',
          },
          {
            href: '/grok-brand-tracking',
            label: 'Grok brand tracking',
            description: 'Real-time X-grounded Grok with live signal correlation.',
          },
          {
            href: '/pricing',
            label: 'Pricing & plans',
            description: 'Find the plan that fits your monitoring cadence.',
          },
        ]}
      />
    </SeoLayout>
  );
}
