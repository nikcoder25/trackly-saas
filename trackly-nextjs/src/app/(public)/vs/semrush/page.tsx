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
  title: 'Livesov vs Semrush — AI Visibility vs Traditional SEO Compared',
  description:
    'A complete comparison of Livesov vs Semrush. Livesov tracks AI visibility across ChatGPT, Claude, Gemini, Perplexity, and Grok. Semrush is the all-in-one Google SEO suite. Here&apos;s how they differ and how to run both.',
  keywords:
    'livesov vs semrush, ai seo tool, chatgpt tracking vs semrush, ai visibility tool comparison, semrush alternative for ai, ai search vs google seo, geo vs seo, semrush vs livesov',
  alternates: { canonical: '/vs/semrush' },
  openGraph: {
    title: 'Livesov vs Semrush — AI Visibility vs Traditional SEO Compared',
    description:
      'Livesov tracks AI visibility. Semrush leads in Google SEO. Detailed feature comparison and combined workflow.',
    url: 'https://livesov.com/vs/semrush',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Livesov vs Semrush — AI Visibility vs Traditional SEO Compared',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov vs Semrush — AI Visibility vs Traditional SEO Compared',
    description:
      'AI visibility vs traditional SEO. Detailed comparison of Livesov vs Semrush and why teams run both.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const livesovStrengths = [
  {
    icon: '◎',
    title: 'AI brand mention tracking',
    description:
      'How often ChatGPT, Claude, Gemini, Perplexity, and Grok name your brand across hundreds of category prompts.',
  },
  {
    icon: '#',
    title: 'AI recommendation rank',
    description:
      'Position 1, 2, 3 tracking inside the AI-generated lists that buyers actually read.',
  },
  {
    icon: '⟁',
    title: 'AI citation capture',
    description:
      'For Perplexity, ChatGPT Search, and Gemini grounded, every cited URL is logged in rank order.',
  },
  {
    icon: '⚠',
    title: 'AI hallucination detection',
    description:
      'Canonical facts store flags every AI response that contradicts your verified brand facts.',
  },
  {
    icon: '✺',
    title: 'AI sentiment scoring',
    description:
      'Per-platform sentiment models tuned to each AI&rsquo;s writing style — not a generic +/− classifier.',
  },
  {
    icon: '⚙',
    title: 'Multi-AI-platform coverage',
    description:
      'One workspace for all 5 majors: ChatGPT, Claude, Gemini, Perplexity, Grok. No bolt-on, no second login.',
  },
];

const semrushStrengths = [
  {
    icon: '📈',
    title: 'Google SERP rank tracking',
    description:
      'Mature daily rank tracking across thousands of keywords in Google for traditional SERP positions.',
  },
  {
    icon: '🔍',
    title: 'Keyword research',
    description:
      'Large keyword database with search volume, difficulty, SERP features, and intent classification.',
  },
  {
    icon: '🔗',
    title: 'Backlink analysis',
    description:
      'Backlink index and link-building toolkit for traditional off-page SEO work.',
  },
  {
    icon: '📊',
    title: 'Paid advertising research',
    description:
      'Google Ads competitive intelligence — ad copy, keywords, spend estimates, display network data.',
  },
  {
    icon: '🛠',
    title: 'Site audit',
    description:
      'Full-site crawler that surfaces technical SEO issues, indexing problems, and on-page errors.',
  },
  {
    icon: '🧰',
    title: 'All-in-one breadth',
    description:
      'Semrush is the broadest traditional digital marketing suite — SEO, paid, social, content, all under one roof.',
  },
];

