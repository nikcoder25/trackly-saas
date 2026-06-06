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
  ComparisonTable,
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'AI Search Optimization: The Complete 2026 Guide | Livesov',
  description:
    'AI search optimization is how you rank inside AI-powered search engines — ChatGPT Search, Perplexity, Google AI Overviews, Gemini, and Bing Copilot. The full strategy, signals, and measurement playbook.',
  keywords:
    'ai search optimization, ai search seo, ranking in ai search, chatgpt search optimization, perplexity optimization, google ai mode, ai overviews seo, bing copilot, ai search engine optimization',
  alternates: { canonical: '/learn/ai-search-optimization' },
  openGraph: {
    title: 'AI Search Optimization: The Complete 2026 Guide',
    description:
      'How to rank inside ChatGPT Search, Perplexity, Google AI Overviews, Gemini, and Bing Copilot — the signals, the workflow, and how to measure it.',
    url: 'https://livesov.com/learn/ai-search-optimization',
    siteName: 'Livesov',
    type: 'article',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AI Search Optimization: The Complete 2026 Guide | Livesov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Search Optimization: The Complete 2026 Guide',
    description:
      'How to rank inside ChatGPT Search, Perplexity, Google AI Overviews, Gemini, and Bing Copilot.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const surfaces = [
  {
    icon: '◉',
    title: 'ChatGPT Search',
    description:
      'OAI-SearchBot retrieves live results and presents an answer with inline citations. Re-ranks the top organic web against an internal authority and freshness model.',
  },
  {
    icon: '◎',
    title: 'Perplexity',
    description:
      'The most aggressive live retriever. Pulls 6–15 sources per answer, cites them explicitly, and re-ranks against query semantics every time. The cleanest AI search to optimize for.',
  },
  {
    icon: '⌖',
    title: 'Google AI Overviews & AI Mode',
    description:
      'Grounded on the live Google index. Strong organic rank is a near-prerequisite. Schema, structured answers, and freshness decide who gets summarised.',
  },
  {
    icon: '✦',
    title: 'Gemini (in Search / Workspace)',
    description:
      'Uses the same retrieval as Google AI Overviews when grounded; uses model memory when not. Both modes reward consistent, structured brand facts.',
  },
  {
    icon: '◈',
    title: 'Bing Copilot',
    description:
      'Reuses Bing&apos;s organic index plus its own re-ranker. Schema, BingBot crawlability, and Microsoft-graph signals (LinkedIn, Edge browsing) all feed in.',
  },
  {
    icon: '◊',
    title: 'Grok (with live X search)',
    description:
      'The only AI search surface that treats X (Twitter) as a primary index. Real-time conversation, not just web pages, drives mention rate.',
  },
];

const steps = [
  {
    title: 'Inventory the AI search surfaces that matter',
    description:
      'Not every brand needs to optimize for every surface. Pick the 2–4 surfaces where your buyers actually ask AI questions, and prioritize those.',
  },
  {
    title: 'Identify your priority retrieval queries',
    description:
      'AI search re-ranks live results per query. Pick the 20–50 queries with highest commercial intent — comparison, alternative, best-for — and baseline them.',
  },
  {
    title: 'Win the underlying organic search',
    description:
      'Every grounded AI surface retrieves from a classic index. If you are not on page 1 organically, you are usually not in the AI answer either. Classic SEO is upstream.',
  },
  {
    title: 'Make the winning page extractable',
    description:
      'Answer the question in the first 200 words. Add schema. Add an updated-on date. Add the question-style H2s AI parsers prefer. This is what turns a top-10 organic into a top-3 citation.',
  },
  {
    title: 'Measure citation share, not just mention rate',
    description:
      'In AI search, the URL cited is as important as the brand named. Track citation share across surfaces and queries — that is where the real signal is.',
  },
];

const aiSearchVsClassic = [
  ['Result format', 'One generated answer + 3–15 citations', 'Ten ranked blue links'],
  ['Ranking signal', 'Live retrieval + re-rank for extractability', 'Index rank + click signals'],
  ['User intent capture', 'Often resolved without a click', 'Click measures intent capture'],
  ['Update cadence', 'Hours to days per query', 'Hours to days per page'],
  ['Click distribution', 'Top 3 citations dominate', 'Top 3 positions dominate'],
  ['Measurement', 'Mention rate, citation share, rank-in-answer', 'Position, CTR, traffic'],
];

