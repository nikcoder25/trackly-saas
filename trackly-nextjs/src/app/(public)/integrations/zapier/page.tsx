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
  title: 'Livesov + Zapier: Connect AI Visibility to 5,000+ Apps',
  description:
    'Use Zapier triggers and actions to push Livesov AI mention data into Google Sheets, HubSpot, Salesforce, Notion, Airtable, and 5,000+ other apps.',
  keywords:
    'livesov zapier integration, ai visibility zapier, geo zapier, llm tracking zapier, chatgpt mention zapier, ai search zapier',
  alternates: { canonical: '/integrations/zapier' },
  openGraph: {
    title: 'Livesov + Zapier: 5,000+ App Integrations',
    description: 'Trigger workflows across HubSpot, Salesforce, Sheets, Notion, and more from Livesov events.',
    url: 'https://livesov.com/integrations/zapier',
    siteName: 'Livesov',
    type: 'article',
  },
};

const triggers = [
  { icon: '◐', title: 'Mention rate change', description: 'Fires when a tracked brand\'s mention rate moves by a configurable threshold on any LLM.' },
  { icon: '◑', title: 'New citation detected', description: 'Fires when a new third-party source begins citing your brand inside an LLM answer.' },
  { icon: '◒', title: 'Competitor pass-through', description: 'Fires when a competitor overtakes you on mention rate, citation share, or rank.' },
  { icon: '◓', title: 'Sentiment shift', description: 'Fires when net sentiment on a tracked brand or prompt drops or rises by a threshold.' },
  { icon: '◔', title: 'New prompt added', description: 'Fires when a new prompt is added to a tracked brand\'s panel.' },
  { icon: '◕', title: 'Report ready', description: 'Fires when a scheduled report is generated and ready for distribution.' },
];

const actions = [
  { icon: '⊕', title: 'Add a tracked prompt', description: 'Programmatically add prompts to a tracked brand\'s panel.' },
  { icon: '⊕', title: 'Add a tracked brand', description: 'Spin up a new tracked brand from any upstream event (e.g. new HubSpot company).' },
  { icon: '⊕', title: 'Generate a report', description: 'Trigger a one-off PDF or CSV report for a brand on demand.' },
  { icon: '⊕', title: 'Update competitor set', description: 'Add or remove competitors on a tracked brand from upstream signals.' },
];

const recipes = [
  { title: 'Log every mention drop to Google Sheets', description: 'Trigger: mention-rate change. Action: append a row to Sheets with brand, LLM, prompt, delta, timestamp.' },
  { title: 'Create a HubSpot ticket on competitor pass-through', description: 'Trigger: competitor pass-through. Action: create a HubSpot ticket assigned to the brand owner.' },
  { title: 'Post Slack notifications via Zapier', description: 'Trigger: any Livesov event. Action: post to a Slack channel with custom formatting (if the native Slack app is not enough).' },
  { title: 'Add tracked brands from Pipedrive deals', description: 'Trigger: new Pipedrive deal at certain stage. Action: add a tracked brand in Livesov with the deal\'s company name.' },
  { title: 'Email weekly digest to clients', description: 'Trigger: report ready. Action: email the PDF to a list pulled from a Google Sheet of client contacts.' },
  { title: 'Push citations to Notion', description: 'Trigger: new citation detected. Action: append a row in a Notion database of brand citations.' },
];

const steps = [
  { title: 'Find Livesov on Zapier', description: 'In Zapier, search "Livesov" and click Connect.' },
  { title: 'Authenticate with your API key', description: 'Grab your API key from Settings → API in your Livesov dashboard.' },
  { title: 'Pick a trigger', description: 'Choose from the six event triggers - mention rate, citation, sentiment, etc.' },
  { title: 'Pick an action', description: 'Connect the trigger to any of Zapier\'s 5,000+ apps. Done.' },
];

const faqs = [
  { question: 'Is the Zapier integration free?', answer: 'The Livesov side is included on every paid plan. Zapier itself bills you for task runs - most teams stay on the free Zapier tier for 1–2 critical Zaps.' },
  { question: 'Do I need a developer to set up Zaps?', answer: 'No. The integration uses standard Zapier triggers and actions - no code required.' },
  { question: 'What is the polling frequency?', answer: 'Triggers fire near real-time (within 60 seconds) for paid Zapier tiers; up to 15 minutes for the Zapier free tier.' },
  { question: 'How do I get an API key?', answer: 'Settings → API in your Livesov dashboard. Keys are per-workspace; rotate them anytime.' },
  { question: 'Can I use Zapier for white-label client reporting?', answer: 'Yes - many agencies trigger Livesov report generation via Zapier on a per-client cadence and email the PDFs through Zapier\'s Gmail or SMTP actions.' },
];

export default function ZapierIntegrationPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Integrations', url: '/integrations' }, { name: 'Zapier', url: '/integrations/zapier' }]} />

      <SeoHero
        title={
          <>
            Livesov +{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              Zapier
            </span>
          </>
        }
        subtitle="Connect AI visibility data to 5,000+ apps. Six triggers, four actions, infinite workflows - no code required."
        ctaText="Get an API key"
        ctaHref="/signup"
      />

      <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px">
        <SectionHeader label="Triggers" title="Six events you can listen for" subtitle="Every event includes brand, LLM, prompt, and a deep link to the dashboard." />
        <FeatureGrid items={triggers} columns={3} />
      </Section>

      <Section pad="72px 24px">
        <SectionHeader label="Actions" title="Four actions you can fire" subtitle="Write back into Livesov from any upstream Zapier trigger." />
        <FeatureGrid items={actions} columns={2} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px">
        <SectionHeader label="Popular recipes" title="The six Zaps teams build first" />
        <FeatureGrid items={recipes.map((r) => ({ icon: '⚡', title: r.title, description: r.description }))} columns={2} />
      </Section>

      <Section pad="72px 24px">
        <SectionHeader label="Setup" title="From zero to first Zap in 5 minutes" />
        <ProcessSteps steps={steps} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
        <LongForm>
          <h2>Why Zapier?</h2>
          <p>
            Most marketing stacks are 30+ tools deep. The integrations that matter for AI
            visibility - CRM, project tracking, analytics, internal comms - are exactly the ones
            Zapier already speaks. Zapier lets you wire Livesov into the workflows you already
            have, with no engineering ticket.
          </p>

          <Callout title="When to use Zapier vs. the API" variant="tip">
            Use Zapier for cross-tool automations that involve apps Zapier already supports. Use
            the <a href="/integrations/api">REST API</a> for custom internal tooling or scale
            beyond what Zapier task limits allow.
          </Callout>
        </LongForm>
      </Section>

      <FaqSection title="Zapier integration FAQ" items={faqs} />

      <PillarLinks
        title="More ways to plug Livesov in"
        links={[
          { href: '/integrations/slack', label: 'Slack integration', description: 'Native real-time alerts and weekly digests in Slack.' },
          { href: '/integrations/api', label: 'REST API', description: 'Build directly against Livesov metrics and events.' },
          { href: '/integrations', label: 'All integrations', description: 'Every LLM, alert route, and export format.' },
          { href: '/docs', label: 'Docs', description: 'Setup guides and integration reference.' },
        ]}
      />
    </SeoLayout>
  );
}
