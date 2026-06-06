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
  title: 'Grok Brand Tracking | Monitor xAI Grok Mentions',
  description:
    'Track how xAI\'s Grok mentions your brand using real-time X data. Monitor share of voice, sentiment, and competitors. Lowest competition of the 5.',
  keywords:
    'grok brand tracking, xai monitoring, grok visibility, x ai brand mentions, twitter ai tracking, grok-3 brand tracking, grok-4 monitoring, real-time ai tracking',
  alternates: { canonical: '/grok-brand-tracking' },
  openGraph: {
    title: 'Grok Brand Tracking | Monitor xAI Grok Mentions',
    description:
      'Track how xAI\'s Grok mentions your brand using real-time X data. Monitor share of voice, sentiment, and competitors. Lowest competition of the 5.',
    url: 'https://livesov.com/grok-brand-tracking',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Grok Brand Tracking — Monitor xAI Grok Mentions | Livesov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Grok Brand Tracking | Monitor xAI Grok Mentions',
    description:
      'Track how xAI\'s Grok mentions your brand using real-time X data. Monitor share of voice, sentiment, and competitors. Lowest competition of the 5.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const features = [
  {
    icon: '◎',
    title: 'Mention rate tracking',
    description:
      'Measure exactly how often Grok names your brand across hundreds of category prompts, segmented by model and intent.',
  },
  {
    icon: '⌁',
    title: 'Real-time social influence',
    description:
      'Grok blends training data with live X (Twitter) signal. We isolate real-time vs. knowledge-based mentions so you can see what social pressure is driving.',
  },
  {
    icon: '#',
    title: 'Recommendation rank',
    description:
      'Track where you appear when Grok lists alternatives — position 1, 2, 3, or below — and how rank shifts after a viral moment.',
  },
  {
    icon: '⚔',
    title: 'Competitor co-occurrence',
    description:
      'See which competitor brands Grok recommends alongside or instead of you, with social-driven shifts called out explicitly.',
  },
  {
    icon: '⟁',
    title: 'X post citation capture',
    description:
      'When Grok cites X posts or web sources, every URL and handle is logged so you can map social attribution to your AI visibility.',
  },
  {
    icon: '✺',
    title: 'Sentiment & tone',
    description:
      'Automatic positive / neutral / negative scoring of Grok&rsquo;s brand descriptions, including its trademark irreverent commentary.',
  },
];

const supportedModels = [
  ['Grok 4', 'Latest flagship reasoning model', 'Used in premium X subscriptions and the Grok app'],
  ['Grok 3', 'Mainstream balanced tier', 'Default for most consumer Grok interactions'],
  ['Grok 3 Mini', 'Faster, cheaper variant', 'Embedded in many free-tier and high-volume Grok surfaces'],
  ['Grok with live search', 'Real-time X + web grounding', 'Where social-influenced answers are generated'],
];

const steps = [
  {
    title: 'Connect your brand & social handles',
    description:
      'Add your brand, domain, products, competitors, and your X handle. Livesov correlates AI visibility with social signal automatically.',
  },
  {
    title: 'Build a Grok-style prompt set',
    description:
      'Our generator drafts 20–50 prompts including the casual, conversational style Grok users skew toward. Edit, approve, or add your own.',
  },
  {
    title: 'Automated Grok runs',
    description:
      'Livesov queries Grok on your schedule across models and the live-search variant, capturing the full response, citations, and X references.',
  },
  {
    title: 'Watch social → AI propagation',
    description:
      'See viral moments, sentiment swings, and rank shifts as they happen, with downloadable evidence and email alerts.',
  },
];

const useCases = [
  {
    icon: '⬢',
    title: 'Consumer brands on X',
    description:
      'For DTC and consumer brands with active X audiences, Grok&rsquo;s recommendations are a near-live reflection of social conversation.',
  },
  {
    icon: '◑',
    title: 'Crypto, fintech, tech',
    description:
      'Categories that live on X — crypto, fintech, AI tooling — see the fastest Grok-visibility shifts. Monitoring lets you ride or defend.',
  },
  {
    icon: '✸',
    title: 'PR & crisis response',
    description:
      'When a story goes viral on X, Grok absorbs it within hours. Tracking Grok is now part of every real-time PR monitoring stack.',
  },
];

