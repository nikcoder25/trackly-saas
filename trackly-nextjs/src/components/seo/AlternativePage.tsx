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
import type { Alternative } from '@/data/alternatives';
import { alternatives, comparisonDisclaimer } from '@/data/alternatives';

// Livesov's own capabilities are the same on every alternative page, so they
// live here once rather than being duplicated across nine data entries.
const LIVESOV_STRENGTHS = [
  {
    icon: '⚙',
    title: 'All 5 LLMs on every plan',
    description:
      'ChatGPT, Claude, Gemini, Perplexity, and Grok are included on every plan - no per-platform add-ons, and the 7-day trial covers all five.',
  },
  {
    icon: '$',
    title: 'Honest entry pricing',
    description:
      'Plans from $9/mo with a 7-day trial and no credit card. Built for SMBs, startups, and agencies, not just enterprise budgets.',
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
    icon: '🛠',
    title: 'Free GEO audit + 11 free tools',
    description:
      'A URL-level GEO audit with prioritized recommendations, plus eleven free tools, let you act on findings without buying anything.',
  },
];

export default function AlternativePage({ data }: { data: Alternative }) {
  const relatedLinks: Array<{ href: string; label: string; description: string }> = [];
  if (data.vsHref && data.vsLabel) {
    relatedLinks.push({
      href: data.vsHref,
      label: data.vsLabel,
      description: data.vsDescription || 'The full head-to-head comparison.',
    });
  }
  relatedLinks.push(
    { href: '/pricing', label: 'Pricing & plans', description: 'Start free, scale to agency multi-brand tracking.' },
    { href: '/how-it-works', label: 'How Livesov works', description: 'Methodology and data pipeline explained.' },
    { href: '/geo-audit', label: 'Free GEO audit', description: 'Score any URL for AI citation-readiness in seconds.' },
    { href: '/tools', label: 'Free AI search tools', description: '11 free tools - no signup required.' },
    { href: '/best-ai-search-optimization-tools', label: 'Best AI visibility tools', description: 'How the category compares, ranked.' },
  );

  const siblingAlternatives = alternatives
    .filter((a) => a.slug !== data.slug)
    .map((a) => ({
      href: `/${a.slug}`,
      label: `${a.name} alternative`,
      description: `How Livesov compares to ${a.name} for AI visibility tracking.`,
    }));

  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: `${data.name} Alternative`, url: `/${data.slug}` }]} />

      <SeoHero
        title={
          <>
            The {data.name} Alternative with{' '}
            <span className="text-[var(--brand)]">Every AI Engine Included</span>
          </>
        }
        subtitle={data.heroSubtitle}
        ctaText="Try Livesov free - no card"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar stats={data.stats} />
      </Section>

      <Section pad="72px 24px 0" width={820}>
        <LongForm>
          <p>
            <strong>{data.name}</strong> is {data.category} If you are weighing a{' '}
            {data.name} alternative, the sections below compare it with{' '}
            <strong>Livesov</strong> - an AI visibility tracker that measures how ChatGPT,
            Claude, Gemini, Perplexity, and Grok mention, rank, and cite your brand - and show
            where each tool fits.
          </p>
        </LongForm>
      </Section>

      <Section pad="48px 24px 80px">
        <SectionHeader
          label="Side-by-side comparison"
          title={`Livesov vs ${data.name}`}
          subtitle="An honest comparison of what each tool does. Livesov's capabilities are verifiable today; competitor details reflect public information and should be confirmed on the vendor's site."
        />
        <ComparisonTable
          headers={['Capability', 'Livesov', data.name]}
          rows={data.comparisonRows}
          highlightColumn={1}
        />
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 12, textAlign: 'center' }}>
          {comparisonDisclaimer(data)}
        </p>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader label="Where Livesov leads" title="Six reasons teams pick Livesov" />
        <FeatureGrid items={LIVESOV_STRENGTHS} columns={3} />
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>{data.switchHeading}</h2>
          {data.switchParagraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <Callout title={data.calloutTitle} variant="note">
            {data.calloutBody}
          </Callout>
        </LongForm>
      </Section>

      <FaqSection title={`${data.name} alternative - FAQ`} items={data.faqs} />

      <PillarLinks title="Keep evaluating" links={relatedLinks} />

      <PillarLinks title="Compare other AI visibility tools" links={siblingAlternatives} />
    </SeoLayout>
  );
}
