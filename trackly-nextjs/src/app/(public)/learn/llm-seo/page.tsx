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
  title: 'LLM SEO: The 2026 Guide to Ranking in ChatGPT, Claude, Gemini & Perplexity | Livesov',
  description:
    'LLM SEO is the practice of optimizing your brand for Large Language Models — ChatGPT, Claude, Gemini, Perplexity, and Grok. The full 2026 playbook: how LLMs rank pages, what they cite, and how to measure it.',
  keywords:
    'llm seo, llm optimization, large language model seo, chatgpt seo, claude seo, perplexity seo, ranking in llms, how llms rank content, llm visibility, llm search optimization',
  alternates: { canonical: '/learn/llm-seo' },
  openGraph: {
    title: 'LLM SEO: The 2026 Guide to Ranking in ChatGPT, Claude, Gemini & Perplexity',
    description:
      'How Large Language Models rank, retrieve, and cite content — and how to make sure they cite yours.',
    url: 'https://livesov.com/learn/llm-seo',
    siteName: 'Livesov',
    type: 'article',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'LLM SEO: The 2026 Guide | Livesov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LLM SEO: The Complete 2026 Guide',
    description:
      'How Large Language Models rank, retrieve, and cite content — and how to make sure they cite yours.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const ranking = [
  {
    icon: '◐',
    title: 'Training-corpus weight',
    description:
      'Base models (ChatGPT default, Claude, Gemini API) score brands by how often they appear in the training data. That is downstream of being everywhere AI scrapes: Wikipedia, Reddit, GitHub, major publishers, G2.',
  },
  {
    icon: '◑',
    title: 'Retrieval relevance',
    description:
      'Grounded surfaces (Perplexity, ChatGPT Search, Gemini AI Overviews) re-rank live search results before citing them. Schema, freshness, and lexical match with the user query decide who gets quoted.',
  },
  {
    icon: '◒',
    title: 'Cross-source consensus',
    description:
      'LLMs deliberately diversify sources. The brand named by 6 different domains beats the brand named only by its own homepage — even if the homepage is more authoritative.',
  },
  {
    icon: '◓',
    title: 'Extractability',
    description:
      'A page that answers the question in its first 200 words is dramatically more citable than one that buries the answer. LLMs reward summarizable content.',
  },
  {
    icon: '◔',
    title: 'Crawler permission',
    description:
      'GPTBot, ClaudeBot, PerplexityBot, GoogleOther, OAI-SearchBot. If you block them in robots.txt, you opt out of every LLM that respects the standard.',
  },
  {
    icon: '◕',
    title: 'Brand-fact consistency',
    description:
      'When facts disagree across sources, LLMs hallucinate. Aligning pricing, founders, integrations, and supported regions across every property closes the hallucination gap.',
  },
];

const steps = [
  {
    title: 'Map the prompts your buyers actually ask',
    description:
      'Stop guessing keywords. Cluster the 30–100 prompts that drive purchase decisions in your category — comparison, best-for, alternatives, integrations.',
  },
  {
    title: 'Baseline mention rate across every LLM',
    description:
      'Run each prompt against ChatGPT, Claude, Gemini, Perplexity, and Grok. Record mention rate, sentiment, citation share, and rank for your brand and your top 5 competitors.',
  },
  {
    title: 'Diagnose why an LLM omits you',
    description:
      'There are only four causes: no training-corpus presence, no retrievable URL, weak cross-source consensus, or low extractability. Each has a different fix.',
  },
  {
    title: 'Ship the highest-leverage fix first',
    description:
      'A canonical comparison page often outperforms 10 blog posts. A G2 placement often outperforms a backlink campaign. Pick the lever the diagnostic identified.',
  },
  {
    title: 'Re-measure on each model cycle',
    description:
      'Grounded surfaces (Perplexity, ChatGPT Search) move in days. Pure training-corpus surfaces (Claude, GPT default) move in weeks to months. Set the cadence per platform.',
  },
];