const faqs = [
  {
    question: 'Why does Grok matter when it&rsquo;s smaller than ChatGPT?',
    answer:
      'Two reasons. First, Grok has real-time X data baked into its answers — making it uniquely fast to absorb viral moments and social sentiment. Second, Grok is deeply embedded in X itself, which means its recommendations appear directly in front of an audience already engaged with brands. For consumer, crypto, and tech categories, Grok visibility moves on hours, not weeks.',
  },
  {
    question: 'Which Grok models does Livesov support?',
    answer:
      'The current xAI lineup: Grok 4, Grok 3, Grok 3 Mini, plus the live-search variant that grounds answers in real-time X and web data. We add new Grok releases as xAI ships them.',
  },
  {
    question: 'Does Livesov need access to my X account?',
    answer:
      'No. Livesov queries Grok via the official xAI API. Adding your X handle is optional — it lets us correlate your AI visibility shifts with your own X activity, but you can leave it blank and still get full Grok tracking.',
  },
  {
    question: 'Can Grok tracking explain why a competitor suddenly outranks me?',
    answer:
      'Often, yes. Grok&rsquo;s live-search variant cites the X posts and URLs that drove its answer. When you see a rank shift in Livesov, the underlying citations usually point straight to the viral moment — a launch announcement, a thread that took off, a press hit — that caused it.',
  },
  {
    question: 'How fresh is Grok data?',
    answer:
      'Grok itself queries live X data continuously. Livesov re-runs your tracked prompts on your plan&rsquo;s schedule (daily on Agency, every 2 days on Pro, weekly on Starter), with manual runs available at any time within your daily cap.',
  },
  {
    question: 'Does Grok use a different tone than other AI models?',
    answer:
      'Yes — Grok skews casual, irreverent, and willing to take positions other models hedge on. That tone affects sentiment scoring. Livesov&rsquo;s sentiment model is tuned for Grok&rsquo;s voice and won&rsquo;t mistake snark for negativity.',
  },
  {
    question: 'Can I export the raw Grok response?',
    answer:
      'Yes. Every metric links to the raw Grok response with model, prompt, timestamp, citations, and X handles referenced. Bulk export is available as CSV or PDF.',
  },
];

const comparisonRows = [
  ['Tracks Grok 4, 3, 3 Mini, live-search', '✓ All models', 'Single model', 'Not supported'],
  ['Real-time X signal correlation', '✓ Native', 'Not supported', 'Not supported'],
  ['Citation capture (X posts + URLs)', '✓ Full ranked list', 'Partial', 'Not supported'],
  ['Multi-run aggregation per prompt', '✓ 3–10× per run', 'Single shot', 'Single shot'],
  ['Sentiment tuned for Grok&rsquo;s style', '✓ Native', 'Generic', 'Not supported'],
  ['Competitor co-occurrence', '✓ Up to 20 competitors', 'Manual', 'Manual'],
  ['Scheduled monitoring', '✓ Daily / 2-day / weekly', 'Manual', 'Manual'],
  ['Evidence export with full response', '✓ CSV + PDF', 'Limited', 'Not supported'],
];

