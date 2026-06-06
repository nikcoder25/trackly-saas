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
  title: 'Claude Brand Tracking | Track Mentions on Claude AI',
  description:
    'Track how Anthropic\'s Claude mentions and recommends your brand. An LLM visibility tracker for share of voice, sentiment, and hallucinations.',
  keywords:
    'claude brand tracking, anthropic ai monitoring, claude visibility, claude brand mentions, claude opus tracking, claude sonnet tracking, claude haiku tracking, claude rank tracking',
  alternates: { canonical: '/claude-brand-tracking' },
  openGraph: {
    title: 'Claude Brand Tracking | Track Mentions on Claude AI',
    description:
      'Track how Anthropic\'s Claude mentions and recommends your brand. An LLM visibility tracker for share of voice, sentiment, and hallucinations.',
    url: 'https://livesov.com/claude-brand-tracking',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Claude Brand Tracking — Monitor Anthropic AI Mentions | Livesov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Claude Brand Tracking | Track Mentions on Claude AI',
    description:
      'Track how Anthropic\'s Claude mentions and recommends your brand. An LLM visibility tracker for share of voice, sentiment, and hallucinations.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const features = [
  {
    icon: '◎',
    title: 'Mention rate tracking',
    description:
      'Measure how often Claude names your brand across thousands of prompts, segmented by model family and query intent.',
  },
  {
    icon: '#',
    title: 'Recommendation rank',
    description:
      'When Claude lists options, where do you appear? Track position 1, 2, 3 and below across comparison and shortlist prompts.',
  },
  {
    icon: '✺',
    title: 'Nuanced sentiment analysis',
    description:
      'Claude writes carefully — its descriptions are nuanced and qualified. We classify the actual stance taken about your brand, not just polarity.',
  },
  {
    icon: '⚔',
    title: 'Competitor co-mention map',
    description:
      'See exactly which competitors Claude pairs you with, and which alternative it recommends when you&rsquo;re not the answer.',
  },
  {
    icon: '⚠',
    title: 'Hallucination guardrails',
    description:
      'Claude rarely fabricates, but when it does, the confident, well-written tone makes it dangerous. We flag every drift from your canonical facts.',
  },
  {
    icon: '◭',
    title: 'Opus vs. Sonnet vs. Haiku drift',
    description:
      'Different Claude model tiers give meaningfully different answers. We track them in parallel so you see drift between releases and tiers.',
  },
];

const supportedModels = [
  ['Claude Opus 4', 'Highest reasoning, longest context', 'Used for deep B2B research and analytical buying'],
  ['Claude Sonnet 4', 'Balanced performance, mainstream default', 'Most prevalent in production deployments'],
  ['Claude Haiku 4', 'Fast, cheap, latency-sensitive', 'Powers many embedded Claude experiences and agents'],
  ['Claude 3.5 Sonnet (legacy)', 'Previous-generation mainstream model', 'Still widely deployed — tracked for compatibility'],
];

const steps = [
  {
    title: 'Connect your brand',
    description:
      'Add your brand, domain, products, and competitors. Livesov drafts a seed set of Claude-style research prompts immediately.',
  },
  {
    title: 'Curate tracked prompts',
    description:
      'Review the AI-generated prompt set. Claude users skew analytical — add the &quot;why,&quot; &quot;compare,&quot; and &quot;recommend for&quot; prompts your buyers actually ask.',
  },
  {
    title: 'Automated Claude runs',
    description:
      'We query Claude on your schedule across Opus, Sonnet, and Haiku, run each prompt multiple times, and capture the full response.',
  },
  {
    title: 'Trends, alerts, evidence',
    description:
      'Visibility shifts, sentiment swings, and hallucinations turn into trend lines, email alerts, and downloadable evidence reports.',
  },
];

