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
  title: 'Livesov + Zapier: Route AI Visibility Updates to 5,000+ Apps',
  description:
    'Point Livesov\'s outbound webhook at a Zapier catch hook and fan AI visibility updates out to Sheets, Notion, HubSpot, or anywhere else Zapier reaches.',
  keywords:
    'livesov zapier, ai visibility zapier, geo zapier, llm tracking zapier, chatgpt mention zapier, zapier webhook seo',
  alternates: { canonical: '/integrations/zapier' },
  openGraph: {
    title: 'Livesov + Zapier: Route Updates to 5,000+ Apps',
    description: 'Send Livesov updates into Zapier with a catch hook.',
    url: 'https://livesov.com/integrations/zapier',
    siteName: 'Livesov',
    type: 'article',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Livesov + Zapier',
      },
    ],
  },
};

const features = [
  {
    icon: '🪝',
    title: 'Catch Hook trigger',
    description: 'Zapier\'s built-in Webhooks by Zapier trigger receives the POST. No Livesov app to install, and no authentication step to configure.',
  },
  {
    icon: '🔧',
    title: 'Fix Engine updates',
    description: 'What flows through today: Fix Engine status summaries and individual fix hand-offs for brands with no Linear or Jira connected.',
  },
  {
    icon: '🏷',
    title: 'One hook per brand',
    description: 'The webhook URL is stored per brand, so each client can drive its own Zap with its own downstream actions.',
  },
  {
    icon: '⚡',
    title: 'Fires on the event',
    description: 'This is a push, not a poll — Zapier receives the POST as Livesov sends it, with no polling interval to wait out.',
  },
];

const recipes = [
  { icon: '📊', title: 'Log every Fix Engine result to Sheets', description: 'Catch Hook → Google Sheets: append a row with the brand, the message, and a timestamp for an audit trail clients can see.' },
  { icon: '🗂', title: 'Push hand-offs into Notion', description: 'Catch Hook → Notion: create a database row per fix so content teams work from a board instead of a channel.' },
  { icon: '🎫', title: 'Open a HubSpot ticket', description: 'Catch Hook → HubSpot: raise a ticket assigned to the account owner whenever the Fix Engine reports something that needs a human.' },
  { icon: '💬', title: 'Reformat before Slack', description: 'Catch Hook → Formatter → Slack, when you want richer formatting than the raw message and would rather not point Livesov at Slack directly.' },
];

const steps = [
  { title: 'Create a Zap with "Webhooks by Zapier"', description: 'Choose the Catch Hook trigger. Zapier gives you a unique URL.' },
  { title: 'Paste that URL into Livesov', description: 'Dashboard → Alerts → Webhook URL, for the brand you want to route.' },
  { title: 'Send a test', description: 'Trigger a Fix Engine notification so Zapier captures a sample payload and can map its fields.' },
  { title: 'Add your action', description: 'Point the second step at any of Zapier\'s 5,000+ apps. Done.' },
];

const faqs = [
  {
    question: 'Is there a Livesov app in the Zapier directory?',
    answer:
      'No. Searching Zapier for "Livesov" will not find anything. The integration is Zapier\'s generic Catch Hook receiving Livesov\'s outbound webhook — which works today with no waiting, but does mean you build the field mapping yourself rather than picking from a list of pre-built triggers. A published Zapier app with named triggers and actions is on the roadmap.',
  },
  {
    question: 'What does the payload look like?',
    answer:
      'A JSON body with a single "text" field containing the formatted message. That shape is Slack-incoming-webhook compatible, which is why the same URL field works for Slack, Zapier, Make, n8n, or your own endpoint. Use a Zapier Formatter step if you need to parse specific values out of the text.',
  },
  {
    question: 'Which events fire it?',
    answer:
      'Fix Engine notifications: status summaries, and individual fix hand-offs for brands with no Linear or Jira tracker connected. Mention-rate drops, competitor moves, and scheduled reports are delivered by email today and do not currently reach the webhook.',
  },
  {
    question: 'Do I need an API key?',
    answer:
      'No, and there is no API key to get — Livesov has no public API yet. The Catch Hook URL is the only credential involved, and it is Zapier\'s, not ours. Treat it as a secret: anyone holding it can post into your Zap.',
  },
  {
    question: 'Can Zapier write back into Livesov?',
    answer:
      'Not yet. The flow is one-directional: Livesov → Zapier → wherever. Creating brands or prompts from an upstream event needs the public API, which is not shipped.',
  },
  {
    question: 'What does it cost?',
    answer:
      'Nothing on the Livesov side — the webhook field is on every plan including the trial. Zapier bills you for task runs; a Catch Hook plus one action fits comfortably in Zapier\'s free tier for most teams.',
  },
];

