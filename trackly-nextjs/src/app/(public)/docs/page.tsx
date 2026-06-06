import type { Metadata } from 'next';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, SectionHeader, LongForm, PillarLinks } from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'Livesov Docs: Help Center, Getting Started & API Reference',
  description:
    'Documentation for Livesov — the AI visibility tracker. Setup guides, prompt configuration, alerts, exports, API reference, and integration walkthroughs.',
  keywords:
    'livesov docs, livesov help, livesov api docs, ai visibility tracker docs, geo tool docs, llm tracking docs',
  alternates: { canonical: '/docs' },
  openGraph: {
    title: 'Livesov Docs',
    description: 'Documentation for the Livesov AI visibility tracker.',
    url: 'https://livesov.com/docs',
    siteName: 'Livesov',
    type: 'website',
  },
};

interface DocSection {
  title: string;
  items: Array<{ title: string; description: string; href: string }>;
}

const DOC_SECTIONS: DocSection[] = [
  {
    title: 'Getting started',
    items: [
      { title: 'Quickstart in 5 minutes', description: 'Create your account, add your first brand, run your first measurement.', href: '/docs#quickstart' },
      { title: 'Add a brand', description: 'Brand setup, competitors, category, and tracked URLs.', href: '/docs#add-brand' },
      { title: 'Build your prompt panel', description: 'Generate, import, or write the prompts that define your measurement scope.', href: '/docs#prompts' },
      { title: 'Pick which LLMs to track', description: 'ChatGPT, Claude, Gemini, Perplexity, and Grok — model tiers and grounding options.', href: '/docs#llms' },
    ],
  },
  {
    title: 'Measurement & metrics',
    items: [
      { title: 'Mention rate', description: 'How we calculate per-platform and per-prompt mention rate.', href: '/docs#mention-rate' },
      { title: 'Citation share', description: 'How citations are detected and attributed on grounded surfaces.', href: '/docs#citation-share' },
      { title: 'Sentiment', description: 'Our 5-point sentiment scale and how it is scored.', href: '/docs#sentiment' },
      { title: 'Rank in answer', description: 'First-paragraph, mid-answer, last-mention — the three rank tiers.', href: '/docs#rank' },
    ],
  },
  {
    title: 'Workflows',
    items: [
      { title: 'Alerts & notifications', description: 'Slack, email, and webhook alerts on mention-rate drops and competitor moves.', href: '/docs#alerts' },
      { title: 'Reports & exports', description: 'Scheduled PDF reports, CSV exports, and the Livesov Reports Library.', href: '/docs#reports' },
      { title: 'Team & collaboration', description: 'Roles, permissions, multi-brand workspaces, and seat management.', href: '/docs#team' },
      { title: 'Multi-brand & agencies', description: 'Manage 5–500 brands in one Livesov account with white-label reports.', href: '/docs#agency' },
    ],
  },
  {
    title: 'Integrations',
    items: [
      { title: 'Slack integration', description: 'Real-time alerts and weekly digests in any Slack channel.', href: '/integrations/slack' },
      { title: 'Zapier integration', description: '5,000+ apps via Zapier triggers and actions.', href: '/integrations/zapier' },
      { title: 'REST API', description: 'Pull metrics, write prompts, and stream events programmatically.', href: '/integrations/api' },
      { title: 'Webhooks', description: 'Push events into your stack the moment they happen.', href: '/docs#webhooks' },
    ],
  },
  {
    title: 'Optimization guides',
    items: [
      { title: 'How to improve mention rate', description: 'The diagnostic-first playbook for moving a brand from invisible to default.', href: '/learn/llm-seo' },
      { title: 'AI Overviews optimization', description: 'Win and hold a citation in Google AI Overviews.', href: '/learn/ai-overviews-optimization' },
      { title: 'AI search optimization', description: 'The companion pillar for AI search surfaces.', href: '/learn/ai-search-optimization' },
      { title: 'GEO playbook', description: 'The broader Generative Engine Optimization framework.', href: '/geo-optimization' },
    ],
  },
  {
    title: 'Account & billing',
    items: [
      { title: 'Plans & pricing', description: 'All tiers, what is included, and how to upgrade or downgrade.', href: '/pricing' },
      { title: 'Billing & invoices', description: 'Cards, invoices, VAT, and changing your billing email.', href: '/docs#billing' },
      { title: 'Security & privacy', description: 'How we handle your data, our security posture, and SOC 2 status.', href: '/docs#security' },
      { title: 'Support', description: 'Live chat, email, and your account manager (Pro and above).', href: '/contact' },
    ],
  },
];

