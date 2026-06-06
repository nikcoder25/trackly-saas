import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  FeatureGrid,
  StatsBar,
  ProcessSteps,
  FaqSection,
  ComparisonTable,
  Callout,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'Perplexity Brand Tracking | AI Citation Tracker',
  description:
    'Track how Perplexity cites and mentions your brand. An AI citation tracker that captures every source URL and your share of voice. Free plan.',
  keywords:
    'perplexity brand tracking, perplexity ai monitoring, ai search visibility, perplexity citation tracking, perplexity sonar tracking, perplexity rank tracking, ai search seo',
  alternates: { canonical: '/perplexity-brand-tracking' },
  openGraph: {
    title: 'Perplexity Brand Tracking | AI Citation Tracker',
    description:
      'Track how Perplexity cites and mentions your brand. An AI citation tracker that captures every source URL and your share of voice. Free plan.',
    url: 'https://livesov.com/perplexity-brand-tracking',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Perplexity Brand Tracking — Monitor AI Search Citations | Livesov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Perplexity Brand Tracking | AI Citation Tracker',
    description:
      'Track how Perplexity cites and mentions your brand. An AI citation tracker that captures every source URL and your share of voice. Free plan.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const features = [
  {
    icon: '⟁',
    title: 'Full citation capture',
    description:
      'Every URL Perplexity references is logged with its rank in the citation list, source domain, and the answer snippet it informed.',
  },
  {
    icon: '◎',
    title: 'Mention rate by intent',
    description:
      'Measure how often Perplexity names your brand, broken down by query intent (research, comparison, transactional).',
  },
  {
    icon: '#',
    title: 'Citation rank tracking',
    description:
      'Track whether your pages are cited first, third, or buried — and how that shifts after you ship new content.',
  },
  {
    icon: '⚔',
    title: 'Competitor citation share',
    description:
      'See which competitor domains Perplexity cites for the queries that matter to you, then close the gap.',
  },
  {
    icon: '✺',
    title: 'Sentiment of brand snippets',
    description:
      'Automatic positive / neutral / negative scoring of the actual answer text Perplexity generates about your brand.',
  },
  {
    icon: '◈',
    title: 'Sonar model coverage',
    description:
      'Tracks Sonar, Sonar Pro, and the reasoning variants — every Perplexity model behaves a little differently.',
  },
];

const supportedModels = [
  ['Sonar', 'Default Perplexity model with live web search', 'Where most consumer answers are generated'],
  ['Sonar Pro', 'Larger context, better synthesis, more citations', 'Used by Pro subscribers for deep research'],
  ['Sonar Reasoning', 'Chain-of-thought reasoning over web context', 'Tracked separately — citation patterns differ'],
  ['Sonar Deep Research', 'Long-form research with extended citation lists', 'High-stakes B2B comparison queries'],
];

const steps = [
  {
    title: 'Add your domain & competitors',
    description:
      'Tell Livesov which domains belong to you, which to competitors, and which third-party sources matter (G2, Reddit, news outlets).',
  },
  {
    title: 'Build a Perplexity query set',
    description:
      'Our AI generates 20–50 Perplexity-style prompts based on your category. These are the questions your buyers research, not the ones you wish they would.',
  },
  {
    title: 'Run on schedule',
    description:
      'Livesov queries Perplexity automatically, captures the full answer plus every citation, and aggregates results into trend dashboards.',
  },
  {
    title: 'Act on the citation gap',
    description:
      'See which competitor URLs Perplexity prefers, what content you need to publish or update, and whether your changes shifted citation share.',
  },
];

const useCases = [
  {
    icon: '⬢',
    title: 'B2B research-led buying',
    description:
      'Enterprise buyers use Perplexity for vendor research. Citation share is a direct leading indicator of pipeline inclusion.',
  },
  {
    icon: '◑',
    title: 'Content & SEO teams',
    description:
      'Perplexity is the cleanest test of whether your content is &quot;LLM-cite-worthy.&quot; If it never cites you, your content strategy needs an AI tier.',
  },
  {
    icon: '✸',
    title: 'PR & analyst relations',
    description:
      'Perplexity cites high-authority third-party sources heavily. Tracking which analyst notes and reviews it surfaces guides your PR investment.',
  },
];

