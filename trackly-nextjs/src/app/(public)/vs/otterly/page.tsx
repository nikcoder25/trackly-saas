import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  FeatureGrid,
  StatsBar,
  FaqSection,
  ComparisonTable,
  Callout,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'Livesov vs Otterly.ai | AI Visibility Tools Compared (2026)',
  description:
    'Compare Livesov and Otterly.ai side by side: AI platforms covered, prompt limits, pricing, citations, and sentiment. An honest Otterly alternative comparison.',
  keywords:
    'livesov vs otterly, otterly alternative, otterly ai review, ai visibility tool comparison, ai search monitoring tools, otterly pricing, track brand chatgpt',
  alternates: { canonical: '/vs/otterly' },
  openGraph: {
    title: 'Livesov vs Otterly.ai | AI Visibility Tools Compared (2026)',
    description:
      'Compare Livesov and Otterly.ai side by side: AI platforms covered, prompt limits, pricing, citations, and sentiment.',
    url: 'https://livesov.com/vs/otterly',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Livesov vs Otterly.ai - AI Visibility Tools Compared',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov vs Otterly.ai | AI Visibility Tools Compared (2026)',
    description:
      'Compare Livesov and Otterly.ai side by side: AI platforms covered, prompt limits, pricing, citations, and sentiment.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const livesovStrengths = [
  {
    icon: '⚙',
    title: 'All 5 LLMs on every plan',
    description:
      'ChatGPT, Claude, Gemini, Perplexity, and Grok are all available in Livesov - no per-platform add-on pricing, and the 7-day trial includes all five.',
  },
  {
    icon: '⚠',
    title: 'AI hallucination detection',
    description:
      'A canonical facts store flags AI responses that contradict your verified brand facts - not just whether you were mentioned.',
  },
  {
    icon: '✺',
    title: 'Per-platform sentiment',
    description:
      'Sentiment models tuned to each AI&rsquo;s writing style, scored per platform rather than one generic classifier.',
  },
  {
    icon: '◎',
    title: 'Evidence capture',
    description:
      'Every run stores the full AI response as proof, so you can show stakeholders exactly what ChatGPT said and when.',
  },
  {
    icon: '$',
    title: 'Lower entry price',
    description:
      'Plans from $9/mo with a 7-day no-card trial. Strong fit for SMBs and early-stage teams priced out of enterprise tools.',
  },
  {
    icon: '⟁',
    title: 'Free GEO audit engine',
    description:
      'Score any URL for AI citation-readiness with prioritized recommendations - included, not a separate product.',
  },
];

const otterlyStrengths = [
  {
    icon: '🔍',
    title: 'Google AI Overviews & AI Mode',
    description:
      'Otterly tracks Google AI Overviews and Google AI Mode directly - Google surfaces are a core focus of the product.',
  },
  {
    icon: '🪟',
    title: 'Microsoft Copilot coverage',
    description: 'Copilot monitoring is available, useful for Microsoft-centric B2B audiences.',
  },
  {
    icon: '🏷',
    title: 'Category recognition',
    description:
      'G2 High Performer in Answer Engine Optimization and a Gartner Cool Vendor mention - strong third-party validation.',
  },
  {
    icon: '🧭',
    title: 'Prompt research tooling',
    description:
      'Free GEO tools including prompt-volume research help teams decide what to track before paying.',
  },
  {
    icon: '🤝',
    title: 'Agency partner program',
    description: 'An explicit agency partner track with volume pricing for client portfolios.',
  },
  {
    icon: '📜',
    title: 'Longer market track record',
    description:
      'One of the earliest dedicated AI search monitoring tools, with an established review footprint.',
  },
];

const comparisonRows = [
  ['ChatGPT tracking', '✓ Every plan', '✓'],
  ['Claude tracking', '✓ Every plan', '✗ Not listed'],
  ['Grok tracking', '✓ Every plan', '✗ Not listed'],
  ['Gemini tracking', '✓ Every plan', 'Paid add-on'],
  ['Perplexity tracking', '✓ Every plan', '✓'],
  ['Google AI Overviews / AI Mode', '✗ Roadmap', '✓ Core focus'],
  ['Microsoft Copilot', '✗', '✓'],
  ['AI sentiment analysis', '✓ Per platform', 'Basic'],
  ['Hallucination / fact-drift detection', '✓', '✗'],
  ['Full AI response stored as evidence', '✓', 'Partial'],
  ['Free trial without a credit card', '✓ 7 days', '14-day trial'],
  ['Entry price', '$9/mo (Starter)', '$29/mo (Lite, ~10 prompts)'],
];

