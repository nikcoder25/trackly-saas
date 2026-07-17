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
  title: 'Generative Engine Optimization (GEO) Guide 2026',
  description:
    'What is generative engine optimization? Learn the GEO strategy to get ChatGPT, Perplexity, Claude, and Gemini to mention and cite your brand.',
  keywords:
    'generative engine optimization, geo seo, ai search optimization, llm optimization, ai visibility optimization, geo guide, how to rank in chatgpt, how to rank in perplexity, llms.txt, ai citation optimization',
  alternates: { canonical: '/geo-optimization' },
  openGraph: {
    title: 'Generative Engine Optimization (GEO) Guide 2026',
    description:
      'What is generative engine optimization? Learn the GEO strategy to get ChatGPT, Perplexity, Claude, and Gemini to mention and cite your brand.',
    url: 'https://livesov.com/geo-optimization',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Generative Engine Optimization (GEO) - The Complete Guide | Livesov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Generative Engine Optimization (GEO) Guide 2026',
    description:
      'What is generative engine optimization? Learn the GEO strategy to get ChatGPT, Perplexity, Claude, and Gemini to mention and cite your brand.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const pillars = [
  {
    icon: '◎',
    title: 'Authoritative content',
    description:
      'Long, well-cited, well-structured pages that LLMs can quote - not short marketing pages. Depth and attribution beat keyword density.',
  },
  {
    icon: '⟁',
    title: 'Citation-worthy structure',
    description:
      'Clear H1 question, scannable first-200-word answers, schema markup, dated author attribution, explicit data sources.',
  },
  {
    icon: '⭑',
    title: 'Third-party authority',
    description:
      'AI weights G2, Capterra, Wikipedia, news outlets, Reddit, and category roundups heavily. Earn presence in the sources AI already trusts.',
  },
  {
    icon: '⌁',
    title: 'Freshness signals',
    description:
      'Last-updated dates, recent timestamps, and active editorial cycles tell AI your content is current - a strong citation booster.',
  },
  {
    icon: '⚙',
    title: 'AI-crawlable infrastructure',
    description:
      'llms.txt, robots.txt permissions for GPTBot / ClaudeBot / PerplexityBot, clean HTML, and accessible content without aggressive JS gating.',
  },
  {
    icon: '✺',
    title: 'Brand consistency',
    description:
      'Same brand name, founders, pricing, integrations across every property AI can read. Inconsistency breeds hallucinations.',
  },
];

const steps = [
  {
    title: 'Audit current AI visibility',
    description:
      'Run a baseline measurement across ChatGPT, Claude, Gemini, Perplexity, and Grok. You can&rsquo;t optimize what you don&rsquo;t measure.',
  },
  {
    title: 'Identify highest-impact prompts',
    description:
      'Cluster the prompts that drive your category (comparison, &quot;best for,&quot; alternatives). Prioritize the prompts with highest commercial intent and lowest current rank.',
  },
  {
    title: 'Reverse-engineer winning citations',
    description:
      'For each priority prompt, look at the pages AI currently cites. What do they have in common? Schema, depth, freshness, source authority - find the pattern.',
  },
  {
    title: 'Ship targeted content & infra',
    description:
      'Publish or upgrade the pages that match the citation pattern. Fix llms.txt and schema. Earn third-party placements in the sources AI trusts.',
  },
  {
    title: 'Re-measure in next AI cycle',
    description:
      'Wait one Perplexity / Gemini cycle (days) or one ChatGPT / Claude cycle (weeks for non-grounded). Confirm the move in your dashboard. Repeat.',
  },
];

const geoVsSeoRows = [
  ['Primary surface', 'AI-generated answer text & citations', 'SERP positions 1–10'],
  ['Ranking input', 'Cross-source consensus + structure + freshness', 'Backlinks + on-page + intent match'],
  ['Click model', 'AI cites; reader may never visit', 'Position 1 dominates clicks'],
  ['Measurement unit', 'Mention rate, share of voice, citation share, rank', 'Keyword position, organic traffic, impressions'],
  ['Update cadence', 'Hours (Perplexity / Grok) to weeks (ChatGPT / Claude)', 'Daily-weekly Google index'],
  ['Hallucination risk', 'High - AI invents facts', 'None - Google links to real pages'],
  ['Best-in-class tool', 'Livesov (AI-native)', 'Ahrefs / Semrush (SERP-native)'],
];

