import type { Metadata } from 'next';
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

export const metadata: Metadata = {
  title: 'Gemini Brand Tracking & AI Overviews Monitor',
  description:
    'Track how Google Gemini and AI Overviews mention your brand. Monitor share of voice and see how to rank in AI Overviews. 7-day free trial.',
  keywords:
    'gemini brand tracking, google ai monitoring, gemini visibility, google ai brand mentions, ai overviews tracking, gemini pro tracking, gemini flash tracking, google sge tracking',
  alternates: { canonical: '/gemini-brand-tracking' },
  openGraph: {
    title: 'Gemini Brand Tracking & AI Overviews Monitor',
    description:
      'Track how Google Gemini and AI Overviews mention your brand. Monitor share of voice and see how to rank in AI Overviews. 7-day free trial.',
    url: 'https://livesov.com/gemini-brand-tracking',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Gemini Brand Tracking - Monitor Google AI Mentions | Livesov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gemini Brand Tracking & AI Overviews Monitor',
    description:
      'Track how Google Gemini and AI Overviews mention your brand. Monitor share of voice and see how to rank in AI Overviews. 7-day free trial.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const features = [
  {
    icon: '◎',
    title: 'Mention rate tracking',
    description:
      'How often Gemini names your brand, segmented by model, query intent, and time period.',
  },
  {
    icon: '#',
    title: 'AI Overviews share of voice',
    description:
      'Track how often you appear in Google Search&rsquo;s Gemini-powered AI Overviews - the most visible AI surface on the web.',
  },
  {
    icon: '⟁',
    title: 'Citation source tracking',
    description:
      'Gemini cites web sources in Search and Grounded responses. We log every URL so you can see what feeds Google&rsquo;s AI.',
  },
  {
    icon: '✺',
    title: 'Sentiment classification',
    description:
      'Automatic positive / neutral / negative scoring of the actual answer text Gemini generates about your brand.',
  },
  {
    icon: '⚔',
    title: 'Competitor co-occurrence',
    description:
      'See which competitor brands Gemini lists alongside or instead of you, broken out by query intent and model tier.',
  },
  {
    icon: '⚠',
    title: 'Hallucination guardrails',
    description:
      'Set canonical facts about your brand and get alerted when Gemini contradicts them - before the answer reaches a buyer.',
  },
];

const supportedModels = [
  ['Gemini 3 Pro', 'Highest reasoning & longest context', 'Used in Workspace, AI Studio, and high-stakes consumer queries'],
  ['Gemini 3 Flash', 'Mainstream balanced tier', 'Powers most Gemini app and consumer Search interactions'],
  ['Gemini 3 Flash-Lite', 'Latency-optimized, low-cost', 'Embedded in Android, smart features, and high-volume Google products'],
  ['Gemini with Search grounding', 'Live-grounded responses with citations', 'Equivalent to AI Overviews - the most visible surface'],
];

const steps = [
  {
    title: 'Connect brand & competitors',
    description:
      'Add your brand, domain, products, and competitor set. Livesov seeds a Gemini-style query set in under 60 seconds.',
  },
  {
    title: 'Approve tracked prompts',
    description:
      'Our generator drafts 20–50 real Google-search-style prompts in your category. Edit, approve, or add your own.',
  },
  {
    title: 'Automated Gemini runs',
    description:
      'Livesov queries Gemini on your schedule across Pro, Flash, Flash-Lite, and grounded variants, capturing the full response and citations.',
  },
  {
    title: 'Trends, alerts, evidence',
    description:
      'See share of voice, AI Overviews presence, sentiment swings, and hallucinations as live dashboards with downloadable evidence.',
  },
];

const useCases = [
  {
    icon: '⬢',
    title: 'Local & SMB brands',
    description:
      'Gemini powers Google AI Overviews - the most-visited AI surface on the web. For local and SMB queries, this is the visibility battle that matters.',
  },
  {
    icon: '◑',
    title: 'Consumer DTC',
    description:
      'Google still owns consumer discovery. Gemini-generated product comparisons in Search are now part of the buying journey for nearly every consumer brand.',
  },
  {
    icon: '✸',
    title: 'Workspace-embedded SaaS',
    description:
      'If your product appears in Gmail, Docs, or Meet, Gemini already shapes how it&rsquo;s perceived. Tracking Gemini is tracking enterprise word-of-mouth.',
  },
];

const faqs = [
  {
    question: 'How does Gemini tracking compare to tracking Google AI Overviews?',
    answer:
      'AI Overviews are powered by Gemini, so they are essentially Gemini responses served at the top of Google Search results. Livesov tracks both directly: API-level Gemini responses (for clean comparison across models) and grounded responses (the version closest to what users see in AI Overviews).',
  },
  {
    question: 'Which Gemini models does Livesov support?',
    answer:
      'The full Gemini 3 family - Pro, Flash, and Flash-Lite - plus grounded variants. We add new Gemini releases as Google ships them, typically within days, with continuous historical data.',
  },
  {
    question: 'Does Livesov require a Google API key?',
    answer:
      'No. Livesov\'s credits cover all Gemini API calls. On Agency plans you can bring your own Google AI Studio or Vertex API key for compliance or attribution.',
  },
  {
    question: 'Why are Gemini answers different from Google search results?',
    answer:
      'Gemini is a language model - it generates answers using a blend of training data and (for grounded responses) live web search. Traditional Google rankings are one input, but the synthesized answer can name brands that don&rsquo;t rank #1 organically. That&rsquo;s exactly why tracking Gemini directly matters.',
  },
  {
    question: 'How often does Livesov re-query Gemini?',
    answer:
      'Free runs weekly, Starter every 2 days, and Pro and Agency run daily - and you can trigger manual runs at any time within your plan&rsquo;s daily cap.',
  },
  {
    question: 'Can I track AI Overviews for specific Google queries?',
    answer:
      'Yes. Configure tracked prompts that mirror the Google searches your buyers run; Livesov queries Gemini with web grounding enabled to approximate the AI Overview a real user would see, then logs the answer, citations, and competitive mentions.',
  },
  {
    question: 'How do I export the raw Gemini response?',
    answer:
      'Every metric links to the raw response with model, prompt, timestamp, and citations. Bulk export is available as CSV or PDF for sharing with clients or stakeholders.',
  },
];

const comparisonRows = [
  ['Tracks Gemini 3 Pro, Flash, Flash-Lite', '✓ All models', 'Single model', 'Not supported'],
  ['Grounded / AI Overviews simulation', '✓ Native', 'Manual', 'Manual'],
  ['Citation capture for grounded responses', '✓ Full ranked list', 'Partial', 'Not supported'],
  ['Multi-run aggregation per prompt', '✓ 3–10× per run', 'Single shot', 'Single shot'],
  ['Sentiment tuned to Gemini&rsquo;s style', '✓ Native', 'Generic', 'Not supported'],
  ['Hallucination / fact-drift alerts', '✓ Canonical facts store', 'Not supported', 'Not supported'],
  ['Competitor co-occurrence', '✓ Up to 20 competitors', 'Manual', 'Manual'],
  ['Scheduled monitoring', '✓ Daily / 2-day / weekly', 'Manual', 'Daily (SERP only)'],
];

export default function GeminiBrandTrackingPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Gemini Brand Tracking', url: '/gemini-brand-tracking' }]} />

      <SeoHero
        title={
          <>
            Track Your Brand in{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4285f4] to-[#34a853]">
              Google Gemini
            </span>
          </>
        }
        subtitle="Monitor how Google's Gemini - 3 Pro, 3 Flash, Flash-Lite, and the grounded variants that power AI Overviews - mentions, ranks, and recommends your brand across Search, Workspace, and Android."
        ctaText="Start tracking Gemini - free"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '4+', label: 'Gemini models tracked' },
            { value: 'AI', label: 'Overviews simulation' },
            { value: '24/7', label: 'Automated coverage' },
            { value: '7-day', label: 'Free trial, no card' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="Why Gemini matters"
          title="Gemini is the AI surface most users see - whether they know it or not"
          subtitle="Gemini powers Google AI Overviews, the most-visited AI experience on the web, plus Workspace AI in Gmail, Docs, and Meet, plus the Android assistant on more than 3 billion devices."
        />
        <LongForm>
          <p>
            Most AI tracking discussions start with ChatGPT, but the largest AI surface by daily
            active users is Google. Gemini is what shows up at the top of Google Search results
            as <strong>AI Overviews</strong>, what summarises threads in Gmail, what drafts the
            slide in Google Slides, and what answers questions on every Pixel and many Android
            devices. If buyers don&apos;t see your brand in Gemini, they may not see it at all.
          </p>
          <p>
            Gemini is also unusual in that the same brand prompt can be answered by very
            different models depending on the surface: Workspace tends to use Pro, the mobile
            Gemini app skews to Flash, AI Overviews use grounded variants. Livesov tracks all of
            them so you don&apos;t mistake a Pro-only win for an AI Overviews win.
          </p>
        </LongForm>
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="What we measure"
          title="Six dimensions of Gemini visibility"
          subtitle="Including the AI Overviews surface that most SEO tools still can&rsquo;t see into."
        />
        <FeatureGrid items={features} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader label="How it works" title="From signup to first Gemini report in under 5 minutes" />
        <ProcessSteps steps={steps} />
      </Section>

      <Section pad="80px 24px" width={920}>
        <SectionHeader
          label="Model coverage"
          title="Every Gemini surface your buyers actually touch"
          subtitle="Tracking only one Gemini model misses the variance that matters. The same prompt can rank you #1 in Pro and #5 in Flash - and you need to know."
        />
        <ComparisonTable
          headers={['Gemini model', 'What it is', 'Where it lives']}
          rows={supportedModels}
          highlightColumn={-1}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader label="Who tracks Gemini" title="Where Gemini visibility ties to revenue" />
        <FeatureGrid items={useCases} />
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>AI Overviews changed Google search forever</h2>
          <p>
            When Google rolled out AI Overviews globally, click-through rates for traditional
            organic results dropped meaningfully on the queries where AI Overviews appear. The
            answer at the top of the page is now generated by Gemini - and if your brand isn&apos;t
            in that answer, you can rank #1 organically and still lose the click.
          </p>
          <p>
            Worse, the AI Overview is not deterministic. Two users searching the same query may
            see different summaries, different cited brands, and different competitor mentions.
            Sampling AI Overviews <em>once</em> is misleading. You need continuous, multi-run
            measurement - which is exactly what Livesov was built for.
          </p>

          <h2>How Gemini chooses what to say</h2>
          <p>
            Gemini blends three input streams: its training corpus (web pages, books, code,
            licensed data up to its cutoff), Google&apos;s real-time search index (for grounded
            and AI Overview responses), and the system instructions Google ships per product
            surface (which differ between Search, Workspace, and the Gemini app).
          </p>
          <p>
            Because Gemini grounds on Google&apos;s own search results in many surfaces, strong
            traditional SEO is a necessary-but-not-sufficient input. The brands that win Gemini
            are the ones that combine high search visibility with the structural signals Gemini
            actually quotes: clear headings, short scannable answers, schema markup, fresh
            timestamps, and citation-friendly attribution.
          </p>

          <h2>Sentiment in Gemini - and why generic models miss it</h2>
          <p>
            Gemini tends to write balanced, list-style answers. Generic sentiment models treat
            those as neutral, which buries the actual signal. Livesov&apos;s sentiment analysis
            is tuned to Gemini&apos;s answer style - it surfaces stance, comparative framing,
            and the implicit recommendation Gemini is making, not just polarity.
          </p>

          <Callout title="Pro tip" variant="tip">
            The single highest-impact move for Gemini visibility is improving the
            top 1–3 pages on your site that Google already ranks for your most valuable
            commercial queries. Add a short, scannable FAQ block, mark up dates and author
            attribution, and ensure the first 100 words clearly answer the question. Gemini
            disproportionately quotes from clean, schema-marked, recently-updated pages.
          </Callout>

          <h2>From measurement to action</h2>
          <p>
            Use Livesov to identify the AI Overviews prompts where your brand is missing or
            losing position. Run a <a href="/geo-audit">free GEO audit</a> on the pages Gemini
            actually cites. Improve them. Re-measure in the next monitoring cycle. The full
            framework lives in our <a href="/geo-optimization">GEO optimization guide</a> - but
            the core loop is measure → fix → re-measure, weekly.
          </p>
        </LongForm>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px" width={1000}>
        <SectionHeader
          label="Why Livesov"
          title="Livesov vs. SERP-only SEO tools and one-off Gemini checks"
          subtitle="AI Overviews aren&rsquo;t SERP positions. Tracking them needs a tool built for AI answers - not a SERP scraper with an AI sticker on the box."
        />
        <ComparisonTable
          headers={['Capability', 'Livesov', 'Manual Gemini checks', 'Traditional SEO']}
          rows={comparisonRows}
        />
      </Section>

      <FaqSection
        title="Gemini brand tracking FAQ"
        subtitle="Common questions from SEO and brand teams adopting Gemini and AI Overviews tracking."
        items={faqs}
      />

      <PillarLinks
        title="Track every AI platform that drives discovery"
        links={[
          {
            href: '/chatgpt-brand-tracking',
            label: 'ChatGPT tracking',
            description: 'OpenAI&rsquo;s consumer-scale AI assistant.',
          },
          {
            href: '/perplexity-brand-tracking',
            label: 'Perplexity tracking',
            description: 'Citation-first AI search with explicit source URLs.',
          },
          {
            href: '/claude-brand-tracking',
            label: 'Claude tracking',
            description: 'Anthropic&rsquo;s analytical AI for high-stakes buying.',
          },
          {
            href: '/grok-brand-tracking',
            label: 'Grok tracking',
            description: 'xAI&rsquo;s Grok with real-time X (Twitter) signal.',
          },
          {
            href: '/geo-audit',
            label: 'Free GEO audit',
            description: 'Score any URL for AI citation-readiness in seconds.',
          },
          {
            href: '/geo-optimization',
            label: 'GEO optimization guide',
            description: 'The complete playbook for ranking in AI answers.',
          },
        ]}
      />
    </SeoLayout>
  );
}
