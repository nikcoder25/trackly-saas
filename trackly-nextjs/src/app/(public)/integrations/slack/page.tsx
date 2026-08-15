import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  FeatureGrid,
  ProcessSteps,
  FaqSection,
  Callout,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'Livesov + Slack: Send AI Visibility Updates to Any Channel',
  description:
    'Point Livesov at a Slack incoming webhook and get Fix Engine updates and issue hand-offs in the channel your team already lives in. Two minutes, no app install.',
  keywords:
    'livesov slack, ai visibility slack alerts, chatgpt mention slack, ai search alerts slack, geo slack webhook, llm alerts slack',
  alternates: { canonical: '/integrations/slack' },
  openGraph: {
    title: 'Livesov + Slack: AI Visibility Updates in Any Channel',
    description: 'Send Livesov updates to Slack with an incoming webhook.',
    url: 'https://livesov.com/integrations/slack',
    siteName: 'Livesov',
    type: 'article',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Livesov + Slack',
      },
    ],
  },
};

const features = [
  {
    icon: '🔧',
    title: 'Fix Engine updates',
    description: 'Status summaries from the Fix Engine post straight into the channel — what was found, what shipped, what failed and why.',
  },
  {
    icon: '🎫',
    title: 'Issue hand-offs',
    description: 'Send an individual fix to the channel as a formatted message when the brand has no Linear or Jira connected.',
  },
  {
    icon: '💬',
    title: 'Native Slack formatting',
    description: 'The payload is a Slack incoming-webhook body, so messages render with bold, links, and line breaks rather than as a wall of JSON.',
  },
  {
    icon: '🔗',
    title: 'Works with any catch-hook',
    description: 'The same webhook URL can point at Zapier, Make, n8n, or your own endpoint — nothing about it is Slack-specific.',
  },
  {
    icon: '🛡',
    title: 'SSRF-validated',
    description: 'The webhook URL must be public HTTPS. Internal and private-range destinations are rejected when you save it.',
  },
  {
    icon: '🏷',
    title: 'One per brand',
    description: 'Each brand carries its own webhook URL, so agencies can route each client to that client\'s own channel.',
  },
];

const steps = [
  {
    title: 'Create a Slack incoming webhook',
    description: 'In Slack: Apps → Incoming Webhooks → Add to Slack. Pick the channel and copy the webhook URL Slack gives you.',
  },
  {
    title: 'Paste it into Livesov',
    description: 'Dashboard → Alerts → Webhook URL. It has to be a public HTTPS URL; Livesov rejects internal destinations.',
  },
  {
    title: 'Save',
    description: 'The webhook is stored against the brand. Fix Engine notifications for that brand start posting to the channel.',
  },
];

const faqs = [
  {
    question: 'Is this a Slack app I install?',
    answer:
      'No. There is no Livesov app in the Slack directory and no OAuth flow. This is a plain Slack incoming webhook: you create the webhook in Slack, paste the URL into Livesov, and Livesov posts to it. A native Slack app with OAuth, channel pickers, and slash commands is on the roadmap, not shipped.',
  },
  {
    question: 'What actually gets posted today?',
    answer:
      'Fix Engine notifications: status summaries, and individual fix hand-offs when a brand has no Linear or Jira tracker connected. Mention-rate and competitor alerts are delivered by email today, not through the webhook — if you want those in Slack, route Livesov\'s alert emails into a channel with Slack\'s email-to-channel address, or watch this page.',
  },
  {
    question: 'Does it cost anything?',
    answer:
      'No. The webhook field is available on every plan, including the trial. Slack does not charge for incoming webhooks either.',
  },
  {
    question: 'Can I route different brands to different channels?',
    answer:
      'Yes. The webhook URL is stored per brand, so give each brand the webhook for its own channel. Agencies typically run one channel per client this way.',
  },
  {
    question: 'Are the requests signed?',
    answer:
      'Not today. Livesov POSTs a JSON body to the URL you configured, with no HMAC signature. Treat the webhook URL itself as the secret — anyone holding it can post to your channel, which is true of Slack incoming webhooks generally. Signed payloads are part of the planned public API work.',
  },
  {
    question: 'Can I trigger Livesov from Slack?',
    answer:
      'No. The integration is one-directional: Livesov → Slack. Inbound slash commands are on the roadmap.',
  },
];

