import type { Metadata } from 'next';
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
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'AI Visibility Score: What It Is & What Counts as a Good One (2026) | Livesov',
  description:
    'What is an AI visibility score, how is it calculated, and what counts as a good search visibility score? A plain-English guide to measuring how often AI engines surface your brand.',
  keywords:
    'visibility score, search visibility score, what is a good search visibility score, search visibility definition, visibility percentage, ai visibility score, search visibility',
  alternates: { canonical: '/learn/ai-visibility-score' },
  openGraph: {
    title: 'AI Visibility Score: What It Is & What Counts as a Good One (2026) | Livesov',
    description:
      'What is an AI visibility score, how is it calculated, and what counts as a good search visibility score? A plain-English guide for the AI search era.',
    url: 'https://livesov.com/learn/ai-visibility-score',
    siteName: 'Livesov',
    type: 'article',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AI visibility score explained - what it is and what counts as a good one',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Visibility Score: What It Is & What Counts as Good | Livesov',
    description:
      'How an AI visibility score is calculated and what counts as a good search visibility score.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const inputs = [
  {
    icon: '◎',
    title: 'Mention rate',
    description:
      'How often AI engines name your brand at all when asked the questions your buyers ask. The foundation of any visibility score.',
  },
  {
    icon: '#',
    title: 'Recommendation rank',
    description:
      'When an engine lists options, where do you land? Being mentioned 5th is very different from being the first answer.',
  },
  {
    icon: '◑',
    title: 'Share of voice',
    description:
      'Your mentions as a percentage of all brand mentions in the same prompts - the AI-era version of market share.',
  },
  {
    icon: '⟁',
    title: 'Engine coverage',
    description:
      'A score that only reflects ChatGPT hides your standing on Gemini, Perplexity, Claude and Grok. Coverage weights the result.',
  },
];

const faqs = [
  {
    question: 'What is an AI visibility score?',
    answer:
      'An AI visibility score is a single number, usually 0–100, that summarises how often and how prominently AI engines like ChatGPT, Gemini and Perplexity surface your brand when people ask questions in your category. It rolls up mention rate, recommendation rank, share of voice and engine coverage into one trackable metric.',
  },
  {
    question: 'What is a good search visibility score?',
    answer:
      'There is no universal pass mark - it depends on how competitive and how broad your category is. As a working rule on a 0–100 scale: under 20 means you are mostly invisible in AI answers, 20–50 is emerging, 50–75 is strong, and 75+ means you are a default recommendation. What matters more than the absolute number is the trend over time and your score relative to direct competitors.',
  },
  {
    question: 'How is an AI visibility score calculated?',
    answer:
      'Run a fixed set of buyer-intent prompts through each AI engine, multiple times per cycle to handle non-determinism, then measure how often your brand is mentioned, where it ranks, and your share of voice versus competitors. Weight those signals across engines and normalise to a 0–100 scale. Recomputing on the same prompts on a schedule turns the score into a trend you can manage.',
  },
  {
    question: 'How is this different from a traditional search visibility score?',
    answer:
      'A traditional search visibility score (the kind in legacy SEO tools) estimates how visible your domain is in Google’s organic results based on keyword rankings and click-through curves. An AI visibility score measures something newer: whether large language models actually mention and recommend you in their answers - which keyword-rank data cannot see.',
  },
  {
    question: 'How often should I check my AI visibility score?',
    answer:
      'AI answers shift weekly as models update and competitors publish, so a one-off check goes stale fast. Tracking on a daily or weekly cadence over the same prompts is what makes the number meaningful - it lets you connect a change you made to a movement in the score.',
  },
  {
    question: 'Can I check my AI visibility score for free?',
    answer:
      'Yes. Livesov’s free GEO audit scores how citable a single page is for AI engines, and the free GEO score checker gives you a quick readiness grade. To track a full visibility score across all five engines over time, you can start a free Livesov trial.',
  },
];