const useCases = [
  {
    icon: '⬢',
    title: 'Developer-tool & API brands',
    description:
      'Claude is the AI of choice for technical buyers. If you sell to developers, Claude rank is a leading indicator of bottoms-up adoption.',
  },
  {
    icon: '◑',
    title: 'Professional services',
    description:
      'Consulting, law, finance — Claude&rsquo;s nuanced tone makes it the default for high-stakes research. Showing up well in Claude shapes RFP shortlists.',
  },
  {
    icon: '✸',
    title: 'Knowledge-work SaaS',
    description:
      'Claude is embedded in Notion, Slack, Quora, and dozens of B2B tools. Its recommendations leak into your prospects&rsquo; daily workflows.',
  },
];

const faqs = [
  {
    question: 'Why track Claude separately from ChatGPT?',
    answer:
      'Claude and ChatGPT are trained differently, fine-tuned differently, and aligned by different teams. They produce meaningfully different answers to the same prompt — especially for nuanced B2B research. If you only track one, you have only half the picture.',
  },
  {
    question: 'Which Claude models does Livesov support?',
    answer:
      'Livesov tracks the full Claude 4 family (Opus, Sonnet, Haiku) plus Claude 3.5 Sonnet for legacy comparison. We add new Claude releases as Anthropic ships them, typically within days, with no historical data loss.',
  },
  {
    question: 'Does Livesov use the Anthropic API directly?',
    answer:
      'Yes. Livesov calls Anthropic&rsquo;s official API for every Claude query, with full audit-grade logging. On Agency plans you can bring your own Anthropic API key for compliance or attribution.',
  },
  {
    question: 'How does Claude&rsquo;s sentiment differ from ChatGPT\'s?',
    answer:
      'Claude tends to write longer, more qualified, more balanced descriptions — which means standard polarity sentiment can be misleading. Livesov\'s sentiment model is tuned for Claude&rsquo;s style and reports nuance (e.g. &quot;positive with caveats,&quot; &quot;neutral comparison&quot;) instead of a single +/− score.',
  },
  {
    question: 'Does Claude hallucinate about brands?',
    answer:
      'Less often than other models, but yes — and when it does, the confident, well-written tone makes it more believable to readers. Livesov&rsquo;s canonical facts store lets you flag every drift between Claude&rsquo;s output and your verified brand facts.',
  },
  {
    question: 'Can I see the exact Claude response for a metric?',
    answer:
      'Yes. Every datapoint in your dashboard links back to the raw Claude response, with model, prompt, timestamp, and token usage. Exportable as CSV or PDF.',
  },
  {
    question: 'How fresh is Claude tracking data?',
    answer:
      'Claude has a fixed knowledge cutoff per model. Livesov re-queries on your plan&rsquo;s schedule (daily on Agency, every 2 days on Pro, weekly on Starter), so even though Claude itself doesn&rsquo;t browse the web by default, your measurement of its current opinions stays current.',
  },
];

const comparisonRows = [
  ['Tracks Claude Opus, Sonnet, Haiku', '✓ All models', 'Single model', 'Not supported'],
  ['Per-prompt multi-run aggregation', '✓ 3–10× per run', 'Single shot', 'Single shot'],
  ['Recommendation rank tracking', '✓ Native', 'Manual', 'Manual'],
  ['Sentiment tuned for Claude&rsquo;s style', '✓ Native', 'Generic', 'Not supported'],
  ['Hallucination / fact-drift alerts', '✓ Canonical facts store', 'Not supported', 'Not supported'],
  ['Competitor co-occurrence', '✓ Up to 20 competitors', 'Manual', 'Manual'],
  ['Scheduled monitoring', '✓ Daily / 2-day / weekly', 'Manual', 'Manual'],
  ['Evidence export with full response', '✓ CSV + PDF', 'Limited', 'Not supported'],
];

export default function ClaudeBrandTrackingPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Claude Brand Tracking', url: '/claude-brand-tracking' }]} />

      <SeoHero
        title={
          <>
            Track Your Brand in{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#d97706] to-[#b45309]">
              Claude
            </span>
          </>
        }
        subtitle="Monitor how Anthropic's Claude — Opus, Sonnet, and Haiku — mentions, ranks, and recommends your brand. Track share of voice, nuanced sentiment, and hallucinations across every Claude model release."
        ctaText="Start tracking Claude — free"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '4+', label: 'Claude models tracked' },
            { value: '20', label: 'Competitor brands monitored' },
            { value: '24/7', label: 'Automated coverage' },
            { value: '7-day', label: 'Free trial, no card' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="Why Claude matters"
          title="Claude is the AI of choice for high-stakes B2B buyers"
          subtitle="Anthropic&rsquo;s Claude has quietly become the model of choice for technical buyers, professional services, and any team that needs nuanced answers it can defend in a meeting."
        />
        <LongForm>
          <p>
            Claude doesn&apos;t have ChatGPT&apos;s consumer scale, but it has something arguably
            more valuable to B2B brands: a reputation for thoughtful, careful, well-reasoned
            answers. That reputation pulls in exactly the buyers most likely to be running formal
            vendor evaluations — CTOs, principal engineers, partners at professional services
            firms, and analysts. When Claude lists you (or doesn&apos;t), it shapes their shortlist
            before a sales team ever enters the picture.
          </p>
          <p>
            Claude is also embedded in dozens of products your prospects already use: Notion,
            Slack, Quora, Zoom, GitHub Copilot Workspaces, and the entire Claude.ai consumer surface.
            Every time one of those products surfaces a Claude-generated answer, your brand is
            either in it, near it, or replaced by a competitor in it. Livesov is the measurement
            layer that turns that opaque process into a continuous, defensible report.
          </p>
        </LongForm>
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="What we measure"
          title="Six dimensions of Claude visibility"
          subtitle="Designed for Claude&rsquo;s nuanced, qualified, analytical answer style — not a generic mention checker bolted on."
        />
        <FeatureGrid items={features} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader label="How it works" title="First Claude visibility report in under 5 minutes" />
        <ProcessSteps steps={steps} />
      </Section>

      <Section pad="80px 24px" width={920}>
        <SectionHeader
          label="Model coverage"
          title="Every Claude tier your buyers actually use"
          subtitle="Different Claude models are tuned for different jobs. Tracking them in parallel reveals drift between releases and exposes tier-specific risks."
        />
        <ComparisonTable
          headers={['Claude model', 'What it is', 'Why it matters']}
          rows={supportedModels}
          highlightColumn={-1}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader label="Who tracks Claude" title="Where Claude visibility correlates with revenue" />
        <FeatureGrid items={useCases} />
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>How Claude decides what to recommend</h2>
          <p>
            Claude&apos;s recommendations are shaped by three forces: Anthropic&apos;s training
            corpus (web pages, books, code, conversations, and licensed data through the model
            cutoff), Anthropic&apos;s constitutional-AI alignment process (which encourages
            balanced, well-attributed answers), and — increasingly — system-prompt context and
            tools wired into the products that embed Claude.
          </p>
          <p>
            In practice this means Claude rewards brands that look <em>well-documented</em> on the
            open web: long, balanced, citation-heavy comparison articles; clearly written
            product documentation; and authoritative third-party reviews. Brands that rely on
            short, marketing-heavy pages tend to underperform in Claude — even when they
            dominate Google.
          </p>

          <h2>Why Claude&rsquo;s sentiment is different</h2>
          <p>
            Most AI sentiment scoring treats &quot;positive,&quot; &quot;negative,&quot; and
            &quot;neutral&quot; as a 3-class problem. That breaks on Claude. Claude almost never
            writes a flatly negative product description — it qualifies, contextualizes, and
            offers alternatives. The risk isn&apos;t Claude calling you bad; it&apos;s Claude
            calling you &quot;solid for small teams but typically replaced by [competitor] at
            enterprise scale&quot; in an otherwise glowing comparison.
          </p>
          <p>
            Livesov&apos;s sentiment model is tuned for Claude&apos;s style. We surface stance,
            qualifiers, comparative framing, and the implicit alternatives Claude recommends —
            so you can fix the actual problem, not just chase a polarity score.
          </p>

          <h2>Hallucination is rare in Claude — and that&rsquo;s exactly the risk</h2>
          <p>
            Claude is one of the most factually careful frontier models. That is good news on
            average and bad news on the tail. Because Claude rarely fabricates, the
            hallucinations it <em>does</em> emit are written confidently and survive scrutiny.
            A wrong founder name, a stale pricing tier, or a confused integration list, served
            by Claude, looks more authoritative than the same fabrication from a noisier model.
          </p>
          <p>
            Livesov&apos;s canonical facts store lets you define the truth: pricing, founders,
            supported regions, integration lists, security certifications. Every Claude response
            is scored against your facts and any drift is surfaced as an alert with the exact
            quote attached.
          </p>

          <Callout title="Pro tip" variant="tip">
            For Claude specifically, the highest-leverage source to correct hallucinations is
            usually your own documentation site. Claude weights well-structured docs heavily.
            A clean, dated, schema-marked-up doc page with the correct fact will out-pull a
            blog post or marketing page in Claude&rsquo;s next training cycle.
          </Callout>

          <h2>What to do when Claude rates a competitor higher</h2>
          <p>
            Use Livesov to identify the exact comparison prompts where the competitor wins, then
            check Claude&apos;s reasoning in the response text — Claude is unusually transparent
            about <em>why</em> it ranks one brand over another. Take those reasons and address
            them: missing capabilities, weaker third-party reviews, unclear documentation,
            outdated public information. Re-measure after one Claude release cycle.
          </p>
          <p>
            For the complete playbook, read our{' '}
            <a href="/geo-optimization">GEO optimization guide</a> and run a{' '}
            <a href="/geo-audit">free GEO audit</a> on the pages Claude is referencing.
          </p>
        </LongForm>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px" width={1000}>
        <SectionHeader
          label="Why Livesov"
          title="Livesov vs. one-off Claude prompts and generic SEO tools"
          subtitle="Claude visibility is only measurable at scale, with multi-run aggregation and a competitor benchmark. Livesov is the only platform that gives you both for Claude specifically."
        />
        <ComparisonTable
          headers={['Capability', 'Livesov', 'Manual Claude checks', 'Traditional SEO']}
          rows={comparisonRows}
        />
      </Section>

      <FaqSection
        title="Claude brand tracking FAQ"
        subtitle="Common questions from B2B marketing and SEO leads adopting Claude visibility tracking."
        items={faqs}
      />

      <PillarLinks
        title="Track every AI platform your buyers ask"
        links={[
          {
            href: '/chatgpt-brand-tracking',
            label: 'ChatGPT tracking',
            description: 'OpenAI&rsquo;s consumer-scale AI assistant.',
          },
          {
            href: '/perplexity-brand-tracking',
            label: 'Perplexity tracking',
            description: 'Citation-first AI search with explicit source URLs.',
          },
          {
            href: '/gemini-brand-tracking',
            label: 'Gemini tracking',
            description: 'Google&rsquo;s AI in Search, Workspace, and Android.',
          },
          {
            href: '/grok-brand-tracking',
            label: 'Grok tracking',
            description: 'xAI&rsquo;s Grok with real-time X (Twitter) signal.',
          },
          {
            href: '/geo-optimization',
            label: 'GEO optimization guide',
            description: 'The complete framework for ranking in AI answers.',
          },
          {
            href: '/pricing',
            label: 'Pricing & plans',
            description: 'Start free, scale to agency-level multi-brand tracking.',
          },
        ]}
      />
    </SeoLayout>
  );
}