const comparisonRows = [
  ['Tracks AI brand mentions (ChatGPT/Claude/Gemini/Perplexity/Grok)', '✓ All 5 platforms', '✗'],
  ['AI recommendation rank in generated answers', '✓ Per-prompt, per-model', '✗'],
  ['AI sentiment analysis tuned per platform', '✓', '✗'],
  ['AI hallucination / fact-drift detection', '✓ Canonical facts store', '✗'],
  ['Perplexity / ChatGPT Search citation capture', '✓ Full ranked list', '✗'],
  ['Competitor brand co-occurrence in AI answers', '✓ Up to 20 competitors', '✗'],
  ['Google SERP rank tracking', 'Limited', '✓ Industry-leading'],
  ['Keyword research database', '✗', '✓ Industry-leading'],
  ['Backlink database', '✗', '✓'],
  ['Paid advertising research', '✗', '✓'],
  ['Technical site audit / crawler', 'Free GEO Audit only', '✓ Full-site crawler'],
  ['Bring-your-own AI API keys', '✓ Agency plan', 'N/A'],
];

const faqs = [
  {
    question: 'Should I replace Semrush with Livesov?',
    answer:
      'No — they don&apos;t solve the same problems. Semrush is the all-in-one traditional digital marketing suite: SEO, paid, social, content. Livesov is purpose-built for AI visibility across ChatGPT, Claude, Gemini, Perplexity, and Grok. The two are complementary; most customers run both.',
  },
  {
    question: 'Is Livesov a cheaper alternative to Semrush?',
    answer:
      'They&apos;re priced differently because they do different things. Livesov plans start free and scale by AI credits and tracked brands. Semrush prices by SEO seats and module breadth. Many teams find Livesov pays for itself by giving them a new measurable channel — AI visibility — that Semrush simply doesn&apos;t cover.',
  },
  {
    question: 'Does Semrush track AI mentions?',
    answer:
      'Semrush has some surface visibility into Google AI Overviews via its SERP tracking, but it does not call the ChatGPT, Claude, Perplexity, or Grok APIs to monitor brand mentions in AI-generated answers. That gap is exactly what Livesov fills.',
  },
  {
    question: 'How do GEO and traditional SEO fit together?',
    answer:
      'They&apos;re largely complementary. The authoritative, well-structured, well-cited content traditional SEO already rewards is also what AI platforms quote in their answers. Semrush helps you build that content; Livesov measures whether AI actually uses it. See our /geo-optimization guide for the full framework.',
  },
  {
    question: 'Can I export Livesov data into my Semrush workflows?',
    answer:
      'Yes. Livesov exports every metric as CSV or JSON, so AI mention rate, citation share, and sentiment data can sit alongside Semrush keyword and rank data in BI dashboards, Looker, or notebooks. Agency plans include programmatic API access.',
  },
  {
    question: 'Does Livesov offer a free trial?',
    answer:
      'Yes — every paid Livesov plan starts with a 7-day free trial, no credit card required. The Free tier is permanent and supports tracking a single brand across all 5 AI platforms on a manual cadence.',
  },
];

