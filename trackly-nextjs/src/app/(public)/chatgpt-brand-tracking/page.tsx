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
  title: 'ChatGPT Brand Tracker | Track Mentions | Livesov',
  description:
    'The ChatGPT brand tracker that shows how ChatGPT mentions, ranks, and recommends your brand. Track share of voice, sentiment, and citations. Free.',
  keywords:
    'chatgpt brand tracking, chatgpt brand monitoring, chatgpt seo, ai visibility chatgpt, openai brand mentions, chatgpt rank tracking, chatgpt share of voice, gpt-5 brand tracking',
  alternates: { canonical: '/chatgpt-brand-tracking' },
  openGraph: {
    title: 'ChatGPT Brand Tracker | Track Mentions | Livesov',
    description:
      'The ChatGPT brand tracker that shows how ChatGPT mentions, ranks, and recommends your brand. Track share of voice, sentiment, and citations. Free.',
    url: 'https://livesov.com/chatgpt-brand-tracking',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ChatGPT Brand Tracking - Monitor Your AI Visibility | Livesov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChatGPT Brand Tracker | Track Mentions | Livesov',
    description:
      'The ChatGPT brand tracker that shows how ChatGPT mentions, ranks, and recommends your brand. Track share of voice, sentiment, and citations. Free.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const features = [
  {
    icon: '◎',
    title: 'Mention rate tracking',
    description:
      'Measure exactly how often ChatGPT names your brand across thousands of relevant prompts - sliced by query type, model, and time period.',
  },
  {
    icon: '#',
    title: 'Recommendation rank',
    description:
      'When ChatGPT lists alternatives, where do you appear? Track position 1, 2, 3 and below across product comparisons and "best of" prompts.',
  },
  {
    icon: '✺',
    title: 'Sentiment & tone',
    description:
      'Automatic positive / neutral / negative classification of every brand description ChatGPT generates, with the source quote attached.',
  },
  {
    icon: '⚔',
    title: 'Competitor co-occurrence',
    description:
      'See which competitors ChatGPT recommends alongside (or instead of) you, broken out by query intent.',
  },
  {
    icon: '⚠',
    title: 'Hallucination detection',
    description:
      'Define canonical facts about your brand. We flag every ChatGPT response that contradicts them so PR and support can react fast.',
  },
  {
    icon: '⟁',
    title: 'Citation capture',
    description:
      'When ChatGPT Search returns sources, we log every URL - so you know which of your pages (and which competitor pages) feed its answers.',
  },
];

const supportedModels = [
  ['GPT-5', 'Flagship multimodal model', 'Most-used in production traffic'],
  ['GPT-5 mini', 'Faster, cheaper variant', 'Default for many embedded ChatGPT experiences'],
  ['GPT-5 Search', 'Live web-grounded responses', 'Where citations and source URLs appear'],
  ['o-series reasoning', 'Long-form reasoning chains', 'Tracked separately for analytical queries'],
];

const steps = [
  {
    title: 'Connect your brand',
    description:
      'Add your brand name, domain, product list, and competitor set. We seed an initial query set in under 60 seconds.',
  },
  {
    title: 'Generate tracked prompts',
    description:
      'Our prompt generator drafts 20–50 real-world questions buyers ask ChatGPT in your category. Edit, approve, or add your own.',
  },
  {
    title: 'Automated ChatGPT runs',
    description:
      'Livesov queries ChatGPT on your schedule - daily, every 2 days, or weekly - using temperature controls that mirror real user sessions.',
  },
  {
    title: 'Parse, score, alert',
    description:
      'Every response is parsed for mentions, rank, sentiment, citations, and hallucinations, then surfaced as trend lines and email alerts.',
  },
];

const useCases = [
  {
    icon: '⬢',
    title: 'B2B SaaS launches',
    description:
      'Tracking the day ChatGPT starts recommending your product alongside the incumbent is a leading indicator of category entry.',
  },
  {
    icon: '◑',
    title: 'Comparison shopping',
    description:
      'For "best X for Y" queries, recommendation rank in ChatGPT correlates strongly with bottom-of-funnel signups.',
  },
  {
    icon: '✸',
    title: 'PR & reputation',
    description:
      'Catch hallucinations and outdated facts ChatGPT spreads about your brand before they ship in customer-facing answers.',
  },
];

