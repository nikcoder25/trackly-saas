import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  FeatureGrid,
  StatsBar,
  ProcessSteps,
  FaqSection,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'AI Visibility Tool for Agencies | LLM Optimization at Scale | Livesov',
  description:
    'Livesov is the AI visibility tool built for agencies. Run LLM optimization for every client, deliver white-label AI search reports, and add a new retainer line - across ChatGPT, Perplexity, Claude, Gemini and Grok.',
  keywords:
    'llm optimization agency, ai search optimization agency, ai seo companies, ai search agency, ai visibility tool for agencies, white-label ai search reports',
  alternates: { canonical: '/solutions/agencies' },
  openGraph: {
    title: 'AI Visibility Tool for Agencies | LLM Optimization at Scale | Livesov',
    description:
      'The AI visibility tool built for agencies. Run LLM optimization for every client, deliver white-label AI search reports, and add a new retainer line.',
    url: 'https://livesov.com/solutions/agencies',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Livesov AI visibility tool for agencies and LLM optimization teams',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Visibility Tool for Agencies | Livesov',
    description:
      'Run LLM optimization for every client and deliver white-label AI search reports with Livesov.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const benefits = [
  {
    icon: '◑',
    title: 'A new retainer line',
    description:
      'Add AI search optimization to every client deck without hiring an AI team. LLM visibility is a service clients now ask for by name - and a recurring line you can own.',
  },
  {
    icon: '⬚',
    title: 'White-label reports',
    description:
      'Deliver branded AI visibility reports under your own logo. Share of voice, sentiment and citations, packaged as a client-ready deliverable in a click.',
  },
  {
    icon: '⛶',
    title: 'Client workspaces',
    description:
      'Keep every client separate - their brands, competitors, prompts and history in isolated workspaces you switch between instantly.',
  },
  {
    icon: '◎',
    title: 'Proof that retains clients',
    description:
      'Show the CMO exactly which AI answers their brand wins and loses each week. Defensible numbers make renewals easy.',
  },
  {
    icon: '⚙',
    title: 'Bulk audits',
    description:
      'Run GEO audits across a client’s key pages at once to scope a new engagement or prove quick wins in the pitch.',
  },
  {
    icon: '◷',
    title: 'Set up in minutes',
    description:
      'No SDK, no script. Add a client’s domain and competitors, approve the seed prompts, and the first AI visibility run starts immediately.',
  },
];

const steps = [
  {
    title: 'Add the client',
    description:
      'Create a workspace, enter the client’s brand, domain, products and competitors. Livesov seeds buyer-intent prompts for their category automatically.',
  },
  {
    title: 'Run LLM optimization',
    description:
      'Track all five engines, surface the prompts where the client is missing or losing rank, and act on the content and structural fixes Livesov recommends.',
  },
  {
    title: 'Report and renew',
    description:
      'Export a white-label report showing share of voice, trend and citations. Bring it to the monthly review as proof the retainer is working.',
  },
];

const faqs = [
  {
    question: 'What is an LLM optimization agency?',
    answer:
      'An LLM optimization agency helps brands get mentioned and recommended inside AI answers from tools like ChatGPT, Gemini and Perplexity - the AI-era extension of SEO. Many traditional SEO and AI SEO companies are adding this service now, and they use a tool like Livesov to measure and prove the results for each client.',
  },
  {
    question: 'Can I white-label Livesov for my clients?',
    answer:
      'Yes. The Agency plan includes white-label reports so you can deliver AI visibility insights under your own brand, plus separate client workspaces to keep every engagement isolated. See the Partners page for white-label, affiliate and reseller options.',
  },
  {
    question: 'Do I need an in-house AI team to offer this?',
    answer:
      'No. Livesov handles the measurement - querying every engine on a schedule, parsing mentions, scoring sentiment, and capturing citations. Your team focuses on the strategy and content work clients pay for, not on building AI infrastructure.',
  },
  {
    question: 'How many clients can one workspace handle?',
    answer:
      'The Agency plan is built for multi-client work: unlimited brands, a large tracked-prompt allowance, all five AI platforms, and competitor tracking. If you need tenant-scoped API keys for compliance, those are supported on Agency too.',
  },
  {
    question: 'How do agencies usually price this service?',
    answer:
      'Most fold AI visibility into an existing SEO or content retainer as a new line item, then upsell deeper LLM optimization work once the first report shows where the client is losing AI share of voice. The white-label report is what makes that upsell easy to justify.',
  },
];