const faqs = [
  {
    question: 'What makes Perplexity tracking different from ChatGPT tracking?',
    answer:
      'Perplexity is citation-first — every answer comes with explicit source URLs. That makes it the easiest AI platform to optimise for and the most diagnostic: you can see exactly which pages drive AI visibility. ChatGPT only shows citations in the search-enabled variant, and even then less reliably.',
  },
  {
    question: 'Does Livesov capture every citation Perplexity returns?',
    answer:
      'Yes. For every tracked prompt and every run, we log the complete ordered citation list — domain, URL, snippet, and rank — so you can build longitudinal citation-share reports.',
  },
  {
    question: 'Which Perplexity models do you support?',
    answer:
      'Livesov tracks the Sonar family — Sonar, Sonar Pro, Sonar Reasoning, and Sonar Deep Research — through the Perplexity API. We run prompts on the model most representative of consumer Perplexity by default, with optional cross-model comparison on Pro and Agency plans.',
  },
  {
    question: 'How is share of voice calculated in Perplexity?',
    answer:
      'Share of voice in Perplexity has two dimensions: mention share (how often your brand is named in the answer text) and citation share (how often your domain appears in the citation list). Livesov reports both, plus a blended composite score.',
  },
  {
    question: 'Can I track competitor domains as well as my own?',
    answer:
      'Yes — competitor domains are a first-class concept in Livesov. You can configure up to 20 competitor domains (plan-dependent) and see side-by-side citation share, mention share, and sentiment.',
  },
  {
    question: 'How fresh is the data?',
    answer:
      'Perplexity runs against live web search every time. Livesov re-queries on your configured cadence (daily on Agency, every 2 days on Pro, weekly on Starter), so you always have current data plus a complete history.',
  },
  {
    question: 'Can I export the full Perplexity response and citations?',
    answer:
      'Yes. Every dashboard view links to the raw response plus citations, and you can export the full evidence as CSV or PDF for sharing with clients, executives, or in audit logs.',
  },
];

const comparisonRows = [
  ['Captures every citation URL', '✓ Full ranked list', 'Partial', 'Not supported'],
  ['Tracks multiple Sonar models', '✓ Sonar / Pro / Reasoning', 'Single', 'Not supported'],
  ['Citation share over time', '✓ Native dashboard', 'Manual export', 'Not supported'],
  ['Competitor citation benchmarking', '✓ Up to 20 domains', 'Manual', 'Not supported'],
  ['Sentiment on answer text', '✓ Native', 'Limited', 'Not supported'],
  ['Hallucination / fact monitoring', '✓ Canonical facts store', 'Not supported', 'Not supported'],
  ['Scheduled monitoring', '✓ Daily / 2-day / weekly', 'Manual', 'Daily (web)'],
  ['Evidence export', '✓ CSV + PDF', 'Limited', 'CSV (rankings only)'],
];

export default function PerplexityBrandTrackingPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Perplexity Brand Tracking', url: '/perplexity-brand-tracking' }]} />

      <SeoHero
        title={
          <>
            Track Your Brand in{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#20b8cd] to-[#1a96a5]">
              Perplexity
            </span>
          </>
        }
        subtitle="Monitor how Perplexity AI mentions and cites your brand across Sonar, Sonar Pro, and Sonar Reasoning models. Capture every citation URL, track competitor share, and benchmark your AI search visibility."
        ctaText="Start tracking Perplexity — free"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '100%', label: 'Citation capture per run' },
            { value: '4', label: 'Sonar models supported' },
            { value: '20', label: 'Competitor domains tracked' },
            { value: '7-day', label: 'Free trial, no card' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="Why Perplexity matters"
          title="The cleanest, most diagnostic AI search to optimise for"
          subtitle="Perplexity grew past 30 million monthly active users by doing one thing better than anyone else: combining LLMs with live web search and showing every source. For brands, that transparency is a gift."
        />
        <LongForm>
          <p>
            Where ChatGPT sometimes feels like a black box, <strong>Perplexity is a glass box</strong>.
            Every answer arrives with a numbered list of source URLs, and the model is explicit
            about which citation supports which sentence. If your domain is cited, you get a clear
            signal. If it isn&apos;t, you can see exactly which domains beat you.
          </p>
          <p>
            That makes Perplexity the highest-leverage AI search platform to invest in. Wins on
            Perplexity tend to translate to ChatGPT Search, Google AI Overviews, and Bing Copilot
            — because the underlying optimisation work (publish authoritative, well-structured,
            citable content) is the same. Livesov turns Perplexity into a continuous test bed for
            your entire AI search strategy.
          </p>
        </LongForm>
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="What we measure"
          title="Citation-grade visibility for every Perplexity query"
          subtitle="Not just whether you&rsquo;re mentioned — exactly which of your pages Perplexity trusts and where competitors are stealing your citation slot."
        />
        <FeatureGrid items={features} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader label="How it works" title="From signup to citation map in under 5 minutes" />
        <ProcessSteps steps={steps} />
      </Section>

      <Section pad="80px 24px" width={920}>
        <SectionHeader
          label="Model coverage"
          title="Every Sonar variant tracked in parallel"
          subtitle="Perplexity ships new Sonar models on a cadence of weeks, not quarters. We add coverage as they ship so your historical trends stay intact."
        />
        <ComparisonTable
          headers={['Perplexity model', 'What it is', 'Why it matters']}
          rows={supportedModels}
          highlightColumn={-1}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader label="Who tracks Perplexity" title="Where Perplexity visibility moves the needle" />
        <FeatureGrid items={useCases} />
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>How Perplexity picks its sources</h2>
          <p>
            Perplexity&apos;s Sonar models do something subtly different from a normal LLM. For
            every user query, Perplexity first runs a real-time web search, retrieves the top
            results, and then asks the language model to synthesise an answer grounded in those
            specific sources. The model then cites them inline.
          </p>
          <p>
            In practice this means three things matter for your visibility: (1) you need to rank
            in the search results Perplexity retrieves, (2) your page needs to actually answer the
            question Perplexity&apos;s synthesiser is trying to compose, and (3) your content has
            to be machine-readable enough for the model to extract a clean quote.
          </p>

          <h2>Citation rank is the new SERP rank</h2>
          <p>
            In a traditional Google result, ranking #1 vs #5 is a 3–5× CTR difference. In
            Perplexity, being cited as source #1 vs #5 isn&apos;t directly clickable in the same
            way — but it is the source the synthesiser leans on hardest, the quote it lifts most
            prominently, and the brand a reader scrolls back to verify. Livesov tracks your
            citation rank for every monitored prompt so you can prioritise which pages to improve.
          </p>

          <h2>Mention share vs. citation share</h2>
          <p>
            These are two different metrics and they tell different stories.{' '}
            <strong>Mention share</strong> is how often your brand name appears in the answer text
            Perplexity generates. <strong>Citation share</strong> is how often your domain appears
            in the source list, regardless of whether the answer text names you.
          </p>
          <p>
            A brand can have high citation share but low mention share — meaning Perplexity reads
            your content but doesn&apos;t name you — which usually points to weak brand signals on
            the cited pages. Conversely, high mention share with low citation share means the
            web at large talks about you, but your own properties aren&apos;t getting picked up.
            Both gaps are fixable, and you can&apos;t close them without measuring them.
          </p>

          <Callout title="Pro tip" variant="tip">
            Pages that win Perplexity citations share three traits: a clear single-question focus
            in the H1, scannable structured answers in the first 200 words, and explicit
            attribution (data sources, author bio, date). If you&apos;re relying on long-form thought
            leadership, expect to lose to a competitor&apos;s structured FAQ page.
          </Callout>

          <h2>What to do when a competitor dominates your citations</h2>
          <p>
            Run a <a href="/geo-audit">free GEO audit</a> on the competitor page Perplexity is
            citing. The audit will show you the specific structural and semantic signals that page
            is sending — schema, freshness, citation density, internal linking — and which of
            them you can match or beat. Then publish, wait one Perplexity cycle, and re-measure
            in Livesov.
          </p>
          <p>
            For a complete framework, read our{' '}
            <a href="/geo-optimization">Generative Engine Optimization guide</a> and our pillar
            article on <a href="/blog">share of voice in AI search</a>.
          </p>
        </LongForm>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px" width={1000}>
        <SectionHeader
          label="Why Livesov"
          title="Livesov vs. one-off citation checkers and SEO suites"
          subtitle="Perplexity citation data is only valuable if you can see it over time — and against your competitors. Livesov is the only tool that gives you both."
        />
        <ComparisonTable
          headers={['Capability', 'Livesov', 'Citation checkers', 'Traditional SEO']}
          rows={comparisonRows}
        />
      </Section>

      <FaqSection
        title="Perplexity brand tracking FAQ"
        subtitle="Common questions from marketers and SEO leads adopting Perplexity tracking."
        items={faqs}
      />

      <PillarLinks
        title="Track every AI platform that drives discovery"
        links={[
          {
            href: '/chatgpt-brand-tracking',
            label: 'ChatGPT tracking',
            description: 'OpenAI&rsquo;s flagship — most-used AI assistant on earth.',
          },
          {
            href: '/claude-brand-tracking',
            label: 'Claude tracking',
            description: 'Anthropic&rsquo;s analytical AI for research and B2B buyers.',
          },
          {
            href: '/gemini-brand-tracking',
            label: 'Gemini tracking',
            description: 'Google&rsquo;s AI in Search, Workspace, and Android.',
          },
          {
            href: '/grok-brand-tracking',
            label: 'Grok tracking',
            description: 'xAI&rsquo;s Grok with real-time X (Twitter) data.',
          },
          {
            href: '/geo-audit',
            label: 'Free GEO audit',
            description: 'Score any URL for AI citation-readiness in seconds.',
          },
          {
            href: '/geo-optimization',
            label: 'GEO optimization guide',
            description: 'The complete playbook for ranking in AI answers.',
          },
        ]}
      />
    </SeoLayout>
  );
}
