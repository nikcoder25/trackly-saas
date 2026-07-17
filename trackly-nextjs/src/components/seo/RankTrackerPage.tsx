import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  FeatureGrid,
  StatsBar,
  ProcessSteps,
  FaqSection,
  ComparisonTable,
  Callout,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';
import type { RankTracker } from '@/data/rank-trackers';

// Hero accent gradients. These must be written as STATIC literal class strings
// so Tailwind's content scanner generates the arbitrary-value utilities - a
// runtime-interpolated `from-[${var}]` would never be emitted. Keyed by slug.
const HERO_GRADIENTS: Record<string, string> = {
  'perplexity-rank-tracker':
    'text-transparent bg-clip-text bg-gradient-to-r from-[#20b8cd] to-[#1a94a5]',
  'chatgpt-rank-tracker':
    'text-transparent bg-clip-text bg-gradient-to-r from-[#19c37d] to-[#10a37f]',
};
const FALLBACK_GRADIENT = 'text-[var(--brand)]';

// Rank-tracker scaffolding is the same for every engine, so the generic
// features/steps/comparison live here and interpolate the engine name. Only
// engine-specific nuance (subtitle, why-copy, faqs, models) lives in the data.
function buildFeatures(engine: string) {
  return [
    {
      icon: '◈',
      title: 'Prompt & keyword rank',
      description: `Track your exact position each time ${engine} lists or recommends options for your target prompts and keywords.`,
    },
    {
      icon: '📈',
      title: 'Rank trend lines',
      description: `See daily, 2-day, or weekly movement in your ${engine} rank over time - not a single misleading snapshot.`,
    },
    {
      icon: '⚔',
      title: 'Competitor rank benchmarking',
      description: `Compare your ${engine} position against up to 20 competitors on the same prompts, and watch the gap change.`,
    },
    {
      icon: '⟁',
      title: 'Citation & source tracking',
      description: `Capture the URLs ${engine} cites so you know which pages drive each ranking - yours and competitors'.`,
    },
    {
      icon: '✺',
      title: 'Share of voice',
      description: `Your share of all brand mentions across your tracked ${engine} prompts, scored over time.`,
    },
    {
      icon: '🔔',
      title: 'Rank-change alerts',
      description: `Get emailed when your ${engine} rank moves up or down, with the evidence attached.`,
    },
  ];
}

function buildSteps(engine: string) {
  return [
    {
      title: 'Add brand, competitors & prompts',
      description: `Add your brand, domain, competitor set, and the target prompts and keywords you want to rank for in ${engine}.`,
    },
    {
      title: `Automated ${engine} runs`,
      description: `Livesov queries ${engine} on your schedule and runs each prompt multiple times, because AI answers are non-deterministic.`,
    },
    {
      title: 'Record rank, citations, competitors',
      description: `Every run records your position, the cited sources, sentiment, and where competitors placed on the same prompt.`,
    },
    {
      title: 'Track trends, export, get alerts',
      description: `Watch your ${engine} rank trend over time, export evidence to CSV or PDF, and get alerts when your position moves.`,
    },
  ];
}

function buildComparisonRows(engine: string): [string, string, string][] {
  return [
    [`Automated ${engine} rank tracking`, '✓ Scheduled', '✗ Manual re-checks'],
    ['Rank trend history over time', '✓', '✗ Snapshot only'],
    ['Multi-run aggregation (non-deterministic answers)', '✓ 3-10x per run', '✗ Single shot'],
    ['Competitor rank benchmarking', '✓ Up to 20', 'Manual'],
    ['Citation / source capture', '✓ Full ranked list', 'Partial'],
    ['Rank-change alerts', '✓ Email', '✗'],
    ['Evidence export (full response)', '✓ CSV + PDF', 'Copy-paste'],
    ['Free to start', '✓ 7-day, no card', 'n/a'],
  ];
}

export default function RankTrackerPage({ data }: { data: RankTracker }) {
  const features = buildFeatures(data.engine);
  const steps = buildSteps(data.engine);
  const comparisonRows = buildComparisonRows(data.engine);
  const modelList = data.models.join(', ');

  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: `${data.engine} Rank Tracker`, url: `/${data.slug}` }]} />

      <SeoHero
        title={
          <>
            The {data.engine}{' '}
            <span className={HERO_GRADIENTS[data.slug] || FALLBACK_GRADIENT}>
              Rank Tracker
            </span>
          </>
        }
        subtitle={data.heroSubtitle}
        ctaText={`Start tracking ${data.engine} rank - free`}
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar stats={data.stats} />
      </Section>

      <Section pad="72px 24px 0" width={820}>
        <LongForm>
          <p>
            <strong>Livesov</strong> is a {data.engineFull} rank tracker built for AI answers, not
            Google SERPs. It tracks where you rank across {modelList} for the prompts and keywords
            that matter, records the sources {data.engine} cites, and charts how your position
            trends over time - so &quot;{data.engine} rank tracking&quot; becomes a measured number
            instead of a guess.
          </p>
        </LongForm>
      </Section>

      <Section pad="48px 24px 80px">
        <SectionHeader
          label="What we track"
          title={`Six dimensions of ${data.engine} rank`}
          subtitle={data.engineFeatureNote}
        />
        <FeatureGrid items={features} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader label="How it works" title={`Live ${data.engine} rank tracking in under 5 minutes`} />
        <ProcessSteps steps={steps} />
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>{data.whyHeading}</h2>
          {data.whyParagraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <Callout title="Rank is a trend, not a snapshot" variant="tip">
            Because AI answers change between runs and across models, one check tells you almost
            nothing. The reliable signal is a rank <em>trend</em> built from many runs over time -
            which is exactly what Livesov automates on every plan.
          </Callout>
        </LongForm>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px" width={1000}>
        <SectionHeader
          label={`Why Livesov for ${data.engine} rank`}
          title={`Livesov vs. manual ${data.engine} rank checks`}
          subtitle="A spreadsheet of copy-pasted answers is not a rank tracker. Tracking AI rank needs scheduled, multi-run measurement with a competitor benchmark."
        />
        <ComparisonTable
          headers={['Capability', 'Livesov', `Manual ${data.engine} checks`]}
          rows={comparisonRows}
          highlightColumn={1}
        />
      </Section>

      <FaqSection title={`${data.engine} rank tracker - FAQ`} items={data.faqs} />

      <PillarLinks
        title="Track rank across every AI engine"
        links={[
          { href: data.brandTrackingHref, label: data.brandTrackingLabel, description: data.brandTrackingDescription },
          { href: data.otherHref, label: data.otherLabel, description: data.otherDescription },
          { href: '/geo-audit', label: 'Free GEO audit', description: 'Score any URL for AI citation-readiness in seconds.' },
          { href: '/tools', label: 'Free AI search tools', description: '11 free tools - no signup required.' },
          { href: '/pricing', label: 'Pricing & plans', description: 'Start free, scale to agency multi-brand tracking.' },
          { href: '/how-it-works', label: 'How Livesov works', description: 'Methodology and data pipeline explained.' },
        ]}
      />
    </SeoLayout>
  );
}