const llmSeoVsClassic = [
  ['Ranking signal', 'Cross-source consensus + extractability', 'Backlinks + on-page signals + intent match'],
  ['Update speed', 'Days (retrieval) to months (training)', 'Daily Google index'],
  ['Position concept', 'Mention rate, citation share, rank inside the answer', 'SERP position 1–10'],
  ['Click path', 'Often zero clicks — AI answers in place', 'Click-through from blue link'],
  ['Hallucination risk', 'Yes — facts get invented', 'No — Google links to real pages'],
  ['Best tool category', 'AI-native trackers (Livesov)', 'SERP trackers (Ahrefs, Semrush)'],
];

const faqs = [
  {
    question: 'What is LLM SEO?',
    answer:
      'LLM SEO is the discipline of optimizing your brand and content so that Large Language Models (ChatGPT, Claude, Gemini, Perplexity, Grok) mention you, recommend you, and cite you in their answers. It is the natural evolution of SEO for a search layer where the model itself answers the user, instead of returning ten blue links.',
  },
  {
    question: 'How is LLM SEO different from GEO (Generative Engine Optimization)?',
    answer:
      'They are largely the same discipline. "LLM SEO" emphasises the model — what the LLM knows about you from training, and how it retrieves you at runtime. "GEO" emphasises the generative answer surface — the box the user reads. In practice the playbook is identical: own the sources LLMs read, structure pages for extraction, and measure mention rate across every platform.',
  },
  {
    question: 'Can I do LLM SEO without doing classic SEO?',
    answer:
      'No, and you would not want to. Every grounded LLM surface — Perplexity, ChatGPT Search, Gemini AI Overviews, Google AI Mode — retrieves from the same web that classic SEO ranks. Strong organic rankings are the cheapest LLM-citation input you can buy. LLM SEO sits on top of classic SEO, not next to it.',
  },
  {
    question: 'Which LLMs cite sources, and which do not?',
    answer:
      'Perplexity, ChatGPT Search, Gemini AI Overviews, Google AI Mode, and Grok with live search all cite. The base ChatGPT model, Claude, and Gemini through the API without grounding do not cite — they answer from training memory. For non-citing surfaces, your only lever is being prevalent enough in the training corpus to be remembered.',
  },
  {
    question: 'How long does LLM SEO take to work?',
    answer:
      'Grounded surfaces respond fastest. A correctly optimised page can show up in Perplexity citations within days of publishing and re-indexing. Pure training-corpus surfaces (Claude, default ChatGPT) take 4–12 weeks for meaningful shifts, because the model only updates when retrained or when its knowledge cutoff moves.',
  },
  {
    question: 'What is the single highest-leverage LLM SEO action?',
    answer:
      'For most brands: shipping a long, well-structured comparison page on the highest-volume "best X for Y" or "X vs Y" query in their category, then earning placements in the 5–10 third-party sources LLMs already cite for that query (G2, Reddit, category roundups). That single move tends to move mention rate across multiple LLMs at once.',
  },
  {
    question: 'How do I measure LLM SEO results?',
    answer:
      'Mention rate, citation share, sentiment, and rank inside the AI answer — per prompt, per LLM, over time. Livesov measures all four continuously across ChatGPT, Claude, Gemini, Perplexity, and Grok so you can see whether a change actually moved the needle.',
  },
];

