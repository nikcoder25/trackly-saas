import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  FeatureGrid,
  StatsBar,
  ProcessSteps,
  FaqSection,
  Callout,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'How AI Visibility Tracking Works | Livesov',
  description:
    'See how Livesov\'s AI visibility tracker queries ChatGPT, Perplexity, Claude, Gemini, and Grok daily, then scores your brand\'s share of voice.',
  keywords:
    'how livesov works, ai brand tracking methodology, ai visibility measurement, llm brand monitoring, ai share of voice methodology, ai citation tracking explained',
  alternates: { canonical: '/how-it-works' },
  openGraph: {
    title: 'How AI Visibility Tracking Works | Livesov',
    description:
      'See how Livesov\'s AI visibility tracker queries ChatGPT, Perplexity, Claude, Gemini, and Grok daily, then scores your brand\'s share of voice.',
    url: 'https://livesov.com/how-it-works',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'How Livesov Works - AI Brand Tracking Methodology',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'How AI Visibility Tracking Works | Livesov',
    description:
      'See how Livesov\'s AI visibility tracker queries ChatGPT, Perplexity, Claude, Gemini, and Grok daily, then scores your brand\'s share of voice.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const steps = [
  {
    title: 'Set up your brand',
    description:
      'Enter your brand, domain, products, and competitors. Livesov seeds a baseline query set tuned to your category in under 60 seconds.',
  },
  {
    title: 'Configure tracked prompts',
    description:
      'Pick AI platforms (ChatGPT, Claude, Gemini, Perplexity, Grok), choose competitors to benchmark, and set a monitoring schedule (daily, every 2 days, or weekly).',
  },
  {
    title: 'Automated multi-platform runs',
    description:
      'Livesov sends each tracked prompt to every selected AI platform on schedule, running it multiple times per cycle to capture variance.',
  },
  {
    title: 'AI response parsing',
    description:
      'Every response is parsed for mentions, recommendation rank, sentiment, competitor co-occurrence, citations, and hallucinations.',
  },
  {
    title: 'Dashboard, trends, alerts',
    description:
      'Results stream into your dashboard as trend lines, share-of-voice charts, citation maps, and email alerts when visibility shifts.',
  },
  {
    title: 'Action loop',
    description:
      'Use AI-generated recommendations to improve your content and positioning, then watch the next cycle measure whether your changes moved the needle.',
  },
];

const dataSources = [
  {
    icon: 'ChatGPT',
    title: 'OpenAI ChatGPT',
    description: 'Direct API access to GPT-4o, GPT-4o-mini, and GPT-4o Search Preview - including o1/o3-mini reasoning models.',
  },
  {
    icon: 'Claude',
    title: 'Anthropic Claude',
    description: 'Direct Anthropic API for Claude Opus 4, Sonnet 4, Haiku 4, and the 3.5 family for legacy comparison.',
  },
  {
    icon: 'Gemini',
    title: 'Google Gemini',
    description: 'Direct Google AI / Vertex API for Gemini 2.5 Pro, 2.5 Flash, Flash-Lite, and grounded variants (AI Overviews simulation).',
  },
  {
    icon: 'Perplexity',
    title: 'Perplexity Sonar',
    description: 'Direct Perplexity API for Sonar, Sonar Pro, Sonar Reasoning, and Deep Research - with full citation capture.',
  },
  {
    icon: 'Grok',
    title: 'xAI Grok',
    description: 'Direct xAI API for Grok 4, Grok 3, Grok 3 Mini, and the live-search variant grounded on real-time X data.',
  },
  {
    icon: 'Audit',
    title: 'GEO Audit engine',
    description: 'Headless fetcher + structural analyzer that scores any URL for AI-citation readiness - schema, freshness, attribution, and 30+ other signals.',
  },
];

const metrics = [
  {
    icon: '◎',
    title: 'Mention rate',
    description: 'Percentage of tracked prompts in which an AI platform names your brand at all. The baseline visibility metric.',
  },
  {
    icon: '◑',
    title: 'Share of voice',
    description: 'Your mentions divided by total brand mentions in the same prompts - the AI-era equivalent of market share.',
  },
  {
    icon: '#',
    title: 'Recommendation rank',
    description: 'When AI lists alternatives, where do you appear? Tracked position-by-position across every monitored prompt.',
  },
  {
    icon: '✺',
    title: 'Sentiment',
    description: 'Tuned per-platform classifier scoring the stance, qualifiers, and implicit recommendation of every brand description.',
  },
  {
    icon: '⟁',
    title: 'Citations',
    description: 'For citation-capable platforms (Perplexity, ChatGPT Search, Gemini grounded), every source URL logged and ranked.',
  },
  {
    icon: '⚠',
    title: 'Hallucinations',
    description: 'Drift detection between AI outputs and your canonical brand facts, with the exact quote and source attached.',
  },
];

