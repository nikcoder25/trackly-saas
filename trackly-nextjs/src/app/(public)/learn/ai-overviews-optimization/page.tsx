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
  title: 'AI Overviews Optimization: How to Rank in Google AI Overviews (2026) | Livesov',
  description:
    'AI Overviews now appears on the majority of US Google searches. The complete optimization guide: how AI Overviews chooses sources, the schema and content patterns it favours, and how to measure whether you are cited.',
  keywords:
    'ai overviews optimization, google ai overviews seo, rank in ai overviews, sge optimization, google search generative experience, ai overviews citation, ai overviews ranking factors',
  alternates: { canonical: '/learn/ai-overviews-optimization' },
  openGraph: {
    title: 'AI Overviews Optimization: How to Rank in Google AI Overviews (2026)',
    description:
      'How AI Overviews chooses sources, the patterns it favours, and how to measure whether you are cited.',
    url: 'https://livesov.com/learn/ai-overviews-optimization',
    siteName: 'Livesov',
    type: 'article',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AI Overviews Optimization: How to Rank in Google AI Overviews | Livesov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Overviews Optimization: The 2026 Guide',
    description:
      'How AI Overviews chooses sources, the patterns it favours, and how to measure whether you are cited.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const factors = [
  {
    icon: '①',
    title: 'Organic top-10 rank',
    description:
      'AI Overviews almost always cites pages that already rank in the top 10 organic results. Strong classic SEO is a hard prerequisite - not a nice-to-have.',
  },
  {
    icon: '②',
    title: 'Direct-answer extractability',
    description:
      'The 30–80 word answer Google paraphrases comes from one or two specific paragraphs. Pages that put a clean, dated answer in the first 200 words win.',
  },
  {
    icon: '③',
    title: 'Schema markup',
    description:
      'FAQPage, HowTo, Article, Product, and Organization schema all materially raise AI Overview citation odds. Schema is the cheapest single uplift you can ship.',
  },
  {
    icon: '④',
    title: 'Freshness signals',
    description:
      'Visible last-updated dates, recent timestamps, and an active editorial cycle. AI Overviews quietly down-weights stale content even when it still ranks.',
  },
  {
    icon: '⑤',
    title: 'E-E-A-T cues',
    description:
      'Named author, credentials, organization page, and explicit data sources. Google&apos;s Helpful Content / E-E-A-T machinery feeds directly into AI Overview citation choices.',
  },
  {
    icon: '⑥',
    title: 'Query-answer fit',
    description:
      'The cited page does not just rank for the query - its on-page answer literally matches the question. Question-style H2s with paragraph-length answers dominate.',
  },
];

const steps = [
  {
    title: 'Identify which queries trigger AI Overviews',
    description:
      'Not every query gets an AI Overview. Pull your top 100 commercial queries and tag which ones trigger an Overview today. Those are your real targets.',
  },
  {
    title: 'Check organic rank on those queries',
    description:
      'For every AI-Overview query you care about, confirm a top-10 organic position exists. If it does not, your AI Overviews work is downstream of classic SEO work.',
  },
  {
    title: 'Audit the currently-cited sources',
    description:
      'Look at the 3–6 sources AI Overviews currently cites for your priority queries. Reverse-engineer the pattern: word count, structure, schema, dated content.',
  },
  {
    title: 'Upgrade the page to match the citation pattern',
    description:
      'Lead with the direct answer. Add FAQPage / Article schema. Add a visible updated date. Restructure H2s as questions. Add a credentialed author block.',
  },
  {
    title: 'Track citation share weekly, not monthly',
    description:
      'AI Overviews refreshes citations far more often than the SERP itself moves. Weekly tracking catches wins (and losses) the SERP report will not.',
  },
];

const overviewVsSerp = [
  ['Position', 'Cited source (1 of 3–6)', 'Organic rank 1–10'],
  ['Click rate', 'Zero-click on most queries', 'CTR ~28% at #1, decays steeply'],
  ['Ranking input', 'Top-10 organic + extractability + schema + freshness', 'Backlinks + content + intent match'],
  ['Refresh rate', 'Citations can rotate weekly', 'SERP usually stable day-to-day'],
  ['User behaviour', 'Reads the summary, may click for detail', 'Clicks the top result'],
  ['Best measurement', 'AI Overview citation share', 'Average position + CTR'],
];

