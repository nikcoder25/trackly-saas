import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  StatsBar,
  FaqSection,
  ComparisonTable,
  Callout,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';
import ToolEmailCapture from '@/components/tools/ToolEmailCapture';
import { getStateOfAiSearchStats } from '@/lib/research-stats';

function quarterLabel(d = new Date()): string {
  return `Q${Math.ceil((d.getUTCMonth() + 1) / 3)} ${d.getUTCFullYear()}`;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmt = (n: number) => n.toLocaleString('en-US');

export async function generateMetadata(): Promise<Metadata> {
  const stats = await getStateOfAiSearchStats();
  const q = quarterLabel();
  const title = stats
    ? `State of AI Search ${q}: Benchmarks from ${fmt(stats.totalResponses)} AI Responses | Livesov`
    : `State of AI Search ${q}: Live AI Visibility Benchmarks | Livesov`;
  const description = stats
    ? `Mention rates, sentiment, citation sources, and accuracy issues measured across ${fmt(stats.totalResponses)} real AI responses from ${stats.platforms.length} platforms over the last ${stats.windowDays} days. Free to republish with attribution.`
    : 'Quarterly benchmarks of brand visibility inside ChatGPT, Claude, Gemini, Perplexity, and Grok, measured from real AI responses on the Livesov platform. Free to republish with attribution.';
  return {
    title,
    description,
    keywords:
      'state of ai search, ai search statistics, ai visibility benchmarks, chatgpt mention rate, llm citation sources, ai search report 2026, geo benchmarks',
    alternates: { canonical: '/research/state-of-ai-search' },
    openGraph: {
      title,
      description,
      url: 'https://livesov.com/research/state-of-ai-search',
      siteName: 'Livesov',
      type: 'article',
      images: [
        {
          url: 'https://livesov.com/og-image.png',
          width: 1200,
          height: 630,
          alt: `State of AI Search ${q} - Livesov Research`,
        },
      ],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['https://livesov.com/og-image.png'] },
  };
}

const faqs = [
  {
    question: 'Where does this data come from?',
    answer:
      'From the Livesov platform itself: every figure is computed from real, logged AI responses collected while tracking customer brands across ChatGPT, Claude, Gemini, Perplexity, and Grok. No survey data, no estimates - these are measured responses.',
  },
  {
    question: 'Is customer data exposed in this report?',
    answer:
      'No. Only aggregates are published. A platform&apos;s numbers appear only when enough distinct brands contribute to the window that no single brand is identifiable, and domains owned by tracked brands are excluded from the citation table entirely.',
  },
  {
    question: 'Can I republish these numbers?',
    answer:
      'Yes - every figure on this page is free to republish with attribution and a link to Livesov State of AI Search (livesov.com/research/state-of-ai-search). If you cite us in a study or article, tell us via the contact page and we&apos;ll link back to your work.',
  },
  {
    question: 'How often is this page updated?',
    answer:
      'The figures are recomputed from the live database on a rolling basis and always describe the trailing 90 days, so the page is effectively a continuously-updated quarterly report.',
  },
  {
    question: 'Why do mention rates differ so much between platforms?',
    answer:
      'Each platform retrieves and synthesizes differently: some ground answers in live web search (Perplexity), others lean on training data (Claude), and some blend both. Different retrieval means different brand sets surface for the same question - which is exactly why single-platform tracking is misleading.',
  },
];

export default async function StateOfAiSearchPage() {
  const stats = await getStateOfAiSearchStats();
  const q = quarterLabel();

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `State of AI Search ${q}`,
    description:
      'Quarterly benchmarks of brand visibility inside AI assistants, measured from real AI responses on the Livesov platform.',
    author: { '@type': 'Organization', name: 'Livesov', url: 'https://livesov.com' },
    publisher: { '@type': 'Organization', name: 'Livesov', url: 'https://livesov.com' },
    dateModified: stats?.generatedAt ?? undefined,
    url: 'https://livesov.com/research/state-of-ai-search',
  };

  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Research', url: '/research/state-of-ai-search' }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />

      <SeoHero
        title={
          <>
            State of AI Search{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              {q}
            </span>
          </>
        }
        subtitle={
          stats
            ? `Brand visibility benchmarks measured from ${fmt(stats.totalResponses)} real AI responses across ${stats.platforms.length} platforms in the ${stats.windowDays} days ending ${stats.windowEnd}. Every number is computed from logged responses - free to republish with attribution.`
            : 'Quarterly benchmarks of brand visibility inside ChatGPT, Claude, Gemini, Perplexity, and Grok - computed directly from real AI responses logged by the Livesov platform.'
        }
        ctaText="Track your own brand free"
      />

      {stats ? (
        <>
          <Section pad="0 24px 56px" width={1000}>
            <StatsBar
              stats={[
                { value: fmt(stats.totalResponses), label: 'AI responses analyzed' },
                { value: fmt(stats.totalBrands), label: 'Brands tracked' },
                { value: fmt(stats.totalPrompts), label: 'Distinct prompts' },
                { value: String(stats.platforms.length), label: 'AI platforms' },
              ]}
            />
            <p style={{ fontSize: 13, color: '#6b7280', maxWidth: 760, margin: '16px auto 0', textAlign: 'center' }}>
              Window: {stats.windowStart} to {stats.windowEnd}. Aggregates only - no brand is
              identifiable, and platforms are shown only when enough distinct brands contribute.
            </p>
          </Section>

          <Section pad="40px 24px 64px" width={1080}>
            <SectionHeader
              label="Platform benchmarks"
              title="Mention, recommendation & sentiment by platform"
              subtitle="Share of tracked-brand prompts where the platform mentioned or recommended the brand, with sentiment over labeled responses."
            />
            <ComparisonTable
              headers={['Platform', 'Responses', 'Mention rate', 'Recommends', 'Positive sentiment', 'Avg. list position']}
              rows={stats.platforms.map((p) => [
                p.platform,
                fmt(p.responses),
                pct(p.mentionRate),
                pct(p.recommendationRate),
                pct(p.sentiment.positive),
                p.avgListPosition == null ? '-' : p.avgListPosition.toFixed(1),
              ])}
            />
          </Section>

          {stats.topCitedDomains.length > 0 && (
            <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
              <SectionHeader
                label="Citation sources"
                title="The domains AI answers cite most"
                subtitle="Share of citation occurrences across all logged responses in the window. Domains owned by tracked brands are excluded."
              />
              <ComparisonTable
                headers={['Rank', 'Domain', 'Share of citations']}
                rows={stats.topCitedDomains.map((d, i) => [String(i + 1), d.domain, pct(d.share)])}
              />
            </Section>
          )}

          {stats.accuracyIssuesPer1k.length > 0 && (
            <Section pad="64px 24px" width={1000}>
              <SectionHeader
                label="Accuracy"
                title="Recorded accuracy issues per 1,000 responses"
                subtitle="Responses that contradicted a brand's verified canonical facts, as flagged by Livesov's accuracy monitor."
              />
              <ComparisonTable
                headers={['Platform', 'Issues per 1,000 responses']}
                rows={stats.accuracyIssuesPer1k.map((a) => [a.platform, a.per1k.toFixed(1)])}
              />
            </Section>
          )}
        </>
      ) : (
        <Section pad="0 24px 56px" width={860}>
          <Callout title={`The ${q} edition is being compiled`} variant="note">
            This report publishes only when the trailing-90-day sample clears our minimum
            thresholds (so the numbers are statistically meaningful and no customer is
            identifiable). Leave your email below and we&apos;ll send the edition the moment it
            goes live.
          </Callout>
        </Section>
      )}

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px" width={860}>
        <SectionHeader label="Stay current" title="Get each edition in your inbox" />
        <ToolEmailCapture source="state-of-ai-search-report" />
      </Section>

      <Section pad="64px 24px">
        <LongForm>
          <h2>Methodology</h2>
          <p>
            Livesov continuously sends category prompts (&quot;best CRM for small business&quot;,
            &quot;top accounting software&quot;, and so on) to ChatGPT, Claude, Gemini,
            Perplexity, and Grok on behalf of the brands it tracks, and stores every full
            response. This report aggregates those logged responses over a trailing
            90-day window:
          </p>
          <ul>
            <li>
              <strong>Mention rate</strong> - share of a brand&apos;s tracked prompts where the
              platform named the brand in its answer.
            </li>
            <li>
              <strong>Recommendation rate</strong> - share where the platform actively
              recommended the brand rather than merely mentioning it.
            </li>
            <li>
              <strong>Sentiment</strong> - per-response classification (positive / neutral /
              negative), reported over labeled responses only.
            </li>
            <li>
              <strong>Citations</strong> - URLs the platform cited; aggregated by domain with
              tracked-brand domains removed.
            </li>
            <li>
              <strong>Accuracy issues</strong> - responses contradicting a brand&apos;s verified
              canonical facts, normalized per 1,000 responses.
            </li>
          </ul>
          <p>
            Cached duplicate responses are excluded so repeated identical answers don&apos;t
            inflate counts. Platforms appear only when both sample-size and brand-diversity
            thresholds pass.
          </p>

          <Callout title="Republish freely - with attribution" variant="note">
            Every figure on this page may be quoted or republished with attribution to
            &quot;Livesov State of AI Search&quot; and a link to
            livesov.com/research/state-of-ai-search. Tell us where you used it via the contact
            page and we&apos;ll link back to your work.
          </Callout>
        </LongForm>
      </Section>

      <FaqSection title="State of AI Search - FAQ" items={faqs} />

      <PillarLinks
        title="Go deeper"
        links={[
          { href: '/ai-search-statistics-2026', label: 'AI search statistics 2026', description: '120+ curated third-party data points on AI search.' },
          { href: '/geo-audit', label: 'Free GEO audit', description: 'Score any URL for AI citation-readiness.' },
          { href: '/tools/chatgpt-mention-checker', label: 'ChatGPT mention checker', description: 'Check any brand&apos;s ChatGPT presence in seconds.' },
          { href: '/learn/llm-seo', label: 'LLM SEO guide', description: 'The operating model behind these benchmarks.' },
          { href: '/pricing', label: 'Track your own brand', description: 'Free tier, all 5 platforms, 7-day trial of paid plans.' },
        ]}
      />
    </SeoLayout>
  );
}