export default function AgenciesSolutionPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Solutions', url: '/solutions/agencies' },
          { name: 'Agencies', url: '/solutions/agencies' },
        ]}
      />

      <SeoHero
        title={
          <>
            The AI visibility tool built for <span className="text-[var(--brand)]">agencies</span>
          </>
        }
        subtitle="Your clients are already asking how they show up in ChatGPT and Perplexity. Livesov lets your agency run LLM optimization for every client, prove it with white-label reports, and turn AI search into a new retainer line - without hiring an AI team."
        ctaText="Become a partner"
        ctaHref="/partners"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '5', label: 'AI engines tracked per client' },
            { value: 'Unlimited', label: 'Brands on the Agency plan' },
            { value: 'White-label', label: 'Reports under your brand' },
            { value: '2 min', label: 'To onboard a new client' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="Why agencies use Livesov"
          title="Everything you need to offer AI search optimization"
          subtitle="A complete AI visibility platform for agencies and AI SEO companies - measurement, reporting and client management in one place."
        />
        <FeatureGrid items={benefits} />
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="The workflow"
          title="From new client to renewed retainer"
          subtitle="The same three-step loop for every account, repeatable across your whole client book."
        />
        <ProcessSteps steps={steps} />
      </Section>

      <Section pad="24px 24px 80px">
        <LongForm>
          <h2>AI search optimization is the agency service clients now ask for</h2>
          <p>
            For years, agencies sold Google rankings. But buyers increasingly start with an AI answer, and
            clients have noticed - &ldquo;why doesn&apos;t ChatGPT mention us?&rdquo; is now a real line in
            kickoff calls. Agencies and AI SEO companies that can answer that question, measure it, and improve
            it have a fresh, defensible service to sell.
          </p>
          <p>
            The hard part has been infrastructure. Querying five engines on a schedule, handling LLM
            non-determinism, parsing mentions and sentiment, and capturing citations is a real engineering
            lift - one most agencies shouldn&apos;t build. Livesov is that infrastructure, delivered as an
            AI visibility platform you can put your own brand on. You bring the strategy and the content
            work; Livesov brings the measurement and the proof.
          </p>

          <h3>Built for multi-client work</h3>
          <p>
            Isolated client workspaces, unlimited brands, white-label reports and bulk GEO audits mean you can
            scale from one client to fifty without the data getting tangled. Every report ties back to the
            verbatim AI response behind it, so the numbers hold up in front of a sceptical CMO.
          </p>
          <p>
            Ready to add it to your services? Explore the{' '}
            <a href="/partners">agency partner program</a> for white-label and reseller terms, compare{' '}
            <a href="/pricing">plans and pricing</a>, or see{' '}
            <a href="/how-it-works">how the measurement works</a> end to end.
          </p>
        </LongForm>
      </Section>

      <FaqSection
        title="AI visibility for agencies - FAQ"
        subtitle="What agencies and AI SEO companies ask before they roll Livesov out to clients."
        items={faqs}
      />

      <PillarLinks
        title="For agencies"
        links={[
          { href: '/partners', label: 'Partner program', description: 'White-label, affiliate and reseller options.' },
          { href: '/pricing', label: 'Agency pricing', description: 'Unlimited brands and white-label reports.' },
          { href: '/use-cases', label: 'Use cases', description: 'How different teams put Livesov to work.' },
          { href: '/how-it-works', label: 'How it works', description: 'The measurement methodology in detail.' },
          { href: '/best-ai-search-optimization-tools', label: 'Tool comparison', description: 'How Livesov compares to other tools.' },
          { href: '/geo-audit', label: 'Free GEO audit', description: 'Scope an engagement with a quick page audit.' },
        ]}
      />
    </SeoLayout>
  );
}