const faqs = [
  {
    question: 'Do you query the actual ChatGPT / Claude / Gemini / Perplexity / Grok APIs?',
    answer:
      'Yes. Livesov calls the official API of every supported AI platform directly. We do not scrape, simulate, or proxy. Every response in your dashboard comes from a real, billable call to the platform.',
  },
  {
    question: 'How many runs do you do per prompt?',
    answer:
      'LLM responses are non-deterministic, so single-shot measurement is misleading. Livesov runs each tracked prompt multiple times per cycle (typically 3–10×, plan-dependent) and aggregates results into share-of-voice, mention rate, and rank metrics. You can configure runs-per-prompt on Pro and Agency plans.',
  },
  {
    question: 'How are mentions detected? What about variants and misspellings?',
    answer:
      'Mentions use a hybrid pipeline: deterministic alias matching (brand + variants + product names you configure) plus an LLM-based normalizer that catches misspellings, abbreviations, and contextual references. False positives are surfaced for review and learned from over time.',
  },
  {
    question: 'How does sentiment analysis actually work?',
    answer:
      'Each AI platform has a different writing style - Claude is qualified, Grok is irreverent, Gemini is list-heavy. We run a per-platform classifier tuned on platform-specific responses, surfacing stance, comparative framing, and implicit recommendation - not just a +/− score.',
  },
  {
    question: 'What is the hallucination detector?',
    answer:
      'You define canonical facts about your brand (pricing tiers, founding year, supported regions, integration list, security certifications). Every AI response is scored against your facts, and contradictions are flagged with the exact quote, platform, prompt, and timestamp.',
  },
  {
    question: 'Can I see the raw AI response behind every metric?',
    answer:
      'Always. Every metric in Livesov links to the underlying response with model, prompt, timestamp, and tokens. Bulk export is available as CSV or PDF for evidence, audits, and client deliverables.',
  },
  {
    question: 'How long does setup take?',
    answer:
      'About 5 minutes. Add your brand and competitors, approve the seed prompt set Livesov drafts, pick platforms, and your first run starts immediately. Your first full report is usually ready inside an hour.',
  },
  {
    question: 'Can I bring my own API keys?',
    answer:
      'Yes, on Agency plans. You can supply tenant-scoped OpenAI, Anthropic, Google, Perplexity, and xAI keys for compliance, attribution, or to use your own enterprise rate limits.',
  },
];