export default function VsSemrushPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'vs Semrush', url: '/vs/semrush' }]} />

      <SeoHero
        title={
          <>
            Livesov vs <span className="text-[var(--brand)]">Semrush</span>
          </>
        }
        subtitle="One is the leader in AI visibility tracking. The other is the leading all-in-one traditional digital marketing suite. They&rsquo;re complements, not competitors — and most modern marketing teams now run both."
        ctaText="Try Livesov free — no card"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '5', label: 'AI platforms (Livesov)' },
            { value: '0', label: 'AI platforms (Semrush)' },
            { value: '50+', label: 'Tools / modules (Semrush)' },
            { value: '7-day', label: 'Free Livesov trial' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="Different problems, different tools"
          title="The clearest way to think about it"
          subtitle="Semrush is the all-in-one traditional digital marketing suite. Livesov is purpose-built for AI visibility. The two solve adjacent but distinct problems."
        />
        <LongForm>
          <p>
            Semrush answers questions like: <em>where do I rank in Google for &quot;best
            project management tool,&quot; which competitor ad copy is performing, how is my
            technical SEO, what content gaps should I fill, how is my paid spend tracking?</em>
          </p>
          <p>
            Livesov answers questions like: <em>does ChatGPT recommend my product, what does
            Claude say about my brand, which competitor does Perplexity cite in my category,
            is Gemini AI Overviews surfacing me, is Grok influenced by my X presence?</em>
          </p>
          <p>
            Both questions matter. Neither tool can answer the other&apos;s questions well.
            The mature setup is: Semrush for traditional digital marketing, Livesov for AI
            visibility, and a shared BI layer that surfaces both signals next to each other.
          </p>
        </LongForm>
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="Side-by-side comparison"
          title="What each tool actually does"
          subtitle="Honest comparison — including the many areas where Semrush is much broader than Livesov."
        />
        <ComparisonTable
          headers={['Capability', 'Livesov', 'Semrush']}
          rows={comparisonRows}
          highlightColumn={1}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="Where Livesov leads"
          title="The six things Livesov does that Semrush can&rsquo;t"
        />
        <FeatureGrid items={livesovStrengths} columns={3} />
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="Where Semrush leads"
          title="The six areas Semrush dominates and Livesov doesn&rsquo;t try to"
        />
        <FeatureGrid items={semrushStrengths} columns={3} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <LongForm>
          <h2>The combined workflow modern teams use</h2>
          <p>
            For most marketing teams the &quot;serious about AI search&quot; workflow now looks
            like this:
          </p>
          <ol>
            <li>
              <strong>Semrush identifies the commercial-intent queries.</strong> Keyword
              research, SERP feature data, and intent classification surface the queries that
              actually drive your category.
            </li>
            <li>
              <strong>Livesov measures AI visibility on those same queries.</strong> Tracked
              prompts mirror Semrush&apos;s top queries; Livesov shows whether AI mentions,
              cites, and recommends you for them.
            </li>
            <li>
              <strong>Semrush&apos;s content and competitive intelligence inform what to ship.</strong>
              {' '}Content gaps, backlink opportunities, and on-page improvements come from the
              Semrush side.
            </li>
            <li>
              <strong>Ship the SEO and GEO improvements together.</strong> Same content investment;
              measured in both Semrush (SERP position) and Livesov (AI mention + citation share).
            </li>
            <li>
              <strong>Re-measure weekly.</strong> Both tools track movement on the metrics they own.
            </li>
          </ol>

          <Callout title="The single biggest blind spot" variant="note">
            Assuming Semrush&apos;s AI Overviews coverage is enough. AI Overviews are one
            surface — and Semrush treats them as a SERP feature, not as a generative answer.
            ChatGPT, Claude, Perplexity, and Grok are completely off Semrush&apos;s map, and
            they&apos;re where most B2B research and an increasing share of consumer discovery
            now happens.
          </Callout>

          <h2>When to pick Livesov first (and Semrush later)</h2>
          <p>
            Early-stage SaaS, AI-native startups, and brands selling to AI-heavy audiences
            often have limited traditional SEO surface area but real, immediate AI visibility
            gaps. For these teams, Livesov is the higher-leverage first investment. Semrush
            adds the most value once you have enough surface area to optimise traditional
            rankings, paid, and content programs.
          </p>

          <h2>When to add Livesov on top of an existing Semrush setup</h2>
          <p>
            Most established marketing teams already have Semrush. Adding Livesov is purely
            additive — it gives them a measurable new channel (AI visibility) without
            disrupting any of the existing workflows. The same content investment now has two
            measurable surfaces: traditional SERP (Semrush) and AI answers (Livesov).
          </p>

          <h2>Read more</h2>
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

      <FaqSection title="Livesov vs Semrush — FAQ" items={faqs} />

      <PillarLinks
        title="Continue evaluating"
        links={[
          {
            href: '/vs/ahrefs',
            label: 'Livesov vs Ahrefs',
            description: 'How Livesov compares to Ahrefs specifically.',
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