export default function AiVisibilityScorePage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Learn', url: '/learn' },
          { name: 'AI Visibility Score', url: '/learn/ai-visibility-score' },
        ]}
      />

      <SeoHero
        title={
          <>
            <span className="text-[var(--brand)]">AI visibility score</span>: what it is, and what counts as good
          </>
        }
        subtitle="Your AI visibility score is the simplest way to answer one question: when people ask AI about your category, how often does it mention - and recommend - you? Here&rsquo;s how the score works, how it&rsquo;s calculated, and what a good one looks like."
        ctaText="Check your score free"
        ctaHref="/geo-audit"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '0–100', label: 'Typical visibility score scale' },
            { value: '50–75', label: 'A strong score in most categories' },
            { value: '5', label: 'Engines a complete score covers' },
            { value: 'Weekly', label: 'How fast AI answers can shift' },
          ]}
        />
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>Search visibility definition: from Google to AI</h2>
          <p>
            For two decades, &ldquo;search visibility&rdquo; meant one thing: an estimate of how visible
            your website is in Google&apos;s organic results, based on where you rank for a set of keywords
            and how often searchers click each position. A <strong>search visibility score</strong> packaged
            that into a single percentage so you could track it over time.
          </p>
          <p>
            That definition is now incomplete. A growing share of searches never reach a list of blue links
            - they end with an answer written by ChatGPT, Gemini, Perplexity or Google&apos;s AI Overviews.
            Keyword rankings can&apos;t tell you whether those answers mention you. So the modern version of
            the metric is an <strong>AI visibility score</strong>: how visible your brand is inside AI-generated
            answers, not just inside a ranked list of links.
          </p>

          <h2>What goes into an AI visibility score</h2>
          <p>
            A credible score isn&apos;t a single data point - it&apos;s a weighted roll-up of how AI engines
            actually treat your brand across many prompts and many runs. Four inputs do most of the work.
          </p>
        </LongForm>
      </Section>

      <Section pad="0 24px 80px" width={1000}>
        <FeatureGrid items={inputs} columns={2} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="The benchmark question"
          title="What is a good search visibility score?"
          subtitle="The honest answer: it depends on your category - but here&apos;s a practical scale to anchor against."
        />
        <LongForm>
          <p>
            On a 0–100 scale, treat these bands as a starting point and adjust for how competitive your
            market is:
          </p>
          <ul>
            <li><strong>Under 20 - Invisible.</strong> AI engines rarely mention you; competitors own the answer.</li>
            <li><strong>20–50 - Emerging.</strong> You show up sometimes, usually not first. Clear room to grow.</li>
            <li><strong>50–75 - Strong.</strong> You&apos;re a regular, well-ranked mention across multiple engines.</li>
            <li><strong>75+ - Default.</strong> You&apos;re one of the first names AI gives - the position you defend.</li>
          </ul>
          <Callout title="Trend &amp; relative score beat the absolute number" variant="tip">
            A score of 40 that climbed from 25 last month is a winning trajectory. A score of 70 that&apos;s
            slipping while a competitor rises is a problem. Always read your visibility score next to its trend
            line and against the specific competitors you care about.
          </Callout>
        </LongForm>
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>How to calculate (and improve) your score</h2>
          <p>
            The mechanics are straightforward, but the rigour is in the details. Pick a fixed set of
            buyer-intent prompts, run each through every engine several times per cycle to smooth out
            non-determinism, then measure mention rate, rank and share of voice and normalise to 0–100. Keep
            the prompt set stable so the number is comparable week to week. For the full methodology, see{' '}
            <a href="/how-it-works">how Livesov measures AI brand monitoring</a>.
          </p>
          <p>
            To move the score, optimise the content AI engines actually cite: clear, answerable structure,
            schema, freshness, and source attribution. Our{' '}
            <a href="/learn/ai-search-optimization">AI search optimization guide</a> covers the playbook, and
            you can pressure-test any single page with the{' '}
            <a href="/tools/geo-score-checker">free GEO score checker</a> or a full{' '}
            <a href="/geo-audit">GEO audit</a>. To see share of voice on its own, try the{' '}
            <a href="/tools/share-of-voice-calculator">share of voice calculator</a>.
          </p>
        </LongForm>
      </Section>

      <FaqSection
        title="AI visibility score - FAQ"
        subtitle="Definitions and benchmarks people ask about most."
        items={faqs}
      />

      <PillarLinks
        title="Go deeper"
        links={[
          { href: '/geo-audit', label: 'Free GEO audit', description: 'Score a page’s AI-citation readiness in seconds.' },
          { href: '/tools/geo-score-checker', label: 'GEO score checker', description: 'A quick AI-readiness grade for any URL.' },
          { href: '/tools/share-of-voice-calculator', label: 'Share of voice calculator', description: 'Measure your slice of AI mentions.' },
          { href: '/learn/ai-search-optimization', label: 'AI search optimization', description: 'The framework for raising your score.' },
          { href: '/how-it-works', label: 'How measurement works', description: 'The methodology behind the numbers.' },
          { href: '/glossary', label: 'AI search glossary', description: 'GEO, AEO, share of voice and more, defined.' },
        ]}
      />
    </SeoLayout>
  );
}