const faqs = [
  {
    question: 'What is Generative Engine Optimization (GEO)?',
    answer:
      'GEO is the practice of optimizing your brand&rsquo;s digital footprint so that AI platforms - ChatGPT, Claude, Gemini, Perplexity, and Grok - accurately mention, recommend, and cite your brand in their generated answers. Where SEO targets the 10 blue links, GEO targets the AI answer above them.',
  },
  {
    question: 'Is GEO replacing SEO?',
    answer:
      'No - it&rsquo;s additive. AI Overviews, ChatGPT Search, and Perplexity all draw on the same authoritative web that SEO helps you build. The fastest brands treat GEO and SEO as one motion: SEO earns the search visibility AI grounds on; GEO measures whether AI actually quotes you.',
  },
  {
    question: 'What is llms.txt?',
    answer:
      'llms.txt is an emerging open standard (similar in spirit to robots.txt) that tells AI crawlers which content on your site they should prioritize and how to interpret it. Livesov ships a free /tools/llms-txt-generator that produces a valid llms.txt for any domain.',
  },
  {
    question: 'How is GEO different per AI platform?',
    answer:
      'The core principles (depth, structure, authority, freshness) are shared. The platform-specific tuning differs: ChatGPT weighs broad open-web consensus, Perplexity weighs live-retrievable structured pages, Claude weighs well-cited long-form content, Gemini weighs current Google-ranking pages, and Grok weighs recent X conversation. Livesov measures each separately.',
  },
  {
    question: 'How quickly does GEO work?',
    answer:
      'For grounded surfaces (Perplexity, ChatGPT Search, Gemini AI Overviews, Grok live-search), improvements can show up in days. For pure model-knowledge surfaces (ChatGPT default, Claude, Gemini API without grounding), shifts typically take 4–12 weeks to fully propagate as models retrain or are updated.',
  },
  {
    question: 'Can I do GEO myself or do I need an agency?',
    answer:
      'Both work. The core loop is measurable and repeatable: audit, identify gaps, ship improvements, re-measure. Livesov is built for solo operators, in-house teams, and agencies alike - see our /partners page for the agency program.',
  },
  {
    question: 'What are the biggest GEO mistakes?',
    answer:
      'Three big ones: (1) optimising only for one platform, (2) treating AI visibility as a one-off audit instead of a continuous loop, and (3) ignoring third-party authority sources because they don&rsquo;t look like &quot;your&quot; pages. AI cares about cross-source consensus more than your homepage.',
  },
];

