import type { Metadata } from 'next';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  FeatureGrid,
  StatsBar,
  FaqSection,
  Callout,
  LongForm,
  PillarLinks,
  ComparisonTable,
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'Generative Engine Optimization Tool — Livesov GEO Platform (2026)',
  description:
    'Livesov is the generative engine optimization (GEO) tool teams use to track and improve brand mentions across ChatGPT, Claude, Gemini, Perplexity, and Grok. Free audit, daily monitoring, 7-day trial — no credit card.',
  keywords:
    'generative engine optimization tool, geo tool, geo platform, ai visibility tool, ai mention tracking tool, llm visibility tool, ai brand monitoring software, chatgpt brand tracking tool, perplexity tracking tool',
  alternates: { canonical: '/generative-engine-optimization-tool' },
  openGraph: {
    title: 'Generative Engine Optimization Tool — Livesov GEO Platform',
    description:
      'Track and improve brand mentions across ChatGPT, Claude, Gemini, Perplexity, and Grok. Free audit, daily monitoring.',
    url: 'https://livesov.com/generative-engine-optimization-tool',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Livesov — Generative Engine Optimization Tool',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Generative Engine Optimization Tool — Livesov',
    description:
      'Track and improve brand mentions across ChatGPT, Claude, Gemini, Perplexity, and Grok.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const capabilities = [
  {
    icon: '◉',
    title: 'Daily multi-LLM monitoring',
    description:
      'Mention rate, citation share, rank, and sentiment tracked daily across ChatGPT, Claude, Gemini, Perplexity, and Grok. One dashboard, all five surfaces.',
  },
  {
    icon: '⌬',
    title: 'Prompt-level visibility',
    description:
      'Track the 50–500 prompts that actually drive your category. See where you win, where you lose, and exactly which competitor takes your slot.',
  },
  {
    icon: '⇋',
    title: 'Competitor benchmarking',
    description:
      'Track up to 10 competitors per brand. Share of voice, head-to-head matchups, gap analysis on the queries you both target.',
  },
  {
    icon: '⌘',
    title: 'Citation source extraction',
    description:
      'Every URL the AI cites is logged. Find which third-party sources are driving competitor mentions, and where you need placements.',
  },
  {
    icon: '◈',
    title: 'Sentiment & accuracy alerts',
    description:
      'Get notified when sentiment flips negative or when an AI invents a fact about your brand. Catch hallucinations before customers do.',
  },
  {
    icon: '⌁',
    title: 'Scheduled reports + alerts',
    description:
      'Weekly and monthly PDF reports. Slack and email alerts when mention rate moves. Built for in-house teams and agencies alike.',
  },
];

const livesovVsManual = [
  ['Platforms covered', 'ChatGPT, Claude, Gemini, Perplexity, Grok', 'Whatever you have time to copy-paste'],
  ['Cadence', 'Daily, automated', 'Weekly at best — usually slips'],
  ['Mention rate', 'Computed across all queries / all runs', 'Manual tally that drifts'],
  ['Citation share', 'Per-URL extraction, per-platform', 'Hard to compute reliably'],
  ['Sentiment', 'Per-mention sentiment scoring', 'Subjective, ad-hoc'],
  ['Competitor tracking', 'Up to 10 per brand, automatic', 'Doubles the manual work per competitor'],
  ['Cost', 'From free, then $39/mo', 'Engineer time × forever'],
];