export default function LlmSeoPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Learn', url: '/learn' },
          { name: 'LLM SEO', url: '/learn/llm-seo' },
        ]}
      />

      <SeoHero
        title={
          <>
            LLM SEO:{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              The 2026 Guide
            </span>
          </>
        }
        subtitle="How Large Language Models rank, retrieve, and cite content — and how to make sure they cite yours. The complete playbook for ChatGPT, Claude, Gemini, Perplexity, and Grok."
        ctaText="Start tracking LLM mentions"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '5', label: 'LLMs to optimize for' },
            { value: '6', label: 'Ranking signals that move the needle' },
            { value: 'Days–weeks', label: 'Time-to-impact per surface' },
            { value: 'Free', label: 'Baseline audit + measurement tools' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="What LLM SEO actually is"
          title="Optimizing for the model, not the SERP"
          subtitle="Classic SEO targets a ranked list. LLM SEO targets a generated paragraph. Different surface, different ranking signals, different measurement."
        />
        <LongForm>
          <p>
            <strong>LLM SEO</strong> is the practice of structuring your brand and content so that
            Large Language Models — ChatGPT, Claude, Gemini, Perplexity, and Grok — accurately
            mention, recommend, and cite you in their generated answers. It is the natural
            extension of search engine optimization for a world where the search engine is no
            longer a list of links but a sentence written by a model.
          </p>
          <p>
            Three things make LLM SEO distinct. First, the ranking unit is the citation or the
            mention, not the SERP position. Second, the ranking signal is cross-source consensus,
            not just on-page or off-page authority — LLMs look for the brand most often
            <em> consistently described</em> across many sources, then quote it. Third, the
            click is often gone: an AI answer that names you is the conversion, not the start of
            one. That changes how you measure success.
          </p>
        </LongForm>
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="The six ranking signals"
          title="What actually determines whether an LLM names you"
          subtitle="Every LLM uses some combination of these six signals. Optimizing for them in order is the entire job."
        />
        <FeatureGrid items={ranking} columns={3} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="The five-step loop"
          title="LLM SEO is a measurement program, not a content checklist"
        />
        <ProcessSteps steps={steps} />
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>How each LLM ranks differently</h2>
          <p>
            The signals above are universal, but the weighting is not. The fastest way to lose
            time in LLM SEO is to apply one playbook to all five LLMs. Here is the per-platform
            cheat sheet that we have validated across thousands of tracked brands.
          </p>

          <h3>ChatGPT (OpenAI)</h3>
          <p>
            The default model answers from training memory and rewards broad open-web presence —
            Wikipedia, Reddit, GitHub, established publishers, G2, Capterra. ChatGPT Search
            additionally re-ranks live retrieval, where schema, freshness, and explicit
            comparison content matter. If you are invisible in Reddit + G2 + Wikipedia, expect to
            be invisible in default ChatGPT regardless of what your blog says. See our{' '}
            <a href="/chatgpt-brand-tracking">ChatGPT brand tracking</a> page for the full
            platform breakdown.
          </p>

          <h3>Claude (Anthropic)</h3>
          <p>
            Claude rewards depth, attribution, and balance. Marketing-heavy prose tends to be
            quoted less than well-cited, long-form documentation. Claude is also unusually
            sensitive to fact consistency — contradictions across sources visibly suppress your
            mention rate. See <a href="/claude-brand-tracking">Claude brand tracking</a>.
          </p>

          <h3>Gemini (Google)</h3>
          <p>
            Gemini and AI Overviews lean heavily on Google&apos;s live index, so high organic
            ranks are close to a prerequisite. Once you rank, scannable answers, structured
            data, and clear schema decide the tiebreaker. See our{' '}
            <a href="/learn/ai-overviews-optimization">AI Overviews optimization guide</a> for
            the specifics.
          </p>

          <h3>Perplexity</h3>
          <p>
            Perplexity is the most directly optimisable LLM. It retrieves live, cites
            explicitly, and updates within days. Structured comparison pages and high-ranking
            evergreen content move citation share quickly. See{' '}
            <a href="/perplexity-brand-tracking">Perplexity brand tracking</a>.
          </p>

          <h3>Grok (xAI)</h3>
          <p>
            Grok weights real-time X conversation heavily and uses live X search. Active,
            credible X presence in your category shifts answers within days — even when your
            website footprint is unchanged. See <a href="/grok-brand-tracking">Grok brand
            tracking</a>.
          </p>

          <h2>LLM SEO vs. classic SEO — head-to-head</h2>
          <p>
            We get asked which one to invest in. The honest answer is both, sequenced. Classic
            SEO is the cheapest LLM SEO input. Here is how the two disciplines compare on the
            dimensions that matter.
          </p>
        </LongForm>

        <div style={{ maxWidth: 900, margin: '40px auto 0', padding: '0 24px' }}>
          <ComparisonTable
            headers={['Dimension', 'LLM SEO', 'Classic SEO']}
            rows={llmSeoVsClassic}
            highlightColumn={1}
          />
        </div>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <LongForm>
          <h2>The four reasons an LLM ignores your brand</h2>
          <p>
            When a brand is missing from an LLM answer, the cause is almost always one of four.
            Diagnosing which one applies is the single most important step in any LLM SEO
            engagement.
          </p>
          <ol>
            <li>
              <strong>No training-corpus presence.</strong> The model has never reliably seen
              your brand name. Fix: invest in the canonical third-party sources LLMs scrape —
              Wikipedia, Reddit, G2, Capterra, well-trafficked publisher coverage.
            </li>
            <li>
              <strong>No retrievable URL.</strong> A grounded LLM tried to fetch evidence for
              the answer, and your site was not in the top retrieval results. Fix: classic SEO
              for the query, plus schema, freshness, and llms.txt.
            </li>
            <li>
              <strong>Weak cross-source consensus.</strong> Only your own pages claim what you
              claim. The LLM diversifies sources and picks the brand that 5 unrelated domains
              name. Fix: earn third-party placements, comparison roundups, analyst inclusion.
            </li>
            <li>
              <strong>Low extractability.</strong> The right page exists, but the answer is
              buried below 1,200 words of preamble. Fix: lead with a direct answer in the first
              200 words; structure with question-style H2s and FAQ schema.
            </li>
          </ol>

          <Callout title="The diagnostic skip is the #1 LLM SEO mistake" variant="note">
            Teams reach for content as the default fix because content is what they know how to
            ship. But if the cause is (1) — no training-corpus presence — no amount of new blog
            posts on your own domain will move it. The diagnostic determines the lever; the
            lever determines the work.
          </Callout>

          <h2>The free LLM SEO toolkit</h2>
          <p>
            You can start without buying anything. The Livesov free tools cover the four
            highest-leverage diagnostics:
          </p>
          <ul>
            <li>
              <a href="/geo-audit">Free GEO Audit</a> — score any URL across the six ranking
              signals.
            </li>
            <li>
              <a href="/tools/ai-crawler-checker">AI Crawler Checker</a> — confirm GPTBot,
              ClaudeBot, PerplexityBot, and GoogleOther can reach your site.
            </li>
            <li>
              <a href="/tools/llms-txt-generator">llms.txt Generator</a> — produce the file LLM
              crawlers increasingly look for.
            </li>
            <li>
              <a href="/tools/chatgpt-mention-checker">ChatGPT Mention Checker</a> — one-shot
              check whether ChatGPT names your brand for a specific prompt.
            </li>
            <li>
              <a href="/tools/citation-finder">Citation Finder</a> — see which URLs Perplexity
              and ChatGPT cite for a query in your category.
            </li>
            <li>
              <a href="/tools/share-of-voice-calculator">Share of Voice Calculator</a> — measure
              your share against named competitors.
            </li>
          </ul>
          <p>
            When you need to move from spot-checks to continuous, multi-platform measurement —
            mention rate, citation share, rank, sentiment, all five LLMs, daily — that is what
            Livesov was built for. <a href="/pricing">Start free</a>, no credit card.
          </p>
        </LongForm>
      </Section>

      <FaqSection
        title="LLM SEO frequently asked questions"
        subtitle="The questions teams ask before they start a serious LLM SEO program."
        items={faqs}
      />

      <PillarLinks
        title="Continue the LLM SEO playbook"
        links={[
          {
            href: '/learn/ai-search-optimization',
            label: 'AI search optimization',
            description: 'The companion pillar — optimizing for AI-powered search surfaces.',
          },
          {
            href: '/learn/ai-overviews-optimization',
            label: 'AI Overviews optimization',
            description: 'Google AI Overviews specifically — how to win and hold a citation.',
          },
          {
            href: '/geo-optimization',
            label: 'Generative Engine Optimization (GEO)',
            description: 'The broader GEO playbook covering all generative surfaces.',
          },
          {
            href: '/generative-engine-optimization-tool',
            label: 'GEO tool',
            description: 'The tool itself — Livesov, built for LLM SEO programs.',
          },
          {
            href: '/geo-audit',
            label: 'Free GEO audit',
            description: 'Score any URL for LLM citation-readiness in under 30 seconds.',
          },
          {
            href: '/pricing',
            label: 'Pricing & plans',
            description: 'Start free, scale to multi-brand LLM SEO programs.',
          },
        ]}
      />
    </SeoLayout>
  );
}
