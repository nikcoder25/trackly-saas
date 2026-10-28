import Link from 'next/link';
import ProductScreenshot from '@/components/seo/ProductScreenshot';
import SeoLayout, { Breadcrumbs } from '@/components/seo/SeoLayout';
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
  JsonLd,
} from '@/components/seo/SeoSections';
import type { Alternative } from '@/data/alternatives';
import { alternatives, comparisonDisclaimer } from '@/data/alternatives';
import { buildShortlist } from '@/data/competitor-roster';
import '@/styles/site-templates.css';

// Livesov's own capabilities are the same on every alternative page, so they
// live here once rather than being duplicated across nine data entries.
const LIVESOV_STRENGTHS = [
  {
    icon: '⚙',
    title: 'All 5 LLMs, no add-ons',
    description:
      'ChatGPT, Claude, Gemini, Perplexity, and Grok are all supported with no per-platform add-ons: 2 engines on Starter, 3 on Pro, all five on Agency, and the 7-day trial covers all five.',
  },
  {
    icon: '$',
    title: 'Honest entry pricing',
    description:
      'Plans from $19/mo with a 7-day trial and no credit card. Built for SMBs, startups, and agencies, not just enterprise budgets.',
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
    title: 'Free GEO audit + 10 free tools',
    description:
      'A URL-level GEO audit with prioritized recommendations, plus ten free tools, let you act on findings without buying anything.',
  },
];

/**
 * How we compare tools. This is deliberately explicit rather than implied:
 * the page title carries a "(Tested)" claim, and an unbacked testing claim is
 * both a trust problem and exactly what review-content ranking systems look
 * for. State what was actually hands-on, what is desk research, and that we
 * rank our own product first on our own site.
 */
const METHODOLOGY = [
  'Livesov is hands-on: every capability we claim for it is running in the product today and is checkable on a free trial without a credit card.',
  'Competing tools are assessed from public product documentation, pricing pages, and vendor marketing, plus hands-on time with the free tiers and trials that are openly available. Where a vendor is demo-gated we say so rather than guessing at what is behind the gate.',
  'We do not publish competitor pricing or feature counts as settled fact. Those change without notice, so each entry links to the vendor so you can verify the current position yourself.',
  'This is our own site and Livesov is ranked first. That is a disclosure, not a neutral verdict - the "best for" line on every other tool is the honest case for choosing it over us.',
];

export default function AlternativePage({ data }: { data: Alternative }) {
  // The title promises seven alternatives, so the page must actually contain
  // seven. buildShortlist rotates the window per subject so the nine
  // alternative pages do not publish an identical list.
  const shortlist = buildShortlist(data.name, 7);

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `7 best ${data.name} alternatives in 2026`,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: shortlist.length,
    itemListElement: shortlist.map((tool, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: tool.name,
      description: tool.blurb,
      url: `https://${tool.domain}`,
    })),
  };

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
    { href: '/tools', label: 'Free AI search tools', description: '10 free tools - most need no signup.' },
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
      <Breadcrumbs items={[{ name: `${data.name} Alternatives`, url: `/${data.slug}` }]} />

      <JsonLd data={itemListSchema} />

      <section className="ls-wrap ls-tpl-hero">
        <span className="ls-eyebrow">{data.name} alternatives</span>
        <h1 className="ls-h1 xl">
          7 Best {data.name} Alternatives in <span className="ls-em acc">2026</span>
        </h1>
        <p className="ls-lead xl">{data.heroSubtitle}</p>
        <div className="ls-cta-row">
          <Link href="/signup" className="ls-btn ls-btn-pri ls-btn-lg">Try Livesov free - no card</Link>
          <Link href="/geo-audit" className="ls-btn ls-btn-out ls-btn-lg">Run a free audit</Link>
        </div>
        <p className="ls-trust">7 day free trial · No credit card · Plans from $19/mo</p>
      </section>

      <div className="ls-wrap ls-tpl-shot">
        <ProductScreenshot
          alt={`${data.name} alternative: Livesov AI visibility dashboard`}
          caption="The Livesov dashboard: brand health, visibility, sentiment and accuracy across five AI engines."
          priority
        />
      </div>

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar stats={data.stats} />
      </Section>

      <Section pad="72px 24px 0" width={820}>
        <LongForm>
          <p>
            <strong>{data.name}</strong> is {data.category} If you are weighing a{' '}
            {data.name} alternative, the shortlist below ranks the seven tools worth
            considering in 2026, followed by a full side-by-side of {data.name} against{' '}
            <strong>Livesov</strong> - an AI visibility tracker that measures how ChatGPT,
            Claude, Gemini, Perplexity, and Grok mention, rank, and cite your brand.
          </p>
        </LongForm>
      </Section>

      {/* The list the title promises. Searchers arriving on a "7 best X
          alternatives" query want the seven up front, not after a wall of
          prose - burying it costs the click back to the SERP. */}
      <Section pad="56px 24px 24px" width={860}>
        <SectionHeader
          label="The shortlist"
          title={`7 best ${data.name} alternatives in 2026`}
          subtitle={`Ranked for teams actively looking to replace ${data.name}. Each entry says who it is genuinely the right call for - including where it beats us.`}
        />

        <ol className="ls-tpl-list">
          {shortlist.map((tool, i) => {
            const isUs = tool.name === 'Livesov';
            return (
              <li key={tool.name} className={'ls-tpl-item' + (isUs ? ' us' : '')}>
                <span aria-hidden="true" className="ls-tpl-n">{String(i + 1).padStart(2, '0')}</span>
                <div style={{ minWidth: 0 }}>
                  <h3>
                    {i + 1}. {tool.name}
                    {isUs && <span className="ls-badge">Our tool</span>}
                  </h3>
                  <p>{tool.blurb}</p>
                  <p style={{ marginBottom: 0 }}>
                    <strong>Best for:</strong> {tool.bestFor}
                  </p>
                  {(tool.alternativeSlug || tool.vsHref) && (
                    <p className="ls-tpl-links">
                      {tool.alternativeSlug && (
                        <Link href={`/${tool.alternativeSlug}`}>{tool.name} alternatives &rarr;</Link>
                      )}
                      {tool.vsHref && (
                        <Link href={tool.vsHref}>Livesov vs {tool.name} &rarr;</Link>
                      )}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Section>

      {/* Backs the "(Tested)" claim in the page title. */}
      <Section pad="24px 24px 16px" width={860}>
        <details className="ls-tpl-method">
          <summary>
            <span>How we compared these tools (and our bias, stated plainly)</span>
            <span className="pm" aria-hidden="true">+</span>
          </summary>
          <ul>
            {METHODOLOGY.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </details>
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
        <p className="ls-tpl-note">{comparisonDisclaimer(data)}</p>
      </Section>

      <Section background="#fff" pad="80px 24px">
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