const faqs = [
  {
    question: 'What is a generative engine optimization (GEO) tool?',
    answer:
      'A GEO tool is software that measures how generative engines — ChatGPT, Claude, Gemini, Perplexity, Grok — talk about your brand, and gives you the diagnostics to improve. The core jobs are: running real prompts against each LLM, extracting mentions and citations from the answers, computing mention rate, citation share, and rank, and showing how those metrics move over time. Livesov is one of the few GEO tools that covers all five major LLMs in a single dashboard.',
  },
  {
    question: 'How is Livesov different from a SERP tracker like Ahrefs or Semrush?',
    answer:
      'SERP trackers measure keyword positions in Google. Livesov measures whether AI platforms name and cite your brand. Different surface, different metric stack, different ranking signals. We use both internally — they answer different questions. For the deep comparison, see /vs/ahrefs and /vs/semrush.',
  },
  {
    question: 'Do I need technical skills to use Livesov?',
    answer:
      'No. The setup flow is: add your brand, pick the prompts you want to track (we suggest starter sets per category), pick up to 10 competitors, and we start running. The dashboard surfaces the changes in plain language. Most customers go from signup to first insight in under 15 minutes.',
  },
  {
    question: 'Can I try Livesov for free?',
    answer:
      'Yes. There is a 7-day free trial with no credit card on /pricing. You can also use the free audit at /geo-audit and the free tool library at /tools (llms.txt generator, AI crawler checker, ChatGPT mention checker, share-of-voice calculator, citation finder, and more) without ever creating an account.',
  },
  {
    question: 'How does Livesov actually query the LLMs?',
    answer:
      'We hit each platform&apos;s production API with your tracked prompts on a daily schedule. ChatGPT (including ChatGPT Search), Claude, Gemini (with Google grounding), Perplexity (live retrieval), and Grok (with live X search). Each answer is parsed for brand mentions, competitor mentions, sentiment, citations, and rank within the response. The methodology is documented end-to-end on /how-it-works.',
  },
  {
    question: 'Which use cases is Livesov best for?',
    answer:
      'In-house marketing teams running GEO programs, SEO agencies adding AI visibility as a service, founders monitoring their own brand mentions, and analysts running competitive intelligence. See /use-cases for detailed scenarios.',
  },
  {
    question: 'How is Livesov priced?',
    answer:
      'Tiered by brands and prompts tracked. The starter plan begins at $39/month with everything you need to run a single-brand GEO program. Multi-brand and agency tiers scale up from there. Full pricing on /pricing, with a 7-day free trial on every plan.',
  },
];

export default function GenerativeEngineOptimizationToolPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          {
            name: 'Generative Engine Optimization Tool',
            url: '/generative-engine-optimization-tool',
          },
        ]}
      />

      <SeoHero
        title={
          <>
            The{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              Generative Engine Optimization
            </span>{' '}
            tool teams actually use
          </>
        }
        subtitle="Livesov tracks how ChatGPT, Claude, Gemini, Perplexity, and Grok talk about your brand — daily. Mention rate, citation share, rank, sentiment, competitor benchmarks, and the diagnostics that let you move them. Free audit, 7-day trial, no credit card."
        ctaText="Start free 7-day trial"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '5', label: 'LLMs tracked daily in one dashboard' },
            { value: '500+', label: 'Prompts trackable per brand' },
            { value: '10', label: 'Competitors per brand, automatic' },
            { value: '$39/mo', label: 'Starting plan — 7-day free trial' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="What it does"
          title="Everything you need to run a serious GEO program"
          subtitle="Most GEO tools cover one or two LLMs and stop at mention rate. Livesov covers all five major LLMs and the full metric stack — including the citation-level data that tells you how to fix the gap."
        />
        <FeatureGrid items={capabilities} columns={3} />
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>Why a dedicated GEO tool matters</h2>
          <p>
            You can run a generative engine optimization program with spreadsheets and copy-paste
            for a week. You cannot run one for a quarter. The work is too fragmented across too
            many surfaces — five LLMs, hundreds of prompts, dozens of competitors, all of them
            re-indexing on different schedules — and the metrics that matter (mention rate,
            citation share, rank, sentiment) are not computable from a notebook.
          </p>
          <p>
            A dedicated GEO tool turns that into a continuous program. You define the prompts
            that matter to your category, the competitors you care about, and the surfaces you
            need to win. The tool runs the queries daily, extracts the signals, and tells you
            both <em>what</em> moved and <em>why</em>.
          </p>

          <h2>How Livesov compares to a manual GEO workflow</h2>
          <p>
            The honest comparison is not Livesov vs. another tool — it is Livesov vs. the
            spreadsheet most teams start with.
          </p>
        </LongForm>

        <div style={{ maxWidth: 900, margin: '40px auto 0', padding: '0 24px' }}>
          <ComparisonTable
            headers={['Capability', 'Livesov', 'Manual / spreadsheet']}
            rows={livesovVsManual}
            highlightColumn={1}
          />
        </div>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <LongForm>
          <h2>What you can do in Livesov in under 15 minutes</h2>
          <ol>
            <li>
              <strong>Add your brand</strong> and pick a starter prompt pack for your category
              (we provide them out of the box).
            </li>
            <li>
              <strong>Add competitors</strong> — up to 10 per brand. They get tracked
              automatically against the same prompt set.
            </li>
            <li>
              <strong>Run the first multi-LLM sweep.</strong> ChatGPT, Claude, Gemini,
              Perplexity, Grok. Mention rate, citation share, rank, sentiment, all populated.
            </li>
            <li>
              <strong>Open the gap report.</strong> The dashboard surfaces the prompts where you
              are losing, the competitor taking your slot, and the third-party sources driving
              their mention.
            </li>
            <li>
              <strong>Wire up alerts.</strong> Slack or email pings when mention rate moves more
              than your set threshold, when sentiment flips, or when a new competitor breaks
              into the top 3 cited brands.
            </li>
          </ol>

          <Callout title="Start with the free tools if you are not ready to commit" variant="tip">
            We give away nine free tools at <a href="/tools">/tools</a> — llms.txt generator, AI
            crawler checker, ChatGPT mention checker, share-of-voice calculator, citation
            finder, AI readiness audit, GEO score checker, prompt generator, and competitor
            finder. They will give you a real first read on where you stand without a signup.
          </Callout>

          <h2>Who uses Livesov</h2>
          <ul>
            <li>
              <strong>In-house marketing teams</strong> running ongoing GEO programs alongside
              classic SEO. Livesov is the dashboard the team checks every Monday.
            </li>
            <li>
              <strong>SEO and content agencies</strong> adding AI visibility as a productised
              service. See <a href="/partners">/partners</a> for the agency program.
            </li>
            <li>
              <strong>Founders and operators</strong> who need a continuous read on whether AI
              mentions of their brand are growing, shrinking, or hallucinating.
            </li>
            <li>
              <strong>Analyst and competitive-intelligence teams</strong> using mention rate and
              citation share as a real-time category map.
            </li>
          </ul>
          <p>
            See the <a href="/use-cases">use cases page</a> for detailed playbooks per role.
          </p>

          <h2>The free GEO toolkit alongside Livesov</h2>
          <p>
            Every Livesov customer also gets the free toolkit — and the free toolkit alone is
            already more than most GEO tools ship paid:
          </p>
          <ul>
            <li>
              <a href="/geo-audit">Free GEO Audit</a> — score any URL across the six GEO ranking
              signals.
            </li>
            <li>
              <a href="/tools/llms-txt-generator">llms.txt Generator</a> — produce a valid
              llms.txt file in 30 seconds.
            </li>
            <li>
              <a href="/tools/ai-crawler-checker">AI Crawler Checker</a> — verify GPTBot,
              ClaudeBot, PerplexityBot, and friends can reach your site.
            </li>
            <li>
              <a href="/tools/chatgpt-mention-checker">ChatGPT Mention Checker</a> — instant
              spot-check.
            </li>
            <li>
              <a href="/tools/citation-finder">Citation Finder</a> — extract the URLs AI
              actually cites for a query.
            </li>
            <li>
              <a href="/tools/share-of-voice-calculator">Share of Voice Calculator</a> — quick
              math for category share.
            </li>
            <li>
              <a href="/tools/competitor-finder">AI Competitor Finder</a> — find the brands AI
              recommends in your category.
            </li>
          </ul>
        </LongForm>

        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <Link
            href="/signup"
            className="land-btn land-btn-primary"
            style={{ padding: '14px 36px', fontSize: 16 }}
          >
            Start free 7-day trial
          </Link>
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginTop: 10,
            }}
          >
            No credit card. Cancel anytime.
          </p>
        </div>
      </Section>

      <FaqSection
        title="GEO tool FAQ"
        subtitle="What teams ask before they pick a generative engine optimization platform."
        items={faqs}
      />

      <PillarLinks
        title="Continue exploring Livesov"
        links={[
          {
            href: '/how-it-works',
            label: 'How Livesov works',
            description: 'The full methodology behind every metric.',
          },
          {
            href: '/pricing',
            label: 'Pricing & plans',
            description: 'From single-brand to agency tier.',
          },
          {
            href: '/use-cases',
            label: 'Use cases',
            description: 'Playbooks per role: marketing, SEO, agency, founder.',
          },
          {
            href: '/geo-optimization',
            label: 'GEO playbook',
            description: 'The strategy guide that goes with the tool.',
          },
          {
            href: '/learn/llm-seo',
            label: 'LLM SEO guide',
            description: 'The deeper model-side optimization playbook.',
          },
          {
            href: '/learn/ai-search-optimization',
            label: 'AI search optimization',
            description: 'Optimizing for the live-retrieval AI surfaces.',
          },
        ]}
      />
    </SeoLayout>
  );
}