export default function ZapierIntegrationPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Integrations', url: '/integrations' }, { name: 'Zapier', url: '/integrations/zapier' }]} />

      <SeoHero
        title={
          <>
            Livesov +{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#f97316]">
              Zapier
            </span>
          </>
        }
        subtitle="Point Livesov's outbound webhook at a Zapier Catch Hook and fan updates out to Sheets, Notion, HubSpot, or any of Zapier's 5,000+ apps. No Livesov app to install - it works today."
        ctaText="Start free"
        ctaHref="/signup"
      />

      <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px">
        <SectionHeader
          label="How it works"
          title="A webhook and a Catch Hook"
          subtitle="Zapier's own generic trigger does the receiving, so there is nothing to install or authenticate."
        />
        <FeatureGrid items={features} columns={2} />
      </Section>

      <Section pad="72px 24px">
        <SectionHeader label="Setup" title="Four steps" />
        <ProcessSteps steps={steps} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px">
        <SectionHeader
          label="Recipes"
          title="What teams actually build"
          subtitle="Every one of these is a Catch Hook plus a single downstream action."
        />
        <FeatureGrid items={recipes} columns={2} />
      </Section>

      <Section pad="64px 24px">
        <LongForm>
          <Callout title="What this is, precisely" variant="note">
            Zapier&rsquo;s generic <strong>Catch Hook</strong> receiving Livesov&rsquo;s outbound
            webhook — not a published Livesov app in the Zapier directory. Searching Zapier for
            &quot;Livesov&quot; will not find anything, and there is no API key step, because
            Livesov has no public API yet. The upside is that it works today. The cost is that you
            map fields out of the payload yourself instead of picking from named triggers.
          </Callout>

          <h2>Parsing the payload</h2>
          <p>
            The body is <code>{'{ "text": "…" }'}</code> — one formatted message, the same shape
            Slack&rsquo;s incoming webhooks accept. For most Zaps that is enough: pass{' '}
            <code>text</code> straight into a Sheets row, a Notion page, or a Slack message.
          </p>
          <p>
            If you need structured values — a brand name, a URL, a fix type — add a{' '}
            <strong>Formatter by Zapier</strong> step between the trigger and the action and split
            on the message&rsquo;s line breaks. It is a workaround, and a real app with typed
            trigger fields would be better; that is the roadmap item.
          </p>

          <h2>When to use Zapier instead of a direct webhook</h2>
          <p>
            If Slack is your only destination, point Livesov at{' '}
            <a href="/integrations/slack">Slack&rsquo;s incoming webhook</a> directly — one fewer
            moving part and no task quota. Reach for Zapier when you need fan-out (one event, three
            destinations), transformation before delivery, or a destination Livesov has no direct
            path to.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Zapier FAQ" items={faqs} />

      <PillarLinks
        title="More ways to plug Livesov in"
        links={[
          { href: '/integrations/wordpress', label: 'WordPress plugin', description: 'Apply approved fixes straight to your site.' },
          { href: '/integrations/slack', label: 'Slack', description: 'The same webhook, pointed at a channel.' },
          { href: '/integrations/api', label: 'API & webhooks', description: 'What is available today, and what is coming.' },
          { href: '/integrations', label: 'All integrations', description: 'Every LLM, alert route, and export format.' },
        ]}
      />
    </SeoLayout>
  );
}
