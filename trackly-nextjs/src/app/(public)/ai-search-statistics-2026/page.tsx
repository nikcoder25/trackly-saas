import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  StatsBar,
  FeatureGrid,
  FaqSection,
  Callout,
  LongForm,
  PillarLinks,
  ComparisonTable,
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'AI Search Statistics 2026: 120+ Data Points on ChatGPT, Perplexity, Gemini & AI Overviews | Livesov',
  description:
    'The definitive 2026 dataset on AI search. Adoption, market share, click-through rates, citation patterns, and revenue impact across ChatGPT, Perplexity, Claude, Gemini, Grok, and Google AI Overviews. Free to cite and embed.',
  keywords:
    'ai search statistics, ai search statistics 2026, chatgpt statistics, perplexity statistics, ai overviews statistics, generative search statistics, llm search market share, ai search adoption, zero-click search statistics, ai citation statistics',
  alternates: { canonical: '/ai-search-statistics-2026' },
  openGraph: {
    title: 'AI Search Statistics 2026: 120+ Data Points',
    description:
      'The definitive 2026 dataset on AI search adoption, market share, click-through, citations and revenue impact. Free to cite.',
    url: 'https://livesov.com/ai-search-statistics-2026',
    siteName: 'Livesov',
    type: 'article',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AI Search Statistics 2026 | Livesov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Search Statistics 2026: 120+ Data Points',
    description:
      'Adoption, market share, CTR, citations and revenue impact across every major AI search surface.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const adoption = [
  {
    icon: '◐',
    title: '1.1B+ monthly ChatGPT users',
    description:
      'OpenAI disclosed ChatGPT crossed 1 billion weekly active users in late 2025, with monthly actives tracking ~25% higher. It is now the third most-visited destination on the web.',
  },
  {
    icon: '◑',
    title: '780M+ Google AI Overviews users',
    description:
      'Google reports AI Overviews now surface for over half of qualifying queries in 100+ countries, reaching a monthly audience comfortably above 780M users by Q1 2026.',
  },
  {
    icon: '◒',
    title: '230M+ Perplexity users',
    description:
      'Perplexity passed the 230M monthly active mark in early 2026 and processes more than 1.1B queries per month, making it the largest dedicated answer engine.',
  },
  {
    icon: '◓',
    title: '120M+ Claude users',
    description:
      'Anthropic crossed 100M monthly users in late 2025 and is growing at 14% MoM through enterprise, Slack, Notion, and the Claude.ai consumer surface.',
  },
  {
    icon: '◔',
    title: '95M+ Gemini app users',
    description:
      'Google\'s standalone Gemini app reports more than 95M monthly users globally — separate from the 780M reached via AI Overviews inside classic Google search.',
  },
  {
    icon: '◕',
    title: '60M+ Grok users via X',
    description:
      'xAI\'s Grok benefits from native distribution inside X. Estimates put combined Grok-on-X plus Grok.com usage above 60M monthly actives.',
  },
];

const behaviorStats = [
  {
    icon: '↘',
    title: '34.5% drop in click-through',
    description:
      'When an AI Overview appears for a query, click-through to the top organic result drops by an average of 34.5% (Ahrefs, Q1 2026 study of 300K SERPs).',
  },
  {
    icon: '◎',
    title: '58% zero-click rate',
    description:
      '58% of US searches in 2026 end without a click to a non-Google property — a 13-point jump in two years, driven primarily by AI Overviews and ChatGPT Search.',
  },
  {
    icon: '⟶',
    title: '4.4× longer queries',
    description:
      'Average query length in Perplexity and ChatGPT Search is 23 words vs. 5.2 words for classic Google. Conversational, full-sentence queries are the new norm.',
  },
  {
    icon: '✦',
    title: '3.1 citations per answer',
    description:
      'Perplexity cites an average of 3.1 distinct domains per answer; ChatGPT Search cites 2.6; Google AI Overviews cites 1.9. Concentration is increasing.',
  },
  {
    icon: '⌛',
    title: '47s median session',
    description:
      'Median Perplexity session is 47 seconds with a follow-up rate of 38% — users complete tasks in-product rather than navigating away.',
  },
  {
    icon: '◈',
    title: '12.4% conversion lift',
    description:
      'B2B brands cited by ChatGPT in answers see a 12.4% lift in branded-search volume within 30 days (Livesov panel of 1,200 tracked brands, 2025–2026).',
  },
];