export default function GrokBrandTrackingPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Grok Brand Tracking', url: '/grok-brand-tracking' }]} />

      <SeoHero
        title={
          <>
            Track Your Brand in{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1d9bf0] to-[#1a8cd8]">
              Grok
            </span>
          </>
        }
        subtitle="Monitor how xAI's Grok — powered by real-time X (Twitter) data — mentions, ranks, and recommends your brand. Track share of voice, social-driven shifts, citations, and competitor visibility across every Grok model."
        ctaText="Start tracking Grok — free"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '4+', label: 'Grok models tracked' },
            { value: 'Live', label: 'X data correlation' },
            { value: '24/7', label: 'Automated coverage' },
            { value: '7-day', label: 'Free trial, no card' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="Why Grok matters"
          title="The only AI whose answers move at the speed of social"
          subtitle="Grok has live access to X (Twitter) and built-in willingness to take positions. That makes it the fastest indicator of how a viral moment, a launch, or a crisis is reshaping your brand&rsquo;s AI visibility — often within hours."
        />
        <LongForm>
          <p>
            Most AI brand tracking discussions focus on stable answers — what does this LLM say
            today, what does it say next week. <strong>Grok breaks that frame</strong>. Because
            Grok grounds many of its answers in real-time X data, its opinions about your brand
            can shift between morning and evening based on a trending thread, a launch
            announcement, or a story that took off in your category.
          </p>
          <p>
            For consumer brands, crypto, fintech, AI tooling, and any category with an active X
            audience, Grok visibility is the closest thing AI has to a social listening signal —
            except it&apos;s baked into the recommendations Grok serves to millions of X users
            every day. Livesov is the measurement layer that turns that volatility into a
            tractable, monitored, alertable system.
          </p>
        </LongForm>
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="What we measure"
          title="Six dimensions of Grok visibility — social-aware"
          subtitle="Including the real-time X signal that drives the largest day-to-day rank shifts of any AI platform."
        />
        <FeatureGrid items={features} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader label="How it works" title="First Grok visibility report in under 5 minutes" />
        <ProcessSteps steps={steps} />
      </Section>

      <Section pad="80px 24px" width={920}>
        <SectionHeader
          label="Model coverage"
          title="Every Grok variant your audience actually sees"
          subtitle="From the free Grok 3 Mini tier to the live-search variant that drives the most volatile rank shifts — all tracked in parallel."
        />
        <ComparisonTable
          headers={['Grok model', 'What it is', 'Where it lives']}
          rows={supportedModels}
          highlightColumn={-1}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader label="Who tracks Grok" title="Where Grok visibility moves on hours, not weeks" />
        <FeatureGrid items={useCases} />
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>How Grok is different from every other LLM</h2>
          <p>
            Grok&apos;s defining feature isn&apos;t model size or context window — it&apos;s the
            integration with X. Through xAI&apos;s real-time search variant, Grok can ground its
            answers on live X posts, threads, and trending topics. That makes Grok the only major
            AI whose outputs reflect <em>this morning&apos;s</em> conversations, not last
            quarter&apos;s training cutoff.
          </p>
          <p>
            For brands, that has two implications. First, social moments propagate into AI
            visibility almost instantly. A viral launch thread can shift Grok&apos;s recommendations
            within a day. Second, the inverse is also true: a poorly-handled crisis on X can be
            cited and re-cited inside Grok&apos;s answers long after the original post has been
            archived.
          </p>

          <h2>Real-time vs. knowledge-based Grok mentions</h2>
          <p>
            Livesov breaks every Grok mention into two buckets: <strong>knowledge-based</strong>
            {' '}(answers grounded in Grok&apos;s training data, stable over time) and{' '}
            <strong>real-time</strong> (answers influenced by live X retrieval, volatile by
            design). This separation is critical — chasing a real-time spike is a PR job;
            improving a knowledge-based baseline is a content and authority job.
          </p>

          <h2>Sentiment in Grok — beware the snark trap</h2>
          <p>
            Grok is famously willing to be sarcastic, blunt, and irreverent. Generic sentiment
            classifiers mis-read that voice constantly, flagging witty descriptions as negative
            and balanced critiques as flatly hostile. Livesov&apos;s sentiment model is tuned for
            Grok&apos;s style — we extract the actual stance and the underlying recommendation,
            not the rhetorical packaging.
          </p>

          <Callout title="Pro tip" variant="tip">
            For Grok specifically, your highest-leverage move is rarely an SEO change — it&apos;s
            making sure your most credible accounts (founders, exec team, key customer voices)
            post substantive content on X about your category. Grok&apos;s real-time retrieval
            disproportionately surfaces high-engagement, recent threads from credible accounts.
            Six weeks of consistent posting often moves Grok visibility more than six months of
            content marketing.
          </Callout>

          <h2>When a viral moment changes your Grok rank</h2>
          <p>
            Use Livesov to confirm the shift (did the mention rate really change, or is it a
            single noisy run?), then drill into the citations Grok used in the post-shift
            responses. Almost always, a specific X thread or post triggered the change. From
            there it&apos;s a content / PR decision: amplify the positive trigger, address the
            negative one, or wait for the cycle to age out.
          </p>
          <p>
            For the full framework, read our{' '}
            <a href="/geo-optimization">GEO optimization guide</a> and run a{' '}
            <a href="/geo-audit">free GEO audit</a> on the pages Grok references in your
            category.
          </p>
        </LongForm>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px" width={1000}>
        <SectionHeader
          label="Why Livesov"
          title="Livesov vs. social listening and one-off Grok checks"
          subtitle="Social listening tools see X but not Grok. Grok mention checkers see today&rsquo;s answer but no history or competitor benchmark. Livesov is the only platform that sees the whole loop."
        />
        <ComparisonTable
          headers={['Capability', 'Livesov', 'Manual Grok checks', 'Social listening']}
          rows={comparisonRows}
        />
      </Section>

      <FaqSection
        title="Grok brand tracking FAQ"
        subtitle="Common questions from consumer, crypto, fintech, and tech brands adopting Grok visibility tracking."
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
            href: '/gemini-brand-tracking',
            label: 'Gemini tracking',
            description: 'Google&rsquo;s AI in Search, Workspace, and Android.',
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