const faqs = [
  {
    question: 'Is Livesov a good Otterly.ai alternative?',
    answer:
      'If your priority is covering all five major LLMs (including Claude and Grok) on every plan, storing full AI responses as evidence, and a lower entry price, yes. If your priority is Google AI Overviews, Google AI Mode, or Microsoft Copilot tracking, Otterly currently covers those surfaces and Livesov does not.',
  },
  {
    question: 'How do Livesov and Otterly pricing compare?',
    answer:
      'Livesov plans run $9-$89/mo, each with a 7-day no-card trial. Otterly lists Lite at $29/mo (around 10 prompts), Standard at $189/mo, and Pro at $989/mo on its public pricing page as of June 2026. Pricing changes - always confirm on each vendor’s site.',
  },
  {
    question: 'Which AI platforms does each tool track?',
    answer:
      'Livesov tracks ChatGPT, Claude, Gemini, Perplexity, and Grok on every plan. Otterly’s public materials list ChatGPT, Perplexity, Google AI Overviews, Google AI Mode, and Microsoft Copilot, with Gemini available as an add-on; Claude and Grok are not listed as of June 2026.',
  },
  {
    question: 'Does either tool have a free option?',
    answer:
      'Livesov offers a 7-day free trial of paid features with no credit card, plus a free GEO audit and free one-off tools that need no signup at all. Otterly offers a 14-day free trial and a set of free one-off GEO tools as of June 2026.',
  },
  {
    question: 'Can I switch from Otterly to Livesov?',
    answer:
      'Yes. Set up the same tracked prompts in Livesov and run both in parallel for a week to compare coverage. Livesov exports everything as CSV/JSON, and onboarding takes a few minutes - add your brand, competitors, and prompts, then run.',
  },
];

export default function VsOtterlyPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'vs Otterly', url: '/vs/otterly' }]} />

      <SeoHero
        title={
          <>
            Livesov vs <span className="text-[var(--brand)]">Otterly.ai</span>
          </>
        }
        subtitle="Two dedicated AI search monitoring tools with different centers of gravity: Livesov covers all five major LLMs on every plan with evidence capture and fact-drift detection; Otterly leans into Google AI Overviews, AI Mode, and Copilot."
        ctaText="Try Livesov free - no card"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '5', label: 'LLMs on every Livesov plan' },
            { value: '$9', label: 'Livesov entry price /mo' },
            { value: '$29', label: 'Otterly entry price /mo' },
            { value: '7-day', label: 'Free Livesov trial' },
          ]}
        />
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="Side-by-side comparison"
          title="What each tool actually does"
          subtitle="Honest comparison based on public product pages and pricing as of June 2026 - including the surfaces where Otterly is ahead."
        />
        <ComparisonTable
          headers={['Capability', 'Livesov', 'Otterly.ai']}
          rows={comparisonRows}
          highlightColumn={1}
        />
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 12 }}>
          Competitor details from Otterly&rsquo;s public site and pricing page, June 2026. Features
          and prices change - verify on otterly.ai before deciding.
        </p>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader label="Where Livesov leads" title="Six reasons teams pick Livesov" />
        <FeatureGrid items={livesovStrengths} columns={3} />
      </Section>

      <Section pad="80px 24px">
        <SectionHeader label="Where Otterly leads" title="Six things Otterly does well" />
        <FeatureGrid items={otterlyStrengths} columns={3} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <LongForm>
          <h2>How to choose between Livesov and Otterly</h2>
          <p>
            The decision usually reduces to one question: <em>which AI surfaces matter most to
            your buyers?</em>
          </p>
          <ul>
            <li>
              <strong>Your buyers research in ChatGPT, Claude, Perplexity, Gemini, or Grok:</strong>{' '}
              Livesov tracks all five on every plan, stores the full responses as evidence, and
              flags hallucinated facts. This is Livesov&rsquo;s home turf.
            </li>
            <li>
              <strong>Your traffic risk is Google AI Overviews or AI Mode:</strong> Otterly
              treats Google&rsquo;s AI surfaces as a first-class citizen, which Livesov does not
              cover today.
            </li>
            <li>
              <strong>Budget-constrained or testing the category:</strong> Livesov&rsquo;s
              free no-signup GEO audit and $9 entry plan are the lowest-friction way to start
              measuring AI visibility at all.
            </li>
          </ul>

          <Callout title="Run both for a week" variant="note">
            Both tools have free trials. The fastest evaluation is to configure the same 20
            prompts in each, run them for a week, and compare which tool surfaces the platforms,
            citations, and competitive movements your team actually acts on.
          </Callout>
        </LongForm>
      </Section>

      <FaqSection title="Livesov vs Otterly - FAQ" items={faqs} />

      <PillarLinks
        title="Continue evaluating"
        links={[
          { href: '/otterly-ai-alternative', label: 'Otterly.ai alternative', description: 'Why teams switch from Otterly to Livesov.' },
          { href: '/vs/profound', label: 'Livesov vs Profound', description: 'How Livesov compares to the enterprise leader.' },
          { href: '/vs/peec-ai', label: 'Livesov vs Peec AI', description: 'Add-on pricing vs all-platforms-included.' },
          { href: '/pricing', label: 'Pricing & plans', description: 'Start free, scale to agency multi-brand.' },
          { href: '/how-it-works', label: 'How Livesov works', description: 'Methodology and data pipeline explained.' },
          { href: '/geo-audit', label: 'Free GEO audit', description: 'Score any URL for AI citation-readiness.' },
          { href: '/tools', label: 'Free AI search tools', description: '11 free tools - no signup required.' },
        ]}
      />
    </SeoLayout>
  );
}
