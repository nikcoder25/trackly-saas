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
import type { VsComparison } from '@/data/vs-comparisons';
import { vsComparisons, vsDisclaimer } from '@/data/vs-comparisons';

// Livesov's own strengths are identical on every /vs/ page, so they live here
// once rather than being duplicated across each data entry - the same pattern
// AlternativePage uses. Mirrors the six-strength grid the original bespoke vs
// pages render.
const LIVESOV_STRENGTHS = [
  {
    icon: '⚙',
    title: 'All 5 LLMs on every plan',
    description:
      'ChatGPT, Claude, Gemini, Perplexity, and Grok are included on every plan - no per-platform add-ons, and the 7-day trial covers all five.',
  },
  {
    icon: '⚠',
    title: 'Hallucination detection',
    description:
      'A canonical facts store flags AI answers that contradict your verified brand facts - with the exact quote attached as evidence.',
  },
  {
    icon: '⟁',
    title: 'Citation capture',
    description:
      'Full ranked source lists on Perplexity and ChatGPT Search show exactly which pages - yours and competitors\' - feed the answer.',
  },
  {
    icon: '◎',
    title: 'Evidence-first reporting',
    description:
      'Every run stores the full AI response, so each metric traces back to the actual answer a buyer would have seen. Export to CSV or PDF.',
  },
  {
    icon: '$',
    title: 'Honest entry pricing',
    description:
      'Plans from $9/mo with a 7-day trial and no credit card. Built for SMBs, startups, and agencies, not just enterprise budgets.',
  },
  {
    icon: '🛠',
    title: 'Free GEO audit + 11 free tools',
    description:
      'A URL-level GEO audit with prioritized recommendations, plus eleven free tools, let you act on findings without buying anything.',
  },
];

export default function VsPage({ data }: { data: VsComparison }) {
  // Cross-link the other /vs/ pages in this data-driven cohort, plus the
  // matching alternative page and the core evaluation links.
  const siblingVs = vsComparisons
    .filter((v) => v.slug !== data.slug)
    .slice(0, 3)
    .map((v) => ({
      href: `/vs/${v.slug}`,
      label: `Livesov vs ${v.name}`,
      description: `How Livesov compares to ${v.name} for AI visibility.`,
    }));

  const relatedLinks = [
    {
      href: data.alternativeHref,
      label: `${data.name} alternative`,
      description: `Why teams switch from ${data.name} to Livesov.`,
    },
    ...siblingVs,
    { href: '/pricing', label: 'Pricing & plans', description: 'Start free, scale to agency multi-brand tracking.' },
    { href: '/how-it-works', label: 'How Livesov works', description: 'Methodology and data pipeline explained.' },
    { href: '/geo-audit', label: 'Free GEO audit', description: 'Score any URL for AI citation-readiness in seconds.' },
  ];

  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: `vs ${data.name}`, url: `/vs/${data.slug}` }]} />

      <SeoHero
        title={
          <>
            Livesov vs <span className="text-[var(--brand)]">{data.name}</span>
          </>
        }
        subtitle={data.heroSubtitle}
        ctaText="Try Livesov free - no card"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar stats={data.stats} />
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="Side-by-side comparison"
          title="What each tool actually does"
          subtitle={`An honest comparison based on public information as of 2026 - including where ${data.name} may be the better pick. Livesov's capabilities are verifiable today; competitor details should be confirmed on the vendor's site.`}
        />
        <ComparisonTable
          headers={['Capability', 'Livesov', data.name]}
          rows={data.comparisonRows}
          highlightColumn={1}
        />
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 12 }}>{vsDisclaimer(data)}</p>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader label="Where Livesov leads" title="Six reasons teams pick Livesov" />
        <FeatureGrid items={LIVESOV_STRENGTHS} columns={3} />
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label={`Where ${data.name} may fit better`}
          title={`When to choose ${data.name}`}
          subtitle="The honest case for the other tool. A comparison that only flatters us is not a comparison."
        />
        <FeatureGrid items={data.competitorFit} columns={data.competitorFit.length >= 3 ? 3 : 2} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <LongForm>
          <h2>How to choose between Livesov and {data.name}</h2>
          <p>{data.chooseIntro}</p>
          <ul>
            {data.chooseBullets.map(([lead, rest]) => (
              <li key={lead}>
                <strong>{lead}</strong> {rest}
              </li>
            ))}
          </ul>
          <Callout title="Run both for a week" variant="note">
            {data.calloutBody}
          </Callout>
        </LongForm>
      </Section>

      <FaqSection title={`Livesov vs ${data.name} - FAQ`} items={data.faqs} />

      <PillarLinks title="Continue evaluating" links={relatedLinks} />
    </SeoLayout>
  );
}