const faqs = [
  {
    question: 'What is AI search optimization?',
    answer:
      'AI search optimization is the practice of ranking inside AI-powered search engines — surfaces where a model retrieves live results, re-ranks them, and writes a single generated answer with citations. The major surfaces are ChatGPT Search, Perplexity, Google AI Overviews, Google AI Mode, Gemini, Bing Copilot, and Grok with live X search.',
  },
  {
    question: 'How is AI search optimization different from LLM SEO?',
    answer:
      'Heavy overlap, but the emphasis differs. LLM SEO covers everything an LLM does — including answering from training memory without retrieval. AI search optimization is the subset focused on the live-retrieval surfaces. In most programs you do both at once, but the daily work is dominated by the retrieval surfaces because that is where changes show up fastest.',
  },
  {
    question: 'Does classic SEO still matter for AI search?',
    answer:
      'Yes, and arguably more than ever. Every grounded AI search engine — ChatGPT Search, Perplexity, AI Overviews, Bing Copilot — retrieves from a classic search index before it generates the answer. If you are not in the top organic results for the query, you are almost never in the AI answer. Strong organic SEO is the cheapest input to AI search optimization.',
  },
  {
    question: 'How do I know which AI search engine to prioritize?',
    answer:
      'Follow the buyer. If your category sells through technical evaluations (devtools, infra, SaaS), Perplexity and ChatGPT Search dominate. If you sell consumer or local, Google AI Overviews and AI Mode dominate. If you sell into communities that live on X, Grok matters disproportionately. Livesov measures all of them so you can see actual buyer attention rather than guess.',
  },
  {
    question: 'How fast does AI search optimization work?',
    answer:
      'Faster than you would expect. Perplexity re-indexes citations within days of a content change. ChatGPT Search updates within days to weeks. Google AI Overviews updates roughly in line with Google&apos;s organic crawl — fast for established sites, slower for new ones. We typically see clear mention-rate shifts within 2–4 weeks of a focused intervention.',
  },
  {
    question: 'Is AI search going to kill classic search traffic?',
    answer:
      'It already has, partially. Zero-click rates on commercial queries in AI Overviews are visibly higher than on classic SERPs. The right strategic response is to optimise for the citation, not just the click — your goal is to be the brand named inside the answer, even when no one clicks. That is exactly what AI search optimization measures.',
  },
  {
    question: 'What tools do I need to start?',
    answer:
      'You need at least one continuous AI mention tracker (we build Livesov for exactly this), plus a few diagnostic tools for crawlability, schema, and citation analysis. We give all of those away free at /tools so any team can run a credible AI search optimization program from day one.',
  },
];