export default function DocsHubPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Docs', url: '/docs' }]} />

      <SeoHero
        title={
          <>
            Livesov{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              Documentation
            </span>
          </>
        }
        subtitle="Setup, measurement, workflows, integrations, and the optimization playbooks that ship inside the product. Searchable, AI-citable, kept current."
        ctaText="Get started"
        ctaHref="#quickstart"
      />

      <Section pad="40px 24px 80px" width={1080}>
        {DOC_SECTIONS.map((section) => (
          <div key={section.title} style={{ marginBottom: 56 }}>
            <SectionHeader title={section.title} />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 14,
              }}
            >
              {section.items.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  style={{
                    background: '#fff',
                    border: '1px solid var(--card-border, #e8e5e1)',
                    borderRadius: 12,
                    padding: 20,
                    textDecoration: 'none',
                    transition: 'all .15s',
                  }}
                  className="pillar-link"
                >
                  <h3
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      margin: '0 0 6px',
                    }}
                  >
                    {item.title} <span style={{ color: 'var(--brand, #6366f1)' }}>→</span>
                  </h3>
                  <p
                    style={{
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {item.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
        <LongForm>
          <h2 id="quickstart">Quickstart in 5 minutes</h2>
          <ol>
            <li>
              <strong>Create your account.</strong> <a href="/signup">Sign up free</a> — no
              credit card required.
            </li>
            <li>
              <strong>Add your brand.</strong> Brand name, primary domain, and the 3–5
              competitors you care about most.
            </li>
            <li>
              <strong>Pick a prompt source.</strong> Use our AI prompt generator to seed 40 starter
              prompts, import a CSV, or write your own.
            </li>
            <li>
              <strong>Run your first measurement.</strong> Livesov queries ChatGPT, Claude,
              Gemini, Perplexity, and Grok in parallel and returns mention rate, citation share,
              sentiment, and rank.
            </li>
            <li>
              <strong>Set alerts.</strong> Slack or email when mention rate drops more than 5
              points or a competitor passes you.
            </li>
          </ol>

          <h2 id="prompts">Building a prompt panel</h2>
          <p>
            A good prompt panel covers four prompt families:{' '}
            <strong>category-defining</strong> (&quot;best CRM for startups&quot;),{' '}
            <strong>comparison</strong> (&quot;HubSpot vs Salesforce&quot;),{' '}
            <strong>problem-led</strong> (&quot;how do I track outbound emails&quot;), and{' '}
            <strong>brand-led</strong> (&quot;is HubSpot good for enterprise&quot;). Aim for 30–60
            prompts per brand. Refresh quarterly.
          </p>

          <h2 id="llms">Choosing which LLMs to track</h2>
          <p>
            Livesov tracks ChatGPT (default + Search), Claude (Opus, Sonnet, Haiku), Gemini (Pro,
            Flash; grounded + ungrounded), Perplexity (Sonar family), and Grok. Most teams enable
            all five. If you must prioritise, ChatGPT and Perplexity are the highest-leverage
            starting set.
          </p>

          <h2 id="alerts">Alerts</h2>
          <p>
            Alerts fire on three signals: mention-rate drop above a threshold, sentiment shift,
            and competitor pass-through. Routes: email, Slack, generic webhook. See the{' '}
            <a href="/integrations/slack">Slack integration</a> for the most common setup.
          </p>

          <p>
            Looking for something not covered here? Email{' '}
            <a href="mailto:hello@livesov.com">hello@livesov.com</a> — we read everything.
          </p>
        </LongForm>
      </Section>

      <PillarLinks
        title="Adjacent"
        links={[
          { href: '/learn/llm-seo', label: 'LLM SEO: the 2026 guide', description: 'The conceptual playbook the product is built on.' },
          { href: '/case-studies', label: 'Case studies', description: 'Real teams running the workflows in this doc.' },
          { href: '/integrations', label: 'All integrations', description: 'Slack, Zapier, API, webhooks, and exports.' },
          { href: '/pricing', label: 'Pricing', description: 'Plan that fits — from solo to multi-brand agency.' },
        ]}
      />
    </SeoLayout>
  );
}
