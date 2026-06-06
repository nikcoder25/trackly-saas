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
  title: 'Livesov vs Ahrefs Brand Radar | AI Visibility',
  description:
    'Compare Livesov and Ahrefs Brand Radar for AI visibility. Pricing, features, and AI platforms covered. A cheaper Ahrefs Brand Radar alternative.',
  keywords:
    'livesov vs ahrefs, ai visibility vs seo, ai brand tracking tool, ahrefs alternative for ai, ahrefs vs livesov, ai search vs google seo, geo vs seo',
  alternates: { canonical: '/vs/ahrefs' },
  openGraph: {
    title: 'Livesov vs Ahrefs Brand Radar | AI Visibility',
    description:
      'Compare Livesov and Ahrefs Brand Radar for AI visibility. Pricing, features, and AI platforms covered. A cheaper Ahrefs Brand Radar alternative.',
    url: 'https://livesov.com/vs/ahrefs',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Livesov vs Ahrefs — AI Visibility vs Backlink SEO Compared',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov vs Ahrefs Brand Radar | AI Visibility',
    description:
      'Compare Livesov and Ahrefs Brand Radar for AI visibility. Pricing, features, and AI platforms covered. A cheaper Ahrefs Brand Radar alternative.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const livesovStrengths = [
  {
    icon: '◎',
    title: 'AI brand mention tracking',
    description:
      'Track how often ChatGPT, Claude, Gemini, Perplexity, and Grok name your brand across hundreds of category prompts.',
  },
  {
    icon: '#',
    title: 'AI recommendation rank',
    description:
      'Position 1, 2, 3 tracking inside AI-generated lists — the AI-era equivalent of SERP rank.',
  },
  {
    icon: '✺',
    title: 'AI sentiment analysis',
    description:
      'Per-platform sentiment scoring tuned to each AI model&rsquo;s writing style.',
  },
  {
    icon: '⚠',
    title: 'Hallucination detection',
    description:
      'Canonical facts store flags every AI response that contradicts your verified brand facts.',
  },
  {
    icon: '⟁',
    title: 'AI citation source tracking',
    description:
      'For Perplexity, ChatGPT Search, and Gemini grounded answers, every cited URL is logged in rank order.',
  },
  {
    icon: '⚔',
    title: 'AI competitor co-occurrence',
    description:
      'See which competitor brands AI lists alongside or instead of you, per platform.',
  },
];

const ahrefsStrengths = [
  {
    icon: '🔗',
    title: 'Backlink index',
    description:
      'Industry-leading backlink database for analyzing your link profile and your competitors&rsquo;.',
  },
  {
    icon: '🔍',
    title: 'Keyword research',
    description:
      'Mature keyword database with search volume, difficulty, and SERP feature data.',
  },
  {
    icon: '📈',
    title: 'Organic traffic estimates',
    description:
      'Estimated organic traffic per page, per domain, useful for competitor benchmarking.',
  },
  {
    icon: '🛠',
    title: 'Site audit',
    description:
      'Technical SEO crawler that surfaces broken links, redirect chains, indexing issues, and on-page problems.',
  },
  {
    icon: '📊',
    title: 'Google rank tracking',
    description:
      'Daily rank tracking across thousands of keywords in Google for traditional SERP positions.',
  },
  {
    icon: '🧭',
    title: 'Content Explorer',
    description:
      'Search-engine-of-content for finding high-performing content and link prospects in your category.',
  },
];

const comparisonRows = [
  ['Tracks AI brand mentions (ChatGPT/Claude/Gemini/Perplexity/Grok)', '✓ All 5 platforms', '✗'],
  ['AI recommendation rank in generated answers', '✓ Per-prompt, per-model', '✗'],
  ['AI sentiment analysis tuned per platform', '✓', '✗'],
  ['AI hallucination / fact-drift detection', '✓ Canonical facts store', '✗'],
  ['Perplexity / ChatGPT Search citation capture', '✓ Full ranked list', '✗'],
  ['Competitor brand co-occurrence in AI answers', '✓ Up to 20 competitors', '✗'],
  ['Google SERP rank tracking', 'Limited (via AI Overviews)', '✓ Industry-leading'],
  ['Backlink database', '✗', '✓ Industry-leading'],
  ['Keyword research database', '✗', '✓ Industry-leading'],
  ['Technical site audit / crawler', 'Free GEO Audit only', '✓ Full-site crawler'],
  ['Content Explorer / link-prospecting', '✗', '✓'],
  ['Bring-your-own AI API keys', '✓ Agency plan', 'N/A'],
];