export default function AiSearchOptimizationPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Learn', url: '/learn' },
          { name: 'AI Search Optimization', url: '/learn/ai-search-optimization' },
        ]}
      />

      <SeoHero
        title={
          <>
            AI Search{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              Optimization
            </span>
          </>
        }
        subtitle="The complete 2026 guide to ranking inside ChatGPT Search, Perplexity, Google AI Overviews, Gemini, and Bing Copilot. Signals, workflow, measurement — what actually works."
        ctaText="Start tracking AI search visibility"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '6', label: 'AI search surfaces to track' },
            { value: '~58%', label: 'Of AI Overviews are zero-click' },
            { value: 'Days', label: 'Time to re-index in Perplexity' },
            { value: 'Free', label: 'AI search audit + tooling' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="The new search stack"
          title="AI search is six distinct surfaces, not one"
          subtitle="Each surface has its own retriever, its own re-ranker, and its own citation behaviour. You cannot optimize all six the same way."
        />
        <FeatureGrid items={surfaces} columns={3} />
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="The workflow"
          title="The five-step AI search optimization loop"
          subtitle="The same loop applies to every surface — only the ranking signal weights change."
        />
        <ProcessSteps steps={steps} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <LongForm>
          <h2>The signals AI search engines actually use</h2>
          <p>
            Strip away the marketing and AI search engines all reduce to four signals stacked on
            top of a classic index. Understanding the stack lets you decide where to spend.
          </p>

          <h3>1. Retrieval rank — &quot;Is your URL in the candidate set at all?&quot;</h3>
          <p>
            Every grounded AI search runs a classic retrieval as step one. If your page is not
            in the top ~30 organic results for the underlying query, no amount of AI-specific
            tuning will save you. The single highest-leverage AI search optimization action is
            still ranking organically.
          </p>

          <h3>2. Re-rank score — &quot;Which candidates does the model trust?&quot;</h3>
          <p>
            AI re-rankers reward different things than Google. They reward: explicit answers
            near the top of the page; clean structure (H2/H3, schema, FAQ); recent
            last-updated timestamps; high cross-source consensus with the rest of the
            candidates. A page can rank #8 organically and still be cited because it
            re-ranks #1.
          </p>

          <h3>3. Extractability — &quot;Can the model lift a clean quote?&quot;</h3>
          <p>
            The most cited pages tend to lead with a tight, direct, dated answer in the first
            200 words and then back it up. Pages that bury the answer below long
            introductions are systematically skipped, even when they rank well.
          </p>

          <h3>4. Brand consensus — &quot;Do other sources agree?&quot;</h3>
          <p>
            AI search aggressively diversifies sources. A brand named identically by 5
            independent domains will beat a brand only mentioned on its own site, even at
            equal organic rank. This is why third-party citation building (G2, Reddit,
            roundups, Wikipedia, analyst notes) outperforms blog publishing for most
            categories.
          </p>

          <h2>AI search vs. classic search — head-to-head</h2>
          <p>
            Most teams keep one budget for &quot;search.&quot; That made sense in 2019. In 2026
            the two channels have diverged enough that you need separate goals, separate KPIs,
            and at least separate dashboards.
          </p>
        </LongForm>

        <div style={{ maxWidth: 900, margin: '40px auto 0', padding: '0 24px' }}>
          <ComparisonTable
            headers={['Dimension', 'AI search', 'Classic search']}
            rows={aiSearchVsClassic}
            highlightColumn={1}
          />
        </div>
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>Per-surface optimization playbook</h2>

          <h3>ChatGPT Search</h3>
          <p>
            Allow OAI-SearchBot in robots.txt. Ship comparison pages on the highest-volume
            queries in your category. Earn placements on Reddit, G2, and category roundup
            articles — ChatGPT Search aggressively cites those. See{' '}
            <a href="/chatgpt-brand-tracking">ChatGPT tracking</a>.
          </p>

          <h3>Perplexity</h3>
          <p>
            Allow PerplexityBot. Ship structured, citation-friendly pages with clear
            last-updated dates. Use FAQ schema and Article schema. Because Perplexity cites 6–15
            sources per answer, fast cycles of write &rarr; ship &rarr; measure are unusually
            productive here. See <a href="/perplexity-brand-tracking">Perplexity tracking</a>.
          </p>

          <h3>Google AI Overviews & AI Mode</h3>
          <p>
            Earn the underlying organic rank first. Then optimise for the AI Overview citation
            with question-style H2s, scannable answers, schema, and clear authorship. See our
            dedicated <a href="/learn/ai-overviews-optimization">AI Overviews optimization
            guide</a>.
          </p>

          <h3>Bing Copilot</h3>
          <p>
            Verify your site in Bing Webmaster Tools. Submit a sitemap. Bing rewards
            consistent structured data more aggressively than Google. The good news: Bing
            organic CTR has gone up since Copilot, not down, because Copilot generates more
            engaged sessions.
          </p>

          <h3>Grok</h3>
          <p>
            Treat X like an SEO surface. Ship from a credible category-leader account with a
            real posting cadence. Grok&apos;s live search will literally retrieve recent posts
            and cite them. See <a href="/grok-brand-tracking">Grok tracking</a>.
          </p>

          <Callout title="Optimize the surfaces your buyers actually use" variant="tip">
            We see teams burn months on Bing Copilot when their buyers live in Perplexity, or on
            Perplexity when their buyers live in Google AI Overviews. The right starting move is
            always: baseline all six, then prioritise the two that drive your category.
          </Callout>

          <h2>How to measure AI search optimization</h2>
          <p>
            Three metrics are non-negotiable:
          </p>
          <ul>
            <li>
              <strong>Mention rate</strong> — the % of queries where the AI answer names your
              brand. This is the headline. Per-surface, per-query, weekly.
            </li>
            <li>
              <strong>Citation share</strong> — when the AI answer links sources, what share of
              those links go to your domain? This is the closest analog to traditional SERP
              position.
            </li>
            <li>
              <strong>Rank inside the answer</strong> — when you are mentioned, are you the
              first, second, or seventh option named? Order matters because users read
              top-down.
            </li>
          </ul>
          <p>
            You can spot-check these for free with{' '}
            <a href="/tools/chatgpt-mention-checker">ChatGPT Mention Checker</a>,{' '}
            <a href="/tools/citation-finder">Citation Finder</a>, and{' '}
            <a href="/tools/share-of-voice-calculator">Share of Voice Calculator</a>. For
            continuous, multi-platform tracking you want <a href="/pricing">Livesov</a>.
          </p>
        </LongForm>
      </Section>

      <FaqSection
        title="AI search optimization FAQ"
        subtitle="What teams ask before they start an AI search program."
        items={faqs}
      />

      <PillarLinks
        title="Continue the AI search playbook"
        links={[
          {
            href: '/learn/llm-seo',
            label: 'LLM SEO',
            description: 'The deeper model-side guide — training memory + retrieval combined.',
          },
          {
            href: '/learn/ai-overviews-optimization',
            label: 'AI Overviews optimization',
            description: 'Google AI Overviews specifically — the highest-volume AI surface.',
          },
          {
            href: '/geo-optimization',
            label: 'Generative engine optimization',
            description: 'The broader GEO playbook covering every generative answer surface.',
          },
          {
            href: '/generative-engine-optimization-tool',
            label: 'GEO tool',
            description: 'Livesov — purpose-built for AI search measurement.',
          },
          {
            href: '/perplexity-brand-tracking',
            label: 'Perplexity tracking',
            description: 'The cleanest AI search surface to test on.',
          },
          {
            href: '/chatgpt-brand-tracking',
            label: 'ChatGPT tracking',
            description: 'Track ChatGPT Search mentions and citations.',
          },
        ]}
      />
    </SeoLayout>
  );
}