const faqs = [
  {
    question: 'What is Google AI Overviews?',
    answer:
      'AI Overviews is the AI-generated summary that appears at the top of many Google search results. It paraphrases an answer to the user&apos;s query and cites 3–6 source URLs. It is the production successor to Search Generative Experience (SGE) and is now the dominant AI surface inside Google.',
  },
  {
    question: 'How do I rank in AI Overviews?',
    answer:
      'Six factors stack together: (1) rank in the top 10 organic results for the underlying query, (2) put a direct, extractable answer in the first ~200 words, (3) add FAQPage, HowTo, Article, and Organization schema, (4) show visible last-updated dates, (5) display clear E-E-A-T signals (named author, credentials, sources), and (6) make sure the on-page answer literally matches the question being asked.',
  },
  {
    question: 'Does AI Overviews always cite the same sources as the organic top 10?',
    answer:
      'Mostly, but not always. The overlap is typically 70–85%. The 15–30% of citations that come from outside the top 10 are usually pages with unusually strong extractability - a clean direct answer, schema, dated content - that re-rank above pages organically above them. That gap is where focused AI Overviews optimization wins.',
  },
  {
    question: 'How often does AI Overviews refresh its citations?',
    answer:
      'More often than the SERP itself. We see citation rotation on the order of days to weeks for established commercial queries, and within hours on news queries. Weekly tracking is the right cadence; monthly tracking misses too many movements.',
  },
  {
    question: 'Will AI Overviews kill my organic traffic?',
    answer:
      'It will reduce it on some queries, especially informational ones where the AI Overview fully answers the question. Commercial queries - comparison, alternatives, best-for, pricing - still drive clicks because users want to verify and choose. The right strategic response is to optimise for the citation, not just the click: being the brand named inside the AI Overview is now a primary conversion event in its own right.',
  },
  {
    question: 'What schema markup matters most for AI Overviews?',
    answer:
      'FAQPage and HowTo schema have the highest direct lift on citation odds because they map cleanly to the question-and-answer format AI Overviews generates. Article schema (with author, datePublished, dateModified) helps signal freshness and E-E-A-T. Organization and Product schema help Google reconcile your brand entity, which feeds the consensus signal AI Overviews uses.',
  },
  {
    question: 'How do I measure AI Overviews performance?',
    answer:
      'Three metrics: (1) AI Overview presence rate - what share of your priority queries trigger an Overview today, (2) citation share - when an Overview shows, are you one of the cited sources, and (3) rank-in-citation - when cited, are you the first, third, or sixth source named. Livesov tracks all three continuously alongside the four other AI surfaces.',
  },
];

export default function AiOverviewsOptimizationPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Learn', url: '/learn' },
          { name: 'AI Overviews Optimization', url: '/learn/ai-overviews-optimization' },
        ]}
      />

      <SeoHero
        title={
          <>
            AI Overviews{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              Optimization
            </span>
          </>
        }
        subtitle="How to win - and hold - a citation inside Google AI Overviews. The six ranking factors, the on-page patterns Google quietly favours, and how to measure citation share at the query level."
        ctaText="Start tracking AI Overviews"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '6', label: 'Citation factors AI Overviews uses' },
            { value: '3–6', label: 'Sources cited per Overview' },
            { value: '~58%', label: 'AI Overviews queries are zero-click' },
            { value: 'Weekly', label: 'Right tracking cadence' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="What AI Overviews is"
          title="The AI summary at the top of Google"
          subtitle="AI Overviews is the production successor to SGE. It is now the dominant AI surface inside Google search and the highest-volume AI surface anywhere."
        />
        <LongForm>
          <p>
            <strong>Google AI Overviews</strong> is the AI-generated paragraph that appears at
            the top of many Google search results, with 3–6 inline source citations. It runs on
            Gemini, grounds against the live Google index, and is shown above the classic ten
            blue links. For most US English queries with a clear informational or commercial
            intent, it is now the first thing the user reads.
          </p>
          <p>
            AI Overviews matters because the position is unlike anything else in search. It is
            not rank #1. It is not a snippet. It is a piece of generated copy that summarises an
            answer and names a small handful of brands. If your brand is one of the named
            sources, you are sitting above every classic SERP result for that query.
          </p>
        </LongForm>
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="The six factors"
          title="What decides who AI Overviews cites"
          subtitle="No single factor wins. AI Overviews stacks all six and rewards the combined score - which is why partial fixes underperform."
        />
        <FeatureGrid items={factors} columns={3} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="The workflow"
          title="The five-step AI Overviews optimization loop"
        />
        <ProcessSteps steps={steps} />
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>The classic SERP vs. AI Overviews - what changes</h2>
          <p>
            AI Overviews is a new position with a new economy. Treating it like a classic top-3
            organic listing gives the wrong answers on every operational question: when to
            update, how often to measure, what to optimise for, what counts as a win.
          </p>
        </LongForm>

        <div style={{ maxWidth: 900, margin: '40px auto 0', padding: '0 24px' }}>
          <ComparisonTable
            headers={['Dimension', 'AI Overviews', 'Classic top-3 SERP']}
            rows={overviewVsSerp}
            highlightColumn={1}
          />
        </div>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <LongForm>
          <h2>The direct-answer pattern AI Overviews quietly rewards</h2>
          <p>
            We have studied thousands of AI Overview citations across categories. The pages
            that get cited share a recognisable structure that is genuinely easy to copy.
          </p>
          <ol>
            <li>
              <strong>One-sentence answer up top.</strong> The cited source almost always opens
              with a 1–2 sentence answer to the literal query - before any preamble, intro
              paragraph, or marketing setup.
            </li>
            <li>
              <strong>Then a short paragraph of context.</strong> 60–120 words that nuance the
              answer with the most common qualifiers. This is the bit AI Overviews paraphrases.
            </li>
            <li>
              <strong>Then a structured deep dive.</strong> Question-style H2s, each with a
              short paragraph + (optionally) a list or table. This is where AI Overviews mines
              follow-up details.
            </li>
            <li>
              <strong>Then trust signals.</strong> Named author, credentials, last-updated
              date, sources cited, link to a methodology page.
            </li>
          </ol>

          <Callout title="The schema lift is bigger than most teams expect" variant="tip">
            FAQPage + HowTo + Article + Organization schema together routinely lift AI Overviews
            citation odds by enough to be worth the day of engineering work. Use the{' '}
            <a href="/geo-audit">free GEO audit</a> to see which schema you are missing.
          </Callout>

          <h2>Where the underlying organic rank comes from</h2>
          <p>
            Because top-10 organic rank is a hard prerequisite, AI Overviews optimization
            usually starts with a classic SEO sprint. Three areas have the highest leverage:
          </p>
          <ul>
            <li>
              <strong>Comparison content.</strong> &quot;X vs Y,&quot; &quot;best X for
              Y,&quot; &quot;X alternatives.&quot; These pages tend to earn the inbound links
              that lift organic rank quickly.
            </li>
            <li>
              <strong>Third-party citation.</strong> G2, Capterra, Wikipedia, category
              roundups, analyst notes. These both raise organic authority and feed the
              consensus signal Google uses to choose AI Overview sources.
            </li>
            <li>
              <strong>Content freshness loops.</strong> Quarterly refresh on your top 20–50
              commercial pages. Visible last-updated dates. Active editorial cycles. Google
              measurably rewards this for AI Overviews, separately from regular ranking.
            </li>
          </ul>

          <h2>How to measure AI Overviews</h2>
          <p>
            The right metric stack is small but uncompromising:
          </p>
          <ul>
            <li>
              <strong>AI Overview presence rate.</strong> Of your priority queries, how many
              currently trigger an Overview? This baseline alone changes how teams allocate
              effort.
            </li>
            <li>
              <strong>Citation share.</strong> When an Overview appears, how often are you one
              of the cited sources? This is the headline KPI.
            </li>
            <li>
              <strong>Rank-in-citation.</strong> When cited, are you cited first or fifth? Order
              matters because users scan top-down.
            </li>
            <li>
              <strong>Citation churn.</strong> How often does the set of cited sources rotate
              for the same query? High churn means small wins compound - and small losses
              compound, too.
            </li>
          </ul>
          <p>
            Livesov tracks all four continuously, alongside ChatGPT Search, Perplexity, Claude,
            Gemini, and Grok. <a href="/pricing">Start free</a> - no credit card.
          </p>
        </LongForm>
      </Section>

      <FaqSection
        title="AI Overviews optimization FAQ"
        subtitle="What teams ask before they put real budget into AI Overviews."
        items={faqs}
      />

      <PillarLinks
        title="Continue the AI Overviews playbook"
        links={[
          {
            href: '/learn/ai-search-optimization',
            label: 'AI search optimization',
            description: 'AI Overviews in the context of every AI search surface.',
          },
          {
            href: '/learn/llm-seo',
            label: 'LLM SEO',
            description: 'The model-side guide - training memory + retrieval together.',
          },
          {
            href: '/geo-optimization',
            label: 'Generative engine optimization',
            description: 'The full GEO playbook across every generative answer surface.',
          },
          {
            href: '/generative-engine-optimization-tool',
            label: 'GEO tool',
            description: 'Livesov - built for AI Overviews and the rest of the AI surfaces.',
          },
          {
            href: '/gemini-brand-tracking',
            label: 'Gemini & AI Overviews tracking',
            description: 'Track Gemini and AI Overview mentions continuously.',
          },
          {
            href: '/tools/geo-score-checker',
            label: 'GEO Score Checker',
            description: 'Free per-URL score across the AI-readiness signals.',
          },
        ]}
      />
    </SeoLayout>
  );
}