export default function GeoOptimizationPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'GEO Optimization', url: '/geo-optimization' }]} />

      <SeoHero
        title={
          <>
            Generative Engine{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              Optimization (GEO)
            </span>
          </>
        }
        subtitle="The complete 2026 playbook for ranking inside AI answers. Content, schema, citations, llms.txt, and how to measure whether your work actually moves the needle across ChatGPT, Claude, Gemini, Perplexity, and Grok."
        ctaText="Get the playbook + free trial"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '5', label: 'AI platforms to optimize for' },
            { value: '6', label: 'GEO pillars to master' },
            { value: '4–12 wk', label: 'Typical impact horizon' },
            { value: 'Free', label: 'GEO audit + llms.txt tools' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="What is GEO?"
          title="The optimization discipline for the post-search internet"
          subtitle="When AI answers buyer questions before they ever land on a SERP, you need a discipline that targets the AI answer itself. That&rsquo;s GEO."
        />
        <LongForm>
          <p>
            <strong>Generative Engine Optimization (GEO)</strong> is the practice of structuring
            your brand&apos;s digital footprint so that AI platforms (ChatGPT, Claude, Gemini,
            Perplexity, Grok) accurately mention, recommend, and cite your brand in their
            generated answers. It is to AI search what SEO was to the early Google index - a
            young, fast-moving, high-impact discipline that compounds for the brands that
            adopt it early.
          </p>
          <p>
            GEO is not a replacement for SEO. It is the layer above SEO that determines whether
            the work you&apos;ve already done - ranking content, earning backlinks, building
            authority - actually gets turned into an AI mention. Some of the highest-traffic
            SEO pages on the web are invisible inside ChatGPT and Perplexity, because they were
            optimized for click-throughs, not for AI quotation.
          </p>
        </LongForm>
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="The six pillars"
          title="What actually moves AI visibility"
          subtitle="There&rsquo;s a lot of GEO noise on the internet right now. These six pillars are what consistently move metrics in production across thousands of tracked Livesov brands."
        />
        <FeatureGrid items={pillars} columns={3} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="The five-step loop"
          title="GEO is a measurement loop, not a one-off audit"
        />
        <ProcessSteps steps={steps} />
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>Pillar 1: Authoritative content</h2>
          <p>
            AI platforms quote content that <em>sounds</em> like the answer they want to give.
            Short, marketing-heavy pages with three bullet points and a CTA almost never get
            cited. Long, structured, attribution-heavy pages that fully answer the question are
            quoted constantly.
          </p>
          <p>
            Practical actions: aim for 1,500–3,000 words on commercial-intent pages, lead with a
            direct answer in the first 200 words (the part AI lifts), include explicit data
            sources and dates, name the author and credentials, and structure the body with H2s
            that mirror real buyer questions.
          </p>

          <h2>Pillar 2: Citation-worthy structure</h2>
          <p>
            AI parsers prefer pages with clean structure. That means: one focused H1 framed as a
            question or claim, scannable H2/H3 hierarchy, FAQ-style sections with explicit
            questions, schema markup (Article, FAQPage, Product, Organization), and proper
            semantic HTML. The same structural cleanup that improves accessibility also
            improves AI citation rate.
          </p>

          <h2>Pillar 3: Third-party authority</h2>
          <p>
            This is the single most under-invested pillar. AI platforms weight third-party
            sources - G2, Capterra, Wikipedia, Reddit, major news outlets, category roundups,
            analyst notes - extraordinarily heavily. The cleanest way to win Perplexity
            citations and ChatGPT mentions is to be the brand most often referenced inside
            those sources, not to publish more on your own blog.
          </p>
          <p>
            Practical actions: claim and complete your G2 / Capterra / Crunchbase / Wikipedia
            profiles, ship comparison pages that other brands link to (because comparison
            content earns inbound citations), invest in analyst relations even at small scale,
            and pursue inclusion in &quot;best of&quot; roundups in your category.
          </p>

          <h2>Pillar 4: Freshness signals</h2>
          <p>
            Last-updated dates, recent timestamps, and active editorial signals tell AI your
            content is current - a strong citation booster, especially for the grounded
            surfaces (Perplexity, ChatGPT Search, Gemini AI Overviews, Grok live-search). A
            three-year-old page with no last-updated date is invisible to most AI grounders.
          </p>
          <p>
            Practical actions: add visible last-updated dates to all evergreen pages, update
            them genuinely (not cosmetically), and ship a quarterly refresh cycle on your
            highest-value commercial pages.
          </p>

          <h2>Pillar 5: AI-crawlable infrastructure</h2>
          <p>
            AI crawlers - GPTBot, ClaudeBot, PerplexityBot, GoogleOther, OAI-SearchBot,
            xAI-Bot - need permission and a clean route to your content. The infra checklist:
            allow the major AI crawlers in robots.txt (unless you have a deliberate reason
            not to), serve content as HTML without aggressive JS gating, ship an llms.txt
            file with a curated map of your most important content, and set HTTP cache headers
            that don&apos;t serve stale content to AI crawlers.
          </p>
          <p>
            Use our free <a href="/tools/llms-txt-generator">llms.txt generator</a> to produce a
            valid file in 30 seconds. Use our <a href="/tools/ai-crawler-checker">AI crawler
            checker</a> to confirm GPTBot, ClaudeBot, and PerplexityBot can actually reach
            your site.
          </p>

          <h2>Pillar 6: Brand consistency</h2>
          <p>
            Inconsistent brand facts across the web create the perfect conditions for AI
            hallucinations. If your pricing tiers, founder names, supported regions, or
            integrations are listed differently on your homepage, your docs, your G2 profile,
            and a third-party comparison page, AI splits the difference and invents an
            average - which is almost always wrong.
          </p>
          <p>
            Practical actions: define a canonical fact set, audit your top 20–50 most-cited
            pages for consistency, and use Livesov&apos;s canonical facts store to monitor for
            drift between AI outputs and your verified facts.
          </p>

          <h2>GEO vs. SEO - the head-to-head</h2>
          <p>
            The clearest way to think about GEO is to put it next to SEO and compare every
            dimension.
          </p>
        </LongForm>

        <div style={{ maxWidth: 900, margin: '40px auto 0', padding: '0 24px' }}>
          <ComparisonTable
            headers={['Dimension', 'GEO', 'Traditional SEO']}
            rows={geoVsSeoRows}
            highlightColumn={1}
          />
        </div>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <LongForm>
          <h2>How GEO differs per AI platform</h2>
          <p>
            The six pillars are universal, but the weighting differs per platform. Here&apos;s
            the cheat sheet:
          </p>
          <ul>
            <li>
              <strong>
                <a href="/chatgpt-brand-tracking">ChatGPT</a>:
              </strong>{' '}
              broad open-web consensus matters most. Long-tail comparison content and
              high-authority third-party reviews dominate. Citations only appear in ChatGPT
              Search; the default model leans on training corpus.
            </li>
            <li>
              <strong>
                <a href="/perplexity-brand-tracking">Perplexity</a>:
              </strong>{' '}
              the most directly optimisable platform. Live retrieval means structured, well-
              ranking, citation-friendly pages win quickly. Citation share is the single
              cleanest metric in all of GEO.
            </li>
            <li>
              <strong>
                <a href="/claude-brand-tracking">Claude</a>:
              </strong>{' '}
              long-form, well-attributed, balanced content rules. Claude rewards depth and
              caveats; it punishes marketing language. Documentation sites often outperform
              blogs.
            </li>
            <li>
              <strong>
                <a href="/gemini-brand-tracking">Gemini</a>:
              </strong>{' '}
              strong Google rankings are a near-prerequisite, since AI Overviews ground on
              the same index. After that, scannable answers and schema markup are the
              tiebreakers.
            </li>
            <li>
              <strong>
                <a href="/grok-brand-tracking">Grok</a>:
              </strong>{' '}
              real-time X presence carries unusual weight. Active, credible X accounts in your
              category materially shift Grok&apos;s answers within days.
            </li>
          </ul>

          <Callout title="The most common GEO mistake" variant="note">
            Treating GEO as a one-off project. AI models update, your competitors ship content,
            third-party sources change. The brands that win GEO run the measurement loop
            weekly - not quarterly. That&apos;s why Livesov is built as a continuous monitor,
            not a one-time audit tool.
          </Callout>

          <h2>Tools that accelerate the loop</h2>
          <p>
            Most of the GEO toolkit is free. Use these to start:
          </p>
          <ul>
            <li>
              <a href="/geo-audit">Free GEO Audit</a> - score any URL for AI-citation readiness
              in seconds.
            </li>
            <li>
              <a href="/tools/llms-txt-generator">llms.txt Generator</a> - produce a valid
              llms.txt for your domain.
            </li>
            <li>
              <a href="/tools/ai-crawler-checker">AI Crawler Checker</a> - confirm GPTBot,
              ClaudeBot, PerplexityBot, and GoogleOther can reach your site.
            </li>
            <li>
              <a href="/tools/chatgpt-mention-checker">ChatGPT Mention Checker</a> - run a one-
              shot mention check against ChatGPT.
            </li>
            <li>
              <a href="/tools/share-of-voice-calculator">Share of Voice Calculator</a> - quick
              math on AI share of voice in your category.
            </li>
            <li>
              <a href="/tools">All free GEO tools</a> - the complete library.
            </li>
          </ul>
          <p>
            Want the deep dives? Read our{' '}
            <a href="/blog/generative-engine-optimization-guide-saas">complete GEO guide for SaaS</a>,
            the roundup of the{' '}
            <a href="/blog/best-ai-brand-monitoring-tools">best AI brand monitoring tools</a>, and
            our playbook on <a href="/blog/how-to-rank-on-chatgpt">how to rank on ChatGPT</a>.
          </p>
          <p>
            When you&apos;re ready to move from spot-checks to continuous measurement, that&apos;s
            where <strong>Livesov</strong> comes in. <a href="/pricing">Start a 7-day free
            trial</a> - no credit card.
          </p>
        </LongForm>
      </Section>

      <FaqSection
        title="GEO frequently asked questions"
        subtitle="What teams ask before they start a serious GEO program."
        items={faqs}
      />

      <PillarLinks
        title="Continue the GEO playbook"
        links={[
          {
            href: '/geo-audit',
            label: 'Free GEO audit',
            description: 'Score any URL for AI citation-readiness.',
          },
          {
            href: '/chatgpt-brand-tracking',
            label: 'ChatGPT tracking',
            description: 'Apply GEO measurement to ChatGPT specifically.',
          },
          {
            href: '/perplexity-brand-tracking',
            label: 'Perplexity tracking',
            description: 'The cleanest platform to test GEO improvements on.',
          },
          {
            href: '/how-it-works',
            label: 'How Livesov works',
            description: 'Methodology behind every metric.',
          },
          {
            href: '/use-cases',
            label: 'Use cases',
            description: 'How different teams run GEO programs.',
          },
          {
            href: '/pricing',
            label: 'Pricing & plans',
            description: 'Start free, scale to multi-brand.',
          },
        ]}
      />
    </SeoLayout>
  );
}