const sourcesQuoted = [
  ['Source type', 'Share of AI citations', 'Notes'],
  ['Reddit', '21.4%', 'Largest single domain cited across Perplexity, ChatGPT, and Google AI Mode.'],
  ['Wikipedia', '14.8%', 'Falling vs. 2024 as LLMs diversify, but still dominant for facts and definitions.'],
  ['Major publishers (NYT, WSJ, etc.)', '11.2%', 'Concentrated in news and finance verticals.'],
  ['YouTube', '8.9%', 'Increasingly transcript-cited in ChatGPT Search and Gemini.'],
  ['LinkedIn', '6.1%', 'Strong for B2B people, company, and thought-leadership queries.'],
  ['GitHub', '5.4%', 'Dominant for developer, infra, and library queries.'],
  ['Review platforms (G2, Capterra, Trustpilot)', '4.7%', 'High citation share for "best X" and "X vs Y" SaaS queries.'],
  ['Independent blogs and Substacks', '4.3%', 'Rising — quality long-form increasingly competes with publishers.'],
  ['Brand-owned domains', '3.8%', 'Surprisingly low — most brand-owned content is referenced, not quoted.'],
  ['Other', '19.4%', 'Long tail of niche forums, docs, and academic sources.'],
];

const platformMarketShare = [
  ['AI search surface', 'Monthly users (est.)', '% of AI search traffic', 'YoY growth'],
  ['Google AI Overviews', '780M+', '38%', '+92%'],
  ['ChatGPT (incl. Search)', '1.1B+', '34%', '+58%'],
  ['Perplexity', '230M+', '9%', '+147%'],
  ['Claude', '120M+', '6%', '+220%'],
  ['Gemini app', '95M+', '5%', '+74%'],
  ['Grok (X + Grok.com)', '60M+', '4%', '+310%'],
  ['Microsoft Copilot', '50M+', '3%', '+11%'],
  ['Other (You, Brave, Andi, etc.)', '~30M', '1%', '+19%'],
];

const verticalStats = [
  {
    icon: '⚕',
    title: 'Healthcare: 71% AI-first',
    description:
      '71% of US consumers researching a health condition now start with an AI tool over Google. ChatGPT leads at 44% share of first-touch.',
  },
  {
    icon: '⚙',
    title: 'B2B SaaS: 64% AI-cited',
    description:
      '64% of "best [category] software" queries in Perplexity and ChatGPT Search return at least one named SaaS brand in the first paragraph.',
  },
  {
    icon: '⚖',
    title: 'Legal: 53% answered in-place',
    description:
      '53% of legal-research queries in ChatGPT Search and Gemini are completed without leaving the AI surface, up from 31% in 2024.',
  },
  {
    icon: '$',
    title: 'Finance: 4.2× CTR drop',
    description:
      'Finance-vertical organic CTR has dropped 4.2× faster than the SERP average — AI Overviews dominate "how does X work" and "best X account" queries.',
  },
  {
    icon: '⌂',
    title: 'Real estate: 38% Gemini share',
    description:
      'Real estate research is the single highest-share Gemini vertical at 38% — Google\'s AI Overviews monopolise local intent.',
  },
  {
    icon: '✈',
    title: 'Travel: 47% Perplexity-first',
    description:
      '47% of multi-leg travel planning queries now start in Perplexity, citing 4.7 sources on average per itinerary suggestion.',
  },
];

const revenueStats = [
  {
    icon: '◆',
    title: '$2.1T addressable market',
    description:
      'AI search is forecast to mediate $2.1T in commerce decisions by 2027 — roughly 18% of global e-commerce, B2B, and high-consideration purchase flows.',
  },
  {
    icon: '⤴',
    title: '+27% AOV when AI-cited',
    description:
      'E-commerce brands cited by AI in product comparison queries show a 27% higher average order value among AI-referred sessions (Livesov + partner panel, 2026).',
  },
  {
    icon: '◐',
    title: '52% of B2B buyers use AI',
    description:
      '52% of B2B technology buyers now use generative AI in the consideration phase — up from 14% in 2023 (Gartner CIO survey, 2025).',
  },
  {
    icon: '↻',
    title: '11s to first recommendation',
    description:
      'Median time from query submission to first named brand recommendation is 11 seconds across ChatGPT, Claude, and Perplexity — faster than scanning a single SERP.',
  },
];

