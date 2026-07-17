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
  title: 'Livesov vs Peec AI | AI Visibility Tools Compared (2026)',
  description:
    'Compare Livesov and Peec AI: platform coverage, add-on pricing vs all-inclusive plans, methodology, and who each tool fits. An honest Peec AI alternative comparison.',
  keywords:
    'livesov vs peec, peec ai alternative, peec ai review, peec ai pricing, ai visibility tool comparison, geo tool, llm seo tool',
  alternates: { canonical: '/vs/peec-ai' },
  openGraph: {
    title: 'Livesov vs Peec AI | AI Visibility Tools Compared (2026)',
    description:
      'Compare Livesov and Peec AI: platform coverage, add-on pricing vs all-inclusive plans, methodology, and who each tool fits.',
    url: 'https://livesov.com/vs/peec-ai',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Livesov vs Peec AI - AI Visibility Tools Compared',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov vs Peec AI | AI Visibility Tools Compared (2026)',
    description:
      'Compare Livesov and Peec AI: platform coverage, add-on pricing vs all-inclusive plans, methodology, and who each tool fits.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const livesovStrengths = [
  {
    icon: '⚙',
    title: 'No per-platform add-ons',
    description:
      'Claude, Gemini, and Grok are included on every Livesov plan. Peec lists them as paid add-ons on top of the base subscription as of June 2026.',
  },
  {
    icon: '$',
    title: '10x lower entry price',
    description:
      'Livesov starts at $9/mo with a 7-day no-card trial. Peec&rsquo;s starter plan lists around $100/mo before add-ons.',
  },
  {
    icon: '◎',
    title: '7-day trial, no credit card',
    description:
      'Measure your brand across all 5 platforms before paying anything. No credit card required.',
  },
  {
    icon: '⚠',
    title: 'Hallucination detection',
    description:
      'Canonical facts store flags AI answers that contradict verified brand facts - beyond mention counting.',
  },
  {
    icon: '⟁',
    title: 'GEO audit included',
    description:
      'URL-level citation-readiness scoring with prioritized recommendations is part of the product, not a separate purchase.',
  },
  {
    icon: '🛠',
    title: '11 free public tools',
    description:
      'llms.txt generator, AI crawler checker, citation finder and more - useful before you ever sign up.',
  },
];

const peecStrengths = [
  {
    icon: '🖥',
    title: 'UI-scraping methodology',
    description:
      'Peec queries AI platforms through real browser sessions rather than APIs, so results mirror what end users literally see.',
  },
  {
    icon: '🚀',
    title: 'Fastest-growing vendor',
    description:
      '$10M ARR within 16 months of launch and a $21M Series A - rapid product velocity and momentum.',
  },
  {
    icon: '🇪🇺',
    title: 'Strong European footprint',
    description: 'Berlin-based with a large European agency and brand customer base.',
  },
  {
    icon: '📊',
    title: 'Polished team dashboards',
    description: 'Built for marketing teams and agencies with collaborative reporting out of the box.',
  },
  {
    icon: '🧪',
    title: 'DeepSeek coverage',
    description: 'Offers DeepSeek tracking as an add-on - relevant for some international audiences.',
  },
  {
    icon: '📰',
    title: 'Category mindshare',
    description: 'Heavy press coverage (TechCrunch, Fortune) keeps Peec top-of-mind in the niche.',
  },
];

const comparisonRows = [
  ['ChatGPT tracking', '✓ Every plan', '✓ Base'],
  ['Perplexity tracking', '✓ Every plan', '✓ Base'],
  ['Claude tracking', '✓ Every plan', 'Paid add-on'],
  ['Gemini tracking', '✓ Every plan', 'Paid add-on'],
  ['Grok tracking', '✓ Every plan', 'Paid add-on'],
  ['Google AI Overviews', '✗ Roadmap', '✓ Base'],
  ['Query method', 'Direct APIs', 'UI scraping (real sessions)'],
  ['Hallucination / fact-drift detection', '✓', '✗ Not advertised'],
  ['Free trial without a credit card', '✓ 7 days', '✗ Not advertised'],
  ['Entry price', '$9/mo', '~$100/mo + add-ons'],
  ['GEO audit included', '✓', '✗'],
];