export default function SlackIntegrationPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Integrations', url: '/integrations' }, { name: 'Slack', url: '/integrations/slack' }]} />

      <SeoHero
        title={
          <>
            Livesov +{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              Slack
            </span>
          </>
        }
        subtitle="Point Livesov at a Slack incoming webhook and Fix Engine updates land in the channel your team already lives in. No app to install, no OAuth, about two minutes of setup."
        ctaText="Start free"
        ctaHref="/signup"
      />

      <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px">
        <SectionHeader
          label="What you get"
          title="A webhook, wired to the channel that cares"
          subtitle="Configured per brand, so each client can have its own channel."
        />
        <FeatureGrid items={features} columns={3} />
      </Section>

      <Section pad="72px 24px">
        <SectionHeader label="Setup" title="Three steps, about two minutes" />
        <ProcessSteps steps={steps} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
        <LongForm>
          <Callout title="What this is, precisely" variant="note">
            A Slack <strong>incoming webhook</strong> — not a Livesov app in the Slack directory.
            You create the webhook in Slack, paste the URL into Livesov, and Livesov POSTs a
            Slack-formatted message to it. A native app with OAuth, a channel picker, per-event
            routing, and slash commands is on the roadmap and is not shipped. We would rather tell
            you that here than have you go looking for us in the Slack directory.
          </Callout>

          <h2>Why teams run Livesov through Slack anyway</h2>
          <p>
            AI visibility moves in days, not quarters. A new competitor placement can shift your
            mention rate within a week, and a Fix Engine change that fails to apply is worth knowing
            about before the next reporting cycle, not after it. A channel that mirrors what the Fix
            Engine is doing keeps content, PR, and exec eyes on the same signal without anyone
            opening another dashboard.
          </p>

          <h2>What is delivered where</h2>
          <p>
            Worth being exact, because &quot;alerts in Slack&quot; means different things in
            different tools:
          </p>
          <ul>
            <li>
              <strong>Fix Engine status summaries and fix hand-offs</strong> — the webhook. This is
              what the setup above configures.
            </li>
            <li>
              <strong>Linear and Jira</strong> — native. When a brand has a tracker connected,
              individual fixes become real issues there instead of webhook messages.
            </li>
            <li>
              <strong>Mention-rate drops, competitor moves, sentiment shifts</strong> — email today.
              If you want them in a channel now, Slack&rsquo;s per-channel email address works well
              as a stopgap.
            </li>
            <li>
              <strong>Weekly and monthly reports</strong> — email, as scheduled PDFs.
            </li>
          </ul>

          <h2>The same webhook, pointed elsewhere</h2>
          <p>
            Nothing about the payload is Slack-specific — it is a JSON body with a{' '}
            <code>text</code> field, which is exactly what a{' '}
            <a href="/integrations/zapier">Zapier</a> or Make catch-hook expects too. If you want
            Livesov output in Teams, Discord, or your own service, point the same field at that
            endpoint instead.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Slack FAQ" items={faqs} />

      <PillarLinks
        title="More ways to plug Livesov in"
        links={[
          { href: '/integrations/wordpress', label: 'WordPress plugin', description: 'Apply approved fixes straight to your site.' },
          { href: '/integrations/zapier', label: 'Zapier', description: 'Same webhook, pointed at a catch-hook.' },
          { href: '/integrations/api', label: 'API & webhooks', description: 'What is available today, and what is coming.' },
          { href: '/integrations', label: 'All integrations', description: 'Every LLM, alert route, and export format.' },
        ]}
      />
    </SeoLayout>
  );
}