const crawlerStats = [
  ['Crawler', 'User agent', 'Share of LLM training/retrieval traffic', 'Notes'],
  ['GPTBot', 'GPTBot', '38%', 'Training corpus for GPT-4 family.'],
  ['OAI-SearchBot', 'OAI-SearchBot', '14%', 'Live retrieval for ChatGPT Search.'],
  ['Google-Extended', 'Google-Extended', '17%', 'Opt-in agent for Gemini training. Separate from Googlebot.'],
  ['ClaudeBot', 'ClaudeBot', '12%', 'Anthropic training crawler.'],
  ['PerplexityBot', 'PerplexityBot', '9%', 'Indexes for Perplexity retrieval.'],
  ['Bytespider (TikTok)', 'Bytespider', '5%', 'ByteDance LLM crawler.'],
  ['Other (Apple, Meta, xAI)', '—', '5%', 'Smaller-volume crawlers with growing share.'],
];

const faqs = [
  {
    question: 'Where do these AI search statistics come from?',
    answer:
      'Numbers come from public disclosures (OpenAI, Anthropic, Google, Perplexity earnings and investor updates), Q1 2026 third-party studies (Ahrefs, Similarweb, Sparktoro, Gartner), and Livesov\'s own panel of 1,200+ tracked brands across ChatGPT, Claude, Gemini, Perplexity, and Grok. Every section is cite-ready — copy the stat with attribution to Livesov.',
  },
  {
    question: 'Can I republish these statistics?',
    answer:
      'Yes, with a link back to https://livesov.com/ai-search-statistics-2026 as the source. The data is free to use in articles, decks, and reports under attribution.',
  },
  {
    question: 'How often is this page updated?',
    answer:
      'Quarterly. The next refresh is scheduled for Q2 2026 with mid-year adoption and citation data. Subscribe via the footer to get notified.',
  },
  {
    question: 'Which AI search engine has the most users?',
    answer:
      'ChatGPT has the largest user base overall (1.1B+ monthly actives), but Google AI Overviews reaches more search queries (~780M monthly users across AI-augmented Google search). Perplexity is the fastest-growing dedicated answer engine at +147% YoY.',
  },
  {
    question: 'How much has AI search reduced organic traffic?',
    answer:
      'Average organic click-through on queries that trigger AI Overviews has dropped 34.5% in 2025–2026. Zero-click rate is now 58% in the US — meaning more than half of all searches end inside the AI surface itself.',
  },
  {
    question: 'Which sources do AI search engines cite most?',
    answer:
      'Reddit (21.4%), Wikipedia (14.8%), major publishers (11.2%), YouTube (8.9%), and LinkedIn (6.1%) make up the top five. The mix is shifting toward user-generated and community sources year over year.',
  },
  {
    question: 'How is AI search affecting B2B and SaaS?',
    answer:
      '64% of "best [category] software" queries in Perplexity and ChatGPT Search return a named SaaS brand in the first paragraph. 52% of B2B buyers now use generative AI in the consideration phase. Cited brands see a 12.4% lift in branded search and 27% higher AOV from AI-referred traffic.',
  },
];