const faqs = [
  {
    question: 'How does Livesov actually query ChatGPT?',
    answer:
      'Livesov calls the OpenAI API directly using your tracked prompts. We rotate models (GPT-5, GPT-5 mini, GPT-5 Search) and run each prompt multiple times to capture variance, then aggregate results into mention rate, share of voice, and rank metrics.',
  },
  {
    question: 'Do I need my own OpenAI API key?',
    answer:
      'No. Livesov\'s credits cover all ChatGPT API calls. If you prefer bring-your-own-key for compliance reasons, the Agency plan supports tenant-scoped OpenAI keys.',
  },
  {
    question: 'How often is data refreshed?',
    answer:
      'Free runs weekly, Starter runs every 2 days, and Pro and Agency run daily. You can also trigger manual runs at any time within your plan\'s daily cap.',
  },
  {
    question: 'Does ChatGPT give the same answer twice?',
    answer:
      'No - ChatGPT responses are non-deterministic. That\'s why Livesov runs every tracked prompt multiple times and aggregates results into statistically meaningful trends rather than reporting a single snapshot.',
  },
  {
    question: 'Will Livesov pick up mentions in ChatGPT Search citations?',
    answer:
      'Yes. When ChatGPT Search returns source URLs, we parse and log every citation so you can see which pages on your site (and competitors\') feed ChatGPT\'s answers.',
  },
  {
    question: 'Can I see the raw ChatGPT response that generated a mention?',
    answer:
      'Always. Every metric in Livesov links to the underlying ChatGPT response with timestamp, model, and prompt - and you can export the full evidence as CSV or PDF.',
  },
  {
    question: 'How is this different from a ChatGPT plugin or "Mentions" tool?',
    answer:
      'Most ChatGPT mention checkers run a single prompt once. Livesov runs hundreds of prompts on a recurring schedule, tracks rank and sentiment, monitors competitors, and detects hallucinations - giving you a continuous brand monitoring system, not a one-off check.',
  },
];

const comparisonRows = [
  ['Tracks GPT-5, GPT-5 mini, ChatGPT Search', '✓ All models', 'Single model only', 'Not supported'],
  ['Multi-run aggregation per prompt', '✓ 3–10× per run', 'Single shot', 'Single shot'],
  ['Rank tracking in recommendation lists', '✓ Native', 'Manual', 'Manual'],
  ['Sentiment analysis of brand descriptions', '✓ Native', 'Limited', 'Not supported'],
  ['Hallucination / fact-drift detection', '✓ Canonical facts store', 'Not supported', 'Not supported'],
  ['Competitor co-occurrence', '✓ Native', 'Manual', 'Manual'],
  ['Scheduled monitoring + alerts', '✓ Daily / 2-day / weekly', 'Manual', 'Manual'],
  ['Evidence export (full response)', '✓ CSV + PDF', 'Limited', 'Limited'],
];

export default function ChatGPTBrandTrackingPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'ChatGPT Brand Tracking', url: '/chatgpt-brand-tracking' }]} />

      <SeoHero
        title={
          <>
            Track Your Brand in{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#19c37d] to-[#10a37f]">
              ChatGPT
            </span>
          </>
        }
        subtitle="Monitor how OpenAI's ChatGPT mentions, ranks, and recommends your brand across GPT-5, GPT-5 mini, and ChatGPT Search. Track share of voice, sentiment, citations, and hallucinations - automatically."
        ctaText="Start tracking ChatGPT - free"
      />

      {/* ── Trust bar ────────────────────────────── */}
      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '5', label: 'AI platforms tracked' },
            { value: '4+', label: 'ChatGPT models supported' },
            { value: '24/7', label: 'Automated monitoring' },
            { value: '7-day', label: 'Free trial, no card' },
          ]}
        />
      </Section>

      {/* ── Why it matters ───────────────────────── */}
      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="Why this matters"
          title="ChatGPT is the new homepage for product discovery"
          subtitle="More than 300 million weekly active users ask ChatGPT for product recommendations, vendor comparisons, and category research. If you can't see how you appear in those answers, you can't influence them."
        />
        <LongForm>
          <p>
            Traditional SEO tools tell you where you rank on Google. They cannot tell you whether
            ChatGPT calls your product &quot;the leader in the category,&quot; lists a competitor first, or
            confidently misstates your pricing. That gap is the largest blind spot in modern brand
            marketing - and it&apos;s exactly what <strong>Livesov</strong> closes.
          </p>
          <p>
            Livesov queries ChatGPT the way your customers do. We send hundreds of real-world prompts
            (&quot;best CRM for early-stage startups,&quot; &quot;is [your brand] better than [competitor],&quot;
            &quot;recommend a project management tool for design agencies&quot;) to GPT-5, GPT-5 mini, and
            ChatGPT Search on a schedule - then parse every response for mentions, rank, sentiment,
            and citations. The result is a continuous, defensible measurement of your visibility
            inside OpenAI&apos;s ChatGPT.
          </p>
        </LongForm>
      </Section>

      {/* ── Feature grid ─────────────────────────── */}
      <Section pad="80px 24px">
        <SectionHeader
          label="What we measure"
          title="Six dimensions of ChatGPT visibility"
          subtitle="Mention rate is the start, not the finish. Livesov tracks the full picture so you can act on real signal - not vibes."
        />
        <FeatureGrid items={features} />
      </Section>

      {/* ── How it works ─────────────────────────── */}
      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="How it works"
          title="From signup to first ChatGPT report in under 5 minutes"
        />
        <ProcessSteps steps={steps} />
      </Section>

      {/* ── Supported models ────────────────────── */}
      <Section pad="80px 24px" width={920}>
        <SectionHeader
          label="Model coverage"
          title="Every ChatGPT model your customers actually use"
          subtitle="OpenAI ships new models constantly, and each one answers your category prompts differently. We track them in parallel so you can see drift between releases."
        />
        <ComparisonTable
          headers={['ChatGPT model', 'What it is', 'Why it matters']}
          rows={supportedModels}
          highlightColumn={-1}
        />
      </Section>

      {/* ── Use cases ───────────────────────────── */}
      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="Who tracks ChatGPT"
          title="Why brands measure their ChatGPT presence"
        />
        <FeatureGrid items={useCases} />
      </Section>

      {/* ── Long-form SEO content ───────────────── */}
      <Section pad="80px 24px">
        <LongForm>
          <h2>How ChatGPT decides which brands to recommend</h2>
          <p>
            ChatGPT&apos;s recommendations are a blend of three signals: its pre-training corpus
            (web pages, books, code, and licensed datasets up to its knowledge cutoff), its
            post-training reinforcement (which shapes which sources it trusts), and - for the
            search-enabled variants - live web results retrieved at query time.
          </p>
          <p>
            That means improving your visibility in ChatGPT is not a single lever. You have to win
            on the open web (where ChatGPT trained), in high-authority third-party reviews (where
            ChatGPT&apos;s preferences are shaped), and in fresh, indexable content (which ChatGPT
            Search retrieves live). Livesov is the measurement layer that lets you tell whether
            each of those investments is actually moving the needle.
          </p>

          <h2>Mention rate vs. share of voice - and why both matter</h2>
          <p>
            <strong>Mention rate</strong> is the percentage of tracked prompts in which ChatGPT
            names your brand at all. It is the most basic visibility metric.
          </p>
          <p>
            <strong>Share of voice</strong> is your mentions divided by total brand mentions in
            the same set of prompts. A 100% mention rate is meaningless if every answer also names
            five competitors above you. Share of voice corrects for that - it&apos;s the closest
            analogue to traditional market share inside an AI answer.
          </p>
          <p>
            Livesov reports both, segmented by query intent: top-of-funnel (&quot;what is X&quot;),
            mid-funnel (&quot;best X for Y&quot;), and bottom-of-funnel (&quot;X vs Y&quot;). Most teams find
            their visibility shifts dramatically across the funnel - strong in branded queries, weak in
            comparison queries - and the prioritisation falls out of the data.
          </p>

          <h2>Why ChatGPT hallucinations are a real PR risk</h2>
          <p>
            ChatGPT confidently invents pricing, founders, integrations, and feature lists. When
            those answers are wrong, they shape buyer perception before your sales team ever
            enters the conversation. Worse, OpenAI&apos;s system prompts make ChatGPT sound certain
            even when its training data is stale.
          </p>
          <p>
            Livesov&apos;s <strong>canonical facts store</strong> lets you define the truth about your
            brand - pricing tiers, founding year, supported regions, key integrations - and then
            automatically flags every ChatGPT response that contradicts them. You get an alert,
            the evidence, and a workflow to push corrections out into the web sources ChatGPT
            references.
          </p>

          <Callout title="Pro tip" variant="tip">
            The fastest way to fix a ChatGPT hallucination is rarely a takedown request - it&apos;s
            updating the high-authority third-party sources ChatGPT trusts (G2, Capterra, Wikipedia,
            comparison roundups). Livesov&apos;s citation tracker shows you exactly which URLs ChatGPT
            references, so you know where to invest.
          </Callout>

          <h2>How to improve your ChatGPT visibility</h2>
          <p>
            We publish a complete playbook in our{' '}
            <a href="/geo-optimization">Generative Engine Optimization guide</a>, but the short
            version: ChatGPT rewards consistent, structured, well-cited information that appears
            across many authoritative third-party sources. That means investing in comparison
            content, review-site presence, schema markup, and an{' '}
            <a href="/tools/llms-txt-generator">llms.txt</a> file that tells AI crawlers exactly
            how to read your site.
          </p>
          <p>
            Start by running a free <a href="/geo-audit">GEO audit</a> on your highest-intent
            pages, then use Livesov to measure whether your changes improved ChatGPT mention rate,
            rank, and sentiment over the next four weeks. Most buyers also research on Perplexity,
            so see our guide on{' '}
            <a href="/blog/track-brand-mentions-chatgpt-and-perplexity">tracking brand mentions in ChatGPT and Perplexity</a>{' '}
            together.
          </p>
        </LongForm>
      </Section>

      {/* ── Comparison vs alternatives ─────────── */}
      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px" width={1000}>
        <SectionHeader
          label="Built for ChatGPT"
          title="Livesov vs. one-off ChatGPT mention checkers"
          subtitle="Free tools tell you what ChatGPT said today. Livesov tells you what it has been saying for the last 90 days, and what it&rsquo;s saying about your competitors."
        />
        <ComparisonTable
          headers={['Capability', 'Livesov', 'Free mention checkers', 'Traditional SEO tools']}
          rows={comparisonRows}
        />
      </Section>

      {/* ── FAQ ──────────────────────────────────── */}
      <FaqSection
        title="ChatGPT brand tracking FAQ"
        subtitle="Everything teams ask before they switch ChatGPT visibility from gut feel to measurement."
        items={faqs}
      />

      {/* ── Pillar links ─────────────────────────── */}
      <PillarLinks
        title="Track every AI platform, not just ChatGPT"
        links={[
          {
            href: '/perplexity-brand-tracking',
            label: 'Perplexity tracking',
            description: 'Citation-heavy AI search with live web grounding.',
          },
          {
            href: '/claude-brand-tracking',
            label: 'Claude tracking',
            description: 'Anthropic\'s thoughtful, analytical AI model family.',
          },
          {
            href: '/gemini-brand-tracking',
            label: 'Gemini tracking',
            description: 'Google\'s AI, integrated into Search and Workspace.',
          },
          {
            href: '/grok-brand-tracking',
            label: 'Grok tracking',
            description: 'xAI\'s real-time Grok with live X (Twitter) signal.',
          },
          {
            href: '/geo-optimization',
            label: 'GEO optimization guide',
            description: 'The full playbook for ranking in AI answers.',
          },
          {
            href: '/pricing',
            label: 'Pricing & plans',
            description: 'Start free, scale to agency-level tracking.',
          },
        ]}
      />
    </SeoLayout>
  );
}