const faqs = [
  {
    question: 'Should I replace Ahrefs with Livesov?',
    answer:
      'No. They solve different problems. Ahrefs is the best in the world at backlinks, keyword research, and traditional Google rank tracking. Livesov is purpose-built for AI visibility across ChatGPT, Claude, Gemini, Perplexity, and Grok. The two are complementary; most customers run both.',
  },
  {
    question: 'Is Livesov a cheaper alternative to Ahrefs?',
    answer:
      'Not really a fair comparison — they don&apos;t do the same things. Livesov plans start free and scale by AI credits and tracked brands. Ahrefs prices by SEO seats and backlink data depth. Many teams find Livesov pays for itself by giving them a new measurable channel (AI visibility) that Ahrefs simply cannot see.',
  },
  {
    question: 'Does Ahrefs track AI mentions at all?',
    answer:
      'Ahrefs offers some visibility into Google AI Overviews via its standard SERP tracking, but it does not call the ChatGPT, Claude, Perplexity, or Grok APIs to monitor brand mentions in AI-generated answers. That gap is exactly what Livesov fills.',
  },
  {
    question: 'How do GEO and SEO fit together?',
    answer:
      'GEO and SEO are largely complementary. The authoritative, well-structured, well-cited content SEO already rewards is also what AI platforms quote in their answers. SEO earns the search visibility AI grounds on; GEO measures whether AI actually quotes you. Run both. See our /geo-optimization guide for the framework.',
  },
  {
    question: 'Can I use Livesov data in my Ahrefs workflows?',
    answer:
      'Yes. Livesov exports every metric as CSV or JSON, so you can pull AI mention rate, citation share, and sentiment alongside your Ahrefs keyword and backlink data in BI tools, dashboards, or notebooks. On Agency plans you also get programmatic API access.',
  },
  {
    question: 'Is there a free trial of Livesov?',
    answer:
      'Yes — every paid Livesov plan starts with a 7-day free trial, no credit card required. The Free tier is permanent and supports tracking a single brand across all 5 AI platforms on a manual cadence.',
  },
];