const faqs = [
  {
    question: 'Is Livesov a good Peec AI alternative?',
    answer:
      'If you want all five major LLMs included at every price point, hallucination detection, and a GEO audit in one product, yes. If Google AI Overviews coverage or UI-scraping methodology are hard requirements, Peec currently has those and Livesov does not.',
  },
  {
    question: 'How does pricing compare between Livesov and Peec AI?',
    answer:
      'Livesov runs $0-$89/mo with everything included. Peec lists a starter around $100/mo with ChatGPT, Perplexity, and Google AI Overviews in the base, while Claude, Gemini, DeepSeek, and Grok are paid add-ons (roughly €20-30/mo each) as of June 2026. A five-platform Peec setup can cost 10x a five-platform Livesov setup. Verify current pricing at peec.ai.',
  },
  {
    question: 'Does API-based querying vs UI scraping matter?',
    answer:
      'Both approaches are legitimate and each has trade-offs. UI scraping (Peec) mirrors the consumer interface including its retrieval behavior; API querying (Livesov) is more stable, reproducible, and auditable, and Livesov stores every full response as evidence. For trend tracking - is your mention rate moving - both methodologies agree far more often than they differ.',
  },
  {
    question: 'Which tool is better for agencies?',
    answer:
      'Both target agencies. Livesov&rsquo;s Agency plan ($89/mo) covers multi-brand tracking with premium AI models and API access. Peec&rsquo;s team features are strong but the per-platform add-on pricing multiplies across client portfolios. Agencies managing many SMB clients tend to feel that multiplication quickly.',
  },
  {
    question: 'Can I try both before deciding?',
    answer:
      'Livesov: yes - a 7-day no-card trial plus a free GEO audit that needs no signup. Peec did not advertise a free tier or self-serve trial as of June 2026; check peec.ai for current options. Running the same prompt set in parallel for a week is the most reliable comparison.',
  },
];

export default function VsPeecAiPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'vs Peec AI', url: '/vs/peec-ai' }]} />

      <SeoHero
        title={
          <>
            Livesov vs <span className="text-[var(--brand)]">Peec AI</span>
          </>
        }
        subtitle="Peec AI is the fastest-growing European player with UI-scraping methodology and add-on platform pricing. Livesov includes all five major LLMs on every plan - starting free - with evidence capture and hallucination detection built in."
        ctaText="Try Livesov free - no card"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '5', label: 'LLMs included (Livesov, every plan)' },
            { value: '2-3', label: 'LLMs in Peec base plan' },
            { value: '$9', label: 'Livesov entry price /mo' },
            { value: '~$100', label: 'Peec entry price /mo' },
          ]}
        />
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="Side-by-side comparison"
          title="What each tool actually does"
          subtitle="Honest comparison from public materials as of June 2026 - including where Peec is genuinely ahead."
        />
        <ComparisonTable
          headers={['Capability', 'Livesov', 'Peec AI']}
          rows={comparisonRows}
          highlightColumn={1}
        />
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 12 }}>
          Competitor details from Peec&rsquo;s public site and pricing page, June 2026. Features
          and prices change - verify on peec.ai before deciding.
        </p>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader label="Where Livesov leads" title="Six reasons teams pick Livesov" />
        <FeatureGrid items={livesovStrengths} columns={3} />
      </Section>

      <Section pad="80px 24px">
        <SectionHeader label="Where Peec leads" title="Six things Peec AI does well" />
        <FeatureGrid items={peecStrengths} columns={3} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <LongForm>
          <h2>The add-on math</h2>
          <p>
            The structural difference between the two products is pricing shape. Peec keeps the
            base price moderate and charges per additional AI platform; Livesov includes every
            platform and scales price by credits and brands instead.
          </p>
          <p>
            If you only care about ChatGPT and Perplexity, both shapes price similarly enough.
            The divergence appears the moment Claude, Gemini, or Grok matter to your audience -
            each one adds to the Peec bill, while on Livesov they were already in the box. For
            agencies, that difference multiplies across every client.
          </p>
          <Callout title="Methodology note" variant="note">
            Peec&rsquo;s UI-scraping approach is a real differentiator worth understanding:
            results reflect the consumer interface, including interface-level personalization.
            Livesov&rsquo;s API approach favors reproducibility and evidence - every response is
            stored and auditable. Teams that need both perspectives sometimes run each tool on a
            subset of prompts before standardizing.
          </Callout>
          <p>
            For a three-way breakdown, read{' '}
            <a href="/blog/peec-ai-vs-promptwatch-vs-livesov">Peec AI vs Promptwatch vs Livesov</a>,
            or see the full roundup of the{' '}
            <a href="/blog/best-ai-brand-monitoring-tools">best AI brand monitoring tools</a>.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Livesov vs Peec AI - FAQ" items={faqs} />

      <PillarLinks
        title="Continue evaluating"
        links={[
          { href: '/peec-ai-alternative', label: 'Peec AI alternative', description: 'Why teams switch from Peec AI to Livesov.' },
          { href: '/vs/otterly', label: 'Livesov vs Otterly', description: 'Two self-serve tools compared surface by surface.' },
          { href: '/vs/profound', label: 'Livesov vs Profound', description: 'Self-serve vs the enterprise platform.' },
          { href: '/pricing', label: 'Pricing & plans', description: 'Start free, scale to agency multi-brand.' },
          { href: '/how-it-works', label: 'How Livesov works', description: 'Methodology and data pipeline explained.' },
          { href: '/geo-audit', label: 'Free GEO audit', description: 'Score any URL for AI citation-readiness.' },
          { href: '/tools', label: 'Free AI search tools', description: '11 free tools - no signup required.' },
        ]}
      />
    </SeoLayout>
  );
}
