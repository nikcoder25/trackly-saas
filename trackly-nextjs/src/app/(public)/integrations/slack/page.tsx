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
  title: 'Livesov + Slack: Real-time AI Visibility Alerts & Weekly Digests',
  description:
    'Stream AI mention drops, competitor moves, and weekly visibility digests into any Slack channel. Native Livesov Slack integration - 2-click setup.',
  keywords:
    'livesov slack integration, ai visibility slack alerts, chatgpt mention slack, ai search alerts slack, geo slack integration, llm alerts slack',
  alternates: { canonical: '/integrations/slack' },
  openGraph: {
    title: 'Livesov + Slack: Real-time AI Visibility Alerts',
    description: 'Real-time mention drops and weekly digests, in your Slack channels.',
    url: 'https://livesov.com/integrations/slack',
    siteName: 'Livesov',
    type: 'article',
  },
};

const features = [
  {
    icon: '🔔',
    title: 'Mention-rate drop alerts',
    description: 'Get pinged the moment your mention rate drops more than a configurable threshold on any tracked LLM.',
  },
  {
    icon: '◆',
    title: 'Competitor pass-through',
    description: 'When a competitor overtakes you in citation share or rank-in-answer, the alert lands in Slack with the prompt and the screenshot.',
  },
  {
    icon: '✦',
    title: 'New citation surfacing',
    description: 'A new third-party source citing your brand? Slack notifies the right channel - perfect for PR and brand teams.',
  },
  {
    icon: '↻',
    title: 'Weekly digest',
    description: 'Every Monday: mention-rate delta, top movers, new citations, and the week\'s biggest sentiment shifts.',
  },
  {
    icon: '🎯',
    title: 'Per-channel routing',
    description: 'Route different brands, categories, or alert types to different Slack channels.',
  },
  {
    icon: '◐',
    title: 'Threaded context',
    description: 'Every alert includes the prompt, the LLM output, and a link to the dashboard - so the conversation can happen right there.',
  },
];

const steps = [
  { title: 'Open Livesov Settings', description: 'In your Livesov dashboard, go to Settings → Integrations → Slack.' },
  { title: 'Click "Connect Slack"', description: 'OAuth flow handles the authentication. Pick the workspace and the default channel.' },
  { title: 'Configure alert types', description: 'Choose which events post to which channels - mention drops, competitor moves, weekly digests.' },
  { title: 'Test the connection', description: 'Send a test alert. If it lands, you\'re live. Otherwise we\'ll guide you to the fix.' },
];

const faqs = [
  { question: 'Is the Slack integration free?', answer: 'Slack is included on every paid Livesov plan, including the entry tier. The free trial includes Slack so you can validate setup before upgrading.' },
  { question: 'How many channels can I route to?', answer: 'Unlimited. Most teams use 2–3 channels (one alerts, one digest, one brand-specific) but agencies often use one channel per client.' },
  { question: 'Does Slack post the full LLM output?', answer: 'Yes - the relevant snippet plus a link to the full response in your Livesov dashboard. You can truncate at 300 characters or expand to the full paragraph.' },
  { question: 'Can I trigger Livesov actions from Slack?', answer: 'Inbound slash commands are on the roadmap (snooze alerts, mark resolved). Today, the integration is one-directional: Livesov → Slack.' },
  { question: 'How is Slack different from email alerts?', answer: 'Same events, different surface. Slack is better for fast-moving teams that already live in channels; email is better for executive digests and external stakeholders.' },
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
        subtitle="Real-time AI visibility alerts, weekly digests, and competitor moves - delivered to the Slack channels you already live in. Two-click setup."
        ctaText="Connect Slack"
        ctaHref="/signup"
      />

      <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px">
        <SectionHeader
          label="What you'll see in Slack"
          title="The six alerts that actually matter"
          subtitle="Configurable per channel, per brand, per LLM."
        />
        <FeatureGrid items={features} columns={3} />
      </Section>

      <Section pad="72px 24px">
        <SectionHeader label="Setup" title="From zero to first alert in 2 minutes" />
        <ProcessSteps steps={steps} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
        <LongForm>
          <h2>Why marketing leaders run Livesov alerts through Slack</h2>
          <p>
            AI visibility moves in days, not quarters. A new competitor placement on Reddit can
            shift your mention rate on ChatGPT Search within 48 hours. Email digests miss the
            window. Slack catches it.
          </p>
          <p>
            The fastest-moving Livesov teams run a single &quot;#ai-visibility&quot; channel that
            mirrors the dashboard in near-real-time. Anyone on the team - PMM, content, PR, exec
            - can react to a drop or a competitor move without opening another tool.
          </p>

          <Callout title="Try it with the free trial" variant="tip">
            Slack is included on the free trial. <a href="/signup">Start free</a> - you can
            connect Slack from Settings → Integrations the moment your account is live.
          </Callout>
        </LongForm>
      </Section>

      <FaqSection title="Slack integration FAQ" items={faqs} />

      <PillarLinks
        title="More ways to plug Livesov in"
        links={[
          { href: '/integrations/zapier', label: 'Zapier integration', description: '5,000+ apps via Zapier triggers and actions.' },
          { href: '/integrations/api', label: 'REST API', description: 'Build directly against Livesov metrics and events.' },
          { href: '/integrations', label: 'All integrations', description: 'Every LLM, alert route, export format, and API surface.' },
          { href: '/docs', label: 'Docs', description: 'Setup guides, workflows, and integration reference.' },
        ]}
      />
    </SeoLayout>
  );
}