export default function VsAhrefsPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'vs Ahrefs', url: '/vs/ahrefs' }]} />

      <SeoHero
        title={
          <>
            Livesov vs <span className="text-[var(--brand)]">Ahrefs</span>
          </>
        }
        subtitle="One is the leader in AI visibility tracking. The other is the leader in backlink SEO. They&rsquo;re not competitors — they&rsquo;re complements. Here&rsquo;s the full comparison and how to think about running both."
        ctaText="Try Livesov free — no card"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '5', label: 'AI platforms (Livesov)' },
            { value: '0', label: 'AI platforms (Ahrefs)' },
            { value: '40T+', label: 'Backlinks indexed (Ahrefs)' },
            { value: '7-day', label: 'Free Livesov trial' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="Different problems, different tools"
          title="The clearest way to think about it"
          subtitle="Ahrefs is the gold standard for backlinks and traditional Google SEO. Livesov is purpose-built for AI visibility. The two solve adjacent but distinct problems."
        />
        <LongForm>
          <p>
            Ahrefs answers questions like: <em>which sites link to me, how do I rank in Google
            for &quot;best CRM,&quot; which competitor pages earn the most traffic, what&apos;s
            broken in my technical SEO?</em>
          </p>
          <p>
            Livesov answers questions like: <em>does ChatGPT recommend my product, what
            sentiment does Claude have about my brand, which competitor does Perplexity cite
            in my category, is Gemini hallucinating my pricing?</em>
          </p>
          <p>
            Both questions matter. Neither tool can answer the other&apos;s questions well. The
            mature setup is: Ahrefs for traditional SEO, Livesov for AI visibility, and a
            shared dashboard or BI layer that surfaces both signals next to each other.
          </p>
        </LongForm>
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="Side-by-side feature comparison"
          title="What each tool actually does"
          subtitle="Honest comparison — including the places Ahrefs is much stronger than Livesov."
        />
        <ComparisonTable
          headers={['Capability', 'Livesov', 'Ahrefs']}
          rows={comparisonRows}
          highlightColumn={1}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="Where Livesov leads"
          title="The six things Livesov does that Ahrefs can&rsquo;t"
        />
        <FeatureGrid items={livesovStrengths} columns={3} />
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="Where Ahrefs leads"
          title="The six things Ahrefs does that Livesov doesn&rsquo;t try to"
        />
        <FeatureGrid items={ahrefsStrengths} columns={3} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <LongForm>
          <h2>The combined workflow that&rsquo;s now standard</h2>
          <p>
            For most modern marketing teams, the &quot;serious about AI search&quot; workflow
            looks roughly like this:
          </p>
          <ol>
            <li>
              <strong>Ahrefs identifies high-value queries.</strong> Keyword research surfaces
              the commercial-intent queries your category cares about (search volume, intent,
              difficulty).
            </li>
            <li>
              <strong>Livesov measures AI visibility on those same queries.</strong> Tracked
              prompts mirror the queries Ahrefs surfaced; Livesov shows whether AI actually
              mentions, cites, and recommends you for them.
            </li>
            <li>
              <strong>Ahrefs explains why competitors win.</strong> Backlink and content
              analysis on the URLs Livesov sees AI citing tells you what authority signals
              you need to match.
            </li>
            <li>
              <strong>Ship the SEO and GEO improvements together.</strong> Better content,
              schema, citations — measured in Ahrefs (SERP position) and Livesov (AI citation
              + mention rate) in parallel.
            </li>
            <li>
              <strong>Re-measure weekly.</strong> Ahrefs tracks SERP drift; Livesov tracks AI
              drift. Both feed the same content roadmap.
            </li>
          </ol>

          <Callout title="The single biggest mistake" variant="note">
            Assuming Ahrefs&apos; existing AI Overviews coverage is enough. AI Overviews are
            one surface (Gemini-grounded), and Ahrefs sees them as a SERP feature, not as
            generative answers. ChatGPT, Claude, Perplexity, and Grok are completely off
            Ahrefs&apos; map — and they&apos;re where most B2B research and consumer discovery
            now happens.
          </Callout>

          <h2>When to pick Livesov first (and Ahrefs later)</h2>
          <p>
            Early-stage SaaS, AI-native startups, and brands whose buyers heavily use AI for
            research often have very limited traditional SEO surface area (few backlinks,
            limited keyword traffic) but real, immediate AI visibility gaps. For these teams,
            Livesov is the higher-leverage first investment. Ahrefs adds value once you have
            enough surface area to optimise traditional rankings.
          </p>

          <h2>When to add Livesov on top of an existing Ahrefs setup</h2>
          <p>
            Most established SEO teams already have Ahrefs and an SEO program. Adding
            Livesov gives them a measurable new channel without disrupting anything: the
            content investment is largely the same, the measurement is additive, and the
            board-level conversation (&quot;here&apos;s what AI says about us, here&apos;s how
            we improved it&quot;) is new and differentiating.
          </p>

          <h2>The deeper read</h2>
          <p>
            For the full GEO framework, read our{' '}
            <a href="/geo-optimization">Generative Engine Optimization guide</a>. For platform-
            specific tactics, see <a href="/chatgpt-brand-tracking">ChatGPT</a>,{' '}
            <a href="/perplexity-brand-tracking">Perplexity</a>,{' '}
            <a href="/claude-brand-tracking">Claude</a>,{' '}
            <a href="/gemini-brand-tracking">Gemini</a>, and{' '}
            <a href="/grok-brand-tracking">Grok</a> brand tracking pages.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Livesov vs Ahrefs — FAQ" items={faqs} />

      <PillarLinks
        title="Continue evaluating"
        links={[
          {
            href: '/vs/semrush',
            label: 'Livesov vs Semrush',
            description: 'How Livesov compares to the other big SEO suite.',
          },
          {
            href: '/pricing',
            label: 'Pricing & plans',
            description: 'Start free, scale to agency multi-brand.',
          },
          {
            href: '/how-it-works',
            label: 'How Livesov works',
            description: 'Methodology and data pipeline explained.',
          },
          {
            href: '/integrations',
            label: 'Integrations',
            description: 'AI APIs, webhooks, exports, and BYOK.',
          },
          {
            href: '/geo-optimization',
            label: 'GEO optimization guide',
            description: 'The full framework for ranking in AI answers.',
          },
          {
            href: '/geo-audit',
            label: 'Free GEO audit',
            description: 'Score any URL for AI citation-readiness.',
          },
        ]}
      />
    </SeoLayout>
  );
}