export default function HowItWorksPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'How It Works', url: '/how-it-works' }]} />

      <SeoHero
        title={
          <>
            How <span className="text-[var(--brand)]">Livesov</span> works
          </>
        }
        subtitle="A systematic, multi-platform, multi-run measurement system for AI brand visibility - built from the API up to give you defensible numbers, not screenshots."
        ctaText="Try it free - no card"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '5', label: 'AI platforms covered' },
            { value: '15+', label: 'AI models monitored' },
            { value: '3–10×', label: 'Runs per prompt, per cycle' },
            { value: '24/7', label: 'Automated coverage' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="The six-step loop"
          title="From signup to action, in one continuous cycle"
          subtitle="Livesov is not a one-off audit. It&rsquo;s a measurement loop: monitor → parse → score → alert → act → re-measure. Every week, the same loop runs and your trends update."
        />
        <ProcessSteps steps={steps} />
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="Data sources"
          title="Direct API access - every model, every run"
          subtitle="No scraping, no simulation. Every metric in Livesov comes from a real, billable call to the AI platform&rsquo;s official API."
        />
        <FeatureGrid items={dataSources} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="What we measure"
          title="Six core metrics, one unified dashboard"
          subtitle="Every metric is computed per-platform and rolled up cross-platform, so you can see both individual model behaviour and overall AI visibility."
        />
        <FeatureGrid items={metrics} />
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>The methodology in detail</h2>
          <p>
            AI brand tracking sounds easy until you build it. The complications are the
            interesting part - and they&apos;re why naive screenshot tools and one-off prompt
            checkers produce noise that looks like data. Here&apos;s how Livesov handles each one.
          </p>

          <h3>Non-determinism: LLMs don&rsquo;t give the same answer twice</h3>
          <p>
            Every modern LLM samples from a probability distribution. Run the same prompt twice
            and you get different wording, sometimes different brands, sometimes a different
            rank order. The naive solution - sample once - gives you a snapshot of noise.
          </p>
          <p>
            Livesov solves this by running every tracked prompt multiple times per cycle (3–10×
            depending on plan), with controlled temperature and explicit per-run seeding where
            the API supports it. We aggregate to mention rate, rank distribution, and confidence
            intervals - so a one-time fluke can&apos;t move your dashboard.
          </p>

          <h3>Mention detection: aliases, variants, and ambiguity</h3>
          <p>
            &quot;Stripe&quot; could mean the payments company or a strip of paint. &quot;Apple&quot;
            could mean the company or the fruit. &quot;Notion&quot; is sometimes a synonym for
            &quot;idea.&quot; And every brand has multiple legitimate variants - product names,
            abbreviations, casual references.
          </p>
          <p>
            Our mention pipeline combines deterministic alias matching (you configure your
            brand&apos;s known variants) with an LLM-based contextual classifier that resolves
            ambiguity from surrounding sentences. False positives are surfaced for review and
            improve the classifier over time. The result is a mention count you can defend in a
            board meeting.
          </p>

          <h3>Rank tracking in unstructured prose</h3>
          <p>
            LLMs don&apos;t return a clean ordered list. They write sentences. Detecting that
            &quot;Stripe and Adyen lead the space, with Braintree as a strong third-place
            option&quot; means rank 1 for Stripe, rank 2 for Adyen, and rank 3 for Braintree
            requires parsing the actual prose, including hedging language and comparative
            framing. Livesov&apos;s parser is trained per-platform - Claude and Gemini phrase
            recommendations very differently from ChatGPT and Grok - and the results are
            verifiable against the linked raw response.
          </p>

          <h3>Sentiment: stance, not polarity</h3>
          <p>
            Generic +/− sentiment misses what matters in AI brand mentions. The actual risk
            isn&apos;t Claude calling you bad - it&apos;s Claude calling you &quot;solid for
            small teams but typically replaced at enterprise scale,&quot; or Grok endorsing you
            with a sarcastic aside that reads as positive to a human but negative to a
            classifier. Our per-platform sentiment models capture stance, qualifiers, and
            implicit recommendation, not raw polarity.
          </p>

          <h3>Citation capture</h3>
          <p>
            For Perplexity, ChatGPT Search, and Gemini&apos;s grounded variants, we log every
            citation URL in rank order, the snippet it informed, and the domain. This is the
            most diagnostic data we collect - it tells you exactly which pages drive AI answers
            in your category, and which competitor pages are stealing your slot.
          </p>

          <h3>Hallucination detection</h3>
          <p>
            You define a small set of canonical facts about your brand: pricing tiers, founders,
            supported regions, integrations, certifications. Every AI response is automatically
            checked against your facts; contradictions trigger an alert with the exact quote
            attached. This is the highest-impact feature in Livesov for PR and customer
            success teams - it catches AI-spread misinformation about your brand before a
            buyer ever sees it.
          </p>

          <Callout title="Why direct API access matters" variant="info">
            Tools that screenshot the ChatGPT or Perplexity web UI break constantly, get rate-
            limited, and capture stale data because of caching. Direct API access gives Livesov
            a clean, reproducible, audit-grade measurement - and lets us run dozens of prompts
            per minute without anyone noticing.
          </Callout>

          <h2>The action loop</h2>
          <p>
            Measurement without action is dashboard art. Livesov closes the loop with AI-
            generated recommendations: for every prompt where you&apos;re missing or losing
            rank, we surface the specific content gap, the competitor page winning the citation,
            and the structural fixes (schema, freshness, attribution, internal linking) most
            likely to move the next cycle.
          </p>
          <p>
            For a deeper look at what to optimise, read our{' '}
            <a href="/geo-optimization">GEO optimization guide</a> or run a free{' '}
            <a href="/geo-audit">GEO audit</a> on the pages you most want AI to cite.
          </p>
        </LongForm>
      </Section>

      <FaqSection
        title="How Livesov works - FAQ"
        subtitle="The most common questions from teams evaluating Livesov&rsquo;s methodology."
        items={faqs}
      />

      <PillarLinks
        title="Go deeper"
        links={[
          {
            href: '/chatgpt-brand-tracking',
            label: 'ChatGPT tracking',
            description: 'Methodology applied to OpenAI&rsquo;s ChatGPT specifically.',
          },
          {
            href: '/perplexity-brand-tracking',
            label: 'Perplexity tracking',
            description: 'How citation capture works for AI search.',
          },
          {
            href: '/use-cases',
            label: 'Use cases',
            description: 'How different teams use Livesov in practice.',
          },
          {
            href: '/integrations',
            label: 'Integrations',
            description: 'Every AI platform, notification channel, and export format.',
          },
          {
            href: '/pricing',
            label: 'Pricing & plans',
            description: 'Find the plan that fits your monitoring cadence.',
          },
          {
            href: '/geo-optimization',
            label: 'GEO optimization',
            description: 'The framework for actually improving AI visibility.',
          },
        ]}
      />
    </SeoLayout>
  );
}