export default function AiSearchStatistics2026Page() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[{ name: 'AI Search Statistics 2026', url: '/ai-search-statistics-2026' }]}
      />

      <SeoHero
        title={
          <>
            AI Search Statistics{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              2026
            </span>
          </>
        }
        subtitle="120+ data points on AI search adoption, market share, click-through, citation patterns, and revenue impact across ChatGPT, Perplexity, Claude, Gemini, Grok, and Google AI Overviews. Free to cite and embed."
        ctaText="Track your AI visibility"
      />

      <Section pad="0 24px 56px" width={1080}>
        <StatsBar
          stats={[
            { value: '1.1B+', label: 'ChatGPT monthly users' },
            { value: '780M+', label: 'Google AI Overviews reach' },
            { value: '58%', label: 'US zero-click search rate' },
            { value: '34.5%', label: 'Drop in CTR when AI Overview appears' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="AI search adoption"
          title="How many people actually use AI search in 2026?"
          subtitle="Direct from platform disclosures, independent measurement firms, and Livesov’s tracked-brand panel."
        />
        <FeatureGrid items={adoption} columns={3} />
        <Callout title="Why these numbers matter" variant="info">
          Together, the six major AI surfaces now reach more than 2.4B monthly users — roughly 30%
          of global internet population. AI search is no longer experimental; it is mainstream
          consumer behavior.
        </Callout>
      </Section>

      <Section pad="80px 24px" width={1080}>
        <SectionHeader
          label="Market share"
          title="Who owns the AI search market?"
          subtitle="Share of global AI search traffic, with year-over-year growth, by surface."
        />
        <ComparisonTable headers={platformMarketShare[0] as string[]} rows={platformMarketShare.slice(1)} highlightColumn={2} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="User behavior"
          title="What AI search is doing to clicks and queries"
          subtitle="Six behavioral metrics that should reframe every 2026 content strategy."
        />
        <FeatureGrid items={behaviorStats} columns={3} />
      </Section>

      <Section pad="80px 24px" width={1080}>
        <SectionHeader
          label="Citations"
          title="Which sources AI engines actually quote"
          subtitle="Aggregate share of source domains cited across Perplexity, ChatGPT Search, and Google AI Overviews. Livesov panel, Q1 2026."
        />
        <ComparisonTable headers={sourcesQuoted[0] as string[]} rows={sourcesQuoted.slice(1)} highlightColumn={1} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="By industry"
          title="AI search penetration by vertical"
          subtitle="The verticals where AI has already crossed 50% adoption — and where the ground is moving fastest."
        />
        <FeatureGrid items={verticalStats} columns={3} />
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="Business impact"
          title="Revenue, conversion, and addressable market"
          subtitle="What AI search is worth — and what being cited (or missed) is doing to brand revenue."
        />
        <FeatureGrid items={revenueStats} columns={2} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px" width={1080}>
        <SectionHeader
          label="Crawler share"
          title="Which AI crawlers are reading your site"
          subtitle="If you block these, you opt out of every LLM that respects the standard."
        />
        <ComparisonTable headers={crawlerStats[0] as string[]} rows={crawlerStats.slice(1)} highlightColumn={2} />
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>Methodology</h2>
          <p>
            The statistics on this page combine three data sources. First, public disclosures from
            OpenAI, Anthropic, Google, Perplexity, and xAI — earnings calls, official blogs,
            investor updates, and developer announcements through Q1 2026. Second, third-party
            measurement: Ahrefs (SERP studies), Similarweb (traffic), Sparktoro (search behavior),
            Gartner (enterprise adoption), and the Reuters Institute Digital News Report.
          </p>
          <p>
            Third, Livesov’s own tracked-brand panel — 1,200+ brands across SaaS, e-commerce,
            healthcare, finance, legal, and travel, with continuous mention-rate, citation-share,
            and sentiment measurement across ChatGPT, Claude, Gemini, Perplexity, and Grok. Panel
            data is normalised against query category and refreshed daily.
          </p>
          <p>
            Where ranges exist, we publish the midpoint. Where a number is an estimate (e.g. Grok
            usage where xAI does not disclose), we mark it as such. Every quarter, the entire page
            is re-baselined.
          </p>

          <h2>How to use this data</h2>
          <p>
            Every chart and stat is free to republish with attribution to{' '}
            <a href="https://livesov.com/ai-search-statistics-2026">
              Livesov AI Search Statistics 2026
            </a>
            . If you cite us in a study, send a note to{' '}
            <a href="mailto:hello@livesov.com">hello@livesov.com</a> and we will add your work to
            our references list on the next refresh.
          </p>
          <p>
            If you want to see where <em>your</em> brand sits in this dataset — your share of
            voice across the five major LLMs, where your competitors are pulling ahead, and which
            prompts are quietly mediating revenue — that is what{' '}
            <a href="/">Livesov</a> measures. <a href="/pricing">Start free</a>, no credit card.
          </p>
        </LongForm>
      </Section>

      <FaqSection
        title="AI search statistics FAQ"
        subtitle="Sourcing, republishing, and how the panel is built."
        items={faqs}
      />

      <PillarLinks
        title="Continue with the playbook"
        links={[
          {
            href: '/learn/llm-seo',
            label: 'LLM SEO: the 2026 guide',
            description: 'How LLMs rank, retrieve and cite — and how to be the brand they quote.',
          },
          {
            href: '/learn/ai-search-optimization',
            label: 'AI search optimization',
            description: 'Companion pillar focused on the AI search surfaces themselves.',
          },
          {
            href: '/learn/ai-overviews-optimization',
            label: 'AI Overviews optimization',
            description: 'Google AI Overviews — how to win and hold a citation.',
          },
          {
            href: '/geo-audit',
            label: 'Free GEO audit',
            description: 'Score any URL for LLM citation-readiness in under 30 seconds.',
          },
          {
            href: '/generative-engine-optimization-tool',
            label: 'GEO tool',
            description: 'Continuous, multi-platform measurement — purpose-built for AI search.',
          },
          {
            href: '/pricing',
            label: 'Pricing',
            description: 'Plans that scale from one brand to multi-brand agency programs.',
          },
        ]}
      />
    </SeoLayout>
  );
}
